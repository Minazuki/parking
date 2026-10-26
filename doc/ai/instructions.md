# AI 共用工作指示

根目錄 `AGENTS.md`、`CLAUDE.md`、`GEMINI.md` 僅導向本檔。穩定工作約定集中在此，專案內容由各主題文件維護。

## 專案現況

本 repository 用於年度機車與腳踏車停車位抽籤工具。採server/src（Go後端）與client/src（Vue／TS前端），已建立Gin Controller–Service–Repository與正式Go抽選／清票、0至6存檔提交、API及log，已接上年度inputs CSV匯入，已建立Vue 2D工作台與進度軸；真實API瀏覽器整合已驗證，已加入TresJS公尺單位的定案場景、小型車輛進場與戶號對話框，並支援活動存檔唯讀播放；已串接抽選前名單至seed、3D進場及結果的投影流程；首頁預設黑暗現場模式，兩次現場自動演出、中間獨立清票及手動結果CSV下載已實作；現場校對、其他報表及發布尚待完成。架構及執行見[Go後端](../architecture/backend.md)與[目錄配置](../architecture/repository-layout.md)。Python[規則原型](../tools/round-two/tool.md)保留作參考。行政人員正在前置登記，前端演出是近期優先項目。

## 開始工作

1. 執行 `git status --short --branch`，保留使用者既有修改。
2. 閱讀 [文件地圖](../README.md)、任務相關主題與 [開發規範](../conventions/development.md)。
3. 先辨識已確認需求與提案；抽籤資格、算法、繳費條件或架構尚未確認時，不自行宣稱定案。
4. 修改功能或規劃時同步更新其文件，避免同一規則分散維護。
   Markdown中的流程圖與目錄結構圖一律使用Mermaid，依[開發規範](../conventions/development.md)維護，不使用ASCII目錄樹。
   新增工具必須一併建立`doc/tools/<tool-name>/tool.md`及更新[工具索引](../tools/README.md)；相關文件收在對應工具目錄，遵循[工具樣板](../conventions/tool-layout.md)。
5. 撰寫commit message前閱讀[Commit Message規範](../conventions/commit-messages.md)，依實際staged內容撰寫英文Conventional Commit。

## 專案UI skill

已安裝Nuxt UI官方[nuxt-ui skill](../../.agents/skills/nuxt-ui/SKILL.md)，來源為`nuxt/ui`的`v4`分支，僅存於本專案`.agents/skills/nuxt-ui`。UI元件、主題、表單及overlay工作先讀該skill，再按任務讀相關references；主題工作先讀[design-system](../../.agents/skills/nuxt-ui/references/guidelines/design-system.md)。官方檔案保留原樣，更新時從同一來源重新安裝，不自行改寫其規範。

目前應用使用Vue／Vite自製元件及語意CSS tokens，尚未導入`@nuxt/ui`執行期元件庫；不得將skill安裝或色票參考誤報為元件庫遷移已完成。導入元件時使用skill的Vue（Vite）路徑，遵守UApp、語意顏色及產生theme slots等規範。

## 視覺基準

主題依使用者指定採Nuxt UI Mono、primary Amber、neutral Neutral、預設Dark。UI色彩集中於`client/src/theme.css`；背景維持純中性黑灰階，選取與主要動作用Amber，詳見[現場模式](../design/live-operation.md)。

## 基礎架構規範

Go CLI以Cobra為入口，root command不帶參數顯示help，只有server子指令啟動服務；cmd/server.go及cmd/version.go呼叫各自模組；需要依賴組裝時使用Wire。Debug版本固定dev／none／none，release腳本注入版本、Git hash及buildtime，OS／ARCH為編譯目標；見[CLI規範](../architecture/cli.md)。

Go server使用Gin RESTful API與Controller–Service–Repository，API統一使用`/api/v1`前綴；TypeScript client使用Vue 3 MVVM，2D採Vue呈現，3D以TresJS整合Three.js並共用MVVM狀態。分層責任與目前遷移狀態以[應用程式架構規範](../architecture/application-patterns.md)為準；不得把規劃誤報為已完成實作。

## 工作邊界

- 目前先做規劃；未有實作任務時，不自行導入框架、雲端資源或付費服務。
- Google Drive 是使用者已有的可用資源，不代表已授權建立、修改或分享遠端檔案。
- 不將真實名冊、繳費資料、無障礙需求或憑證寫入版本控制；示範使用虛構資料。
- 正式抽籤、名單變更、結果重抽與對外公布須依後續確認的操作規則執行，不以測試之名操作正式資料。
- 保留使用者未提交內容；不自行 commit、push 或 publish。

## 驗證與交付

文件變更確認相對連結有效，執行 `git diff --check` 並檢視變更。新增未追蹤檔案也須檢查內容，不能只依賴 `git diff`。後端測試使用 `go -C server test -race ./src/...`，TS與交叉驗證使用 `npm test`；Python原型使用 `python3 -m unittest discover -s tests -v`；修改工具時同步驗證CLI及輸出保護。

交付簡述新增或修改內容、驗證方式與仍待確認事項。
