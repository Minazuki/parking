package draw

import (
	"bytes"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"regexp"
	"sort"
	"strings"

	"golang.org/x/crypto/chacha20"
)

const Algorithm = "parking-draw-chacha20-v2"

type Candidate struct {
	Type    string  `json:"type"`
	SpaceID *string `json:"spaceId,omitempty"`
	Rank    *int    `json:"rank,omitempty"`
}

func (c *Candidate) UnmarshalJSON(raw []byte) error {
	type alias Candidate
	var decoded alias
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&decoded); err != nil {
		return err
	}
	var keys map[string]json.RawMessage
	if err := json.Unmarshal(raw, &keys); err != nil {
		return err
	}
	field := "spaceId"
	if decoded.Type == "waitlist" {
		field = "rank"
	}
	if len(keys) != 2 || keys["type"] == nil || keys[field] == nil {
		return fmt.Errorf("invalid candidate fields")
	}
	*c = Candidate(decoded)
	return nil
}

type Pool struct {
	ID         string      `json:"id"`
	Households []string    `json:"households"`
	Candidates []Candidate `json:"candidates"`
}
type Prepared struct {
	SchemaVersion int    `json:"schemaVersion"`
	DrawRound     int    `json:"drawRound"`
	Pools         []Pool `json:"pools"`
}
type Assignment struct {
	Household string `json:"household"`
	SpaceID   string `json:"spaceId"`
}
type Waiting struct {
	Household string `json:"household"`
	Rank      int    `json:"rank"`
}
type PoolResult struct {
	ID                   string       `json:"id"`
	Status               string       `json:"status"`
	Reason               *string      `json:"reason"`
	Assignments          []Assignment `json:"assignments"`
	Waitlist             []Waiting    `json:"waitlist"`
	UnassignedHouseholds []string     `json:"unassignedHouseholds"`
	RemainingSpaces      []string     `json:"remainingSpaces"`
}
type Result struct {
	SchemaVersion  int          `json:"schemaVersion"`
	Algorithm      string       `json:"algorithm"`
	Nonce          string       `json:"nonce"`
	InitialCounter int          `json:"initialCounter"`
	Uint32Endian   string       `json:"uint32Endian"`
	PoolRemoval    string       `json:"poolRemoval"`
	Status         string       `json:"status"`
	Reason         *string      `json:"reason"`
	StreamHex      string       `json:"streamHex"`
	Pools          []PoolResult `json:"pools"`
}

func pointer(s string) *string { return &s }
func Decode(raw []byte) (Prepared, error) {
	var input Prepared
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		return input, err
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		return input, fmt.Errorf("trailing JSON data")
	}
	return input, Validate(input)
}
func Validate(input Prepared) error {
	ids := []string{"motorcycle_a", "motorcycle_b", "bicycle_large", "bicycle_small"}
	if input.DrawRound == 2 {
		ids = []string{"motorcycle", "bicycle_large", "bicycle_small"}
	} else if input.DrawRound != 1 {
		return fmt.Errorf("invalid draw round")
	}
	if input.SchemaVersion != 1 || len(input.Pools) != len(ids) {
		return fmt.Errorf("invalid schema version or pool count")
	}
	motorHouseholds, motorSpaces := map[string]bool{}, map[string]bool{}
	for i, pool := range input.Pools {
		if pool.ID != ids[i] || pool.Households == nil || pool.Candidates == nil {
			return fmt.Errorf("invalid pool order or arrays")
		}
		households, spaces := map[string]bool{}, map[string]bool{}
		motor := strings.HasPrefix(pool.ID, "motorcycle")
		for _, household := range pool.Households {
			if household == "" || strings.TrimSpace(household) != household || households[household] {
				return fmt.Errorf("invalid or duplicate household")
			}
			households[household] = true
			if motor {
				if motorHouseholds[household] {
					return fmt.Errorf("household in both motorcycle pools")
				}
				motorHouseholds[household] = true
			}
		}
		pattern := `^(?:[1-9][0-9]?|1[0-4][0-9]|150|(?:2|3|14)-1)$`
		if pool.ID == "bicycle_large" {
			pattern = `^大(?:[1-9]|[12][0-9]|3[0-8])$`
		} else if pool.ID == "bicycle_small" {
			pattern = `^小(?:39|4[0-9]|5[0-7])$`
		}
		validSpace := regexp.MustCompile(pattern)
		nextRank, waiting := 1, false
		for _, c := range pool.Candidates {
			switch c.Type {
			case "space":
				if c.SpaceID == nil || c.Rank != nil {
					return fmt.Errorf("invalid space fields")
				}
				id := *c.SpaceID
				if waiting || spaces[id] || !validSpace.MatchString(id) {
					return fmt.Errorf("invalid or duplicate space")
				}
				spaces[id] = true
				if motor {
					if motorSpaces[id] {
						return fmt.Errorf("space in both motorcycle pools")
					}
					motorSpaces[id] = true
				}
			case "waitlist":
				if input.DrawRound != 2 || c.SpaceID != nil || c.Rank == nil || *c.Rank != nextRank {
					return fmt.Errorf("invalid waitlist")
				}
				nextRank++
				waiting = true
			default:
				return fmt.Errorf("unknown candidate type")
			}
		}
		if input.DrawRound == 2 && nextRank-1 != max(0, len(households)-len(spaces)) {
			return fmt.Errorf("waitlist count does not match shortage")
		}
	}
	return nil
}
func Draw(seed string, input Prepared) (Result, error) {
	key, err := hex.DecodeString(seed)
	if err != nil || len(key) != 32 {
		return Result{}, fmt.Errorf("seed must contain exactly 32 hex bytes")
	}
	if err := Validate(input); err != nil {
		return Result{}, err
	}
	stream, err := chacha20.NewUnauthenticatedCipher(key, make([]byte, 12))
	if err != nil {
		return Result{}, err
	}
	stream.SetCounter(0)
	used := []byte{}
	index := func(size int) int {
		if size == 1 {
			return 0
		}
		data := make([]byte, 4)
		stream.XORKeyStream(data, data)
		used = append(used, data...)
		return int(uint64(binary.BigEndian.Uint32(data)) % uint64(size))
	}
	result := Result{SchemaVersion: 1, Algorithm: Algorithm, Nonce: strings.Repeat("00", 12), Uint32Endian: "big", PoolRemoval: "stable", Status: "skipped", Reason: pointer("no_drawable_pools"), Pools: []PoolResult{}}
	for _, pool := range input.Pools {
		households := append([]string{}, pool.Households...)
		candidates := append([]Candidate{}, pool.Candidates...)
		p := PoolResult{ID: pool.ID, Status: "completed", Assignments: []Assignment{}, Waitlist: []Waiting{}, UnassignedHouseholds: []string{}, RemainingSpaces: []string{}}
		if len(households) == 0 && len(candidates) == 0 {
			p.Reason = pointer("no_participants_and_no_candidates")
		} else if len(households) == 0 {
			p.Reason = pointer("no_participants")
		} else if len(candidates) == 0 {
			p.Reason = pointer("no_candidates")
		}
		if p.Reason != nil {
			p.Status = "skipped"
		} else {
			result.Status = "completed"
			result.Reason = nil
		}
		for len(households) > 0 && len(candidates) > 0 {
			ci := index(len(candidates))
			candidate := candidates[ci]
			candidates = append(candidates[:ci], candidates[ci+1:]...)
			hi := index(len(households))
			household := households[hi]
			households = append(households[:hi], households[hi+1:]...)
			if candidate.Type == "space" {
				p.Assignments = append(p.Assignments, Assignment{household, *candidate.SpaceID})
			} else {
				p.Waitlist = append(p.Waitlist, Waiting{household, *candidate.Rank})
			}
		}
		sort.Slice(p.Waitlist, func(i, j int) bool { return p.Waitlist[i].Rank < p.Waitlist[j].Rank })
		p.UnassignedHouseholds = households
		for _, c := range candidates {
			if c.Type == "space" {
				p.RemainingSpaces = append(p.RemainingSpaces, *c.SpaceID)
			}
		}
		result.Pools = append(result.Pools, p)
	}
	result.StreamHex = hex.EncodeToString(used)
	return result, nil
}
