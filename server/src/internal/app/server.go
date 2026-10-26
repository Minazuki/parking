package app

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os/exec"
	"runtime"
	"time"

	"github.com/Minazuki/parking/server/src/internal/controller"
	"github.com/Minazuki/parking/server/src/internal/repository"
	"github.com/Minazuki/parking/server/src/internal/service"
	"github.com/Minazuki/parking/server/src/internal/webui"
)

type Application struct {
	config     Config
	repository *repository.Store
	activity   *service.Service
}

// Run owns the service lifetime; the CLI only passes validated options and context.
func Run(ctx context.Context, cfg Config, out, errOut io.Writer) error {
	if err := cfg.Validate(); err != nil {
		return err
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	application, cleanup, err := Initialize(cfg)
	if err != nil {
		return err
	}
	defer cleanup()
	return application.Serve(ctx, out, errOut)
}

func (a *Application) Serve(ctx context.Context, out, errOut io.Writer) error {
	listener, err := net.Listen("tcp", a.config.Addr)
	if err != nil {
		return err
	}
	defer listener.Close()
	address := listener.Addr().String()
	server := &http.Server{
		Handler:           controller.Handler(a.activity, controller.Config{Host: address, DevOrigin: a.config.DevOrigin, Version: a.config.Version, TestMode: a.config.TestMode, DefaultActivityYear: nextActivityYear(time.Now()), Frontend: webui.Handler(webui.Files())}),
		ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 60 * time.Second,
	}
	location := "http://" + address
	fmt.Fprintln(out, "Parking backend:", location, "workspace:", a.repository.Root(), "version:", a.config.Version)
	done := make(chan error, 1)
	go func() { done <- server.Serve(listener) }()
	if !a.config.NoBrowser {
		if runtime.GOOS != "darwin" {
			fmt.Fprintln(errOut, "Open Google Chrome manually:", location)
		} else if err := exec.CommandContext(ctx, "open", "-a", "Google Chrome", location).Run(); err != nil {
			fmt.Fprintln(errOut, "Open Google Chrome manually:", location, err)
		}
	}
	select {
	case err := <-done:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
		shutdown, cancel := context.WithTimeout(context.Background(), 35*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdown); err != nil {
			// Keep the workspace lease until active operations finish, even past the grace period.
			return err
		}
		return nil
	}
}
