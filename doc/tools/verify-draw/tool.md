# ChaCha20 TS／Go抽取驗證

[Shell入口](../../../tools/verify-draw.sh)／[TS實作](../../../tools/verify-draw/ts/main.mts)／[Go實作](../../../tools/verify-draw/go/main.go)。

狀態：2026-10-26使用者要求建立1～150逐次抽出、不放回的交叉驗證程式。這是獨立測試，不執行社區配位，尚未串接前端或正式抽選核心。

入口改為Bash script，依序啟動seed工具、獨立TS worker及Go worker，最後以Node內建JSON比較確認一致。原`verify-draw.mts`已移除，統一使用shell入口。

## 執行

需要可直接執行`.mts`的Node.js（實測v26.12.1）與Go 1.26以上（實測1.27.3）。首次執行`npm ci`；Go首次執行會下載固定版本模組，之後可使用本機快取。

從repository根目錄取得最新drand seed，依序跑TS、Go及逐筆比對：

```sh
./tools/verify-draw.sh --output tmp/draw-check-001
```

指定公開歷史round，方便重現：

```sh
./tools/verify-draw.sh --round 33382601 --output tmp/draw-check-002
```

重用已保存的原始seed證據（重新離線驗證BLS，不重新請求seed）：

```sh
./tools/verify-draw.sh --input tmp/draw-check-002/seed --output tmp/draw-check-003
```

輸出資料夾必須不存在，避免覆寫；任何階段失敗保留檔案及`failure.json`，以非零狀態結束。比對不一致也以失敗結束，不重抽seed。

| 輸出 | 內容 |
| --- | --- |
| `seed/` | drand鏈資訊、原始回應及驗證收據，見[seed工具](../drand-seed/tool.md) |
| `ts.json` | Noble ChaCha20的完整抽取順序與逐筆trace |
| `go.json` | Go獨立實作的完整抽取順序與逐筆trace |
| `comparison.json` | 深度比對結果、seed、round及完整順序 |

`matches: true`表示兩份JSON的算法參數、150筆順序及全部trace均相同，不只是最後順序相同。Go工具只接收seed並計算，不自行驗證drand；來源驗證由前一步完成，不能把交叉比對誤稱為兩份獨立BLS驗證。

## 固定規格 parking-draw-chacha20-v1

- TS：`@noble/ciphers@2.4.0`的`chacha20`；Go：`golang.org/x/crypto@v0.58.0/chacha20`，各自鎖定相依版本。
- RFC 8439 IETF ChaCha20（20 rounds），不是Go的ChaCha8或XChaCha20。
- key為drand seed的32個原始bytes，不能使用64字元hex的UTF-8內容。
- nonce為12個零bytes，初始block counter為0。將零資料與串流XOR取得亂數；連續讀取，不在每次抽取時重設。
- 每4 bytes依大端序解讀為uint32；初始池依序為`[1,2,...,150]`。
- 設目前池大小為n，`limit = floor(2^32 / n) * n`。亂數小於limit才接受，索引為`random % n`；否則消耗該亂數，再取下一個。
- 抽出索引的號碼，刪除該元素並維持其餘元素順序，直到抽完。n=1仍消耗一個亂數。
- trace紀錄從0開始的word編號、poolSize、random、limit、accepted、index及selected；拒絕的值也記錄，index=-1、selected=0。

固定零nonce用於這項公開、確定性的抽取規格，不用於私密資料加密。正式各段如何識別或分隔串流另依抽選規格確認。

## 測試與相關文件

測試方式、公開向量及實測紀錄見[測試紀錄](testing.md)。
