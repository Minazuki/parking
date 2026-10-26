package cmd

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"strings"
	"testing"

	"github.com/Minazuki/parking/server/src/internal/app"
	"github.com/Minazuki/parking/server/src/internal/buildinfo"
)

func TestVersionAndHelpNeverStartServer(t *testing.T) {
	info := buildinfo.Info{Version: "dev", GitHash: "none", BuildTime: "none", OS: "darwin", ARCH: "arm64"}
	for _, args := range [][]string{{"version"}, {"--version"}, {"--help"}, {"server", "--help"}, {}} {
		t.Run(fmt.Sprint(args), func(t *testing.T) {
			var out bytes.Buffer
			cmd := newRootCommand(info, func(context.Context, app.Config, io.Writer, io.Writer) error {
				t.Fatal("read-only command started server")
				return nil
			})
			cmd.SetOut(&out)
			cmd.SetErr(&out)
			cmd.SetArgs(args)
			if err := cmd.Execute(); err != nil {
				t.Fatal(err)
			}
			if len(args) > 0 && (args[0] == "version" || args[0] == "--version") {
				if out.String() != info.String()+"\n" {
					t.Fatal(out.String())
				}
			} else if !strings.Contains(out.String(), "Usage:") {
				t.Fatal(out.String())
			}
		})
	}
}
func TestServerOptionsAndValidation(t *testing.T) {
	info := buildinfo.Info{Version: "test-version"}
	for _, args := range [][]string{
		{"server"}, {"server", "--workspace", ""},
		{"server", "--workspace", "data", "extra"},
		{"version", "extra"}, {"typo"},
		{"server", "--workspace", "data", "--addr", "0.0.0.0:8080"},
		{"server", "--workspace", "data", "--addr", "127.0.0.1:65536"},
		{"server", "--workspace", "data", "--dev-origin", "http://user@localhost:5173"},
		{"server", "--workspace", "data", "--dev-origin", "https://localhost:5173"},
	} {
		cmd := newRootCommand(info, func(context.Context, app.Config, io.Writer, io.Writer) error {
			t.Fatal("invalid input started server")
			return nil
		})
		cmd.SetArgs(args)
		cmd.SetOut(io.Discard)
		cmd.SetErr(io.Discard)
		if err := cmd.Execute(); err == nil {
			t.Fatalf("accepted %v", args)
		}
	}
	called := false
	key := struct{}{}
	ctx := context.WithValue(context.Background(), key, "forwarded")
	cmd := newRootCommand(info, func(got context.Context, cfg app.Config, out, errOut io.Writer) error {
		called = true
		if got.Value(key) != "forwarded" || cfg.Workspace != "relative workspace" || cfg.Addr != "127.0.0.1:0" || !cfg.NoBrowser || cfg.Version != "test-version" || cfg.DevOrigin != "http://localhost:5173" {
			t.Fatal(cfg)
		}
		return nil
	})
	cmd.SetArgs([]string{"server", "--workspace", "relative workspace", "--addr", "127.0.0.1:0", "--no-browser", "--dev-origin", "http://localhost:5173"})
	if err := cmd.ExecuteContext(ctx); err != nil {
		t.Fatal(err)
	}
	if !called {
		t.Fatal("server command was not dispatched")
	}
}
