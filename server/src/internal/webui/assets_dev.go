//go:build !frontend

package webui

import "io/fs"

// Files leaves ordinary Go development and verification builds independent of Node.
func Files() fs.FS { return nil }
