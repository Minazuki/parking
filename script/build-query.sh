#!/usr/bin/env bash
# 從年度存檔離線建置獨立住戶查詢網站；不啟動server、不取得seed、不上傳。
# 用法（repo根目錄）：./script/build-query.sh --workspace ~/testwork-waitlist
# 指定第一輪：./script/build-query.sh --workspace ~/testwork-waitlist --round 1
# 指定輸出：./script/build-query.sh --workspace ~/testwork-waitlist --round 2 --output tmp/query-demo
# 需事先npm ci及備妥本機Go dependencies；建置使用本機依賴，不自動下載。
# 使用說明：doc/design/resident-query.md；--help查看參數。
set -euo pipefail
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
workspace=''; query_data=''; output=''; round='auto'
usage() {
  cat <<'HELP'
用法：./script/build-query.sh (--workspace 年度存檔目錄 | --query-data 查詢演練JSON) [--round auto|1|2] [--output 新目錄]
例：./script/build-query.sh --workspace ~/testwork-waitlist
    ./script/build-query.sh --workspace ~/testwork-waitlist --round 1 --output tmp/query-first
    ./script/build-query.sh --query-data testdata/previous-year/query-round2.json
預設auto：完整到6輸出兩輪版，否則需完整到2才能輸出第一輪。
預設輸出dist/parking-query-<年度>-round<輪次>-vYYYY.MMDD.HHmm/。
相對路徑以呼叫位置為準；既有輸出拒絕覆寫；不寫入來源存檔。
需預先安裝npm依賴及Go module cache；不連網取得seed或上傳Pages。
建置成功後可用HTTP靜態伺服器預覽，再另外以Wrangler CLI上傳。
HELP
}
while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --workspace|--query-data|--output|--round)
      if [[ $# -lt 2 || "$2" == --* ]]; then echo "缺少參數：$1" >&2; exit 2; fi
      case "$1" in --workspace) workspace="$2" ;; --query-data) query_data="$2" ;; --output) output="$2" ;; --round) round="$2" ;; esac
      shift 2 ;;
    *) echo "未知參數：$1" >&2; usage >&2; exit 2 ;;
  esac
done
if [[ ( -n "$workspace" && -n "$query_data" ) || ( -z "$workspace" && -z "$query_data" ) ]]; then echo '--workspace與--query-data請擇一提供' >&2; exit 2; fi
if [[ -n "$workspace" && ! -d "$workspace" ]]; then echo '需要存在的--workspace目錄' >&2; exit 2; fi
if [[ -n "$query_data" && ! -f "$query_data" ]]; then echo '需要存在的--query-data檔案' >&2; exit 2; fi
case "$round" in auto|1|2) ;; *) echo '--round僅接受auto、1、2' >&2; exit 2 ;; esac
for dependency in go node npm; do command -v "$dependency" >/dev/null || { echo "缺少$dependency" >&2; exit 1; }; done
if [[ ! -x "$repo_dir/node_modules/.bin/vite" ]]; then echo '請先在repo執行npm ci' >&2; exit 1; fi
if [[ -n "$workspace" ]]; then
  workspace="$(cd -- "$workspace" && pwd -P)"
else
  query_data="$(cd -- "$(dirname -- "$query_data")" && pwd -P)/$(basename -- "$query_data")"
fi
if [[ -n "$output" && ( -e "$output" || -L "$output" ) ]]; then echo "拒絕覆寫既有輸出：$output" >&2; exit 1; fi
staging="$(mktemp -d "${TMPDIR:-/tmp}/parking-query.XXXXXX")"
trap 'rm -rf -- "$staging"' EXIT
mkdir "$staging/public"
if [[ -n "$workspace" ]]; then
  GOPROXY=off GOSUMDB=off GOTOOLCHAIN=local go -C "$repo_dir/server" run ./src export-query --workspace "$workspace" --round "$round" --output "$staging/public/query-data.json"
else
  GOPROXY=off GOSUMDB=off GOTOOLCHAIN=local go -C "$repo_dir/server" run ./src export-query --query-data "$query_data" --round "$round" --output "$staging/public/query-data.json"
fi
published_round="$(node -p "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')).throughRound" "$staging/public/query-data.json")"
data_file="$(node --input-type=module - "$staging/public/query-data.json" <<'NODE'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
console.log(`query-data-${createHash('sha256').update(readFileSync(process.argv[2])).digest('hex')}.json`)
NODE
)"
if [[ -z "$output" ]]; then
  metadata="$(node --input-type=module - "$staging/public/query-data.json" <<'NODE'
import {readFileSync} from 'node:fs'
const data=JSON.parse(readFileSync(process.argv[2],'utf8'))
const p=Object.fromEntries(new Intl.DateTimeFormat('en',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(v=>[v.type,v.value]))
console.log(`${data.activityYear}-round${data.throughRound}-v${p.year}.${p.month}${p.day}.${p.hour}${p.minute}`)
NODE
)"
  output="$repo_dir/dist/parking-query-$metadata"
fi
if [[ -e "$output" || -L "$output" ]]; then echo "拒絕覆寫既有輸出：$output" >&2; exit 1; fi
mv "$staging/public/query-data.json" "$staging/public/$data_file"
cat > "$staging/public/_headers" <<'HEADERS'
/
  Cache-Control: no-cache
/index.html
  Cache-Control: no-cache
/assets/*
  Cache-Control: public, max-age=31536000, immutable
/query-data-*.json
  Cache-Control: public, max-age=31536000, immutable
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
HEADERS
PARKING_QUERY_PUBLIC_DIR="$staging/public" VITE_QUERY_DATA_FILE="$data_file" npm --prefix "$repo_dir" run build:query --workspace @parking/client -- --outDir "$staging/site" --emptyOutDir
# Publish the complete directory only after build success; mkdir reserves the
# destination without replacing an existing directory or following a symlink.
parent="$(dirname -- "$output")"
mkdir -p -- "$parent"
if ! mkdir -- "$output"; then echo "無法建立新輸出：$output" >&2; exit 1; fi
cp -R "$staging/site/." "$output/"
printf 'Query site: %s\n' "$(cd -- "$output" && pwd)"
printf 'Round: %s\n' "$published_round"
printf 'Preview: ./script/preview-query.sh --site %q\n' "$(cd -- "$output" && pwd)"
