package repository

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"syscall"
)

// ReadInput reads one original CSV from inputs. It never creates inputs or writes sources.
// Names come from service constants, not a client-supplied filesystem path.
func (s *Store) ReadInput(name string) ([]byte, error) {
	if name == "" || filepath.Base(name) != name || strings.ContainsAny(name, "/\\") || !strings.HasSuffix(name, ".csv") {
		return nil, fmt.Errorf("invalid CSV filename")
	}
	directory := filepath.Join(s.root, "inputs")
	info, err := os.Lstat(directory)
	if err != nil {
		return nil, err
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return nil, fmt.Errorf("inputs must be a regular directory")
	}
	root, err := os.OpenRoot(directory)
	if err != nil {
		return nil, err
	}
	defer root.Close()
	stat, err := root.Lstat(name)
	if err != nil {
		return nil, err
	}
	const maxBytes = 1 << 20
	if !stat.Mode().IsRegular() || stat.Size() > maxBytes {
		return nil, fmt.Errorf("CSV must be a regular file under 1MiB")
	}
	file, err := root.OpenFile(name, os.O_RDONLY|syscall.O_NOFOLLOW, 0)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	stat, err = file.Stat()
	if err != nil {
		return nil, err
	}
	if !stat.Mode().IsRegular() || stat.Size() > maxBytes {
		return nil, fmt.Errorf("CSV must be a regular file under 1MiB")
	}
	raw, err := io.ReadAll(io.LimitReader(file, maxBytes+1))
	if err != nil {
		return nil, err
	}
	if len(raw) > maxBytes {
		return nil, fmt.Errorf("CSV exceeds 1MiB")
	}
	return raw, nil
}
