package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/Minazuki/parking/server/src/internal/query"
	"github.com/spf13/cobra"
)

func newExportQueryCommand() *cobra.Command {
	var workspace, queryData, output, round string
	command := &cobra.Command{Use: "export-query", Short: "離線驗證存檔並輸出公開查詢JSON", Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			n := 0
			switch round {
			case "auto":
			case "1":
				n = 1
			case "2":
				n = 2
			default:
				return fmt.Errorf("--round must be auto, 1 or 2")
			}
			if _, err := os.Lstat(output); !os.IsNotExist(err) {
				return fmt.Errorf("output already exists or cannot be checked: %s", output)
			}
			var data query.Dataset
			var err error
			if queryData != "" {
				data, err = query.ReadFixture(queryData, n, time.Now())
			} else {
				data, err = query.Build(workspace, n, time.Now())
			}
			if err != nil {
				return err
			}
			raw, err := json.MarshalIndent(data, "", "  ")
			if err != nil {
				return err
			}
			file, err := os.OpenFile(output, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
			if err != nil {
				return err
			}
			_, err = file.Write(append(raw, '\n'))
			if closeErr := file.Close(); err == nil {
				err = closeErr
			}
			return err
		},
	}
	command.Flags().StringVar(&workspace, "workspace", "", "年度存檔目錄（唯讀）")
	command.Flags().StringVar(&output, "output", "", "新建的公開JSON檔案")
	command.Flags().StringVar(&round, "round", "auto", "auto依完整斷點判斷；或1／2")
	command.Flags().StringVar(&queryData, "query-data", "", "查詢頁專用testMode JSON（非抽選存檔）")
	command.MarkFlagsOneRequired("workspace", "query-data")
	command.MarkFlagsMutuallyExclusive("workspace", "query-data")
	command.MarkFlagRequired("output")
	return command
}
