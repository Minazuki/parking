# 從產出物回推前端技術

狀態：2026-10-26使用者選定Vite＋Vue 3＋TypeScript＋Three.js，並說明較熟悉TypeScript。尚未安裝前端套件，套件版本尚待確認；第一版固定Mac＋Chrome，以Go內嵌前端並負責年度目錄讀寫，啟動方式已定案、存檔契約待設計。3D仍屬選配。

2D採Vue 3 MVVM；3D透過TresJS整合Three.js並共用ViewModel。分層規範見[應用程式架構規範](application-patterns.md)。

## 使用者提出的產出

1. 各抽選段落輸出CSV，可依用途轉成其他報表格式並上傳Google Drive。
2. 現場有完整流程演出，順序為A棟機車、B棟機車、大腳踏車、小腳踏車；整輪配位一次保存，各段獨立輸出報表。
3. 每段先展示參與及放棄戶號與數量，再展示可抽車位號碼池與數量，接著演出抽選並展示結果。
4. 最後可選做靜態查詢頁：輸入戶號，查詢停車場車位位置。使用者希望探索Three.js相關函式庫，但此功能優先序最低，不影響主要抽選交付。
5. 傾向離線網頁，具備2D／3D前端呈現能力，不使用常駐VPC。

上述A／B分段為第一輪機車演出順序，不直接套用到AB合併的第二輪機車流程；第二輪演出段落按實際抽選池安排。

## 產出與責任

| 產出 | 建議用途與內容 |
| --- | --- |
| 各段結果CSV | 由正式JSON匯出配位、未配位戶別及剩餘車位，供外部報表使用 |
| 活動存檔JSON | 年度、輪次、輸入快照、各段狀態、已產生結果與檔案關聯，供恢復及重播 |
| 合併報表 | 所有段落完成後彙總，保留各段原檔 |
| 查詢用結果JSON | 根據最終有效配置產出戶號與車位對應，不直接公開整份活動存檔 |
| 停車場配置資料 | 車位ID、平面位置／座標、區域；後續2D高亮與3D場景共用 |

位置查詢還需要停車場平面圖及車位位置對應，不能只從抽選CSV推得實際位置。查詢頁使用第二輪及繳費清查後確認的有效配置，不能把第一輪已放棄車位仍列為有效。

## 已選方向與實作建議

| 範圍 | 方案 | 理由 |
| --- | --- | --- |
| 前端 | Vue 3 + TypeScript + Vite | 一套畫面組件支援行政流程、投影演出與後續靜態查詢，產出靜態資源 |
| 2D演出 | HTML／CSS／SVG，搭配Vue Transition／TransitionGroup | 名單、數量、號碼池、排序與揭曉易讀，先完成現場操作與錄影 |
| 正式抽選與清票核心 | Go後端 | 狀態、取seed、配位與存檔由Go一併執行，Chrome中斷不取消已啟動階段 |
| 獨立驗證 | client/src/domain中的純TS模組 | 以固定seed及有序輸入核對Go結果，不作正式配位來源 |
| 狀態 | Go掌握完整斷點；Vue管理畫面與演出進度 | API讀正式狀態，不以畫面進度代表存檔完成 |
| 恢復 | Go讀取指定年度目錄的JSON存檔 | 不依賴瀏覽器快取恢復正式活動 |
| 檔案保存 | Go負責指定工作目錄的讀寫，TS經本機服務提交資料 | 正式存檔均為JSON，CSV僅在外部匯入／匯出時轉換，提交契約待設計 |
| 3D選配 | Three.js透過TresJS整合Vue 3 MVVM | 在Vue畫面中加入可替換3D場景，不讓3D依賴介入抽選規則 |
| Drive | 第一版手動上傳產出 | 維持離線核心，直接API授權及同步之後再評估 |

Python原型保留作早期規則與測試參考，正式清票及抽選已移至Go。前後端分別位於server/src及client/src，開發時分別啟動Vite與Go、由API溝通，正式發布仍由Go內嵌前端。TS保留獨立重算，不與Go同時維護兩套正式活動狀態。詳見[Repository Layout](repository-layout.md)與[Go後端](backend.md)。

## 單段演出與存檔邊界

核心先確認整輪輸入、取得seed、計算並保存整輪結果；之後每個演出段落的流程如下：

```mermaid
flowchart LR
    participants["參與／放棄名單"] --> pool["車位池"]
    pool --> reveal["動畫揭曉"]
    reveal --> result["結果總覽／匯出"]
    result --> next["下一段"]
```

結果保存與動畫分離：整輪只計算一次完整結果，先可靠保存核心斷點，再按結果播放動畫；動畫中斷可恢復或重播，不再次抽取。尚未保存、保存失敗、已保存待揭曉、已揭曉應可區別；不能按下下載按鈕就宣稱完成落檔。

核心完成0/名單、1/整輪seed、2/整輪結果的斷點後，前端依序演出A棟、B棟與兩類腳踏車。演出進度與核心state分開，某段演出故障不影響整輪已保存結果；各段CSV可獨立重新匯出而不重新抽選。

## 離線啟動

已確認：發布包以`start.sh --workspace`指定年度工作目錄，Go執行檔內嵌前端、提供localhost網站並開啟Chrome，檔案讀寫由Go負責。第一版使用目前這台Mac外接投影，暫不需跨平台封裝。發布目錄帶臺灣建置時間版本號，與年度資料分離，完整規格見[本機啟動與版本發布](local-launch.md)。

CSV預先放入inputs，按階段確認才讀取並轉成存檔；詳細規劃見[工作資料夾與存檔](../design/workspace-storage.md)。字型、音效與素材隨包提供；取得新的drand seed仍需網路，現場Wi-Fi及API存取由操作者事前測試。

## 官方參考

- [Vite production build](https://vite.dev/guide/build)：靜態產物、建置與資源路徑。
- [Vue Quick Start](https://vuejs.org/guide/quick-start.html)：官方Vite開發流程、SFC及TypeScript選項。
- [Vue Transition](https://vuejs.org/guide/built-ins/transition.html)：2D轉場；列表排序搭配TransitionGroup。
- [Three.js installation](https://threejs.org/manual/en/installation)：套件、建置與本機伺服器。
- [MDN showSaveFilePicker](https://developer.mozilla.org/en-US/docs/Web/API/Window/showSaveFilePicker)：瀏覽器相容性、安全環境及使用者互動限制。

## 接下來確認

Go與TS之間的保存提交契約、中斷恢復、投影與操作台是否共用畫面。前端方向已選Vue 3／TypeScript／Vite／Three.js；確認現場需求後再決定版本、相依套件及專案骨架。本次只更新選型文件，不先實作3D或公開查詢頁。
