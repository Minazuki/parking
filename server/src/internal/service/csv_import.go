package service

import (
	"fmt"
	"time"

	"github.com/Minazuki/parking/server/src/internal/domain"
	"github.com/Minazuki/parking/server/src/internal/inputcsv"
)

func (s *Service) readCSV(name string) ([]byte, error) {
	raw, err := s.repo.ReadInput(name)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrInvalid, &inputcsv.Issue{FileName: name, Row: 0, Column: "檔案", Message: err.Error()})
	}
	return raw, nil
}

// ImportRegistrationCSV reads only this stage's fixed inputs while holding the operation lock.
func (s *Service) ImportRegistrationCSV() (Snapshot, error) {
	return s.repo.WithOperation("registration_csv_import", func(tx Transaction) error {
		snapshot := tx.Snapshot()
		if snapshot.CurrentStage != -1 {
			return ErrConflict
		}
		data := make([][]byte, 3)
		names := []string{inputcsv.RegistrationA, inputcsv.RegistrationB, inputcsv.Accessible}
		for i, name := range names {
			raw, err := s.readCSV(name)
			if err != nil {
				return err
			}
			data[i] = raw
		}
		input, err := inputcsv.ParseRegistration(data[0], data[1], data[2])
		if err != nil {
			return fmt.Errorf("%w: %w", ErrInvalid, err)
		}
		first, err := domain.BuildFirst(input.Registrations, input.Assignments)
		if err != nil {
			return fmt.Errorf("%w: %w", ErrInvalid, err)
		}
		raw, err := domain.Encode(first)
		if err != nil {
			return err
		}
		if err := tx.Record("csv_inputs_read", map[string]any{"files": names}); err != nil {
			return err
		}
		return tx.Commit(0, map[string][]byte{"state.json": raw})
	})
}

func (s *Service) ImportPaymentsCSV() (Snapshot, error) {
	return s.repo.WithOperation("payments_csv_import", func(tx Transaction) error {
		snapshot := tx.Snapshot()
		if snapshot.CurrentStage != 2 {
			return ErrConflict
		}
		raw, err := s.readCSV(inputcsv.Payments)
		if err != nil {
			return err
		}
		first, err := decodeAs[First](snapshot.States[0])
		if err != nil {
			return err
		}
		payments, err := inputcsv.ParsePayments(raw, first, time.Now())
		if err != nil {
			return fmt.Errorf("%w: %w", ErrInvalid, err)
		}
		data, err := domain.Encode(payments)
		if err != nil {
			return err
		}
		if err := s.validatePayments(snapshot, data); err != nil {
			return err
		}
		if err := tx.Record("csv_inputs_read", map[string]any{"files": []string{inputcsv.Payments}}); err != nil {
			return err
		}
		return tx.Commit(3, map[string][]byte{"state.json": data})
	})
}
