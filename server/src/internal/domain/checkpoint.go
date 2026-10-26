package domain

import (
	"encoding/json"
	"errors"
	"fmt"
	"github.com/Minazuki/parking/server/src/draw"
	"github.com/Minazuki/parking/server/src/internal/beacon"
)

var ErrConflict = errors.New("operation does not match current stage")
var ErrInvalid = errors.New("invalid input")

type Snapshot struct {
	CurrentStage int                     `json:"currentStage"`
	Activity     json.RawMessage         `json:"activity"`
	States       map[int]json.RawMessage `json:"-"`
}

func decodeAs[T any](raw []byte) (T, error) {
	var value T
	err := json.Unmarshal(raw, &value)
	return value, err
}
func (v *Validator) CheckStage(n int, raw []byte, states map[int]json.RawMessage, extra func(string) ([]byte, error)) error {
	if err := v.Validate(n, raw); err != nil {
		return fmt.Errorf("stage %d: %w", n, err)
	}
	switch n {
	case 0:
		state, err := decodeAs[First](raw)
		if err != nil {
			return err
		}
		return ValidateFirst(state)
	case 1, 5:
		state, err := decodeAs[beacon.State](raw)
		if err != nil {
			return err
		}
		info, err := extra("info.json")
		if err != nil {
			return err
		}
		wire, err := extra("beacon.json")
		if err != nil {
			return err
		}
		return beacon.Validate(beacon.Evidence{State: state, Info: info, Beacon: wire})
	case 2, 6:
		inputStage, seedStage, round := 0, 1, 1
		if n == 6 {
			inputStage, seedStage, round = 4, 5, 2
		}
		var input struct {
			Pools []draw.Pool `json:"pools"`
		}
		if err := json.Unmarshal(states[inputStage], &input); err != nil {
			return err
		}
		seed, err := decodeAs[beacon.State](states[seedStage])
		if err != nil {
			return err
		}
		result, err := draw.Draw(seed.Seed, draw.Prepared{SchemaVersion: 1, DrawRound: round, Pools: input.Pools})
		if err != nil {
			return err
		}
		expected, err := Encode(result)
		if err != nil {
			return err
		}
		if !EqualJSON(raw, expected) {
			return fmt.Errorf("stage %d allocation or stream differs from saved inputs", n)
		}
	case 3:
		first, err := decodeAs[First](states[0])
		if err != nil {
			return err
		}
		payment, err := decodeAs[Payments](raw)
		if err != nil {
			return err
		}
		return ValidatePayments(payment, first)
	case 4:
		first, err := decodeAs[First](states[0])
		if err != nil {
			return err
		}
		allocation, err := decodeAs[draw.Result](states[2])
		if err != nil {
			return err
		}
		payment, err := decodeAs[Payments](states[3])
		if err != nil {
			return err
		}
		second, err := BuildSecond(first, allocation, payment)
		if err != nil {
			return err
		}
		expected, err := Encode(second)
		if err != nil {
			return err
		}
		if !EqualJSON(raw, expected) {
			return fmt.Errorf("stage 4 differs from saved payments, allocations or enrollment")
		}
	}
	return nil
}
