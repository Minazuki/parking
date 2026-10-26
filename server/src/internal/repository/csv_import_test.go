package repository

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/Minazuki/parking/server/src/internal/beacon"
	"github.com/Minazuki/parking/server/src/internal/domain"
	"github.com/Minazuki/parking/server/src/internal/inputcsv"
)

func copyInputs(t *testing.T, root string) map[string][]byte {
	t.Helper()
	directory := filepath.Join(root, "inputs")
	if err := os.Mkdir(directory, 0700); err != nil {
		t.Fatal(err)
	}
	result := map[string][]byte{}
	for _, name := range []string{inputcsv.RegistrationA, inputcsv.RegistrationB, inputcsv.Accessible, inputcsv.Payments} {
		raw, err := os.ReadFile(filepath.Join("../../../../examples/imports/inputs", name))
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(directory, name), raw, 0600); err != nil {
			t.Fatal(err)
		}
		result[name] = raw
	}
	return result
}
func TestCSVImportsRespectPhasesAndFreezeInputs(t *testing.T) {
	root := t.TempDir()
	s := open(t, root)
	inputs := copyInputs(t, root)
	// Registration must not read payments, even if that file is already present and invalid.
	paymentFile := filepath.Join(root, "inputs", inputcsv.Payments)
	if err := os.WriteFile(paymentFile, []byte("not a CSV"), 0600); err != nil {
		t.Fatal(err)
	}
	snapshot, err := s.ImportRegistrationCSV()
	if err != nil || snapshot.CurrentStage != 0 {
		t.Fatal(snapshot.CurrentStage, err)
	}
	if !domain.EqualJSON(snapshot.States[0], raw(t, 0)) {
		t.Fatal("registration CSV changed stage 0 fixture")
	}
	// Committed stage 0 wins over subsequent CSV edits.
	if err := os.Remove(filepath.Join(root, "inputs", inputcsv.RegistrationA)); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ImportRegistrationCSV(); !errors.Is(err, ErrConflict) {
		t.Fatal("committed registration reread", err)
	}
	if _, err := s.ImportPaymentsCSV(); !errors.Is(err, ErrConflict) {
		t.Fatal("payments imported before draw", err)
	}
	calls := 0
	s.Fetch = func(context.Context) (beacon.Evidence, error) { calls++; return evidence(t), nil }
	if _, err := s.RunRound(1); err != nil {
		t.Fatal(err)
	}
	snapshot, err = s.ImportPaymentsCSV()
	if !errors.Is(err, domain.ErrInvalid) || snapshot.CurrentStage != 2 {
		t.Fatal(snapshot.CurrentStage, err)
	}
	if _, err := os.Stat(filepath.Join(root, "checkpoints", "3")); !os.IsNotExist(err) {
		t.Fatal("invalid payment import committed", err)
	}
	if err := os.WriteFile(paymentFile, inputs[inputcsv.Payments], 0600); err != nil {
		t.Fatal(err)
	}
	snapshot, err = s.ImportPaymentsCSV()
	if err != nil || snapshot.CurrentStage != 3 {
		t.Fatal(snapshot.CurrentStage, err)
	}
	var saved domain.Payments
	if err := json.Unmarshal(snapshot.States[3], &saved); err != nil {
		t.Fatal(err)
	}
	var source struct{ SHA256 string }
	if err := json.Unmarshal(saved.Source, &source); err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(inputs[inputcsv.Payments])
	if source.SHA256 != hex.EncodeToString(sum[:]) {
		t.Fatal("digest is not from original CSV bytes")
	}
	// Review depends only on saved JSON. Neither original CSV nor a source digest match is required.
	if err := os.RemoveAll(filepath.Join(root, "inputs")); err != nil {
		t.Fatal(err)
	}
	snapshot, err = s.Review()
	if err != nil || !domain.EqualJSON(snapshot.States[4], raw(t, 4)) {
		t.Fatal("review reread external inputs", err)
	}
	snapshot, err = s.RunRound(2)
	if err != nil || calls != 2 || !domain.EqualJSON(snapshot.States[6], raw(t, 6)) {
		t.Fatal("CSV lifecycle result differs", err)
	}
}
func TestInvalidOrMissingCSVDoesNotCommitRegistration(t *testing.T) {
	root := t.TempDir()
	s := open(t, root)
	if _, err := s.ImportRegistrationCSV(); !errors.Is(err, domain.ErrInvalid) {
		t.Fatal(err)
	}
	files := copyInputs(t, root)
	bad := bytes.Replace(files[inputcsv.RegistrationA], []byte("兩輪"), nil, 1)
	if err := os.WriteFile(filepath.Join(root, "inputs", inputcsv.RegistrationA), bad, 0600); err != nil {
		t.Fatal(err)
	}
	snapshot, err := s.ImportRegistrationCSV()
	var detail *inputcsv.Issue
	if !errors.As(err, &detail) || snapshot.CurrentStage != -1 || detail.Column != "機車位" {
		t.Fatal(snapshot.CurrentStage, err)
	}
	if _, err := os.Stat(filepath.Join(root, "checkpoints")); !os.IsNotExist(err) {
		t.Fatal("failed import created checkpoint directory")
	}
	good := files[inputcsv.RegistrationA]
	if err := os.WriteFile(filepath.Join(root, "inputs", inputcsv.RegistrationA), good, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ImportRegistrationCSV(); err != nil {
		t.Fatal(err)
	}
	for name, want := range files {
		got, err := os.ReadFile(filepath.Join(root, "inputs", name))
		if err != nil || !bytes.Equal(got, want) {
			t.Fatalf("source %s modified", name)
		}
	}
}
func TestInputReaderRejectsOutsidePathsSymlinksAndNonRegularFiles(t *testing.T) {
	root := t.TempDir()
	s := open(t, root)
	copyInputs(t, root)
	for _, name := range []string{"../outside.csv", "/tmp/outside.csv", "notes.txt"} {
		if _, err := s.repo.ReadInput(name); err == nil {
			t.Fatal("invalid input name accepted")
		}
	}
	external := filepath.Join(t.TempDir(), "outside.csv")
	if err := os.WriteFile(external, []byte("external"), 0600); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(root, "inputs", "linked.csv")
	if err := os.Symlink(external, link); err != nil {
		t.Fatal(err)
	}
	if _, err := s.repo.ReadInput("linked.csv"); err == nil {
		t.Fatal("symlink input accepted")
	}
	if err := os.Mkdir(filepath.Join(root, "inputs", "directory.csv"), 0700); err != nil {
		t.Fatal(err)
	}
	if _, err := s.repo.ReadInput("directory.csv"); err == nil {
		t.Fatal("directory input accepted")
	}
}
