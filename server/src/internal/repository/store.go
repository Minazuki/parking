package repository

import (
	"bufio"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/Minazuki/parking/server/src/internal/domain"
	"github.com/Minazuki/parking/server/src/internal/service"
)

type Snapshot = domain.Snapshot

// IntegrityValidator is injected; storage does not implement allocation rules.
type IntegrityValidator interface {
	Activity([]byte) error
	CheckStage(int, []byte, map[int]json.RawMessage, func(string) ([]byte, error)) error
}

var ErrConflict = domain.ErrConflict

func regular(path string) ([]byte, error) {
	f, err := os.Lstat(path)
	if err != nil {
		return nil, err
	}
	if !f.Mode().IsRegular() || f.Size() > 16<<20 {
		return nil, fmt.Errorf("expected regular file under 16MiB: %s", path)
	}
	return os.ReadFile(path)
}
func ensureDir(path string) error {
	if err := os.Mkdir(path, 0700); err != nil && !errors.Is(err, os.ErrExist) {
		return err
	}
	f, err := os.Lstat(path)
	if err != nil {
		return err
	}
	if !f.IsDir() || f.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("invalid directory: %s", path)
	}
	return nil
}
func Load(root string, v IntegrityValidator) (Snapshot, error) {
	result := Snapshot{CurrentStage: -1, Activity: json.RawMessage("null"), States: map[int]json.RawMessage{}}
	if raw, err := regular(filepath.Join(root, "activity.json")); err == nil {
		if err := v.Activity(raw); err != nil {
			return result, err
		}
		result.Activity = raw
	} else if !errors.Is(err, os.ErrNotExist) {
		return result, err
	}
	directory := filepath.Join(root, "checkpoints")
	if f, err := os.Lstat(directory); errors.Is(err, os.ErrNotExist) {
		return result, nil
	} else if err != nil {
		return result, err
	} else if !f.IsDir() {
		return result, fmt.Errorf("invalid checkpoints directory")
	}
	entries, err := os.ReadDir(directory)
	if err != nil {
		return result, err
	}
	present := [7]bool{}
	for _, entry := range entries {
		name := entry.Name()
		if strings.Trim(name, "0123456789") != "" || name == "" {
			continue
		}
		n, err := strconv.Atoi(name)
		if err != nil || n < 0 || n > 6 || strconv.Itoa(n) != name || entry.Type()&os.ModeSymlink != 0 || !entry.IsDir() {
			return result, fmt.Errorf("unsupported checkpoint %s", name)
		}
		present[n] = true
	}
	gap := false
	for n, exists := range present {
		if !exists {
			gap = true
			continue
		}
		if gap {
			return result, fmt.Errorf("checkpoint chain has missing stage before %d", n)
		}
		dir := filepath.Join(directory, strconv.Itoa(n))
		raw, err := regular(filepath.Join(dir, "state.json"))
		if err != nil {
			return result, err
		}
		if err := v.CheckStage(n, raw, result.States, func(name string) ([]byte, error) { return regular(filepath.Join(dir, name)) }); err != nil {
			return result, err
		}
		result.States[n] = raw
		result.CurrentStage = n
	}
	return result, nil
}

type event struct {
	Time        string `json:"time"`
	SessionID   string `json:"sessionId"`
	OperationID string `json:"operationId,omitempty"`
	AppVersion  string `json:"appVersion"`
	Event       string `json:"event"`
	Stage       int    `json:"stage"`
	Details     any    `json:"details,omitempty"`
}
type Store struct {
	mu                     sync.Mutex
	root, version, session string
	validator              IntegrityValidator
	lease, log             *os.File
	closed                 bool
	// Tests inject a failure before publication; partial data must remain pending.
	beforePublish func(int) error
}

func id() string {
	b := make([]byte, 12)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}
func (s *Store) record(kind string, stage int, operation string, details any) error {
	raw, err := json.Marshal(event{time.Now().UTC().Format(time.RFC3339Nano), s.session, operation, s.version, kind, stage, details})
	if err != nil {
		return err
	}
	if _, err = s.log.Write(append(raw, '\n')); err != nil {
		return err
	}
	return s.log.Sync()
}
func Open(root, version string, validator IntegrityValidator) (*Store, error) {
	if err := os.MkdirAll(root, 0700); err != nil {
		return nil, err
	}
	root, err := filepath.EvalSymlinks(root)
	if err != nil {
		return nil, err
	}
	root, err = filepath.Abs(root)
	if err != nil {
		return nil, err
	}
	leasePath := filepath.Join(root, ".parking.lock")
	lease, err := os.OpenFile(leasePath, os.O_CREATE|os.O_RDWR|syscall.O_NOFOLLOW, 0600)
	if err != nil {
		return nil, err
	}
	if err = syscall.Flock(int(lease.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		lease.Close()
		return nil, fmt.Errorf("workspace already open: %w", err)
	}
	s := &Store{root: root, version: version, session: id(), validator: validator, lease: lease}
	success := false
	defer func() {
		if !success {
			if s.log != nil {
				s.log.Close()
			}
			lease.Close()
		}
	}()
	if err := ensureDir(filepath.Join(root, "logs")); err != nil {
		return nil, err
	}
	previous := -1
	entries, _ := os.ReadDir(filepath.Join(root, "logs"))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".jsonl") {
			continue
		}
		file, err := os.Open(filepath.Join(root, "logs", entry.Name()))
		if err != nil {
			continue
		}
		scan := bufio.NewScanner(file)
		for scan.Scan() {
			var e event
			if json.Unmarshal(scan.Bytes(), &e) == nil && (e.Event == "workspace_opened" || e.Event == "stage_committed") {
				previous = e.Stage
			}
		}
		file.Close()
	}
	logName := time.Now().UTC().Format("20060102T150405.000000000") + "-" + s.session + ".jsonl"
	s.log, err = os.OpenFile(filepath.Join(root, "logs", logName), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return nil, err
	}
	snapshot, err := Load(root, validator)
	if err != nil {
		s.record("workspace_error", -1, "", err.Error())
		return nil, err
	}
	if err := s.record("workspace_opened", snapshot.CurrentStage, "", map[string]any{"previousObservedStage": previous, "checkpointSuffixReduced": previous > snapshot.CurrentStage}); err != nil {
		return nil, err
	}
	success = true
	return s, nil
}
func (s *Store) Root() string { return s.root }
func (s *Store) Snapshot() (Snapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return Snapshot{}, fmt.Errorf("workspace is closed")
	}
	return Load(s.root, s.validator)
}
func (s *Store) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return nil
	}
	s.closed = true
	err := s.record("workspace_closed", -1, "", nil)
	return errors.Join(err, s.log.Close(), s.lease.Close())
}
func syncDir(path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	return f.Sync()
}
func writeExclusive(path string, raw []byte) error {
	f, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	if _, err = f.Write(raw); err == nil {
		err = f.Sync()
	}
	return errors.Join(err, f.Close())
}
func (s *Store) commit(snapshot *Snapshot, stage int, files map[string][]byte, operation string) error {
	if stage != snapshot.CurrentStage+1 {
		return ErrConflict
	}
	if err := s.validator.CheckStage(stage, files["state.json"], snapshot.States, func(name string) ([]byte, error) {
		raw, ok := files[name]
		if !ok {
			return nil, fmt.Errorf("missing %s", name)
		}
		return raw, nil
	}); err != nil {
		return err
	}
	directory := filepath.Join(s.root, "checkpoints")
	if err := ensureDir(directory); err != nil {
		return err
	}
	pending := filepath.Join(directory, fmt.Sprintf("%d.pending-%s", stage, operation))
	if err := os.Mkdir(pending, 0700); err != nil {
		return err
	}
	for name, raw := range files {
		if name != "state.json" && name != "info.json" && name != "beacon.json" {
			return fmt.Errorf("invalid checkpoint filename")
		}
		if err := writeExclusive(filepath.Join(pending, name), raw); err != nil {
			return err
		}
	}
	if err := syncDir(pending); err != nil {
		return err
	}
	if s.beforePublish != nil {
		if err := s.beforePublish(stage); err != nil {
			return err
		}
	}
	final := filepath.Join(directory, strconv.Itoa(stage))
	if _, err := os.Lstat(final); !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("checkpoint already exists or cannot be inspected")
	}
	if err := os.Rename(pending, final); err != nil {
		return err
	}
	if err := syncDir(directory); err != nil {
		return err
	}
	snapshot.States[stage] = json.RawMessage(files["state.json"])
	snapshot.CurrentStage = stage
	if err := s.record("stage_committed", stage, operation, nil); err != nil {
		return fmt.Errorf("stage %d committed but log failed: %w", stage, err)
	}
	return nil
}
func (s *Store) WithOperation(name string, fn func(service.Transaction) error) (Snapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return Snapshot{}, fmt.Errorf("workspace is closed")
	}
	snapshot, err := Load(s.root, s.validator)
	if err != nil {
		return snapshot, err
	}
	op := id()
	if err := s.record("operation_started", snapshot.CurrentStage, op, name); err != nil {
		return snapshot, err
	}
	err = fn(&transaction{store: s, snapshot: &snapshot, operation: op})
	kind := "operation_completed"
	var details any = name
	if err != nil {
		kind = "operation_failed"
		details = map[string]any{"operation": name, "error": err.Error()}
	}
	return snapshot, errors.Join(err, s.record(kind, snapshot.CurrentStage, op, details))
}

type transaction struct {
	store     *Store
	snapshot  *Snapshot
	operation string
}

func (t *transaction) Snapshot() *Snapshot { return t.snapshot }
func (t *transaction) Commit(stage int, files map[string][]byte) error {
	return t.store.commit(t.snapshot, stage, files, t.operation)
}
func (t *transaction) Record(kind string, details any) error {
	return t.store.record(kind, t.snapshot.CurrentStage, t.operation, details)
}
func (t *transaction) SaveActivity(raw []byte) error {
	if string(t.snapshot.Activity) != "null" {
		return ErrConflict
	}
	if err := t.store.validator.Activity(raw); err != nil {
		return err
	}
	pending := filepath.Join(t.store.root, "activity.pending-"+t.operation+".json")
	if err := writeExclusive(pending, raw); err != nil {
		return err
	}
	final := filepath.Join(t.store.root, "activity.json")
	if _, err := os.Lstat(final); !errors.Is(err, os.ErrNotExist) {
		return ErrConflict
	}
	if err := os.Rename(pending, final); err != nil {
		return err
	}
	if err := syncDir(t.store.root); err != nil {
		return err
	}
	t.snapshot.Activity = raw
	return nil
}

var _ service.Repository = (*Store)(nil)
