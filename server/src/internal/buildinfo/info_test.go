package buildinfo

import (
	"runtime"
	"testing"
)

func TestDebugMetadataDefaults(t *testing.T) {
	got := Current()
	if got.Version != "dev" || got.GitHash != "none" || got.BuildTime != "none" || got.OS != runtime.GOOS || got.ARCH != runtime.GOARCH {
		t.Fatal(got)
	}
}
