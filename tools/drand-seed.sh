#!/usr/bin/env bash
# 用途：取得quicknet v2 seed並驗證BLS，或離線重驗已保存的原始證據。
# 前提：Node.js支援.mts（實測26），從repository根目錄先 npm ci。
# 取得新seed：./tools/drand-seed.sh fetch --output tmp/drand-new-001
# 重用證據：./tools/drand-seed.sh verify --input tmp/drand-new-001 --output tmp/drand-check-001
# --input需含info.json、beacon.json；--output必須不存在，每次換新名稱。
# fetch需網路、無API key；verify不連網。失敗保留狀態，不自動重試。
# 產物：info.json、beacon.json、request.json、status.json、receipt.json。
# 成功：status為verified，receipt的signatureVerified為true；失敗退出非零。
# round預定時間不等於本機請求時間。文件：doc/tools/drand-seed/tool.md。
set -euo pipefail
usage() {
  cat <<'HELP'
用法（先 npm ci，需要支援.mts的Node.js）：
  ./tools/drand-seed.sh fetch --output tmp/drand-new-001
  ./tools/drand-seed.sh fetch --round 33382601 --output tmp/drand-history-001
  ./tools/drand-seed.sh verify --input tmp/drand-new-001 --output tmp/drand-check-001

fetch使用quicknet v2 API，無需API key；verify離線重驗info.json與beacon.json。
--output必須是新目錄；--input不可與fetch使用，--round不可與verify使用。
產物：info.json、beacon.json、request.json、status.json、receipt.json。
成功時status為verified、signatureVerified為true；失敗以非零退出並保留紀錄。
不自動重試。round預定時間與本機請求時間分開保存。
文件：doc/tools/drand-seed/tool.md；樣板：doc/conventions/tool-layout.md。
HELP
}
if [[ $# -eq 0 || ${1:-} == --help ]]; then usage; exit 0; fi
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
command -v node >/dev/null
exec node "$repo_dir/tools/drand-seed/ts/main.mts" "$@"
