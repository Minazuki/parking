# 文件地圖與 DaC 維護方式

本專案採 Documentation as Code（DaC）：以 repository 內的 Markdown 作為需求、設計與工作規範的可版本追蹤來源。沿用 `~/script` 的薄 Agent 入口、共用指示與分類文件結構，內容依本專案調整。

| 路徑 | 責任 |
| --- | --- |
| [AI 共用指示](ai/instructions.md) | 跨 Agent 工作約定與閱讀入口 |
| [開發規範](conventions/development.md) | 檔案、輸出與提交慣例 |
| [工具入口與目錄樣板](conventions/tool-layout.md) | Shell入口、語言子目錄、檔頭用法與help慣例 |
| [工具文件索引](tools/README.md) | 各工具操作、規格、測試及維護文件的歸檔入口 |
| [Commit Message規範](conventions/commit-messages.md) | 英文Conventional Commits、type及本專案scope |
| [需求與範圍](planning/requirements.md) | 已知需求、限制與範圍 |
| [活動流程](planning/workflow.md) | 登記、兩輪抽籤、繳費與結案 |
| [116年度抽選時程](planning/schedule-116.md) | 登記、第一輪抽籤與第一輪繳費日期 |
| [機車位與無障礙配置](planning/motorcycle-spaces.md) | 車位編號、分棟範圍、無障礙分配及拆分條件 |
| [待辦](planning/backlog.md) | 工作順序及待確認事項 |
| [停車場3D場景](design/parking-scene.md) | 圖面來源、公尺尺寸、車位位置、TresJS與模型預覽 |
| [Vue 2D工作台](design/client-workbench.md) | MVVM操作、進度軸、結果查閱及恢復邊界 |
| [前端演出](design/presentation.md) | 現場展示流程與建議行為 |
| [Seed與可重現性](design/randomness.md) | 每段亂數來源、保存時機、故障恢復及算法待決事項 |
| [ChaCha20交叉驗證](tools/verify-draw/tool.md) | 相同seed與有序多池交給TS／Go雙抽，核對串流、配位及候補 |
| [drand v2驗證工具](tools/drand-seed/tool.md) | quicknet簽章驗證、seed推導、round時間與離線重驗 |
| [第三方seed測試腳本](tools/random-org-seed/tool.md) | TS取得seed、取回歷史紀錄、簽章驗證及離線格式示例 |
| [資料規劃](design/data.md) | 登記欄位與資料分工草案 |
| [行政工作表樣板](design/admin-template.md) | 現行五個分頁、保護範圍、年度複製與交接 |
| [116年度測試工作表](design/test-workbook-116.md) | 獨立測試副本、情境數量與驗證紀錄 |
| [現場模式與獨立清票](design/live-operation.md) | 黑暗首頁、兩次自動現場演出、中間獨立清票與手動下載 |
| [住戶靜態查詢與Pages發布](design/resident-query.md) | 從年度JSON離線建置，第一輪／第二輪兩次更新相同查詢網址 |
| [結果CSV下載](design/result-export.md) | 每輪JSON轉CSV、欄位、來源摘要與手動下載 |
| [活動階段與CSV產出](design/activity-states.md) | 階段狀態、分頁轉碼、資料快照與第二輪工作表銜接 |
| [行政CSV匯入契約](design/csv-import.md) | 分階段讀取inputs、欄位與錯誤、虛構輸入範例 |
| [存檔Schema與唯讀驗證](design/checkpoint-schema.md) | 0至6欄位契約、完整性檢查及存檔重算入口 |
| [工作資料夾與存檔](design/workspace-storage.md) | 選資料夾恢復、按階段確認讀CSV、年度封存與錯誤處理 |
| [清票與第二輪抽選核心](tools/round-two/tool.md) | 已實作的離線工具、輸入契約、驗證與尚未串接功能 |
| [手動CI發布](architecture/ci-release.md) | 指定commit建置macOS arm64、SHA-256、tag與GitHub Release |
| [本機啟動與版本發布](architecture/local-launch.md) | Mac＋Chrome、Go指定工作目錄、發布包與時間版本號 |
| [應用程式架構規範](architecture/application-patterns.md) | Gin三層、Vue 3 MVVM及TresJS整合 |
| [Cobra CLI與版本資訊](architecture/cli.md) | server／version命令、debug／release metadata及Wire組裝 |
| [Repository Layout](architecture/repository-layout.md) | server/src、client/src及共用schema／工具分工 |
| [Go後端與階段提交](architecture/backend.md) | API、正式配位與清票、完整提交、恢復與session log |
| [架構方向](architecture/overview.md) | 部署、保存與恢復的提案 |
| [前端技術選型討論](architecture/frontend-options.md) | 從CSV、分段演出與選配靜態查詢回推離線前端 |
| [首次規劃紀錄](meetings/2026-10-25-kickoff.md) | 討論來源與當時狀態 |

## 維護原則

- 主題文件維護目前有效內容；會議紀錄保留當時的討論與來源，不取代現行規格。
- 區分「已確認需求」、「提案」及「待確認」，未獲確認的建議不可寫成既定規則。
- 變更需求或設計時，同步修改對應主題文件及受影響的待辦。
- 重要技術決策定案後，可在 `doc/architecture/` 新增決策紀錄，記載背景、方案、理由與影響；目前不建立假定已定案的 ADR。
- 文件使用繁體中文與相對連結。新增主題時更新本索引。
- 文件只放虛構範例；真實住戶、登記、繳費與抽籤資料不進 Git。
