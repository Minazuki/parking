# Commit Message 規範

參考 `~/script/doc/conventions/commit-messages.md`，沿用英文Conventional Commits，scope依本專案調整。本檔為parking repository的提交規範來源，不依賴其他repo的檔案存在。

## Header

```text
<type>(<scope>): <description>
```

Header及body一律英文。Description使用現在式祈使句、小寫開頭、不加句點。跨模組維護可省略scope，或選最主要的scope。

| Type | 用途 |
| --- | --- |
| feat | 新增功能 |
| fix | 修正錯誤 |
| docs | 說明、需求、規則及設計文件 |
| style | 不改變行為的格式調整 |
| refactor | 不改變行為的結構調整 |
| test | 驗證與測試 |
| chore | 設定、忽略清單及維護 |

| Scope | 範圍 |
| --- | --- |
| doc | README、文件入口及跨主題文件 |
| planning | 需求、活動流程、時程與抽選規則 |
| design | 行政樣板、資料格式、活動階段與演出設計 |
| architecture | 系統架構與技術決策 |
| conventions | 開發及提交規範 |
| ai | 共用Agent指示與薄入口 |

實作模組建立後再依需要擴充scope，不預先編造不存在的模組。

## Body

- 以`- `條列，每條句首大寫，描述具體變更與理由。
- 聚焦最終內容，不寫對話歷程、憑證、正式住戶或繳費資料。
- 簡單變更可只寫header。

```text
docs(doc): establish parking lottery planning and guidelines

- Document registration, allocation, payment review, and round-two preparation
- Record the ROC year 116 schedule and administrative workbook structure
- Add shared agent instructions and repository conventions
```

## 提交前

1. 確認`git status`，只stage本次需要的檔案。
2. 依`git diff --cached`分析實際提交內容，再撰寫message。
3. 執行適用驗證及`git diff --cached --check`，確認無正式資料或暫存產物。
4. 搬移及更名使用`git mv`，避免與大幅內容修改混在同一commit；刪除追蹤檔使用`git rm`。其餘依[開發規範](development.md)。
