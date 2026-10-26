package cmd

import (
	"fmt"
	"github.com/Minazuki/parking/server/src/internal/buildinfo"
	"github.com/spf13/cobra"
)

func newVersionCommand(info buildinfo.Info) *cobra.Command {
	return &cobra.Command{
		Use: "version", Short: "顯示版本、Git hash、建置時間與目標平台", Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			_, err := fmt.Fprintln(cmd.OutOrStdout(), info.String())
			return err
		},
	}
}
