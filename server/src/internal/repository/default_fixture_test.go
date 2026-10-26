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

func TestDefaultCSVCompletesBothRounds(t *testing.T) {
	root := t.TempDir()
	h := open(t, root)
	for _, name := range []string{inputcsv.RegistrationA, inputcsv.RegistrationB, inputcsv.Accessible, inputcsv.Payments} {
		raw, err := os.ReadFile(filepath.Join("../../../../testdata/default/input", name))
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(root, "inputs", name), raw, 0600); err != nil {
			t.Fatal(err)
		}
	}
	calls := 0
	h.Fetch = func(context.Context) (beacon.Evidence, error) {
		calls++
		return evidence(t), nil
	}
	if _, err := h.ImportRegistrationCSV(); err != nil {
		t.Fatal(err)
	}
	if _, err := h.RunRound(1); err != nil {
		t.Fatal(err)
	}
	if _, err := h.ImportPaymentsCSV(); err != nil {
		t.Fatal(err)
	}
	if _, err := h.Review(); err != nil {
		t.Fatal(err)
	}
	snapshot, err := h.RunRound(2)
	if err != nil || snapshot.CurrentStage != 6 || calls != 2 {
		t.Fatalf("stage=%d seedCalls=%d err=%v", snapshot.CurrentStage, calls, err)
	}
	var first domain.First
	if err := json.Unmarshal(snapshot.States[0], &first); err != nil {
		t.Fatal(err)
	}
	for _, building := range []struct {
		rows                    []domain.Registration
		total, declined, second int
	}{
		{first.Registrations.A, 65, 2, 7}, {first.Registrations.B, 85, 3, 9},
	} {
		declined, second := 0, 0
		for _, row := range building.rows {
			if row.Motorcycle == 0 {
				declined++
			}
			if row.Motorcycle == 2 {
				second++
			}
		}
		if len(building.rows) != building.total || declined != building.declined || second != building.second {
			t.Fatalf("unexpected registration counts: %+v", building)
		}
	}
	var review domain.Second
	if err := json.Unmarshal(snapshot.States[4], &review); err != nil {
		t.Fatal(err)
	}
	if len(review.Review[0].Released) != 10 || len(review.Pools[0].Households) != 16 || len(review.Pools[0].Candidates) != 18 {
		t.Fatal("unexpected motorcycle review totals")
	}
	for _, stage := range []int{2, 6} {
		var result draw.Result
		if err := json.Unmarshal(snapshot.States[stage], &result); err != nil {
			t.Fatal(err)
		}
		want := 4
		if stage == 6 {
			want = 3
		}
		if len(result.Pools) != want {
			t.Fatalf("stage %d: expected %d pools", stage, want)
		}
		for _, pool := range result.Pools {
			if len(pool.Assignments) == 0 {
				t.Fatalf("stage %d pool %s has no assignments", stage, pool.ID)
			}
		}
	}
}
