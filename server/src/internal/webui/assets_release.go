//go:build frontend

package webui

import (
	"embed"
	"io/fs"
)

//go:embed dist
var bundled embed.FS

func Files() fs.FS {
	files, err := fs.Sub(bundled, "dist")
	if err != nil {
		panic(err)
	}
	return files
}
