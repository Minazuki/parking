package repository

import (
	_ "embed"
	"errors"
	"os"
	"path/filepath"
)

//go:embed workspace-readme.md
var workspaceReadme []byte

// prepareWorkspace creates only the skeleton; activity and checkpoints require
// explicit operations. Existing operator files are never overwritten.
func prepareWorkspace(root string) error {
	for _, name := range []string{"inputs", "checkpoints", "exports", "logs"} {
		if err := ensureDir(filepath.Join(root, name)); err != nil {
			return err
		}
	}
	file, err := os.OpenFile(filepath.Join(root, "README.md"), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if errors.Is(err, os.ErrExist) {
		return nil
	}
	if err != nil {
		return err
	}
	_, writeErr := file.Write(workspaceReadme)
	if writeErr == nil {
		writeErr = file.Sync()
	}
	closeErr := file.Close()
	return errors.Join(writeErr, closeErr)
}
