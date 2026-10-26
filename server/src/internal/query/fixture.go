package query

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// ReadFixture accepts explicit query-only test data, not checkpoint evidence.
// Unknown fields (including seed/payment data) are rejected rather than copied.
func ReadFixture(path string, round int, now time.Time) (Dataset, error) {
	var data Dataset
	info, err := os.Lstat(path)
	if err != nil {
		return data, err
	}
	if !info.Mode().IsRegular() || info.Size() > 16<<20 {
		return data, fmt.Errorf("query data must be a regular JSON file under 16MiB")
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return data, err
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&data); err != nil {
		return data, err
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return data, fmt.Errorf("trailing JSON content")
	}
	if data.Households == nil || data.SplitAccessible == nil || data.SchemaVersion != 1 || !data.TestMode || data.ActivityYear < 1 || data.ThroughRound < 1 || data.ThroughRound > 2 {
		return data, fmt.Errorf("query fixture must have schemaVersion 1, testMode true, a valid activity year and round")
	}
	if round != 0 && round != data.ThroughRound {
		return data, fmt.Errorf("--round does not match the query fixture")
	}
	split := map[string]bool{}
	for _, id := range data.SplitAccessible {
		if split[id] || (id != "14" && id != "2" && id != "3") {
			return data, fmt.Errorf("invalid split accessible ID")
		}
		split[id] = true
	}
	households := map[string]bool{}
	occupied := map[string]bool{}
	waiting := map[string]map[int]bool{}
	housePattern := regexp.MustCompile(`^[1-9][0-9]*-[1-9][0-9]*$`)
	motorPattern := regexp.MustCompile(`^(?:[1-9][0-9]?|1[0-4][0-9]|150|(?:2|3|14)-1)$`)
	largePattern := regexp.MustCompile(`^大(?:[1-9]|[12][0-9]|3[0-8])$`)
	smallPattern := regexp.MustCompile(`^小(?:39|4[0-9]|5[0-7])$`)
	for _, h := range data.Households {
		if h.Records == nil || !housePattern.MatchString(h.Household) || households[h.Household] {
			return data, fmt.Errorf("invalid or duplicate household")
		}
		for _, part := range strings.Split(h.Household, "-") {
			n, e := strconv.ParseUint(part, 10, 64)
			if e != nil || n > 9007199254740991 {
				return data, fmt.Errorf("invalid household number")
			}
		}
		households[h.Household] = true
		records := map[string]bool{}
		for _, r := range h.Records {
			if r.Round < 1 || r.Round > data.ThroughRound {
				return data, fmt.Errorf("record round exceeds published round")
			}
			pattern := motorPattern
			switch r.Category {
			case "motorcycle":
			case "bicycle_large":
				pattern = largePattern
			case "bicycle_small":
				pattern = smallPattern
			default:
				return data, fmt.Errorf("unknown vehicle category")
			}
			key := fmt.Sprintf("%s:%d:%s:%s:%d", r.Category, r.Round, r.Status, r.SpaceID, r.Rank)
			if records[key] {
				return data, fmt.Errorf("duplicate query record")
			}
			records[key] = true
			switch r.Status {
			case "assigned", "released":
				if !pattern.MatchString(r.SpaceID) || r.Rank != 0 {
					return data, fmt.Errorf("invalid assigned or released space")
				}
				if strings.HasSuffix(r.SpaceID, "-1") && !split[strings.TrimSuffix(r.SpaceID, "-1")] {
					return data, fmt.Errorf("split space missing layout configuration")
				}
				if r.Status == "released" {
					if r.Round != 1 || data.ThroughRound != 2 {
						return data, fmt.Errorf("released history requires combined publication")
					}
				} else {
					slot := r.Category + ":" + r.SpaceID
					if occupied[slot] {
						return data, fmt.Errorf("duplicate effective parking space")
					}
					occupied[slot] = true
				}
			case "waitlisted":
				if r.Round != 2 || r.Rank < 1 || r.SpaceID != "" {
					return data, fmt.Errorf("invalid waitlist")
				}
				if waiting[r.Category] == nil {
					waiting[r.Category] = map[int]bool{}
				}
				if waiting[r.Category][r.Rank] {
					return data, fmt.Errorf("duplicate waitlist rank")
				}
				waiting[r.Category][r.Rank] = true
			case "unassigned":
				if r.SpaceID != "" || r.Rank != 0 {
					return data, fmt.Errorf("invalid unassigned record")
				}
			default:
				return data, fmt.Errorf("unknown query status")
			}
		}
	}
	for _, ranks := range waiting {
		for i := 1; i <= len(ranks); i++ {
			if !ranks[i] {
				return data, fmt.Errorf("non-contiguous waitlist ranks")
			}
		}
	}
	data.BuiltAt = now.UTC().Format(time.RFC3339)
	return data, nil
}
