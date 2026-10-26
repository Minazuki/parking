# 開發與檔案規範

## 檔案管理

新工具的shell入口、語言子目錄、檔頭用法及help遵循[工具入口與目錄樣板](tool-layout.md)。既有工具按任務需要逐步調整。

新增工具必須同時建立`doc/tools/<tool-name>/tool.md`，將相關文件收在同目錄，並更新[工具索引](../tools/README.md)及shell內的文件路徑。

- 文件依 [文件地圖](../README.md) 分類，根目錄保留專案入口與必要設定。
- 已追蹤檔案搬移或更名使用 `git mv`，刪除使用 `git rm`；搬移與大幅內容修改盡量分開，方便檢閱歷史。
- 不清除或覆蓋使用者既有檔案；避免廣泛遞迴刪除。
- Repo操作入口統一放`script/`，從工作目錄以`./script/...`呼叫；獨立驗證工具保留`tools/`。完整發布產物放`dist/parking-release-vYYYY.MMDD.HHmm/`，與年度資料分離，忽略Git。
- `tmp/` 放暫存產物，`logs/` 放執行日誌，`bin/` 放建置產物，均不提交。未來工具如需其他輸出位置，應同步調整規範與忽略清單。
- `data/` 與 `exports/` 分別保留本機正式輸入與匯出結果，不提交；需要長期保存的正式資料另行備份，Git 忽略清單不是備份機制。
- 可提交的資料範例必須虛構，置於後續建立的 `examples/`，不要放在正式資料目錄。

應用程式來源採[server/src與client/src配置](../architecture/repository-layout.md)；schemas維護共用契約，tools維護CLI驗證工具。

架構基準依[應用程式架構規範](../architecture/application-patterns.md)：Go採Gin RESTful API與Controller–Service–Repository，Vue 3採MVVM，Three.js經TresJS整合。

Go CLI採Cobra，root command用於help，不預設啟動server；版本與Wire組裝遵循[CLI規範](../architecture/cli.md)。

## Commit

提交格式、語言與scope以[Commit Message規範](commit-messages.md)為唯一來源。僅在使用者要求時提交；push使用已確認的remote及branch。

## Markdown圖表

所有Markdown文件中的流程圖及目錄結構圖統一使用`mermaid` fenced code block。流程使用flowchart等合適圖型，目錄以有標籤的節點與父子連線表示；不使用ASCII／Unicode tree view或以純文字箭頭串列替代流程圖。命令、程式碼、資料範例與數學公式保留各自格式，文字敘述中的編號順序不必改畫圖。

修改文件時同步檢查圖表節點、連線、標籤及相對連結。工具文件的目錄樣板見[工具入口與目錄樣板](tool-layout.md)。

## 驗證

目前文件檢查包括相對連結、狀態標示、差異與行尾空白。實作階段依風險驗證名單檢查、配位約束、保存與恢復，正式抽籤資料不得作為自動測試輸入。

## GitHub Actions驗證

CI runner與Action設定以官方runner-images文件及各Action的action.yml／README／release為準；使用gh api確認遠端權限、workflow及run／job結果，並以實際建置與發布驗證。actionlint僅輔助靜態檢查，其內建清單落後或忽略警告皆不構成runner可用性證明。發布流程見[手動CI發布](../architecture/ci-release.md)。
