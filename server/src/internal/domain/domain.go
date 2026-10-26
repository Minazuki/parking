package domain

import (
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/Minazuki/parking/server/src/draw"
)

type Registration struct {
	Household  string `json:"household"`
	Motorcycle int    `json:"motorcycle"`
	Large      int    `json:"bicycleLarge"`
	Small      int    `json:"bicycleSmall"`
}
type Registrations struct {
	A []Registration `json:"A"`
	B []Registration `json:"B"`
}
type AccessibleAssignment struct {
	Order     int    `json:"order"`
	Household string `json:"household"`
	SpaceID   string `json:"spaceId"`
}
type Accessible struct {
	Assignments []AccessibleAssignment `json:"assignments"`
	Split       []string               `json:"splitSpaces"`
	Transferred []string               `json:"transferredSpaces"`
}
type First struct {
	SchemaVersion int           `json:"schemaVersion"`
	Registrations Registrations `json:"registrations"`
	Accessible    Accessible    `json:"accessible"`
	Pools         []draw.Pool   `json:"pools"`
}
type Payment struct {
	Household  string `json:"household"`
	Motorcycle bool   `json:"motorcycle"`
	Large      bool   `json:"bicycleLarge"`
	Small      bool   `json:"bicycleSmall"`
}
type Payments struct {
	SchemaVersion int             `json:"schemaVersion"`
	Source        json.RawMessage `json:"source"`
	Payments      []Payment       `json:"payments"`
}
type Released struct {
	Household string `json:"household"`
	SpaceID   string `json:"spaceId"`
	Reason    string `json:"reason"`
}
type Review struct {
	Category string            `json:"category"`
	Retained []draw.Assignment `json:"retained"`
	Released []Released        `json:"released"`
	Vacant   []string          `json:"vacantSpaces"`
}
type Origin struct {
	Category string `json:"category"`
	SpaceID  string `json:"spaceId"`
	Source   string `json:"source"`
}
type Second struct {
	SchemaVersion int         `json:"schemaVersion"`
	Review        []Review    `json:"review"`
	Pools         []draw.Pool `json:"pools"`
	Origins       []Origin    `json:"spaceOrigins"`
}

func householdParts(s string) (int64, int64) {
	p := strings.Split(s, "-")
	if len(p) != 2 {
		return -1, -1
	}
	a, e1 := strconv.ParseInt(p[0], 10, 64)
	b, e2 := strconv.ParseInt(p[1], 10, 64)
	if e1 != nil || e2 != nil || a < 1 || b < 1 || a > 9007199254740991 || b > 9007199254740991 {
		return -1, -1
	}
	return a, b
}
// HouseholdLess compares normalized household IDs by door number and floor.
func HouseholdLess(a, b string) bool {
	x, y := householdParts(a)
	z, w := householdParts(b)
	return x < z || x == z && y < w
}
func spaceParts(s string) (int, int) {
	s = strings.TrimPrefix(strings.TrimPrefix(s, "大"), "小")
	p := strings.Split(s, "-")
	a, _ := strconv.Atoi(p[0])
	b := 0
	if len(p) > 1 {
		b, _ = strconv.Atoi(p[1])
	}
	return a, b
}
func spaceLess(a, b string) bool {
	x, y := spaceParts(a)
	z, w := spaceParts(b)
	return x < z || x == z && y < w
}
func orderedHouseholds(ids []string) error {
	seen := map[string]bool{}
	for i, s := range ids {
		a, _ := householdParts(s)
		if a < 1 || seen[s] || i > 0 && !HouseholdLess(ids[i-1], s) {
			return fmt.Errorf("invalid, duplicate or unsorted household %q", s)
		}
		seen[s] = true
	}
	return nil
}
func candidate(s string) draw.Candidate      { return draw.Candidate{Type: "space", SpaceID: &s} }
func allRows(r Registrations) []Registration { return append(append([]Registration{}, r.A...), r.B...) }
func householdIDs(rows []Registration, kind int, round int, excluded map[string]bool) []string {
	out := []string{}
	for _, r := range rows {
		value := r.Motorcycle
		if kind == 1 {
			value = r.Large
		} else if kind == 2 {
			value = r.Small
		}
		if (round == 1 && value > 0 || round == 2 && value == 2) && !excluded[r.Household] {
			out = append(out, r.Household)
		}
	}
	sort.Slice(out, func(i, j int) bool { return HouseholdLess(out[i], out[j]) })
	return out
}
func BuildFirst(reg Registrations, assignments []AccessibleAssignment) (First, error) {
	if reg.A == nil || reg.B == nil || assignments == nil {
		return First{}, fmt.Errorf("registration arrays required")
	}
	sortRows := func(rows []Registration) {
		sort.Slice(rows, func(i, j int) bool { return HouseholdLess(rows[i].Household, rows[j].Household) })
	}
	sortRows(reg.A)
	sortRows(reg.B)
	all := allRows(reg)
	known := map[string]bool{}
	for _, r := range all {
		if known[r.Household] || r.Motorcycle < 0 || r.Motorcycle > 2 || r.Large < 0 || r.Large > 2 || r.Small < 0 || r.Small > 2 {
			return First{}, fmt.Errorf("invalid registration")
		}
		known[r.Household] = true
	}
	ids := []string{}
	for _, r := range all {
		ids = append(ids, r.Household)
	}
	sort.Slice(ids, func(i, j int) bool { return HouseholdLess(ids[i], ids[j]) })
	if err := orderedHouseholds(ids); err != nil {
		return First{}, err
	}
	accessible := Accessible{Assignments: assignments, Split: []string{}, Transferred: []string{}}
	excluded, occupied := map[string]bool{}, map[string]bool{}
	aCount := 0
	order := []string{"14", "2", "3"}
	for i, a := range assignments {
		if i >= 3 || a.Order != i+1 || a.SpaceID != order[i] || !known[a.Household] || excluded[a.Household] {
			return First{}, fmt.Errorf("invalid accessible assignment")
		}
		excluded[a.Household] = true
		occupied[a.SpaceID] = true
		for _, r := range reg.A {
			if r.Household == a.Household {
				aCount++
			}
		}
	}
	for _, id := range order {
		if !occupied[id] {
			accessible.Split = append(accessible.Split, id, id+"-1")
		}
	}
	sort.Slice(accessible.Split, func(i, j int) bool { return spaceLess(accessible.Split[i], accessible.Split[j]) })
	for i := 0; i < aCount; i++ {
		accessible.Transferred = append(accessible.Transferred, strconv.Itoa(86+i))
	}
	aSpaces, bSpaces, large, small := []draw.Candidate{}, []draw.Candidate{}, []draw.Candidate{}, []draw.Candidate{}
	for i := 86 + aCount; i <= 150; i++ {
		aSpaces = append(aSpaces, candidate(strconv.Itoa(i)))
	}
	bIDs := []string{}
	for i := 1; i <= 85; i++ {
		id := strconv.Itoa(i)
		if !occupied[id] {
			bIDs = append(bIDs, id)
		}
	}
	for _, id := range accessible.Split {
		if strings.HasSuffix(id, "-1") {
			bIDs = append(bIDs, id)
		}
	}
	bIDs = append(bIDs, accessible.Transferred...)
	sort.Slice(bIDs, func(i, j int) bool { return spaceLess(bIDs[i], bIDs[j]) })
	for _, s := range bIDs {
		bSpaces = append(bSpaces, candidate(s))
	}
	for i := 1; i <= 38; i++ {
		large = append(large, candidate("大"+strconv.Itoa(i)))
	}
	for i := 39; i <= 57; i++ {
		small = append(small, candidate("小"+strconv.Itoa(i)))
	}
	first := First{1, reg, accessible, []draw.Pool{{ID: "motorcycle_a", Households: householdIDs(reg.A, 0, 1, excluded), Candidates: aSpaces}, {ID: "motorcycle_b", Households: householdIDs(reg.B, 0, 1, excluded), Candidates: bSpaces}, {ID: "bicycle_large", Households: householdIDs(all, 1, 1, nil), Candidates: large}, {ID: "bicycle_small", Households: householdIDs(all, 2, 1, nil), Candidates: small}}}
	return first, draw.Validate(draw.Prepared{SchemaVersion: 1, DrawRound: 1, Pools: first.Pools})
}
func ValidateFirst(first First) error {
	// Build against a detached copy; loading must never reorder caller data.
	raw, _ := json.Marshal(first)
	var copy First
	if err := json.Unmarshal(raw, &copy); err != nil {
		return err
	}
	expected, err := BuildFirst(copy.Registrations, copy.Accessible.Assignments)
	if err != nil {
		return err
	}
	actual, _ := json.Marshal(first)
	want, _ := json.Marshal(expected)
	if !EqualJSON(actual, want) {
		return fmt.Errorf("stage 0 differs from registration or space preparation rules")
	}
	return nil
}
func ValidatePayments(p Payments, f First) error {
	ids := []string{}
	for _, row := range p.Payments {
		ids = append(ids, row.Household)
	}
	if err := orderedHouseholds(ids); err != nil {
		return err
	}
	wanted := []string{}
	for _, r := range allRows(f.Registrations) {
		wanted = append(wanted, r.Household)
	}
	sort.Slice(wanted, func(i, j int) bool { return HouseholdLess(wanted[i], wanted[j]) })
	a, _ := json.Marshal(ids)
	b, _ := json.Marshal(wanted)
	if !EqualJSON(a, b) {
		return fmt.Errorf("payment households must match registration")
	}
	return nil
}
func BuildSecond(first First, allocation draw.Result, p Payments) (Second, error) {
	if err := ValidatePayments(p, first); err != nil {
		return Second{}, err
	}
	payment := map[string]Payment{}
	for _, row := range p.Payments {
		payment[row.Household] = row
	}
	categories := []string{"motorcycle", "bicycle_large", "bicycle_small"}
	second := Second{SchemaVersion: 1, Review: []Review{}, Pools: []draw.Pool{}, Origins: []Origin{}}
	for kind, category := range categories {
		assignments := []draw.Assignment{}
		vacant := []string{}
		for _, pool := range allocation.Pools {
			if kind == 0 && strings.HasPrefix(pool.ID, "motorcycle") || pool.ID == category {
				assignments = append(assignments, pool.Assignments...)
				vacant = append(vacant, pool.RemainingSpaces...)
			}
		}
		if kind == 0 {
			for _, a := range first.Accessible.Assignments {
				assignments = append(assignments, draw.Assignment{Household: a.Household, SpaceID: a.SpaceID})
			}
		}
		r := Review{category, []draw.Assignment{}, []Released{}, vacant}
		origins := []Origin{}
		for _, a := range assignments {
			paid, ok := payment[a.Household]
			if !ok {
				return second, fmt.Errorf("allocation household missing payment")
			}
			value := paid.Motorcycle
			if kind == 1 {
				value = paid.Large
			} else if kind == 2 {
				value = paid.Small
			}
			if value {
				r.Retained = append(r.Retained, a)
			} else {
				r.Released = append(r.Released, Released{a.Household, a.SpaceID, "unpaid_after_deadline"})
				origins = append(origins, Origin{category, a.SpaceID, "unpaid_after_deadline"})
			}
		}
		for _, space := range vacant {
			origins = append(origins, Origin{category, space, "first_round_vacant"})
		}
		sort.Slice(r.Retained, func(i, j int) bool { return spaceLess(r.Retained[i].SpaceID, r.Retained[j].SpaceID) })
		sort.Slice(r.Released, func(i, j int) bool { return spaceLess(r.Released[i].SpaceID, r.Released[j].SpaceID) })
		sort.Slice(r.Vacant, func(i, j int) bool { return spaceLess(r.Vacant[i], r.Vacant[j]) })
		sort.Slice(origins, func(i, j int) bool { return spaceLess(origins[i].SpaceID, origins[j].SpaceID) })
		pool := draw.Pool{ID: category, Households: householdIDs(allRows(first.Registrations), kind, 2, nil), Candidates: []draw.Candidate{}}
		for _, o := range origins {
			pool.Candidates = append(pool.Candidates, candidate(o.SpaceID))
		}
		for rank := 1; rank <= len(pool.Households)-len(origins); rank++ {
			n := rank
			pool.Candidates = append(pool.Candidates, draw.Candidate{Type: "waitlist", Rank: &n})
		}
		second.Review = append(second.Review, r)
		second.Pools = append(second.Pools, pool)
		second.Origins = append(second.Origins, origins...)
	}
	return second, draw.Validate(draw.Prepared{SchemaVersion: 1, DrawRound: 2, Pools: second.Pools})
}
