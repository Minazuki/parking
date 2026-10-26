# verify-draw 測試紀錄

操作入口與工具定位見[工具說明](tool.md)。

## v2驗證（2026-10-26）

`npm test`目前包含25項Node測試（含既有seed工具測試），以及由Node測試編譯Go worker進行的交叉／shell整合驗證；需安裝Go。新增8項存檔測試涵蓋0至6 schema、唯讀、回退及篡改檢查，含workspace兩輪shell重算。Go本身亦可在tools/verify-draw/go執行`go test ./...`。

- 四組虛構多池情境，加上一組完整容量第一輪（A65戶／65格、B85戶／88格、大38、小19），分別使用全零、全ff及公開round 33382601對應seed，共15組TS／Go完整JSON交叉比對。
- 核對跨64-byte區塊的原始串流、先車位再戶號、單項不消耗、穩定移除、各類候補、全候補池及skipped。
- shell整合：seed證據離線BLS驗證、重新讀保存輸入、expected既有結果比對、串流／配位篡改失敗、拒絕覆寫、非法輸入於取seed前失敗，全部skipped仍保留seed證據。
- 兩份worker都拒絕重複戶號、候補不足／跳號／非法型別、欄位異常、池順序錯誤等輸入。

本次手動端到端以公開round 33382601證據及round-two.json執行，消耗24 bytes，implementationsMatch=true；重讀該測試包的seed、pools與既有ts.json後，expectedMatches=true。輸出在本機tmp/verify-v2-second-001與tmp/verify-v2-replay-001，不提交Git。此測試使用歷史公開seed，不是正式第二輪活動。

公開向量使用固定seed `7010277ecb91976aba93d63d298503889de63e291a5a49f7c1b8d2cce2b3e858`，由TS與Go獨立結果完全一致後保存；expected檔只含結果，不複製seed或輸入。

| 輸入 | 預期結果 | 消耗bytes |
| --- | --- | --- |
| [第一輪](../../../examples/verify-draw/round-one.json) | [expected](../../../examples/verify-draw/round-one.expected.json) | 28 |
| [第二輪](../../../examples/verify-draw/round-two.json) | [expected](../../../examples/verify-draw/round-two.expected.json) | 24 |
| [全跳過](../../../examples/verify-draw/all-skipped.json) | [expected](../../../examples/verify-draw/all-skipped.expected.json) | 0 |
| [第一輪不足](../../../examples/verify-draw/first-round-shortage.json) | [expected](../../../examples/verify-draw/first-round-shortage.expected.json) | 4 |

[輸入Schema](../../../schemas/checkpoints/draw-pools.schema.json)及[結果Schema](../../../schemas/checkpoints/draw-result.schema.json)另經JSON Schema檢查器驗證。正式0至6包裝格式、CSV匯入與主程式尚未完成，不能把此測試記為主程式全流程驗收。

## v1歷史實測與檢查

round 33382601的seed經BLS驗證後交給兩邊，150筆及全部trace一致，前10筆為：

```text
122, 9, 69, 130, 10, 101, 145, 88, 48, 131
```

另完整實測latest取得round 33383668，TS／Go的150筆順序及全部trace一致。

公開預期向量見[抽取結果](../../../examples/chacha-draw-33382601.json)。v1當時測試包含已知ChaCha20向量、可重現性、1～150唯一完整、穩定移除及拒絕取樣邊界。現行測試使用v2契約，不以此舊向量驗收新算法。

Go測試：

```sh
cd tools/verify-draw/go
go test ./...
```

實作：[TS抽取核心](../../../tools/verify-draw/ts/main.mts)、[Go抽取工具](../../../tools/verify-draw/go/main.go)、[Shell串接與比對入口](../../../tools/verify-draw.sh)。

官方參考：[Noble ChaCha實作](https://github.com/paulmillr/noble-ciphers)、[Go ChaCha20](https://pkg.go.dev/golang.org/x/crypto/chacha20)。
