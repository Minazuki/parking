package app

import (
	"context"
	"io"
	"os"
	"path/filepath"
	"testing"
)

func TestWireAcquiresAndReleasesWorkspaceLease(t *testing.T) {
	cfg := Config{Workspace: t.TempDir(), Addr: "127.0.0.1:0", Version: "dev", NoBrowser: true}
	application, cleanup, err := Initialize(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer cleanup()
	state, err := application.activity.Snapshot()
	if err != nil || state.CurrentStage != -1 {
		t.Fatal(state, err)
	}
	if _, closeOther, err := Initialize(cfg); err == nil {
		closeOther()
		t.Fatal("second writer obtained workspace")
	}
	cleanup()
	_, closeNext, err := Initialize(cfg)
	if err != nil {
		t.Fatal("cleanup did not release lease", err)
	}
	closeNext()
}
func TestRunDoesNotTouchWorkspaceOnInvalidOrCanceledInput(t *testing.T) {
	root := filepath.Join(t.TempDir(), "not-created")
	cfg := Config{Workspace: root, Addr: "0.0.0.0:8080", Version: "dev", NoBrowser: true}
	if err := Run(context.Background(), cfg, io.Discard, io.Discard); err == nil {
		t.Fatal("non-loopback address accepted")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	cfg.Addr = "127.0.0.1:0"
	if err := Run(ctx, cfg, io.Discard, io.Discard); err == nil {
		t.Fatal("canceled startup accepted")
	}
	if _, err := os.Stat(root); !os.IsNotExist(err) {
		t.Fatal("workspace touched before validation", err)
	}
}
