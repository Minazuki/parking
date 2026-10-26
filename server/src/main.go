package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/Minazuki/parking/server/src/cmd"
	"github.com/Minazuki/parking/server/src/internal/buildinfo"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := cmd.NewRootCommand(buildinfo.Current()).ExecuteContext(ctx); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
