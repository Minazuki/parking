package cmd

import (
	"github.com/Minazuki/parking/server/src/internal/app"
	"github.com/Minazuki/parking/server/src/internal/buildinfo"
	"github.com/spf13/cobra"
)

func newServerCommand(info buildinfo.Info, run serverRunner) *cobra.Command {
	cfg := app.Config{Version: info.Version}
	command := &cobra.Command{
		Use: "server", Short: "啟動本機Gin服務及Google Chrome", Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			if err := cfg.Validate(); err != nil {
				return err
			}
			return run(cmd.Context(), cfg, cmd.OutOrStdout(), cmd.ErrOrStderr())
		},
	}
	command.Flags().StringVar(&cfg.Workspace, "workspace", "", "年度工作目錄（必要）")
	command.Flags().StringVar(&cfg.Addr, "addr", "127.0.0.1:8080", "僅允許loopback IP；port 0自選可用埠")
	command.Flags().StringVar(&cfg.DevOrigin, "dev-origin", "", "允許的本機Vite HTTP origin")
	command.Flags().BoolVar(&cfg.NoBrowser, "no-browser", false, "不啟動Google Chrome")
	command.Flags().BoolVar(&cfg.TestMode, "test-mode", false, "以演練模式建立新活動")
	command.MarkFlagRequired("workspace")
	return command
}
