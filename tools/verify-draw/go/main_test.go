package main

import (
	"encoding/hex"
	"golang.org/x/crypto/chacha20"
	"os"
	"reflect"
	"strings"
	"testing"
)

func load(t *testing.T, name string) Prepared {
	t.Helper()
	raw, err := os.ReadFile("../../../examples/verify-draw/" + name + ".json")
	if err != nil {
		t.Fatal(err)
	}
	input, err := decode(raw)
	if err != nil {
		t.Fatal(err)
	}
	return input
}
func TestKnownVector(t *testing.T) {
	stream, err := chacha20.NewUnauthenticatedCipher(make([]byte, 32), make([]byte, 12))
	if err != nil {
		t.Fatal(err)
	}
	data := make([]byte, 16)
	stream.XORKeyStream(data, data)
	if hex.EncodeToString(data) != "76b8e0ada0f13d90405d6ae55386bd28" {
		t.Fatal("known vector differs")
	}
	output, err := draw(strings.Repeat("00", 32), load(t, "round-one"))
	if err != nil {
		t.Fatal(err)
	}
	if output.StreamHex[:32] != hex.EncodeToString(data) {
		t.Fatal("stream starts at wrong offset")
	}
}
func TestFixtures(t *testing.T) {
	for name, words := range map[string]int{"round-one": 7, "round-two": 6, "all-skipped": 0, "first-round-shortage": 1} {
		input := load(t, name)
		for _, seed := range []string{strings.Repeat("00", 32), strings.Repeat("ff", 32), "7010277ecb91976aba93d63d298503889de63e291a5a49f7c1b8d2cce2b3e858"} {
			a, err := draw(seed, input)
			if err != nil {
				t.Fatal(err)
			}
			b, _ := draw(seed, input)
			if !reflect.DeepEqual(a, b) || len(a.StreamHex) != words*8 {
				t.Fatalf("%s: not reproducible or wrong consumption", name)
			}
			for i, p := range a.Pools {
				seen := map[string]bool{}
				for _, x := range p.Assignments {
					seen[x.Household] = true
				}
				for _, x := range p.Waitlist {
					seen[x.Household] = true
				}
				for _, x := range p.UnassignedHouseholds {
					seen[x] = true
				}
				if len(seen) != len(input.Pools[i].Households) {
					t.Fatal("households not conserved")
				}
			}
		}
	}
}
func TestInvalidInput(t *testing.T) {
	input := load(t, "round-two")
	input.Pools[0].Candidates[1].Rank = nil
	if _, err := draw(strings.Repeat("00", 32), input); err == nil {
		t.Fatal("missing rank accepted")
	}
	if _, err := draw("bad", load(t, "round-one")); err == nil {
		t.Fatal("bad seed accepted")
	}
	for _, raw := range []string{`null`, `{}`, `{"schemaVersion":1,"drawRound":1,"pools":null}`, `{"schemaVersion":1,"drawRound":2,"pools":[],"extra":1}`, `{} {}`} {
		if _, err := decode([]byte(raw)); err == nil {
			t.Fatal("invalid input accepted")
		}
	}
}
