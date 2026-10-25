# verify-draw 測試紀錄

操作入口與工具定位見[工具說明](tool.md)。

## 實測與檢查

round 33382601的seed經BLS驗證後交給兩邊，150筆及全部trace一致，前10筆為：

```text
122, 9, 69, 130, 10, 101, 145, 88, 48, 131
```

另完整實測latest取得round 33383668，TS／Go的150筆順序及全部trace一致。

公開預期向量見[抽取結果](../../../examples/chacha-draw-33382601.json)。`npm test`檢查已知ChaCha20向量、可重現性、1～150唯一完整、池子穩定移除、拒絕取樣邊界及Go實測向量。

Go測試：

```sh
cd tools/verify-draw/go
go test ./...
```

實作：[TS抽取核心](../../../tools/verify-draw/ts/main.mts)、[Go抽取工具](../../../tools/verify-draw/go/main.go)、[Shell串接與比對入口](../../../tools/verify-draw.sh)。

官方參考：[Noble ChaCha實作](https://github.com/paulmillr/noble-ciphers)、[Go ChaCha20](https://pkg.go.dev/golang.org/x/crypto/chacha20)。
