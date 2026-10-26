package repository

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Minazuki/parking/server/src/internal/beacon"
	"github.com/Minazuki/parking/server/src/internal/domain"
	"github.com/Minazuki/parking/server/src/internal/service"
)

const sample = "../../../../examples/workspace"

func raw(t *testing.T, stage int) []byte {
	t.Helper()
	value, err := os.ReadFile(filepath.Join(sample, "checkpoints", string(rune('0'+stage)), "state.json"))
	if err != nil {
		t.Fatal(err)
	}
	return value
}
func evidence(t *testing.T) beacon.Evidence {
	t.Helper()
	state, err := decodeTest[beacon.State](raw(t, 1))
	if err != nil {
		t.Fatal(err)
	}
	a, err := os.ReadFile(filepath.Join(sample, "checkpoints/1/info.json"))
	if err != nil {
		t.Fatal(err)
	}
	b, err := os.ReadFile(filepath.Join(sample, "checkpoints/1/beacon.json"))
	if err != nil {
		t.Fatal(err)
	}
	return beacon.Evidence{State: state, Info: a, Beacon: b}
}

type harness struct {
	*service.Service
	repo  *Store
	Fetch service.Fetch
}

func (h *harness) Close() error { return h.repo.Close() }
func decodeTest[T any](raw []byte) (T, error) {
	var value T
	err := json.Unmarshal(raw, &value)
	return value, err
}
func open(t *testing.T, root string) *harness {
	t.Helper()
	v, err := domain.NewValidator()
	if err != nil {
		t.Fatal(err)
	}
	s, err := Open(root, "test-version", v)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	h := &harness{repo: s, Fetch: beacon.Fetcher{}.Fetch}
	h.Service = service.New(s, func(ctx context.Context) (beacon.Evidence, error) { return h.Fetch(ctx) }, v, "test-version")
	return h
}
func prepare(t *testing.T, s *harness) {
	t.Helper()
	if _, err := s.InitActivity(116, "test"); err != nil {
		t.Fatal(err)
	}
	first, err := decodeTest[domain.First](raw(t, 0))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.ImportFirst(first); err != nil {
		t.Fatal(err)
	}
}
func TestReadSchemaAndFixture(t *testing.T) {
	v, err := domain.NewValidator()
	if err != nil {
		t.Fatal(err)
	}
	snapshot, err := Load(sample, v)
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.CurrentStage != 6 {
		t.Fatal(snapshot.CurrentStage)
	}
}
func TestFullLifecycleMatchesIndependentTSFixture(t *testing.T) {
	s := open(t, t.TempDir())
	prepare(t, s)
	calls := 0
	s.Fetch = func(context.Context) (beacon.Evidence, error) { calls++; return evidence(t), nil }
	if _, err := s.RunRound(1); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ImportPayments(raw(t, 3)); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Review(); err != nil {
		t.Fatal(err)
	}
	snapshot, err := s.RunRound(2)
	if err != nil {
		t.Fatal(err)
	}
	for _, n := range []int{0, 2, 4, 6} {
		if !domain.EqualJSON(snapshot.States[n], raw(t, n)) {
			t.Fatalf("stage %d differs from TS fixture", n)
		}
	}
	if calls != 2 {
		t.Fatal("each round must obtain its own seed")
	}
	if _, err := s.RunRound(2); !errors.Is(err, ErrConflict) {
		t.Fatal("repeat draw accepted", err)
	}
	if calls != 2 {
		t.Fatal("repeated operation fetched seed")
	}
	entries, _ := os.ReadDir(filepath.Join(s.repo.root, "logs"))
	log, _ := os.ReadFile(filepath.Join(s.repo.root, "logs", entries[0].Name()))
	if strings.Count(string(log), `"event":"stage_committed"`) != 7 {
		t.Fatal("missing checkpoint log")
	}
	if _, err := Open(s.repo.root, "other", s.repo.validator); err == nil {
		t.Fatal("second writer acquired workspace")
	}
}
func TestFailedPublicationResumesFromSeedWithoutRefetch(t *testing.T) {
	root := t.TempDir()
	s := open(t, root)
	prepare(t, s)
	s.Fetch = func(context.Context) (beacon.Evidence, error) { return evidence(t), nil }
	s.repo.beforePublish = func(n int) error {
		if n == 2 {
			return errors.New("simulated write failure")
		}
		return nil
	}
	snapshot, err := s.RunRound(1)
	if err == nil || snapshot.CurrentStage != 1 {
		t.Fatal(snapshot.CurrentStage, err)
	}
	s.Close()
	next := open(t, root)
	next.Fetch = func(context.Context) (beacon.Evidence, error) {
		t.Fatal("saved seed was fetched again")
		return beacon.Evidence{}, nil
	}
	snapshot, err = next.RunRound(1)
	if err != nil || snapshot.CurrentStage != 2 {
		t.Fatal(snapshot.CurrentStage, err)
	}
	entries, _ := os.ReadDir(filepath.Join(root, "checkpoints"))
	pending := false
	for _, entry := range entries {
		pending = pending || strings.HasPrefix(entry.Name(), "2.pending-")
	}
	if !pending {
		t.Fatal("failed evidence was discarded")
	}
}
func TestUncommittedSeedCanBeFetchedOnExplicitRetry(t *testing.T) {
	root := t.TempDir()
	s := open(t, root)
	prepare(t, s)
	calls := 0
	s.Fetch = func(context.Context) (beacon.Evidence, error) { calls++; return evidence(t), nil }
	s.repo.beforePublish = func(n int) error {
		if n == 1 {
			return errors.New("before seed commit")
		}
		return nil
	}
	snapshot, err := s.RunRound(1)
	if err == nil || snapshot.CurrentStage != 0 || calls != 1 {
		t.Fatal(snapshot.CurrentStage, calls, err)
	}
	s.repo.beforePublish = nil
	snapshot, err = s.RunRound(1)
	if err != nil || snapshot.CurrentStage != 2 || calls != 2 {
		t.Fatal(snapshot.CurrentStage, calls, err)
	}
}
func TestManualSuffixRemovalPreservesHistoryAndUsesExistingSeed(t *testing.T) {
	root := t.TempDir()
	s := open(t, root)
	prepare(t, s)
	s.Fetch = func(context.Context) (beacon.Evidence, error) { return evidence(t), nil }
	if _, err := s.RunRound(1); err != nil {
		t.Fatal(err)
	}
	s.Close()
	logs, _ := os.ReadDir(filepath.Join(root, "logs"))
	old := logs[0].Name()
	before, _ := os.ReadFile(filepath.Join(root, "logs", old))
	os.RemoveAll(filepath.Join(root, "checkpoints/2"))
	next := open(t, root)
	next.Fetch = func(context.Context) (beacon.Evidence, error) {
		t.Fatal("seed refetched after removing only results")
		return beacon.Evidence{}, nil
	}
	snapshot, err := next.RunRound(1)
	if err != nil || snapshot.CurrentStage != 2 {
		t.Fatal(err)
	}
	after, _ := os.ReadFile(filepath.Join(root, "logs", old))
	if string(before) != string(after) {
		t.Fatal("old log changed")
	}
	entries, _ := os.ReadDir(filepath.Join(root, "logs"))
	found := false
	for _, entry := range entries {
		bytes, _ := os.ReadFile(filepath.Join(root, "logs", entry.Name()))
		found = found || strings.Contains(string(bytes), `"checkpointSuffixReduced":true`)
	}
	if !found {
		t.Fatal("rollback observation not recorded")
	}
}
func TestRegistrationInputRejectsMissingFlagsAndSchemaDoesNotCoerce(t *testing.T) {
	s := open(t, t.TempDir())
	first, _ := decodeTest[domain.First](raw(t, 0))
	request := map[string]any{"registrations": first.Registrations, "accessibleAssignments": first.Accessible.Assignments}
	data, _ := json.Marshal(request)
	if _, err := s.PrepareRegistration(data); err != nil {
		t.Fatal(err)
	}
	bad := []byte(`{"registrations":{"A":[{"household":"999-2"}],"B":[]},"accessibleAssignments":[]}`)
	if _, err := s.PrepareRegistration(bad); err == nil {
		t.Fatal("missing intent flags accepted")
	}
}

func TestFutureButtonTimeDoesNotFetchOrAdvance(t *testing.T) {
	s := open(t, t.TempDir())
	prepare(t, s)
	s.Fetch = func(context.Context) (beacon.Evidence, error) {
		t.Fatal("invalid timestamp must not trigger fetch")
		return beacon.Evidence{}, nil
	}
	snapshot, err := s.RunRoundAt(1, "2999-01-01T00:00:00Z")
	if !errors.Is(err, domain.ErrInvalid) || snapshot.CurrentStage != 0 {
		t.Fatal(snapshot.CurrentStage, err)
	}
}
func TestAllSkippedStillFetchesAndCommitsSeed(t *testing.T) {
	s := open(t, t.TempDir())
	first, _ := decodeTest[domain.First](raw(t, 0))
	for i := range first.Registrations.A {
		first.Registrations.A[i].Motorcycle = 0
		first.Registrations.A[i].Large = 0
		first.Registrations.A[i].Small = 0
	}
	for i := range first.Registrations.B {
		first.Registrations.B[i].Motorcycle = 0
		first.Registrations.B[i].Large = 0
		first.Registrations.B[i].Small = 0
	}
	first, err := domain.BuildFirst(first.Registrations, first.Accessible.Assignments)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.ImportFirst(first); err != nil {
		t.Fatal(err)
	}
	calls := 0
	s.Fetch = func(context.Context) (beacon.Evidence, error) { calls++; return evidence(t), nil }
	snapshot, err := s.RunRound(1)
	if err != nil || snapshot.CurrentStage != 2 || calls != 1 {
		t.Fatal(snapshot.CurrentStage, calls, err)
	}
	var result struct {
		Status string `json:"status"`
		Stream string `json:"streamHex"`
	}
	json.Unmarshal(snapshot.States[2], &result)
	if result.Status != "skipped" || result.Stream != "" {
		t.Fatal(result)
	}
}

// Two UI submissions must serialize across the whole seed + allocation operation.
func TestConcurrentDrawRequestsFetchOnlyOnce(t *testing.T) {
	s := open(t, t.TempDir())
	prepare(t, s)
	proof := evidence(t)
	calls := 0
	s.Fetch = func(context.Context) (beacon.Evidence, error) { calls++; return proof, nil }
	start := make(chan struct{})
	results := make(chan error, 2)
	for i := 0; i < 2; i++ {
		go func() { <-start; _, err := s.RunRound(1); results <- err }()
	}
	close(start)
	success, conflict := 0, 0
	for i := 0; i < 2; i++ {
		err := <-results
		if err == nil {
			success++
		} else if errors.Is(err, ErrConflict) {
			conflict++
		} else {
			t.Fatal(err)
		}
	}
	if success != 1 || conflict != 1 || calls != 1 {
		t.Fatalf("success=%d conflict=%d fetches=%d", success, conflict, calls)
	}
	snapshot, err := s.Snapshot()
	if err != nil || snapshot.CurrentStage != 2 {
		t.Fatal(snapshot.CurrentStage, err)
	}
}
