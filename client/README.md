# Client

已建立Vue 3／TypeScript／Vite的2D MVVM操作頁面，包含活動建立、CSV匯入、兩輪抽選、清票、結果回看與固定底部進度軸。已加入依平面圖建立的TresJS／Three.js模型預覽；正式狀態、seed、配位與檔案提交由Go負責。

## 開發啟動

從repository根目錄執行，後端與前端各使用一個terminal：

```sh
npm ci
./script/run-server.sh server --workspace tmp/frontend-demo --dev-origin http://127.0.0.1:5173 --no-browser
```

```sh
npm run dev:client
```

使用Google Chrome開啟http://127.0.0.1:5173。Vite只監聽127.0.0.1:5173，埠已使用時停止，不自行換埠；/api/v1代理到127.0.0.1:8080。後端須明確允許上述dev-origin。需要其他API埠時，以PARKING_API_TARGET指定代理目標並配合Go --addr。

新活動先由畫面輸入民國年度與模式，預設演練模式；不從電腦時間推定年度。CSV預先放入工作目錄inputs，檔名與範例見[匯入契約](../doc/design/csv-import.md)。不要將正式目錄作測試資料；虛構來源位於examples/imports/inputs。

## 檢查與建置

```sh
npm run build:client
npm test
npm run test:browser
```

build先執行vue-tsc型別檢查，再產生client/dist；該目錄不提交。Chrome瀏覽器測試使用本機Google Chrome，不下載或改用Chromium。macOS權限尚未授予Ghostty時，先重啟終端並完成授權，再執行瀏覽器或本機服務測試。

已通過6個Chrome瀏覽器情境：4個模擬API操作／版面測試、1個3D場景測試，以及1個經實際Vite proxy連至真正Go API的虛構CSV整合測試。整合測試不取得seed、不操作正式資料。

## MVVM分工

- models/activity.ts：API與各階段型別、顯示格式及階段標籤。
- api/activity.ts：/api/v1 HTTP封裝，不自動重試寫入。
- viewmodels/useActivity.ts：恢復、操作、忙碌鎖、階段導覽、請求中斷後的唯讀對帳。
- views/ActivityView.vue及components：Vue 2D呈現，不計算正式配位。
- domain/draw.mts：獨立驗證核心；UI只引用其型別，不執行抽選。
- scenes：TresJS場景、車位、文字與攝影機；models/parking維護位置與公尺尺寸。

前端演出不驅動核心存檔；已完成階段只能回看。自動現場演出與結果CSV已實作；其他行政報表，另有其他行政報表尚待完成。完整發布已由`./script/build-release.sh`內嵌Vue至Go，預設輸出`dist/parking-release-vYYYY.MMDD.HHmm/`；一般Go開發build根頁仍是API狀態。

完整互動與恢復規則見[2D工作台](../doc/design/client-workbench.md)。

模型預覽：Chrome開啟http://127.0.0.1:5173/?view=parking，不需要Go API。規格見[3D場景](../doc/design/parking-scene.md)。

### 住戶進場試播

在3D預覽右側「住戶進場演出」按「整批進場」。這一版只使用虛構配位，機車與腳踏車各有固定路線，可重播、直接顯示結果或收起物件。

「查詢戶號（示範）」輸入`999-1`可看單戶進場，`999-7`可看場外候補；展開「示範戶號與配位」可看目前區域的完整清單。腳踏車`999-3`示範經門口前往小39。也可選擇「讀取活動存檔」，透過Go API唯讀播放第一輪／第二輪結果；工作台結果頁有對應梯次的3D播放連結。

移動物件採小型機車／腳踏車模型，點擊後頭頂顯示戶號對話框，同時只顯示一個；查詢戶號時自動顯示並跟隨進場。

### 全車位路線測試

開啟`http://127.0.0.1:5173/?view=parking&source=all`，或按「全車位配位測試」。目前區域每格配置一戶`998-*`虛構戶號，機車150格（無障礙全拆分153格）、腳踏車57格。此模式不呼叫活動API。

可整批播放、選擇單一車位重播、調整1／2／4倍速，或拖曳播放進度暫停檢查。車位穿越檢查涵蓋全部路徑中心線與其他車格的矩形範圍；尚未模擬車身碰撞、牆／柱／欄杆碰撞或物件互相避讓，仍需用動畫校正現場動線。

### 管理工作台的逐步投影

開啟`?view=workbench`，於第一輪／第二輪車位類型列按「開啟投影演出」，可手動逐段查看名單、車位池、seed、3D進場及結果。這是管理與校對入口，不是現場模式的必要操作。

### 預設現場模式

Chrome開啟首頁`http://127.0.0.1:5173/`，全站採Nuxt UI Mono參考色票（Neutral灰階、Amber主色），預設Dark；色彩集中於`src/theme.css`。管理工作台改到`?view=workbench`。

第一次按開始，自動匯入登記並演出四池，結束後按下載第一輪CSV。之後另日放入繳費CSV，按「匯入繳費並清票」直接查看3／4結果，不取seed。再於第二次現場按開始，自動演出第二輪三池，結束後按下載第二輪CSV。上傳Google Drive由操作人員自行完成。

詳見[現場流程](../doc/design/live-operation.md)及[CSV欄位](../doc/design/result-export.md)。
