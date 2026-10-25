#!/usr/bin/env bash
# 用途：清票與第二輪規則原型；draw使用SystemRandom，非正式drand抽選入口。
# 前提：Python 3，僅使用標準函式庫，不需安裝套件或連網。
# 從repository根目錄執行，以虛構範例準備清票結果：
#   ./tools/round-two.sh prepare --input examples/round-two-bicycle.json --output tmp/round-two-prepared-001.json
# 重用清票結果進行原型抽選：
#   ./tools/round-two.sh draw --input tmp/round-two-prepared-001.json --output tmp/round-two-result-001.json
# --input為JSON檔；prepare需確認review_confirmed及明確的paid布林。
# --output為新JSON檔（不是目錄），每次換名稱，不覆寫既有結果。
# 成功為退出碼0，結果status為ready、completed或skipped_*；無人／無位即跳過。
# 失敗退出非零並顯示錯誤，不自動重試。此工具不產生failure.json。
# 文件：doc/tools/round-two/tool.md；樣板：doc/conventions/tool-layout.md。
set -euo pipefail
usage() {
  cat <<'HELP'
清票與第二輪規則原型（非正式drand抽選入口）。需要Python 3標準函式庫，無需網路。
用法（從repository根目錄執行）：
  ./tools/round-two.sh prepare --input examples/round-two-bicycle.json --output tmp/round-two-prepared-001.json
  ./tools/round-two.sh draw --input tmp/round-two-prepared-001.json --output tmp/round-two-result-001.json

prepare：核對明確的paid狀態與review_confirmed，合併未繳釋出及未配位車位。
draw：讀取prepare產出，使用SystemRandom抽選；不能以seed重現，僅作規則原型。
--input：JSON檔案；第二輪意願與資格須由上游確認。
--output：尚不存在的新JSON檔，每次換名稱；工具會建立父目錄。
退出碼0表示完成，結果status為ready、completed或skipped_*（無人／無位跳過）。
失敗退出非零並顯示錯誤，不自動重試；既有結果不覆寫，不產生failure.json。
文件：doc/tools/round-two/tool.md；樣板：doc/conventions/tool-layout.md。
HELP
}
if [[ $# -eq 0 || ${1:-} == --help ]]; then usage; exit 0; fi
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
command -v python3 >/dev/null
exec python3 "$repo_dir/tools/round-two/py/main.py" "$@"
