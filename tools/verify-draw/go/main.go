package main

import (
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"strings"

	"golang.org/x/crypto/chacha20"
)

type Entry struct {
	Word     int    `json:"word"`
	PoolSize int    `json:"poolSize"`
	Random   uint32 `json:"random"`
	Limit    uint64 `json:"limit"`
	Accepted bool   `json:"accepted"`
	Index    int    `json:"index"`
	Selected int    `json:"selected"`
}
type Result struct {
	Algorithm      string  `json:"algorithm"`
	Seed           string  `json:"seed"`
	Nonce          string  `json:"nonce"`
	InitialCounter int     `json:"initialCounter"`
	Uint32Endian   string  `json:"uint32Endian"`
	PoolRemoval    string  `json:"poolRemoval"`
	Order          []int   `json:"order"`
	Trace          []Entry `json:"trace"`
}

func draw(seed string) (Result, error) {
	key, err := hex.DecodeString(seed)
	if err != nil || len(key) != 32 {
		return Result{}, fmt.Errorf("seed must contain exactly 32 hex bytes")
	}
	stream, err := chacha20.NewUnauthenticatedCipher(key, make([]byte, 12))
	if err != nil {
		return Result{}, err
	}
	stream.SetCounter(0)
	result := Result{Algorithm: "parking-draw-chacha20-v1", Seed: strings.ToLower(seed), Nonce: strings.Repeat("00", 12), Uint32Endian: "big", PoolRemoval: "stable", Order: []int{}, Trace: []Entry{}}
	pool := make([]int, 150)
	for i := range pool {
		pool[i] = i + 1
	}
	for len(pool) > 0 {
		n := len(pool)
		limit := (uint64(1) << 32) / uint64(n) * uint64(n)
		buf := make([]byte, 4)
		stream.XORKeyStream(buf, buf)
		random := binary.BigEndian.Uint32(buf)
		accepted := uint64(random) < limit
		index, selected := -1, 0
		if accepted {
			index = int(uint64(random) % uint64(n))
			selected = pool[index]
		}
		result.Trace = append(result.Trace, Entry{len(result.Trace), n, random, limit, accepted, index, selected})
		if accepted {
			result.Order = append(result.Order, selected)
			pool = append(pool[:index], pool[index+1:]...)
		}
	}
	return result, nil
}
func run() error {
	seed := flag.String("seed", "", "32-byte hex seed")
	output := flag.String("output", "", "new JSON output file")
	flag.Parse()
	if *output == "" || flag.NArg() != 0 {
		return fmt.Errorf("use --seed HEX --output NEW_FILE")
	}
	result, err := draw(*seed)
	if err != nil {
		return err
	}
	raw, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		return err
	}
	file, err := os.OpenFile(*output, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return err
	}
	defer file.Close()
	_, err = file.Write(append(raw, '\n'))
	return err
}
func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
