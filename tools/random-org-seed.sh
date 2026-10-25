#!/usr/bin/env bash
# 用途：保留RANDOM.ORG開發測試，非正式抽選來源。
# 前提：Node.js支援.mts（實測26），不需額外套件。
# 離線格式：./tools/random-org-seed.sh preview --output tmp/random-preview-001
# 取得seed：./tools/random-org-seed.sh generate --output tmp/random-live-001
# 重取紀錄：./tools/random-org-seed.sh get --receipt tmp/random-live-001/response.json --output tmp/random-get-001
# 驗證簽章：./tools/random-org-seed.sh verify --receipt tmp/random-live-001/response.json --output tmp/random-verify-001
# generate/get需RANDOM_ORG_API_KEY環境變數；請勿將key寫入script或Git。
# preview離線且不是真實憑據，其餘命令連線。--output必須是新目錄。
# 產物：request.json、status.json、response.json（preview為response.example.json）。
# generate僅保存簽章，需verify確認authenticity:true；preview不構成驗證成功。
# 失敗保留紀錄、不自動重試，以非零退出；文件：doc/tools/random-org-seed/tool.md。
set -euo pipefail
usage() {
  cat <<'HELP'
RANDOM.ORG開發測試工具；正式抽選採drand。本工具需要支援.mts的Node.js。
用法：
  ./tools/random-org-seed.sh preview --output tmp/random-preview-001
  ./tools/random-org-seed.sh generate --output tmp/random-live-001
  ./tools/random-org-seed.sh get --receipt tmp/random-live-001/response.json --output tmp/random-get-001
  ./tools/random-org-seed.sh get --serial 123 --output tmp/random-get-002
  ./tools/random-org-seed.sh verify --receipt tmp/random-live-001/response.json --output tmp/random-verify-001

generate可加--user-data path.json；generate/get從環境讀取RANDOM_ORG_API_KEY。
--receipt是保存的response.json；get使用--receipt或--serial擇一。
--output必須是尚不存在的新目錄，每次換名稱。
preview離線，response.example.json及簽章皆為假資料；其他命令需網路。
保存request.json、status.json、response.json；verify回傳authenticity:true才算驗證通過。
失敗退出非零並保留紀錄，不自動重試、不保存API key。
文件：doc/tools/random-org-seed/tool.md；樣板：doc/conventions/tool-layout.md。
HELP
}
if [[ $# -eq 0 || ${1:-} == --help ]]; then usage; exit 0; fi
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
command -v node >/dev/null
exec node "$repo_dir/tools/random-org-seed/ts/main.mts" "$@"
