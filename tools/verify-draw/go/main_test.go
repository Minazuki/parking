package main

import (
	"encoding/hex"
	"golang.org/x/crypto/chacha20"
	"reflect"
	"strings"
	"testing"
)

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
}
func TestPermutation(t *testing.T) {
	for _, seed := range []string{strings.Repeat("00", 32), strings.Repeat("ff", 32)} {
		a, err := draw(seed)
		if err != nil {
			t.Fatal(err)
		}
		b, _ := draw(seed)
		if !reflect.DeepEqual(a, b) {
			t.Fatal("not deterministic")
		}
		seen := map[int]bool{}
		for _, n := range a.Order {
			if n < 1 || n > 150 || seen[n] {
				t.Fatal("invalid permutation")
			}
			seen[n] = true
		}
		if len(seen) != 150 {
			t.Fatal("missing values")
		}
	}
	if _, err := draw("bad"); err == nil {
		t.Fatal("accepted malformed seed")
	}
}
