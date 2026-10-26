# 虛構年度存檔範例

此目錄僅用於schema、恢復與可重現測試，mode為test，不是社區正式活動。

戶號999、997系列完全虛構，只示範五戶登記；車位容量沿用規則，因此有大量第一輪剩餘車位。正式匯入仍需完整社區主檔驗證，不能拿此範例當名冊。

兩輪為了固定測試，刻意重用同一公開round 33382601的真實簽章及seed；按鈕／請求／匯入時間為合成欄位，不是實際活動的第三方請求收據。付款來源檔名為虛構檔、sha256為全零佔位，不代表真實CSV。原始info.json及beacon.json可離線驗證BLS。

程式只讀此目錄，驗證輸出請寫到外部tmp目錄：

```sh
./tools/verify-draw.sh --workspace examples/workspace --draw-round 1 --output tmp/workspace-first-001
./tools/verify-draw.sh --workspace examples/workspace --draw-round 2 --output tmp/workspace-second-001
```

各階段欄位及限制見[存檔Schema](../../doc/design/checkpoint-schema.md)。候補與全跳過的小池情境仍由[verify-draw範例](../../doc/tools/verify-draw/v2-contract.md)覆蓋。
