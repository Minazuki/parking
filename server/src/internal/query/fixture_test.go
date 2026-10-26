package query

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestReadQueryOnlyFixtureValidatesPublicSchema(t *testing.T) {
	data, err := Build(fixture, 1, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "query.json")
	write := func(value any) {
		raw, err := json.Marshal(value)
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, raw, 0600); err != nil {
			t.Fatal(err)
		}
	}
	write(data)
	now := time.Date(2026, 10, 27, 0, 0, 0, 0, time.UTC)
	result, err := ReadFixture(path, 1, now)
	if err != nil || result.BuiltAt != now.Format(time.RFC3339) {
		t.Fatal(err)
	}
	if _, err := ReadFixture(path, 2, now); err == nil {
		t.Fatal("accepted mismatched round")
	}
	data.TestMode = false
	write(data)
	if _, err := ReadFixture(path, 0, now); err == nil {
		t.Fatal("accepted query-only data as formal mode")
	}
	data.TestMode = true
	raw, _ := json.Marshal(data)
	var fields map[string]any
	if err := json.Unmarshal(raw, &fields); err != nil {
		t.Fatal(err)
	}
	fields["seed"] = "made-up"
	write(fields)
	if _, err := ReadFixture(path, 0, now); err == nil {
		t.Fatal("accepted unsupported evidence field")
	}
}
func TestReadQueryOnlyFixtureRejectsSpaceCollisionsAndWaitlistGaps(t *testing.T) {
	data := Dataset{SchemaVersion: 1, ActivityYear: 115, ThroughRound: 2, TestMode: true, SplitAccessible: []string{}, Households: []Household{
		{Household: "999-1", Records: []Record{{Category: "motorcycle", Round: 1, Status: "assigned", SpaceID: "86"}}},
		{Household: "999-2", Records: []Record{{Category: "motorcycle", Round: 2, Status: "assigned", SpaceID: "86"}}},
	}}
	path := filepath.Join(t.TempDir(), "query.json")
	checkRejected := func() {
		raw, _ := json.Marshal(data)
		if err := os.WriteFile(path, raw, 0600); err != nil {
			t.Fatal(err)
		}
		if _, err := ReadFixture(path, 0, time.Now()); err == nil {
			t.Fatal("accepted invalid query fixture")
		}
	}
	checkRejected()
	data.Households[1].Records[0] = Record{Category: "motorcycle", Round: 2, Status: "waitlisted", Rank: 2}
	checkRejected()
	data.Households[1].Records[0] = Record{Category: "bicycle_small", Round: 2, Status: "assigned", SpaceID: "小38"}
	checkRejected()
}
