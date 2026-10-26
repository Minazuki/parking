# AI 共用工作指示

根目錄 `AGENTS.md`、`CLAUDE.md`、`GEMINI.md` 僅導向本檔。穩定工作約定集中在此，專案內容由各主題文件維護。

## 專案現況

本 repository 用於年度機車與腳踏車停車位抽籤工具。採server/src（Go後端）與client/src（Vue／TS前端），已建立Gin Controller–Service–Repository與正式Go抽選／清票、0至6存檔提交、API及log，Vue與CSV整合尚待完成。架構及執行見[Go後端](../architecture/backend.md)與[目錄配置](../architecture/repository-layout.md)。Python[規則原型](../tools/round-two/tool.md)保留作參考。行政人員正在前置登記，前端演出是近期優先項目。

## 開始工作

1. 執行 `git status --short --branch`，保留使用者既有修改。
2. 閱讀 [文件地圖](../README.md)、任務相關主題與 [開發規範](../conventions/development.md)。
3. 先辨識已確認需求與提案；抽籤資格、算法、繳費條件或架構尚未確認時，不自行宣稱定案。
4. 修改功能或規劃時同步更新其文件，避免同一規則分散維護。
   Markdown中的流程圖與目錄結構圖一律使用Mermaid，依[開發規範](../conventions/development.md)維護，不使用ASCII目錄樹。
   新增工具必須一併建立`doc/tools/<tool-name>/tool.md`及更新[工具索引](../tools/README.md)；相關文件收在對應工具目錄，遵循[工具樣板](../conventions/tool-layout.md)。
5. 撰寫commit message前閱讀[Commit Message規範](../conventions/commit-messages.md)，依實際staged內容撰寫英文Conventional Commit。

## 基礎架構規範

Go CLI以Cobra為入口，root command不帶參數顯示help，只有server子指令啟動服務；cmd/server.go及cmd/version.go呼叫各自模組；需要依賴組裝時使用Wire。Debug版本固定dev／none／none，release腳本注入版本、Git hash及buildtime，OS／ARCH為編譯目標；見[CLI規範](../architecture/cli.md)。

Go server使用Gin RESTful API與Controller–Service–Repository；TypeScript client使用Vue 3 MVVM，2D採Vue呈現，3D以TresJS整合Three.js並共用MVVM狀態。分層責任與目前遷移狀態以[應用程式架構規範](../architecture/application-patterns.md)為準；不得把規劃誤報為已完成實作。

## 工作邊界

- 目前先做規劃；未有實作任務時，不自行導入框架、雲端資源或付費服務。
- Google Drive 是使用者已有的可用資源，不代表已授權建立、修改或分享遠端檔案。
- 不將真實名冊、繳費資料、無障礙需求或憑證寫入版本控制；示範使用虛構資料。
- 正式抽籤、名單變更、結果重抽與對外公布須依後續確認的操作規則執行，不以測試之名操作正式資料。
- 保留使用者未提交內容；不自行 commit、push 或 publish。

## 驗證與交付

文件變更確認相對連結有效，執行 `git diff --check` 並檢視變更。新增未追蹤檔案也須檢查內容，不能只依賴 `git diff`。核心測試使用 `python3 -m unittest discover -s tests -v`；修改工具時同步驗證CLI及輸出保護。

交付簡述新增或修改內容、驗證方式與仍待確認事項。
