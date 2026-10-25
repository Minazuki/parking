# drand-seed 測試紀錄

操作入口與工具定位見[工具說明](tool.md)。

## 2026-10-26實測

使用者提供的round 33382601已透過v2 API取回並驗證成功，離線重新驗證結果相同：

```json
{
  "round": 33382601,
  "seed": "7010277ecb91976aba93d63d298503889de63e291a5a49f7c1b8d2cce2b3e858",
  "signatureVerified": true,
  "roundScheduledTimeUtc": "2026-10-25T17:59:27.000Z",
  "roundScheduledTimeTaipei": "2026-10-26T01:59:27+08:00"
}
```

另實測latest取得round 33382728，BLS驗證通過，臺灣預定時間02:05:48。公開範例保存在[鏈資訊](../../../examples/drand-quicknet-v2-info.json)及[round 33382601](../../../examples/drand-quicknet-v2-round-33382601.json)，不含社區資料。

`npm test`包含公開簽章驗證、鏈參數篡改、簽章／round篡改、時間邊界、v2請求與離線驗證、拒絕覆寫，以及既有RANDOM.ORG測試，合計10項通過。實測輸出位於本機`tmp/drand-v2-*`，不提交Git。

官方實作參考：[drand-client](https://github.com/drand/drand-client)、[簽章驗證實作](https://github.com/drand/drand-client/blob/master/lib/beacon-verification.ts)。
