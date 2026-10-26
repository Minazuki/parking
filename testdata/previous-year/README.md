# 115年度歷年結果查詢預覽（本機真實資料）

用途：先將歷年結果上傳Cloudflare Pages，供住戶測試手機／電腦、查詢、3D與鏡頭操作的相容性；正式抽選仍只在操作者電腦執行。

來源為操作者提供的`tmp/第一二輪機車腳踏車抽選結果.xlsx`，只讀取第一／二輪結果分頁；不修改原Excel。戶號保留真實值，移除樓層前導零與F。JSON含真實歷年戶號與配位，僅放本機且已忽略Git；原Excel、錄影連結與附註均不複製進repo。

| 檔案 | 查詢範圍 |
| --- | --- |
| query-round1.json | 第一輪實際抽中結果 |
| query-round2.json | 第一輪保留結果、已釋出歷史與第二輪車位／候補 |

設定activityYear為115、testMode為true，網站顯示115年度及社區公告優先提示；依使用者後續要求移除演練標籤，資料testMode仍保留。這是查詢專用資料，不是0至6抽選存檔，不填造seed或簽章，也不能拿來驗證當年的抽籤算法。

## 內容核對

- Excel中共出現144個不同戶號；沒有出現的住戶不憑空補入。
- 第一輪：機車143筆、大腳踏車35筆、小腳踏車13筆。
- 第二輪：機車12筆、機車候補36筆、大腳踏車5筆；Excel沒有第二輪小腳踏車結果分頁，因此不新增此類結果。
- `(無)`列不是住戶，只用來辨識空位或第二輪可用池，不列為戶號。
- 第二輪池中的實際車位，若第一輪曾抽給住戶，第一輪紀錄改標「已釋出」。依此可辨識機車2筆、大腳踏車5筆，共7筆。包含第二輪仍未抽出的車位，避免誤保留第一輪已釋出的配置。
- 這是依Excel結果與第二輪池推定的保留／釋出關係，不代表已取得付款明細；無法由檔案辨識的行政異動不另行捏造。

## 建置與預覽

```sh
./script/build-query.sh --query-data testdata/previous-year/query-round1.json \
  --output tmp/previous-year-first

./script/build-query.sh --query-data testdata/previous-year/query-round2.json \
  --output tmp/previous-year-query

./script/preview-query.sh --site tmp/previous-year-query
```

輸出目錄必須尚不存在。省略`--output`會使用dist年度／輪次／時間版本目錄。資料已準備於本機，其他checkout不會自帶這兩份JSON。

`--query-data`只接受testMode=true的最小公開JSON，驗證戶號、車種類型、車位編號、有效車位唯一性、候補順位及欄位白名單；不讀取seed，不假裝完成drand簽章驗證。正式116年度仍以`--workspace`讀完整存檔輸出。

上傳命令與網域設定見[Pages發布規格](../../doc/design/resident-query.md)。115歷年預覽已依使用者授權部署至parking115 Pages，詳見[部署紀錄](../../doc/tools/build-query/deployment.md)。
