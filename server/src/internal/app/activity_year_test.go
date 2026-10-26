package app

import (
	"testing"
	"time"
)

func TestNextActivityYearUsesStartupInTaiwan(t *testing.T) {
	for _, item := range []struct {
		utc  string
		year int
	}{
		{"2026-10-26T00:00:00Z", 116},
		{"2026-12-31T15:59:59Z", 116},
		{"2026-12-31T16:00:00Z", 117},
	} {
		now, err := time.Parse(time.RFC3339, item.utc)
		if err != nil {
			t.Fatal(err)
		}
		if got := nextActivityYear(now); got != item.year {
			t.Fatalf("%s: got %d, want %d", item.utc, got, item.year)
		}
	}
}
