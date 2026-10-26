# 虛構行政CSV輸入範例

inputs內四份CSV只含999／997系列的五戶虛構資料，與[年度存檔範例](../workspace/README.md)的登記及繳費值一致，不是社區名冊。A／B表故意使用舊式樓層格式及右側名額區，匯入後正規化戶號，警示區不作抽選依據。

將inputs整個複製到獨立測試年度目錄後啟動程式，不直接指定本目錄當工作目錄：

```sh
mkdir -p tmp/csv-demo
cp -R examples/imports/inputs tmp/csv-demo/
./server/run.sh server --workspace tmp/csv-demo --no-browser
```

另一個terminal確認匯入（不取得seed、不抽選）：

```sh
curl --fail --request POST http://127.0.0.1:8080/api/v1/csv-imports/registration
curl --fail http://127.0.0.1:8080/api/v1/stages/0
```

這會建立tmp/csv-demo/checkpoints/0與操作log，不會因繳費CSV已存在就提前讀取它。第一輪抽選完成、斷點在2/時才可POST /api/v1/csv-imports/payments匯入繳費；完整匯入與兩輪的自動測試使用固定公開seed證據，不會連網執行正式抽選。

CSV在Git中使用LF；程式也接受Google下載的CRLF與UTF-8 BOM，測試會另外構造這些格式。付款source摘要依實際讀入的原始bytes計算，與年度JSON範例中的全零示意摘要不同。

格式與欄位見[CSV匯入契約](../../doc/design/csv-import.md)。這些範例未涵蓋社區完整名冊核對，不作正式年度檔案使用。
