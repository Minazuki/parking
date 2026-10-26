package main

import (
	"encoding/json"
	"flag"
	"fmt"
	core "github.com/Minazuki/parking/server/src/draw"
	"os"
)

type Prepared = core.Prepared
type Result = core.Result

func decode(raw []byte) (Prepared, error)              { return core.Decode(raw) }
func draw(seed string, input Prepared) (Result, error) { return core.Draw(seed, input) }

func run() error {
	seed := flag.String("seed", "", "32-byte hex seed")
	pools := flag.String("pools", "", "prepared ordered pools JSON")
	output := flag.String("output", "", "new JSON output file")
	flag.Parse()
	if *seed == "" || *pools == "" || *output == "" || flag.NArg() != 0 {
		return fmt.Errorf("use --seed HEX --pools JSON --output NEW_FILE")
	}
	raw, err := os.ReadFile(*pools)
	if err != nil {
		return err
	}
	input, err := decode(raw)
	if err != nil {
		return err
	}
	result, err := draw(*seed, input)
	if err != nil {
		return err
	}
	raw, err = json.MarshalIndent(result, "", "  ")
	if err != nil {
		return err
	}
	file, err := os.OpenFile(*output, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return err
	}
	if _, err = file.Write(append(raw, '\n')); err != nil {
		file.Close()
		return err
	}
	return file.Close()
}
func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
