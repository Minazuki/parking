# Client

Vue／TypeScript前端來源放在src。目前有獨立TS雙抽驗證核心與models／api／viewmodels／views／scenes目錄責任說明，Vue頁面與Vite開發設定尚待建立。

架構採Vue 3 MVVM；2D使用Vue，3D以TresJS整合Three.js，共用ViewModel。見[架構規範](../doc/architecture/application-patterns.md)。

正式狀態、seed取得、配位與檔案提交由Go後端負責；client只負責操作與演出，TS算法供獨立重算，不取代Go正式結果。

相依使用根目錄npm workspace管理，從repository根執行npm ci及npm test。正式部署預計將前端建置產物內嵌Go，不需要現場分別啟動Vite與Go。

見[目錄配置](../doc/architecture/repository-layout.md)與[後端API](../doc/architecture/backend.md)。
