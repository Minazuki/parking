package controller

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Minazuki/parking/server/src/internal/beacon"
	"github.com/Minazuki/parking/server/src/internal/domain"
	"github.com/Minazuki/parking/server/src/internal/repository"
	"github.com/Minazuki/parking/server/src/internal/service"
)

type testSeed struct {
	fetch service.Fetch
	root  string
}

func setup(t *testing.T) (*testSeed, *httptest.Server) {
	t.Helper()
	v, err := domain.NewValidator()
	if err != nil {
		t.Fatal(err)
	}
	store, err := repository.Open(t.TempDir(), "api-test", v)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	s := httptest.NewUnstartedServer(nil)
	host := s.Listener.Addr().String()
	seed := &testSeed{fetch: beacon.Fetcher{}.Fetch, root: store.Root()}
	app := service.New(store, func(ctx context.Context) (beacon.Evidence, error) { return seed.fetch(ctx) }, v, "api-test")
	s.Config.Handler = Handler(app, Config{Host: host, Version: "api-test"})
	s.Start()
	t.Cleanup(s.Close)
	return seed, s
}
func request(t *testing.T, s *httptest.Server, method, path string, data []byte, headers map[string]string) (int, []byte) {
	t.Helper()
	req, err := http.NewRequest(method, s.URL+path, bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	if data != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range headers {
		if k == "Host" {
			req.Host = v
		} else {
			req.Header.Set(k, v)
		}
	}
	resp, err := s.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, body
}
func read(t *testing.T, name string) []byte {
	t.Helper()
	b, err := os.ReadFile("../../../../examples/workspace/" + name)
	if err != nil {
		t.Fatal(err)
	}
	return b
}
func TestStatusAndOriginBoundary(t *testing.T) {
	_, s := setup(t)
	if code, _ := request(t, s, "GET", "/api/v1/status", nil, nil); code != 200 {
		t.Fatal(code)
	}
	if code, _ := request(t, s, "POST", "/api/v1/payment-reviews", nil, map[string]string{"Origin": "https://evil.example"}); code != 403 {
		t.Fatal("foreign origin allowed", code)
	}
	if code, _ := request(t, s, "POST", "/api/v1/payment-reviews", nil, map[string]string{"Sec-Fetch-Site": "cross-site"}); code != 403 {
		t.Fatal("cross-site without origin allowed", code)
	}
	if code, _ := request(t, s, "GET", "/api/v1/status", nil, map[string]string{"Host": "evil.example"}); code != 403 {
		t.Fatal("unexpected host allowed", code)
	}
}
func TestAPIWorkflowAndDisconnectedRequestStillCommits(t *testing.T) {
	store, s := setup(t)
	if code, body := request(t, s, "POST", "/api/v1/activities", []byte(`{"activityYear":116,"mode":"test"}`), nil); code != 201 {
		t.Fatal(code, string(body))
	}
	var first domain.First
	if err := json.Unmarshal(read(t, "checkpoints/0/state.json"), &first); err != nil {
		t.Fatal(err)
	}
	reg, _ := json.Marshal(map[string]any{"registrations": first.Registrations, "accessibleAssignments": first.Accessible.Assignments})
	if code, body := request(t, s, "POST", "/api/v1/registrations", reg, nil); code != 201 {
		t.Fatal(code, string(body))
	}
	var state beacon.State
	if err := json.Unmarshal(read(t, "checkpoints/1/state.json"), &state); err != nil {
		t.Fatal(err)
	}
	info, wire := read(t, "checkpoints/1/info.json"), read(t, "checkpoints/1/beacon.json")
	store.fetch = func(ctx context.Context) (beacon.Evidence, error) {
		if ctx.Err() != nil {
			return beacon.Evidence{}, ctx.Err()
		}
		return beacon.Evidence{State: state, Info: info, Beacon: wire}, nil
	}
	// A canceled browser context must not cancel the backend operation.
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	target, _ := url.Parse(s.URL)
	req := httptest.NewRequest("POST", s.URL+"/api/v1/rounds/1/draws", nil).WithContext(ctx)
	req.Host = target.Host
	recorder := httptest.NewRecorder()
	s.Config.Handler.ServeHTTP(recorder, req)
	if recorder.Code != 201 {
		t.Fatal(recorder.Code, recorder.Body.String())
	}
	if code, _ := request(t, s, "POST", "/api/v1/rounds/1/draws", nil, nil); code != 409 {
		t.Fatal("duplicate draw allowed", code)
	}
	if code, body := request(t, s, "POST", "/api/v1/payment-imports", read(t, "checkpoints/3/state.json"), nil); code != 201 {
		t.Fatal(code, string(body))
	}
	if code, body := request(t, s, "POST", "/api/v1/payment-reviews", nil, nil); code != 201 {
		t.Fatal(code, string(body))
	}
	if code, body := request(t, s, "POST", "/api/v1/rounds/2/draws", nil, nil); code != 201 {
		t.Fatal(code, string(body))
	}
	if code, body := request(t, s, "GET", "/api/v1/status", nil, nil); code != 200 || !strings.Contains(string(body), `"currentStage":6`) {
		t.Fatal(code, string(body))
	}
}
func TestRequestValidation(t *testing.T) {
	_, s := setup(t)
	for _, r := range []struct {
		path    string
		data    []byte
		headers map[string]string
	}{{"/api/v1/activities", []byte(`{"activityYear":0,"mode":"test"}`), nil}, {"/api/v1/registrations", []byte(`{"registrations":{"A":[],"B":[]},"accessibleAssignments":null}`), nil}, {"/api/v1/payment-imports", []byte("{}"), map[string]string{"Content-Type": "application/jsonp"}}} {
		code, body := request(t, s, "POST", r.path, r.data, r.headers)
		if code < 400 {
			t.Fatal(fmt.Sprint(code), string(body))
		}
	}
}

func TestGinRoutesMethodsAndPreflight(t *testing.T) {
	_, s := setup(t)
	for _, r := range []struct {
		method, path string
		want         int
	}{
		{"GET", "/api/v1/rounds/1/draws", 405},
		{"POST", "/api/v1/does-not-exist", 404},
		{"GET", "/api/v1/stages/8", 400},
		{"GET", "/api/v1/stages/0", 404},
		{"GET", "/api/status", 404},
		{"GET", "/api/v2/status", 404},
	} {
		code, body := request(t, s, r.method, r.path, nil, nil)
		if code != r.want || !json.Valid(body) {
			t.Fatalf("%s %s: %d %s", r.method, r.path, code, body)
		}
	}
	// Test preflight directly: it must stop before touching the service.
	handler := Handler(nil, Config{Host: "127.0.0.1:8080", DevOrigin: "http://localhost:5173"})
	req := httptest.NewRequest("OPTIONS", "http://127.0.0.1:8080/api/v1/registrations", nil)
	req.Header.Set("Origin", "http://localhost:5173")
	req.Header.Set("Sec-Fetch-Site", "cross-site")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)
	if recorder.Code != 204 || recorder.Header().Get("Access-Control-Allow-Origin") != "http://localhost:5173" {
		t.Fatal(recorder.Code, recorder.Header())
	}
}

func TestCSVImportActionsAndStructuredErrors(t *testing.T) {
	seed, s := setup(t)
	if code, _ := request(t, s, "POST", "/api/v1/csv-imports/payments", nil, nil); code != 409 {
		t.Fatal(code)
	}
	if code, _ := request(t, s, "POST", "/api/v1/csv-imports/registration", []byte(`{"path":"outside.csv"}`), nil); code != 400 {
		t.Fatal(code)
	}
	if code, body := request(t, s, "POST", "/api/v1/csv-imports/registration", nil, nil); code != 400 || !bytes.Contains(body, []byte(`"issues"`)) {
		t.Fatal(code, string(body))
	}
	directory := filepath.Join(seed.root, "inputs")
	if err := os.MkdirAll(directory, 0700); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"A棟資料.csv", "B棟資料.csv", "無障礙車位資料.csv"} {
		raw, err := os.ReadFile(filepath.Join("../../../../examples/imports/inputs", name))
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(directory, name), raw, 0600); err != nil {
			t.Fatal(err)
		}
	}
	path := filepath.Join(directory, "A棟資料.csv")
	original, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, bytes.Replace(original, []byte("兩輪"), nil, 1), 0600); err != nil {
		t.Fatal(err)
	}
	code, body := request(t, s, "POST", "/api/v1/csv-imports/registration", nil, nil)
	var response struct {
		Issues []struct {
			FileName string
			Row      int
			Column   string
		}
	}
	if err := json.Unmarshal(body, &response); err != nil {
		t.Fatal(err)
	}
	if code != 400 || len(response.Issues) != 1 || response.Issues[0].FileName != "A棟資料.csv" || response.Issues[0].Row != 2 || response.Issues[0].Column != "機車位" {
		t.Fatal(code, string(body))
	}
	if err := os.WriteFile(path, original, 0600); err != nil {
		t.Fatal(err)
	}
	code, body = request(t, s, "POST", "/api/v1/csv-imports/registration", nil, nil)
	if code != 201 || !bytes.Contains(body, []byte(`"currentStage":0`)) {
		t.Fatal(code, string(body))
	}
	if code, _ := request(t, s, "POST", "/api/v1/csv-imports/registration", nil, nil); code != 409 {
		t.Fatal(code)
	}
}
