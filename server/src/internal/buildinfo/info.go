// Package buildinfo holds immutable metadata supplied by the release linker flags.
package buildinfo

import (
	"fmt"
	"runtime"
)

// Debug builds deliberately have no release metadata.
var (
	Version   = "dev"
	GitHash   = "none"
	BuildTime = "none"
)

type Info struct {
	Version   string
	GitHash   string
	BuildTime string
	OS        string
	ARCH      string
}

func Current() Info {
	return Info{Version: Version, GitHash: GitHash, BuildTime: BuildTime, OS: runtime.GOOS, ARCH: runtime.GOARCH}
}

func (i Info) String() string {
	return fmt.Sprintf("version: %s\ngithash: %s\nbuildtime: %s\nOS: %s\nARCH: %s", i.Version, i.GitHash, i.BuildTime, i.OS, i.ARCH)
}
