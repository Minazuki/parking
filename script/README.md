# Repository操作腳本

從repository工作目錄呼叫`./script/...`。獨立算法及資料驗證工具仍保留在tools；發布包裡的start.sh是執行入口，不要求現場具備repo。

| 入口 | 用途 |
| --- | --- |
| ./script/build-release.sh | 完整Vue內嵌Go發布包，預設dist/parking-release-vYYYY.MMDD.HHmm |
| ./script/run-server.sh | Go debug開發、Cobra help／version／server |
| ./script/build-server.sh | Go執行檔與版本metadata輔助；完整發布請使用build-release |
| release/start.sh、release/README.md | 隨完整發布包複製的啟動與說明樣板 |

```sh
npm ci
./script/build-release.sh
./script/build-release.sh --help
./script/run-server.sh version
```

發布包內容與使用見[本機啟動與版本發布](../doc/architecture/local-launch.md)。所有repo入口具備檔頭與help，不依賴呼叫者先cd進script；相對參數依呼叫位置處理。版本目錄存在時拒絕覆寫，不把年度名冊、繳費或抽選資料包進產物。
