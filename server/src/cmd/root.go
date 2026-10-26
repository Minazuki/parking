package cmd

import (
	"context"
	"io"

	"github.com/Minazuki/parking/server/src/internal/app"
	"github.com/Minazuki/parking/server/src/internal/buildinfo"
	"github.com/spf13/cobra"
)

type serverRunner func(context.Context, app.Config, io.Writer, io.Writer) error

// NewRootCommand creates a fresh command tree; only the server command opens a workspace.
func NewRootCommand(info buildinfo.Info) *cobra.Command {
	return newRootCommand(info, app.Run)
}

func newRootCommand(info buildinfo.Info, run serverRunner) *cobra.Command {
	root := &cobra.Command{
		Use: "parking", Short: "年度停車位抽選本機工具", Args: cobra.NoArgs,
		SilenceUsage: true, SilenceErrors: true, Version: info.String(),
		RunE:              func(command *cobra.Command, args []string) error { return command.Help() },
		CompletionOptions: cobra.CompletionOptions{DisableDefaultCmd: true},
	}
	root.SetVersionTemplate("{{.Version}}\n")
	root.AddCommand(newVersionCommand(info), newServerCommand(info, run))
	return root
}
