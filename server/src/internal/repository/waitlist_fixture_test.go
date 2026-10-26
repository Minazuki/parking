package repository

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/Minazuki/parking/server/src/draw"
	"github.com/Minazuki/parking/server/src/internal/beacon"
	"github.com/Minazuki/parking/server/src/internal/domain"
	"github.com/Minazuki/parking/server/src/internal/inputcsv"
)

func TestWaitlistCSVHasTenWaitlistedHouseholdsPerSecondRoundPool(t *testing.T) {
	root := t.TempDir()
	h := open(t, root)
	for _, name := range []string{inputcsv.RegistrationA, inputcsv.RegistrationB, inputcsv.Accessible, inputcsv.Payments} {
		raw, err := os.ReadFile(filepath.Join("../../../../testdata/waitlist/input", name))
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(root, "inputs", name), raw, 0600); err != nil {
			t.Fatal(err)
		}
	}
	calls := 0
	h.Fetch = func(context.Context) (beacon.Evidence, error) { calls++; return evidence(t), nil }
	if _, err := h.ImportRegistrationCSV(); err != nil {
		t.Fatal(err)
	}
	if _, err := h.RunRound(1); err != nil {
		t.Fatal(err)
	}
	if _, err := h.ImportPaymentsCSV(); err != nil {
		t.Fatal(err)
	}
	reviewed, err := h.Review()
	if err != nil {
		t.Fatal(err)
	}
	var review domain.Second
	if err := json.Unmarshal(reviewed.States[4], &review); err != nil {
		t.Fatal(err)
	}
	wantSpaces := []int{18, 8, 6}
	wantPeople := []int{28, 18, 16}
	for i, pool := range review.Pools {
		spaces, waiting := 0, 0
		for _, c := range pool.Candidates {
			if c.Type == "space" {
				spaces++
			} else {
				waiting++
			}
		}
		if spaces != wantSpaces[i] || waiting != 10 || len(pool.Households) != wantPeople[i] {
			t.Fatalf("pool %s: spaces=%d waiting=%d people=%d", pool.ID, spaces, waiting, len(pool.Households))
		}
	}
	snapshot, err := h.RunRound(2)
	if err != nil || snapshot.CurrentStage != 6 || calls != 2 {
		t.Fatalf("stage=%d seedCalls=%d err=%v", snapshot.CurrentStage, calls, err)
	}
	var result draw.Result
	if err := json.Unmarshal(snapshot.States[6], &result); err != nil {
		t.Fatal(err)
	}
	if len(result.Pools) != 3 {
		t.Fatal("missing second round pools")
	}
	for i, pool := range result.Pools {
		if len(pool.Assignments) != wantSpaces[i] || len(pool.Waitlist) != 10 || len(pool.UnassignedHouseholds) != 0 || len(pool.RemainingSpaces) != 0 {
			t.Fatalf("unexpected result for %s: %+v", pool.ID, pool)
		}
		for rank, item := range pool.Waitlist {
			if item.Rank != rank+1 {
				t.Fatal("non-contiguous waitlist", item)
			}
		}
	}
}
