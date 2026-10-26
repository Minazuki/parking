# 測試資料

default／waitlist為150戶虛構CSV；複製各組的`input/*.csv`至獨立workspace的`inputs/`，不直接在來源目錄啟動。previous-year為本機真實歷年結果的查詢專用JSON，忽略Git，使用方式不同。

| 資料組 | 情境 |
| --- | --- |
| [default](default/README.md) | 接近現場規模，兩輪三類均有抽選，未製造超額候補 |
| [waitlist](waitlist/README.md) | 第二輪機車、大腳踏車、小腳踏車各10戶候補 |
| [previous-year](previous-year/README.md) | 本機歷年真實戶號與結果，供靜態查詢相容性測試；JSON不提交Git |
