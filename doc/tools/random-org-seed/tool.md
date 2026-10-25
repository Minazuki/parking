# RANDOM.ORG簽章seed測試腳本

[Shell入口](../../../tools/random-org-seed.sh)／[TS實作](../../../tools/random-org-seed/ts/main.mts)。

已實作獨立TypeScript工具 [random-org-seed.sh](../../../tools/random-org-seed.sh)，不安裝套件，不參與正式抽選。使用支援原生TypeScript的Node；本機以Node v26.12.1驗證。`.mts`明確指定ES module，不需先建立前端package.json。

## 先看格式，不打API

```bash
./tools/random-org-seed.sh preview --output tmp/seed-format
```

產生request.json（key已遮蔽）、response.example.json、status.json。離線範例位於 [response.example.json](../../../examples/random-org-response.example.json)，所有seed、時間、流水號及簽章均為合成示例，不是第三方收據，也無法通過簽章驗證。

回應主要欄位為`result.random.data[0]`、`completionTime`、`serialNumber`、`userData`及`result.signature`。seed為256-bit，即64個hex字元；時間來自服務端UTC。具體格式以API真實回應為準。

## 真實請求

需要具有Signed API權限與額度的RANDOM.ORG API key。腳本只從RANDOM_ORG_API_KEY讀取，不把key寫進程式、請求紀錄或摘要。以下在自己的zsh終端中輸入key並於同一終端執行：

```zsh
read -rs 'RANDOM_ORG_API_KEY?RANDOM.ORG API key: '
export RANDOM_ORG_API_KEY
./tools/random-org-seed.sh generate --output tmp/seed-live-001
```

`generate`呼叫`generateSignedBlobs`，參數n=1、size=256、format=hex；預設userData標明parking-seed-format-test。可用`--user-data path.json`指定不超過1000字元的JSON物件，例如活動與段落識別及輸入摘要；此工具不將真實名冊自動上傳。

每次使用新輸出目錄，包含：

| 檔案 | 內容 |
| --- | --- |
| request.json | 實際請求參數，但apiKey為REDACTED |
| response.json | 第三方原始回應文字，不重排或改寫signed random物件 |
| status.json | 操作、請求ID、進度及成功／失敗狀態 |

腳本會先建立新目錄及pending紀錄，再發出單次請求。已存在的目錄會在請求前拒絕，沒有自動重試。網路失敗記錄delivery_unknown，因為對方可能已產生seed，不能因未收到回應就自動再取一次。

## 依流水號取回

同一API key下，可讀前次收據取得流水號：

```bash
./tools/random-org-seed.sh get --receipt tmp/seed-live-001/response.json --output tmp/seed-fetched-001
```

或直接指定已知流水號：

```bash
./tools/random-org-seed.sh get --serial 12345 --output tmp/seed-fetched-002
```

使用getResult；若提供原收據，會比對random內容與signature是否一致。JSON-RPC外層id是新請求ID，可以不同；原seed、時間與流水號應相同。12345只是用法示例，不代表真實已生成的紀錄。

## 驗證來源

```bash
./tools/random-org-seed.sh verify --receipt tmp/seed-live-001/response.json --output tmp/seed-verified-001
```

使用官方verifySignature方法，不需API key，保留驗證回應並顯示authenticity。generate及get成功僅標示已保存簽章回應，不等於已完成密碼學驗證；驗證false時回傳失敗。

官方保證歷史Signed API紀錄至少保存一年，不是永久公開查詢頁；完整收據仍需自己封存。真實請求會使用帳號額度，服務授權與費率依使用者帳號方案確認。

## 測試與相關文件

測試方式、公開向量及實測紀錄見[測試紀錄](testing.md)。
