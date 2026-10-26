package query

import (
	"context"
	"encoding/json"
	"github.com/Minazuki/parking/server/src/internal/beacon"
	"github.com/Minazuki/parking/server/src/internal/domain"
	"github.com/Minazuki/parking/server/src/internal/repository"
	"github.com/Minazuki/parking/server/src/internal/service"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

const fixture = "../../../../examples/workspace"

func TestBuildSeparatesFirstRoundHistoryFromEffectiveCombinedResults(t *testing.T) {
	now := time.Date(2026, 10, 27, 0, 0, 0, 0, time.UTC)
	first, err := Build(fixture, 1, now)
	if err != nil {
		t.Fatal(err)
	}
	second, err := Build(fixture, 0, now)
	if err != nil {
		t.Fatal(err)
	}
	if first.ThroughRound != 1 || second.ThroughRound != 2 || len(second.Households) != 5 {
		t.Fatal("wrong output metadata")
	}
	var originalSpace string
	for _, h := range first.Households {
		for _, r := range h.Records {
			if r.Round != 1 || r.Status != "assigned" {
				t.Fatal("first export includes later outcomes")
			}
			if h.Household == "999-2" && r.Category == "motorcycle" {
				originalSpace = r.SpaceID
			}
		}
	}
	if originalSpace == "" {
		t.Fatal("missing first allocation")
	}
	foundReleased, foundNew := false, false
	for _, h := range second.Households {
		for _, r := range h.Records {
			if h.Household == "999-2" && r.Round == 1 && r.Category == "motorcycle" {
				foundReleased = r.Status == "released" && r.SpaceID == originalSpace
			}
			if r.Round == 2 && (r.Status == "assigned" || r.Status == "waitlisted") {
				foundNew = true
			}
		}
	}
	if !foundReleased || !foundNew {
		t.Fatal("combined results failed to exclude released allocations or include round two")
	}
	raw, _ := json.Marshal(second)
	for _, private := range []string{"activityId", "payments", "seed", "streamHex", "importedAt", "source"} {
		if strings.Contains(string(raw), `"`+private+`"`) {
			t.Fatal("private field exported", private)
		}
	}
	if _, err := Build(fixture, 3, now); err == nil {
		t.Fatal("accepted unknown round")
	}
}
func TestBuildRejectsMissingOrCorruptedCheckpointsWithoutWritingSource(t *testing.T) {
	root := t.TempDir()
	if err := os.CopyFS(root, os.DirFS(fixture)); err != nil {
		t.Fatal(err)
	}
	for _, stage := range []string{"3", "4", "5", "6"} {
		if err := os.RemoveAll(filepath.Join(root, "checkpoints", stage)); err != nil {
			t.Fatal(err)
		}
	}
	data, err := Build(root, 0, time.Now())
	if err != nil || data.ThroughRound != 1 {
		t.Fatal(err)
	}
	if _, err := Build(root, 2, time.Now()); err == nil {
		t.Fatal("accepted missing second round")
	}
	if _, err := os.Stat(filepath.Join(root, ".parking.lock")); !os.IsNotExist(err) {
		t.Fatal("export created a workspace lease")
	}
	file := filepath.Join(root, "checkpoints/2/state.json")
	if err := os.WriteFile(file, []byte(`{}`), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := Build(root, 1, time.Now()); err == nil {
		t.Fatal("accepted corrupted allocation")
	}
}

func TestBuildIncludesTenWaitlistRanksForEveryCategory(t *testing.T) {
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, "inputs"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.CopyFS(filepath.Join(root, "inputs"), os.DirFS("../../../../testdata/waitlist/input")); err != nil {
		t.Fatal(err)
	}
	validator, err := domain.NewValidator()
	if err != nil {
		t.Fatal(err)
	}
	store, err := repository.Open(root, "query-test", validator)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	read := func(name string) []byte {
		raw, err := os.ReadFile(filepath.Join(fixture, "checkpoints/1", name))
		if err != nil {
			t.Fatal(err)
		}
		return raw
	}
	var state beacon.State
	if err := json.Unmarshal(read("state.json"), &state); err != nil {
		t.Fatal(err)
	}
	saved := beacon.Evidence{State: state, Info: read("info.json"), Beacon: read("beacon.json")}
	app := service.New(store, func(context.Context) (beacon.Evidence, error) { return saved, nil }, validator, "query-test")
	if _, err := app.InitActivity(116, "test"); err != nil {
		t.Fatal(err)
	}
	if _, err := app.ImportRegistrationCSV(); err != nil {
		t.Fatal(err)
	}
	if _, err := app.RunRound(1); err != nil {
		t.Fatal(err)
	}
	if _, err := app.ImportPaymentsCSV(); err != nil {
		t.Fatal(err)
	}
	if _, err := app.Review(); err != nil {
		t.Fatal(err)
	}
	if _, err := app.RunRound(2); err != nil {
		t.Fatal(err)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	data, err := Build(root, 0, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	counts := map[string]map[int]bool{}
	for _, h := range data.Households {
		for _, r := range h.Records {
			if r.Status == "waitlisted" {
				if counts[r.Category] == nil {
					counts[r.Category] = map[int]bool{}
				}
				counts[r.Category][r.Rank] = true
				if r.Round != 2 || r.SpaceID != "" {
					t.Fatal("invalid public waitlist record", r)
				}
			}
		}
	}
	for _, category := range []string{"motorcycle", "bicycle_large", "bicycle_small"} {
		if len(counts[category]) != 10 {
			t.Fatal("missing waitlist ranks", category, counts)
		}
		for rank := 1; rank <= 10; rank++ {
			if !counts[category][rank] {
				t.Fatal("missing rank", category, rank)
			}
		}
	}
}
