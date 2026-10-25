# drand quicknet v2驗證工具

[Shell入口](../../../tools/drand-seed.sh)／[TS實作](../../../tools/drand-seed/ts/main.mts)。

工具：[tools/drand-seed.sh](../../../tools/drand-seed.sh)。使用TypeScript及固定版本`drand-client@1.4.2`驗證BLS簽章，尚未串接抽選。執行環境使用可直接執行`.mts`的Node.js（本次實測v26.12.1），首次安裝執行`npm ci`。

## 操作

取得最新round，或指定歷史round：

```sh
./tools/drand-seed.sh fetch --output tmp/drand-latest-002
./tools/drand-seed.sh fetch --round 33382601 --output tmp/drand-round-002
```

使用已保存的原始資料離線驗證，不連線：

```sh
./tools/drand-seed.sh verify --input tmp/drand-round-002 --output tmp/drand-verified-002
```

輸出必須為新資料夾；既有路徑直接拒絕，不覆寫也不先發送請求。無API key、不自動重試。每次保存：

| 檔案 | 內容 |
| --- | --- |
| `request.json` | API網址、指定round或離線來源 |
| `info.json` | v2鏈資訊原文 |
| `beacon.json` | v2 round與signature原文 |
| `receipt.json` | 驗證通過後的seed、round、時間與查詢網址 |
| `status.json` | pending、requesting_beacon、verified或failed |

失敗保留已取得的資料與錯誤狀態，不產生驗證成功收據。離線模式重新驗證原始鏈資訊及簽章，不信任原有receipt；其request時間欄位為null。

## 驗證與時間

固定quicknet鏈`52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971`，使用`/v2/chains/<hash>/info`及`/rounds/latest`或`/rounds/<round>`，請求標頭`Accept: application/json`。

鏈公鑰、chain hash、genesis seed、scheme、period及genesis time均與工具內固定值核對。v2回應沒有randomness欄位；工具由signature的原始bytes計算SHA-256作為seed，並透過官方client驗證BLS簽章，通過後才輸出成功收據。固定round請求也核對回傳round一致。

```text
round預定Unix時間（秒） = genesis_time + (round - 1) × period
quicknet: genesis_time = 1692803367，period = 3秒
```

`roundScheduledTimeUtc`及`roundScheduledTimeTaipei`是預定出值時間，不是HTTP請求時間，也不是實際發布時間。`requestStartedAt`、`responseReceivedAt`是本機觀測的beacon請求起迄，`durationMs`使用單調時鐘量測。`roundAgeAtResponseMs`以本機時鐘比較回應與round預定時間，供檢視資料年齡，不是第三方簽章時間證明。

簽章有效不代表最新；工具允許歷史round，尚未訂正式抽選的新鮮度門檻、事前承諾與防挑選round規則。完整討論見[Seed與可重現性](../../design/randomness.md)。

## 測試與相關文件

測試方式、公開向量及實測紀錄見[測試紀錄](testing.md)。
