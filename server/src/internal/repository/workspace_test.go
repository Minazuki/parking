package repository

import (
	"os"
	"path/filepath"
	"testing"
)

func TestWorkspaceBootstrapPreservesOperatorFiles(t *testing.T) {
	root := t.TempDir()
	h := open(t, root)
	for _, name := range []string{"inputs", "checkpoints", "exports", "logs"} {
		info, err := os.Stat(filepath.Join(root, name))
		if err != nil || !info.IsDir() {
			t.Fatalf("missing directory %s: %v", name, err)
		}
	}
	snapshot, err := h.repo.Snapshot()
	if err != nil || snapshot.CurrentStage != -1 || string(snapshot.Activity) != "null" {
		t.Fatalf("bootstrap created activity or stages: %+v, %v", snapshot, err)
	}
	for _, name := range []string{"inputs", "checkpoints", "exports"} {
		entries, err := os.ReadDir(filepath.Join(root, name))
		if err != nil || len(entries) != 0 {
			t.Fatalf("bootstrap populated %s: %v", name, err)
		}
	}
	if err := h.Close(); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"README.md", "inputs/A棟資料.csv", "exports/result.csv"} {
		if err := os.WriteFile(filepath.Join(root, name), []byte("operator content"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.Remove(filepath.Join(root, "checkpoints")); err != nil {
		t.Fatal(err)
	}
	open(t, root)
	for _, name := range []string{"README.md", "inputs/A棟資料.csv", "exports/result.csv"} {
		raw, err := os.ReadFile(filepath.Join(root, name))
		if err != nil || string(raw) != "operator content" {
			t.Fatalf("overwrote %s: %v", name, err)
		}
	}
}

func TestWorkspaceBootstrapRejectsInvalidDirectory(t *testing.T) {
	for _, symlink := range []bool{false, true} {
		root := t.TempDir()
		path := filepath.Join(root, "inputs")
		var err error
		if symlink {
			err = os.Symlink(t.TempDir(), path)
		} else {
			err = os.WriteFile(path, []byte("keep"), 0600)
		}
		if err != nil {
			t.Fatal(err)
		}
		if err := prepareWorkspace(root); err == nil {
			t.Fatal("accepted invalid inputs directory")
		}
	}
}
