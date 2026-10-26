package controller

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"strconv"
	"strings"

	"github.com/Minazuki/parking/server/src/internal/inputcsv"
	"github.com/Minazuki/parking/server/src/internal/service"
	"github.com/gin-gonic/gin"
)

type ActivityService interface {
	Root() string
	Snapshot() (service.Snapshot, error)
	InitActivity(int, string) (service.Snapshot, error)
	ImportRegistration([]byte) (service.Snapshot, error)
	ImportRegistrationCSV() (service.Snapshot, error)
	ImportPaymentsCSV() (service.Snapshot, error)
	ImportPayments([]byte) (service.Snapshot, error)
	Review() (service.Snapshot, error)
	RunRoundAt(int, string) (service.Snapshot, error)
}

const APIPrefix = "/api/v1"

type Config struct {
	Host, DevOrigin, Version string
	Frontend                 http.Handler
	TestMode                 bool
	DefaultActivityYear      int
}

func respond(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(value)
}
func failure(w http.ResponseWriter, err error) {
	status := http.StatusInternalServerError
	if errors.Is(err, service.ErrInvalid) {
		status = http.StatusBadRequest
	}
	if errors.Is(err, service.ErrConflict) {
		status = http.StatusConflict
	}
	payload := map[string]any{"error": err.Error()}
	var issue *inputcsv.Issue
	if errors.As(err, &issue) {
		payload["issues"] = []*inputcsv.Issue{issue}
	}
	respond(w, status, payload)
}
func invalid(w http.ResponseWriter, err error) {
	respond(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
}
func body(w http.ResponseWriter, r *http.Request) ([]byte, error) {
	mediaType, _, parseErr := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if parseErr != nil || mediaType != "application/json" {
		return nil, fmt.Errorf("Content-Type must be application/json")
	}
	raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	return raw, nil
}
func decodeRequest(raw []byte, value any) error {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(value); err != nil {
		return err
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		return fmt.Errorf("trailing JSON data")
	}
	return nil
}

type ActivityController struct {
	service ActivityService
	config  Config
}

func Handler(app ActivityService, cfg Config) http.Handler {
	ctrl := &ActivityController{service: app, config: cfg}
	mux := gin.New()
	mux.Use(gin.Recovery())
	mux.SetTrustedProxies(nil)
	mux.HandleMethodNotAllowed = true
	mux.Use(boundary(cfg))
	mux.NoRoute(func(c *gin.Context) {
		if cfg.Frontend != nil && (c.Request.Method == http.MethodGet || c.Request.Method == http.MethodHead) && !strings.HasPrefix(c.Request.URL.Path, "/api/") {
			cfg.Frontend.ServeHTTP(c.Writer, c.Request)
			return
		}
		respond(c.Writer, 404, gin.H{"error": "resource not found"})
	})
	mux.NoMethod(func(c *gin.Context) { respond(c.Writer, 405, gin.H{"error": "method not allowed"}) })

	api := mux.Group(APIPrefix)
	api.GET("/status", ctrl.Status)
	api.GET("/stages/:stage", ctrl.Stage)
	api.POST("/activities", ctrl.CreateActivity)
	api.POST("/registrations", ctrl.ImportRegistration)
	api.POST("/payment-imports", ctrl.ImportPayments)
	api.POST("/payment-reviews", ctrl.Review)
	api.POST("/rounds/:round/draws", ctrl.Draw)
	api.POST("/csv-imports/registration", ctrl.ImportRegistrationCSV)
	api.POST("/csv-imports/payments", ctrl.ImportPaymentsCSV)
	if cfg.Frontend == nil {
		mux.GET("/", ctrl.Index)
	} else {
		serveFrontend := func(c *gin.Context) { cfg.Frontend.ServeHTTP(c.Writer, c.Request) }
		mux.GET("/", serveFrontend)
		mux.HEAD("/", serveFrontend)
	}
	return mux
}

func boundary(cfg Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		w, r := c.Writer, c.Request

		if cfg.Host != "" && r.Host != cfg.Host {
			c.Abort()
			respond(w, 403, map[string]string{"error": "unexpected Host"})
			return
		}
		origin := r.Header.Get("Origin")
		if origin != "" && origin != "http://"+r.Host && origin != cfg.DevOrigin {
			c.Abort()
			respond(w, 403, map[string]string{"error": "unexpected Origin"})
			return
		}
		if r.Header.Get("Sec-Fetch-Site") == "cross-site" && !(cfg.DevOrigin != "" && origin == cfg.DevOrigin) {
			c.Abort()
			respond(w, 403, map[string]string{"error": "cross-site request rejected"})
			return
		}
		if cfg.DevOrigin != "" && origin == cfg.DevOrigin {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			if r.Method == http.MethodOptions {
				c.Abort()
				w.WriteHeader(204)
				return
			}
		}
		c.Next()
	}
}

func (ctrl *ActivityController) Status(c *gin.Context) {
	w := c.Writer
	snapshot, err := ctrl.service.Snapshot()
	if err != nil {
		failure(w, err)
		return
	}
	respond(w, 200, map[string]any{"version": ctrl.config.Version, "workspace": ctrl.service.Root(), "currentStage": snapshot.CurrentStage, "activity": snapshot.Activity, "testMode": ctrl.config.TestMode, "defaultActivityYear": ctrl.config.DefaultActivityYear})
}

func (ctrl *ActivityController) Stage(c *gin.Context) {
	w := c.Writer
	n, err := strconv.Atoi(c.Param("stage"))
	if err != nil || n < 0 || n > 6 {
		invalid(w, fmt.Errorf("invalid stage"))
		return
	}
	snapshot, err := ctrl.service.Snapshot()
	if err != nil {
		failure(w, err)
		return
	}
	raw, ok := snapshot.States[n]
	if !ok {
		respond(w, 404, map[string]any{"error": "stage not completed"})
		return
	}
	respond(w, 200, raw)
}

func (ctrl *ActivityController) CreateActivity(c *gin.Context) {
	w, r := c.Writer, c.Request
	raw, err := body(w, r)
	if err != nil {
		invalid(w, err)
		return
	}
	var request struct {
		ActivityYear int    `json:"activityYear"`
		Mode         string `json:"mode"`
	}
	if err := decodeRequest(raw, &request); err != nil {
		invalid(w, err)
		return
	}
	if request.Mode == "" {
		request.Mode = "live"
		if ctrl.config.TestMode {
			request.Mode = "test"
		}
	}
	snapshot, err := ctrl.service.InitActivity(request.ActivityYear, request.Mode)
	if err != nil {
		failure(w, err)
		return
	}
	respond(w, 201, snapshot)
}

func (ctrl *ActivityController) ImportRegistration(c *gin.Context) {
	w, r := c.Writer, c.Request
	raw, err := body(w, r)
	if err != nil {
		invalid(w, err)
		return
	}
	snapshot, err := ctrl.service.ImportRegistration(raw)
	if err != nil {
		failure(w, err)
		return
	}
	respond(w, 201, snapshot)
}

func (ctrl *ActivityController) ImportPayments(c *gin.Context) {
	w, r := c.Writer, c.Request
	raw, err := body(w, r)
	if err != nil {
		invalid(w, err)
		return
	}
	snapshot, err := ctrl.service.ImportPayments(raw)
	if err != nil {
		failure(w, err)
		return
	}
	respond(w, 201, snapshot)
}

func (ctrl *ActivityController) Review(c *gin.Context) {
	w := c.Writer
	snapshot, err := ctrl.service.Review()
	if err != nil {
		failure(w, err)
		return
	}
	respond(w, 201, snapshot)
}

func (ctrl *ActivityController) Draw(c *gin.Context) {
	w, r := c.Writer, c.Request
	round, err := strconv.Atoi(c.Param("round"))
	if err != nil || round < 1 || round > 2 {
		invalid(w, fmt.Errorf("round must be 1 or 2"))
		return
	}
	var button struct {
		ButtonPressedAt string `json:"buttonPressedAt"`
	}
	if r.ContentLength != 0 {
		raw, err := body(w, r)
		if err != nil {
			invalid(w, err)
			return
		}
		if err := decodeRequest(raw, &button); err != nil {
			invalid(w, err)
			return
		}
	}
	snapshot, err := ctrl.service.RunRoundAt(round, button.ButtonPressedAt)
	if err != nil {
		failure(w, err)
		return
	}
	respond(w, 201, snapshot)
}

func (ctrl *ActivityController) Index(c *gin.Context) {
	w, r := c.Writer, c.Request
	http.Redirect(w, r, APIPrefix+"/status", http.StatusTemporaryRedirect)
}

// CSV actions accept no file content or filesystem paths from HTTP.
func emptyImportBody(c *gin.Context) bool {
	raw, err := io.ReadAll(http.MaxBytesReader(c.Writer, c.Request.Body, 1024))
	if err != nil || len(bytes.TrimSpace(raw)) != 0 {
		invalid(c.Writer, fmt.Errorf("CSV import reads fixed workspace inputs and requires an empty body"))
		return false
	}
	return true
}
func (ctrl *ActivityController) ImportRegistrationCSV(c *gin.Context) {
	if !emptyImportBody(c) {
		return
	}
	snapshot, err := ctrl.service.ImportRegistrationCSV()
	if err != nil {
		failure(c.Writer, err)
		return
	}
	respond(c.Writer, http.StatusCreated, snapshot)
}
func (ctrl *ActivityController) ImportPaymentsCSV(c *gin.Context) {
	if !emptyImportBody(c) {
		return
	}
	snapshot, err := ctrl.service.ImportPaymentsCSV()
	if err != nil {
		failure(c.Writer, err)
		return
	}
	respond(c.Writer, http.StatusCreated, snapshot)
}
