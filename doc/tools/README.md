# 工具文件索引

每個工具對應`doc/tools/<tool-name>/tool.md`，與`tools/<tool-name>.sh`及實作目錄同名。工具操作、規格與相關測試紀錄集中在該工具資料夾。

| 工具 | 用途 | 相關文件 |
| --- | --- | --- |
| [drand-seed](drand-seed/tool.md) | quicknet v2 seed取得、BLS驗證與離線重驗 | [測試紀錄](drand-seed/testing.md) |
| [random-org-seed](random-org-seed/tool.md) | RANDOM.ORG開發測試，非正式來源 | [測試紀錄](random-org-seed/testing.md) |
| [verify-draw](verify-draw/tool.md) | 同seed的TS／Go ChaCha20抽取交叉驗證 | [測試紀錄](verify-draw/testing.md)、[v2資料契約](verify-draw/v2-contract.md) |
| [round-two](round-two/tool.md) | 清票與第二輪規則原型，非正式抽選入口 | 測試指令收錄於工具說明 |

新增工具必須同時新增對應`tool.md`，補入本索引，並讓shell檔頭與help指向該文件。文件內容與完成檢查依[工具入口與目錄樣板](../conventions/tool-layout.md)。

## 本機網站建置

- [build-query](build-query/tool.md)：從驗證過的年度存檔離線輸出第一輪或兩輪住戶查詢網站，入口位於script/build-query.sh。

- [preview-query](preview-query/tool.md)：以loopback HTTP及Chrome開啟查詢網站，不直接使用file URL。
