# 本機預覽住戶查詢網站

入口：[script/preview-query.sh](../../../script/preview-query.sh)。需要Python 3；Mac預設開啟Google Chrome。不需要Go server或網路服務。

```sh
./script/preview-query.sh --site tmp/r1
./script/preview-query.sh --site tmp/r1 --no-browser
./script/preview-query.sh --help
```

腳本確認目錄包含index.html、assets及雜湊命名查詢JSON，在127.0.0.1自選可用埠，印出網址；Ctrl+C停止。相對路徑依呼叫位置解析。預覽只提供目錄內檔案，不允許目錄列表及路徑跳出，不修改查詢資料，也不上傳Cloudflare。

Vite網站使用JavaScript modules與fetch；直接雙擊index.html會以file URL開啟，受瀏覽器限制。建置產物在file URL下會顯示預覽指令提示；透過HTTP預覽或Pages網址開啟則正常顯示查詢頁。

相關：[建置查詢網站](../build-query/tool.md)。
