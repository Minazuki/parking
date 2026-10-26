# Cloudflare Pages部署紀錄

## 115年度相容性預覽

2026-10-27已依使用者授權公開部署歷年真實戶號與配位查詢網站，供住戶測試手機／電腦與3D。只有靜態查詢網站上線，抽選後端與年度工作目錄仍在操作者本機。

| 項目 | 設定 |
| --- | --- |
| Pages專案 | parking115 |
| Production branch | main |
| 自訂網域 | parking115.ellight.monster |
| Pages備用網址 | https://parking115.pages.dev/ |
| 本次deployment | https://1401f503.parking115.pages.dev/ |
| 本機上傳包 | dist/parking-query-115-round2-v2026.1027.0138/ |
| 公開資料來源 | 本機testdata/previous-year/query-round2.json，JSON忽略Git |
| DNS | CNAME parking115指向parking115.pages.dev；proxied=true、TTL自動 |
| 工具 | cf管理專案／網域／DNS；Wrangler 4.153.0上傳靜態檔案 |

自訂網域的DNS驗證、HTTPS驗證及整體狀態均已確認active，正式子網域與Pages預設網址皆可使用；檢查狀態使用下方指令。本次未修改主網域、其他子網域、郵件或全域SSL設定。

## CLI與登入

本機cf與bun位於`~/.bun/bin`；目前版本的`cf pages deploy`不支援傳統Pages直接上傳，因此使用官方Wrangler，cf仍能管理Pages資源。可在目前shell補上路徑：

```sh
export PATH="$HOME/.bun/bin:$PATH"
cf pages list
cf pages domains get parking115.ellight.monster --project-name parking115
```

本次重用既有cf登入，在記憶體內提供部署程序所需授權；沒有將token、refresh token或登入設定複製進repo、網站或文件。若日後直接使用Wrangler但未登入，可另行執行官方登入流程：

```sh
bunx wrangler@4.153.0 login
```

## 更新同年度網站

先建置新目錄並預覽，確認後再部署到相同production branch：

```sh
./script/build-query.sh --query-data testdata/previous-year/query-round2.json
# 將下方路徑換成本次Query site輸出的版本目錄。
bunx wrangler@4.153.0 pages deploy dist/parking-query-115-round2-v2026.1027.0138 \
  --project-name parking115 --branch main --commit-dirty=true
```

不得將整個年度workspace當上傳來源。原始付款、seed證據、亂數串流及log不包含在查詢包。

## 116年度

使用者確認按年度分開網站：115歷年預覽使用parking115.ellight.monster；116抽選結果預計另建parking116專案及parking116.ellight.monster。同一年度第一輪與第二輪更新該年度相同Pages專案及main production，不覆寫另一年度網站。116專案與DNS目前尚未建立。

相關：[建置操作](tool.md)、[查詢與發布規格](../../design/resident-query.md)。

## 上線驗證

已確認Pages預設網址與parking115.ellight.monster均以有效TLS回傳HTTP 200。公開資料的SHA-256與本機上傳包一致；Chrome以真實戶號實測桌面、390px手機、候補36、立即就位、面板收合及WebGL，無JavaScript錯誤。

Cloudflare API最後確認：domain status、verification_data.status、validation_data.status均為active；憑證簽發者google。

## 2026-10-27第二次115預覽更新

已依使用者授權覆蓋同一專案與正式網址：上傳包`dist/parking-query-115-round2-v2026.1027.0149/`，deployment為https://77ee4a9d.parking115.pages.dev/。新增手機在重新播放／查看位置／查看候補位置後自動收合面板；車身改淺灰、選取近白，腳下使用帶深色描邊的青色光圈，以區別Amber車格。Chrome正式網址已驗證自動收合。

## 2026-10-27第三次115預覽更新

更新至`dist/parking-query-115-round2-v2026.1027.0157/`，deployment為https://ccf5a82e.parking115.pages.dev/。手機查詢成功後即收合面板；車身由淺灰改為藍#0072B2，加上白色條紋、保留深色輪胎及青色光圈，避免僅靠色相辨識。

## 2026-10-27第四次115預覽更新

更新至`dist/parking-query-115-round2-v2026.1027.0202/`，deployment為https://fc9ab37c.parking115.pages.dev/。一般車輛恢復淺灰；只有focus車輛使用藍色車身、白色條紋、聚光燈、可見光柱與白色呼吸光圈。查詢目標保持focus，即使收起對話框；抽選演出則僅點選車輛有特效，取消選取即移除。尊重減少動態效果設定。Chrome已驗證正式網址載入此包、手機查詢後自動收合，無JavaScript錯誤；本機查詢／抽選／點選瀏覽器測試10項通過。
