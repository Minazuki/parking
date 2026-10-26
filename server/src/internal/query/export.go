// Package query projects verified checkpoints into a minimal public dataset.
package query

import (
	"encoding/json"
	"fmt"
	"reflect"
	"sort"
	"strings"
	"time"

	"github.com/Minazuki/parking/server/src/draw"
	"github.com/Minazuki/parking/server/src/internal/domain"
	"github.com/Minazuki/parking/server/src/internal/repository"
)

type Record struct {
	Category string `json:"category"`
	Round    int    `json:"round"`
	Status   string `json:"status"`
	SpaceID  string `json:"spaceId,omitempty"`
	Rank     int    `json:"rank,omitempty"`
}
type Household struct {
	Household string   `json:"household"`
	Records   []Record `json:"records"`
}
type Dataset struct {
	SchemaVersion   int         `json:"schemaVersion"`
	ActivityYear    int         `json:"activityYear"`
	ThroughRound    int         `json:"throughRound"`
	TestMode        bool        `json:"testMode"`
	BuiltAt         string      `json:"builtAt"`
	SplitAccessible []string    `json:"splitAccessible"`
	Households      []Household `json:"households"`
}

func category(id string) string {
	if strings.HasPrefix(id, "motorcycle") {
		return "motorcycle"
	}
	return id
}

// Build never opens a mutable Store, acquires a lease, or requests a beacon.
// A second verified read rejects checkpoints changed during projection.
func Build(workspace string, round int, now time.Time) (Dataset, error) {
	var out Dataset
	validator, err := domain.NewValidator()
	if err != nil {
		return out, err
	}
	snapshot, err := repository.Load(workspace, validator)
	if err != nil {
		return out, err
	}
	if round == 0 {
		if snapshot.CurrentStage >= 6 {
			round = 2
		} else {
			round = 1
		}
	}
	if round != 1 && round != 2 {
		return out, fmt.Errorf("round must be auto, 1 or 2")
	}
	required := 2
	if round == 2 {
		required = 6
	}
	if snapshot.CurrentStage < required {
		return out, fmt.Errorf("round %d requires complete checkpoints 0 through %d", round, required)
	}
	var activity struct {
		ActivityYear int    `json:"activityYear"`
		Mode         string `json:"mode"`
	}
	if err := json.Unmarshal(snapshot.Activity, &activity); err != nil || activity.ActivityYear < 1 {
		return out, fmt.Errorf("missing valid activity metadata")
	}
	var first domain.First
	var allocation draw.Result
	if err := json.Unmarshal(snapshot.States[0], &first); err != nil {
		return out, err
	}
	if err := json.Unmarshal(snapshot.States[2], &allocation); err != nil {
		return out, err
	}
	out = Dataset{1, activity.ActivityYear, round, activity.Mode == "test", now.UTC().Format(time.RFC3339), []string{}, []Household{}}
	for _, id := range []string{"14", "2", "3"} {
		for _, split := range first.Accessible.Split {
			if split == id+"-1" {
				out.SplitAccessible = append(out.SplitAccessible, id)
			}
		}
	}
	households := map[string][]Record{}
	for _, row := range append(first.Registrations.A, first.Registrations.B...) {
		households[row.Household] = []Record{}
	}
	retained := map[string]bool{}
	key := func(cat, house, space string) string { return cat + ":" + house + ":" + space }
	if round == 2 {
		var review domain.Second
		if err := json.Unmarshal(snapshot.States[4], &review); err != nil {
			return out, err
		}
		for _, item := range review.Review {
			for _, a := range item.Retained {
				retained[key(item.Category, a.Household, a.SpaceID)] = true
			}
		}
	}
	addAssigned := func(cat, house, space string, n int) {
		status := "assigned"
		if n == 1 && round == 2 && !retained[key(cat, house, space)] {
			status = "released"
		}
		households[house] = append(households[house], Record{Category: cat, Round: n, Status: status, SpaceID: space})
	}
	for _, a := range first.Accessible.Assignments {
		addAssigned("motorcycle", a.Household, a.SpaceID, 1)
	}
	addRound := func(result draw.Result, n int) {
		for _, pool := range result.Pools {
			cat := category(pool.ID)
			for _, a := range pool.Assignments {
				addAssigned(cat, a.Household, a.SpaceID, n)
			}
			for _, w := range pool.Waitlist {
				households[w.Household] = append(households[w.Household], Record{Category: cat, Round: n, Status: "waitlisted", Rank: w.Rank})
			}
			for _, h := range pool.UnassignedHouseholds {
				households[h] = append(households[h], Record{Category: cat, Round: n, Status: "unassigned"})
			}
		}
	}
	addRound(allocation, 1)
	if round == 2 {
		var second draw.Result
		if err := json.Unmarshal(snapshot.States[6], &second); err != nil {
			return out, err
		}
		addRound(second, 2)
	}
	ids := make([]string, 0, len(households))
	for id := range households {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool { return domain.HouseholdLess(ids[i], ids[j]) })
	for _, id := range ids {
		out.Households = append(out.Households, Household{id, households[id]})
	}
	after, err := repository.Load(workspace, validator)
	if err != nil {
		return out, err
	}
	if !reflect.DeepEqual(snapshot, after) {
		return out, fmt.Errorf("workspace changed while exporting; stop the server and retry")
	}
	return out, nil
}
