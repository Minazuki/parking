# ChaCha20 TS／Go可重現驗證工具

[Shell入口](../../../tools/verify-draw.sh)／[可供前端共用的TS核心](../../../tools/verify-draw/ts/core.mts)／[TS worker](../../../tools/verify-draw/ts/main.mts)／[Go獨立實作](../../../tools/verify-draw/go/main.go)。

狀態：已實作`parking-draw-chacha20-v2`。支援有序多池、雙抽、直接mod、各類第二輪候補、skipped、實際消耗串流保存與既有結果比對。尚未建立主程式、正式0至6存檔讀取器或CSV正規化；這是獨立算法驗證工具，不操作正式社區活動。

## 驗證目的

固定seed、有序輸入、算法版本／參數與mod消耗順序，TS及Go必須產生完全相同的消耗串流、實際配位、候補、未配位戶及剩餘車位。不是大量分布統計測試。drand簽章驗證由[seed工具](../drand-seed/tool.md)負責，Go worker只接收已驗證seed，不另作第二份BLS驗證。

結果不複製seed、整份輸入或來源摘要；工具測試包分開保存`pools.json`及`seed/`，重算時再讀取。具體欄位與邊界見[v2資料契約](v2-contract.md)。

## 執行

需要支援直接執行`.mts`的Node.js（實測26.12.1）及Go 1.26以上（實測1.27.3），首次`npm ci`。Go首次執行需下載已鎖定模組，其後可用快取。無參數或`--help`僅顯示使用說明。

從repository根目錄，取得最新seed並使用預設虛構第一輪池：

```sh
./tools/verify-draw.sh --output tmp/verify-v2-live-002
```

固定公開round及第二輪候補情境：

```sh
./tools/verify-draw.sh --round 33382601 \
  --pools examples/verify-draw/round-two.json \
  --output tmp/verify-v2-second-002
```

重用上述證據與輸入，重新計算並比對既有結果：

```sh
./tools/verify-draw.sh --input tmp/verify-v2-second-002/seed \
  --pools tmp/verify-v2-second-002/pools.json \
  --expected tmp/verify-v2-second-002/ts.json \
  --output tmp/verify-v2-replay-002
```

| 參數 | 意義 |
| --- | --- |
| `--output` | 必填，必須為尚不存在的新目錄 |
| `--pools` | 有序池JSON；省略使用examples/verify-draw/round-one.json |
| `--round` | 固定drand round，與input互斥；兩者皆無則取得latest |
| `--input` | 含info.json與beacon.json的seed證據目錄；離線重驗，不取得新seed |
| `--expected` | 選填，依本v2結果契約保存的既有結果，用於重算比對 |

所有使用者提供的相對路徑相對於呼叫時工作目錄。工具先保存並驗證有序輸入，再取得seed；不在抽選時排序或補候補。所有池皆skipped也照常取得或驗證seed。第一輪池順序為A機車、B機車、大腳踏車、小腳踏車；第二輪為合併機車、大腳踏車、小腳踏車。

## 輸出與成功判定

| 輸出 | 內容 |
| --- | --- |
| `pools.json` | 本次使用的原始有序池輸入副本 |
| `seed/` | drand原始證據與驗證收據 |
| `ts.json`、`go.json` | 各自獨立計算的算法參數、streamHex及整輪結果，無seed副本或逐步trace |
| `expected.json` | 指定expected時保存的待比對結果 |
| `comparison.json` | 算法、round、消耗bytes及完整比對結果 |
| `failure.json` | 失敗階段與退出碼；worker或比較錯誤亦輸出至stderr |

`implementationsMatch: true`表示兩邊結果JSON語意完全一致，包含streamHex；指定expected時，`expectedMatches`必須同樣為true，總體`matches`才為true。未指定expected時該欄為null，只表示TS／Go交叉比對，不宣稱核對過主程式結果。

若未來主程式的2/state.json、6/state.json使用相同契約，可直接傳給expected；正式0/state.json、4/state.json的包裝schema仍待定義，須從其中抽取對應有序pools作為輸入，不能目前就把整份state直接當作本工具輸入。算法版本或schema不同時不自動轉換。

串流或結果有任一差異即非零退出，保留比較紀錄；輸出目錄、worker輸出檔拒絕覆寫。不自動重試、換seed或重抽。不能把重新計算驗證當作正式活動重抽。

## 算法與維護

TS使用`@noble/ciphers@2.4.0`，Go使用`golang.org/x/crypto@v0.58.0/chacha20`。核心以RFC 8439 ChaCha20連續串流雙抽，先車位／候補，再戶號；各池剩一項直接取出、不讀亂數，換池不重設。只記錄真正讀取的原始bytes，不保留未使用的區塊尾端。

輸入候補數、順位、類型、重複與池順序均檢查；戶號的社區分棟／排序及無障礙實體配置等屬上游正式準備邏輯，本工具不代替。無可抽內容保存skipped及reason，全候補池仍屬有效抽取。

舊v1採拒絕取樣、單池抽出順序及最後一格消耗亂數，與v2不同。其公開向量與歷史實測保留作歷史資料，不混用或覆寫。測試與目前實測見[測試紀錄](testing.md)。
