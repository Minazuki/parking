# AI 共用工作指示

根目錄 `AGENTS.md`、`CLAUDE.md`、`GEMINI.md` 僅導向本檔。穩定工作約定集中在此，專案內容由各主題文件維護。

## 專案現況

本 repository 用於年度機車與腳踏車停車位抽籤工具。目前有規劃文件及Python標準函式庫的清票／第二輪離線核心，尚無完整前端。執行與測試見[核心說明](../design/round-two-core.md)。行政人員正在前置登記，前端演出是近期優先項目。

## 開始工作

1. 執行 `git status --short --branch`，保留使用者既有修改。
2. 閱讀 [文件地圖](../README.md)、任務相關主題與 [開發規範](../conventions/development.md)。
3. 先辨識已確認需求與提案；抽籤資格、算法、繳費條件或架構尚未確認時，不自行宣稱定案。
4. 修改功能或規劃時同步更新其文件，避免同一規則分散維護。
5. 撰寫commit message前閱讀[Commit Message規範](../conventions/commit-messages.md)，依實際staged內容撰寫英文Conventional Commit。

## 工作邊界

- 目前先做規劃；未有實作任務時，不自行導入框架、雲端資源或付費服務。
- Google Drive 是使用者已有的可用資源，不代表已授權建立、修改或分享遠端檔案。
- 不將真實名冊、繳費資料、無障礙需求或憑證寫入版本控制；示範使用虛構資料。
- 正式抽籤、名單變更、結果重抽與對外公布須依後續確認的操作規則執行，不以測試之名操作正式資料。
- 保留使用者未提交內容；不自行 commit、push 或 publish。

## 驗證與交付

文件變更確認相對連結有效，執行 `git diff --check` 並檢視變更。新增未追蹤檔案也須檢查內容，不能只依賴 `git diff`。核心測試使用 `python3 -m unittest discover -s tests -v`；修改工具時同步驗證CLI及輸出保護。

交付簡述新增或修改內容、驗證方式與仍待確認事項。
