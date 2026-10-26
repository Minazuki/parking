# Parking 發布包

執行於此發布包建置的OS／ARCH；版本及SHA-256見`manifest.json`，也可執行`./start.sh version`查看。程式已內嵌Vue前端，現場不需Go、Node、Vite或重新建置。

```sh
./start.sh --workspace "../停車位抽籤資料/116年度"
```

啟動後自選本機可用埠號，以Google Chrome開啟首頁。`--workspace`相對目前呼叫位置解析；完整選項可用`./parking server --help`查看。`./start.sh --no-browser --workspace /path/to/annual`可不開Chrome，終端會顯示網址。Ctrl+C正常停止。

| 檔案 | 用途 |
| --- | --- |
| parking | Go執行檔，內嵌前端、API及JSON Schema |
| start.sh | 本機啟動入口與help |
| manifest.json | 版本、Git hash、建置時間、OS／ARCH及檔案摘要 |
| README.md | 本說明 |
| LICENSE | MIT授權及免責聲明 |

程式與年度工作資料分離。把行政CSV放在年度目錄的`inputs/`，不要放在發布包內；既有JSON斷點及logs保留於年度目錄。升版使用新的發布目錄，仍指向原年度目錄。

第一次現場按開始後自動匯入登記並演出，完成後手動下載CSV並上傳Drive。之後另日放入繳費CSV，獨立按「匯入繳費並清票」；此作業可離線進行，不取得seed。第二次現場再按開始演出。每輪取得新drand seed需要網路，已保存結果的查閱、重播與下載不需網路。

新活動的年度及演練／正式模式在開始前設定，既有活動沿用保存資料。預設Mono／Amber／Dark；管理工作台為`?view=workbench`，3D預覽為`?view=parking`。

年度封存時一併備份整個發布目錄及年度工作目錄。工作目錄損壞時停止處理，不以重抽取代debug；需要回退時先停止伺服器，保留logs，再依既定斷點規則處理。

啟動時會建立工作目錄內的`inputs/`、`checkpoints/`、`exports/`、`logs/`及`README.md`，既有檔案保留。所需CSV檔名見工作目錄README；Chrome下載的結果請手動保存至exports。

一般啟動預設正式活動；演練可加`--test-mode`。目前此模式只有標記差異，仍請求真實seed並存檔，請另外指定測試workspace。
