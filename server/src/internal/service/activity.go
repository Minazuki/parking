package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"github.com/Minazuki/parking/server/src/draw"
	"github.com/Minazuki/parking/server/src/internal/beacon"
	"github.com/Minazuki/parking/server/src/internal/domain"
)

type Snapshot = domain.Snapshot
type First = domain.First
type Payments = domain.Payments
type Registrations = domain.Registrations
type AccessibleAssignment = domain.AccessibleAssignment

var ErrConflict = domain.ErrConflict
var ErrInvalid = domain.ErrInvalid

type Fetch func(context.Context) (beacon.Evidence, error)
type Service struct {
	repo      Repository
	fetch     Fetch
	validator *domain.Validator
	version   string
}

func New(repo Repository, fetch Fetch, validator *domain.Validator, version string) *Service {
	return &Service{repo: repo, fetch: fetch, validator: validator, version: version}
}
func (s *Service) Root() string                { return s.repo.Root() }
func (s *Service) Snapshot() (Snapshot, error) { return s.repo.Snapshot() }
func decodeAs[T any](raw []byte) (T, error) {
	var value T
	err := json.Unmarshal(raw, &value)
	return value, err
}
func activityID() string {
	b := make([]byte, 12)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}
func (s *Service) ImportFirst(first First) (Snapshot, error) {
	return s.repo.WithOperation("registration_import", func(tx Transaction) error {
		snapshot := tx.Snapshot()
		if snapshot.CurrentStage != -1 {
			return ErrConflict
		}
		raw, err := domain.Encode(first)
		if err != nil {
			return err
		}
		return tx.Commit(0, map[string][]byte{"state.json": raw})
	})
}
func (s *Service) ImportPayments(raw []byte) (Snapshot, error) {
	return s.repo.WithOperation("payments_import", func(tx Transaction) error {
		snapshot := tx.Snapshot()
		if snapshot.CurrentStage != 2 {
			return ErrConflict
		}
		if err := s.validatePayments(snapshot, raw); err != nil {
			return err
		}
		return tx.Commit(3, map[string][]byte{"state.json": raw})
	})
}
func (s *Service) Review() (Snapshot, error) {
	return s.repo.WithOperation("payment_review", func(tx Transaction) error {
		snapshot := tx.Snapshot()
		if snapshot.CurrentStage != 3 {
			return ErrConflict
		}
		first, _ := decodeAs[First](snapshot.States[0])
		allocation, _ := decodeAs[draw.Result](snapshot.States[2])
		payment, _ := decodeAs[Payments](snapshot.States[3])
		second, err := domain.BuildSecond(first, allocation, payment)
		if err != nil {
			return err
		}
		raw, err := domain.Encode(second)
		if err != nil {
			return err
		}
		return tx.Commit(4, map[string][]byte{"state.json": raw})
	})
}
func (s *Service) RunRound(round int) (Snapshot, error) { return s.RunRoundAt(round, "") }

func (s *Service) RunRoundAt(round int, buttonPressedAt string) (Snapshot, error) {
	return s.repo.WithOperation("round_draw", func(tx Transaction) error {
		snapshot := tx.Snapshot()
		if round != 1 && round != 2 {
			return fmt.Errorf("round must be 1 or 2")
		}
		base := 0
		if round == 2 {
			base = 4
		}
		if snapshot.CurrentStage != base && snapshot.CurrentStage != base+1 {
			return ErrConflict
		}
		if snapshot.CurrentStage == base {
			if buttonPressedAt != "" {
				pressed, err := time.Parse(time.RFC3339Nano, buttonPressedAt)
				if err != nil || pressed.After(time.Now()) {
					return fmt.Errorf("%w: invalid button timestamp", ErrInvalid)
				}
			}
			e, err := s.fetch(context.Background())
			if err != nil {
				return err
			}
			if buttonPressedAt != "" {
				e.State.ButtonPressedAt = buttonPressedAt
			}
			if err := beacon.Validate(e); err != nil {
				return err
			}
			if err := tx.Record("seed_received", map[string]any{"round": e.State.Round, "seed": e.State.Seed}); err != nil {
				return err
			}
			raw, err := domain.Encode(e.State)
			if err != nil {
				return err
			}
			if err := tx.Commit(base+1, map[string][]byte{"state.json": raw, "info.json": e.Info, "beacon.json": e.Beacon}); err != nil {
				return err
			}
		}
		var prepared struct {
			Pools []draw.Pool `json:"pools"`
		}
		if err := json.Unmarshal(snapshot.States[base], &prepared); err != nil {
			return err
		}
		seed, _ := decodeAs[beacon.State](snapshot.States[base+1])
		result, err := draw.Draw(seed.Seed, draw.Prepared{SchemaVersion: 1, DrawRound: round, Pools: prepared.Pools})
		if err != nil {
			return err
		}
		raw, err := domain.Encode(result)
		if err != nil {
			return err
		}
		return tx.Commit(base+2, map[string][]byte{"state.json": raw})
	})
}

func (s *Service) InitActivity(year int, mode string) (Snapshot, error) {
	return s.repo.WithOperation("activity_initialize", func(tx Transaction) error {
		snapshot := tx.Snapshot()
		if string(snapshot.Activity) != "null" || snapshot.CurrentStage != -1 {
			return ErrConflict
		}
		data := map[string]any{"schemaVersion": 1, "activityId": activityID(), "activityYear": year, "mode": mode, "createdAt": time.Now().UTC().Format(time.RFC3339Nano), "createdByAppVersion": s.version}
		raw, err := domain.Encode(data)
		if err != nil {
			return err
		}
		if err := s.validator.Activity(raw); err != nil {
			return fmt.Errorf("%w: %v", ErrInvalid, err)
		}
		return tx.SaveActivity(raw)
	})
}
func (s *Service) PrepareRegistration(raw []byte) (First, error) {
	if err := s.validator.Registration(raw); err != nil {
		return First{}, err
	}
	var input struct {
		Registrations         Registrations          `json:"registrations"`
		AccessibleAssignments []AccessibleAssignment `json:"accessibleAssignments"`
	}
	if err := json.Unmarshal(raw, &input); err != nil {
		return First{}, err
	}
	return domain.BuildFirst(input.Registrations, input.AccessibleAssignments)
}

func (s *Service) ImportRegistration(raw []byte) (Snapshot, error) {
	return s.repo.WithOperation("registration_import", func(tx Transaction) error {
		snapshot := tx.Snapshot()
		if snapshot.CurrentStage != -1 {
			return ErrConflict
		}
		first, err := s.PrepareRegistration(raw)
		if err != nil {
			return fmt.Errorf("%w: %v", ErrInvalid, err)
		}
		data, err := domain.Encode(first)
		if err != nil {
			return err
		}
		return tx.Commit(0, map[string][]byte{"state.json": data})
	})
}

func (s *Service) validatePayments(snapshot *Snapshot, raw []byte) error {
	if err := s.validator.Validate(3, raw); err != nil {
		return fmt.Errorf("%w: %v", ErrInvalid, err)
	}
	payment, err := decodeAs[Payments](raw)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrInvalid, err)
	}
	first, _ := decodeAs[First](snapshot.States[0])
	if err := domain.ValidatePayments(payment, first); err != nil {
		return fmt.Errorf("%w: %v", ErrInvalid, err)
	}
	return nil
}
