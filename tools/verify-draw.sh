#!/usr/bin/env bash
# 從 repository 根目錄執行。需要 Node.js（支援直接執行 .mts）及 Go 1.26+。
# 首次先 npm ci；Go 首次執行需連網下載模組，之後可使用快取。
#
# 1. 取得最新 drand seed，驗證簽章，再分別執行 TS／Go 抽取 1～150：
#    ./tools/verify-draw.sh --output tmp/draw-shell-001
#
# 2. 重用已保存的 seed 證據，重新離線驗證，不向 drand 取得新 seed：
#    ./tools/verify-draw.sh \
#      --input tmp/chacha-cross-002/seed \
#      --output tmp/draw-shell-002
#    上述 input 是先前測試的 seed 目錄；若要重用步驟 1，改用：
#      --input tmp/draw-shell-001/seed
#
# --input 指向含 info.json、beacon.json 的 seed/，不是整個抽取結果目錄。
# --output 必須是尚不存在的新目錄，每次執行請換名稱，避免覆寫紀錄。
# 產物：seed/ 原始證據、ts.json、go.json、comparison.json。
# comparison.json 的 matches: true 表示完整抽取順序及逐筆 trace 一致。
# 失敗以非零狀態結束，保留現有產物與 failure.json，不自動換 seed 重抽。
# 更多用法：./tools/verify-draw.sh --help
# 工具樣板：doc/conventions/tool-layout.md；抽取規格：doc/tools/verify-draw/tool.md。
set -euo pipefail

usage() {
  cat <<'HELP'
用法：./tools/verify-draw.sh --output 新目錄 [--round 輪號 | --input 已保存的seed目錄]

取得最新 drand seed，再分別執行 TS／Go 並比對：
  ./tools/verify-draw.sh --output tmp/draw-shell-001

重用已保存的 seed 證據（離線重新驗證，不取得新 seed）：
  ./tools/verify-draw.sh \
    --input tmp/chacha-cross-002/seed \
    --output tmp/draw-shell-002
  若要重用第一個範例，--input 改為 tmp/draw-shell-001/seed。

指定歷史 round：
  ./tools/verify-draw.sh --round 33382601 --output tmp/draw-history-001

--input 需包含 info.json、beacon.json；不可與 --round 同時使用。
--output 必須不存在；每次執行請換新名稱。
結果：seed/、ts.json、go.json、comparison.json（matches: true 代表完全一致）。
需要 Node.js（支援 .mts）、Go 1.26+；首次先 npm ci，Go 模組首次需連網下載。
文件：doc/tools/verify-draw/tool.md；工具樣板：doc/conventions/tool-layout.md。
HELP
}
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
output=''
round=''
input=''
if [[ $# -eq 0 || ${1:-} == --help ]]; then usage; exit 0; fi
while [[ $# -gt 0 ]]; do
  if [[ $# -lt 2 || $2 == --* || -z $2 ]]; then usage >&2; exit 1; fi
  case "$1" in
    --output) [[ -z $output ]] || exit 1; output=$2 ;;
    --round) [[ -z $round ]] || exit 1; round=$2 ;;
    --input) [[ -z $input ]] || exit 1; input=$2 ;;
    *) usage >&2; exit 1 ;;
  esac
  shift 2
done
if [[ -z $output || ( -n $round && -n $input ) ]]; then usage >&2; exit 1; fi
command -v node >/dev/null
command -v go >/dev/null
mkdir -p -- "$(dirname -- "$output")"
# Exclusive directory creation happens before any request or worker invocation.
mkdir -- "$output"
output="$(cd -- "$output" && pwd)"
stage='seed'
on_error() {
  local code=$?
  trap - ERR
  node --input-type=module - "$output/failure.json" "$stage" "$code" <<'JS' || true
import { writeFileSync } from 'node:fs'
const [file, stage, exitCode] = process.argv.slice(2)
writeFileSync(file, JSON.stringify({ stage, exitCode: Number(exitCode) }, null, 2) + '\n', { flag: 'wx' })
JS
  exit "$code"
}
trap on_error ERR
if [[ -n $input ]]; then
  "$repo_dir/tools/drand-seed.sh" verify --input "$input" --output "$output/seed"
elif [[ -n $round ]]; then
  "$repo_dir/tools/drand-seed.sh" fetch --round "$round" --output "$output/seed"
else
  "$repo_dir/tools/drand-seed.sh" fetch --output "$output/seed"
fi
seed="$(node --input-type=module - "$output/seed/receipt.json" <<'JS'
import { readFileSync } from 'node:fs'
const receipt = JSON.parse(readFileSync(process.argv[2], 'utf8'))
if (receipt.signatureVerified !== true || !/^[0-9a-f]{64}$/.test(receipt.seed)) throw new Error('Invalid verified seed receipt')
console.log(receipt.seed)
JS
)"
stage='typescript'
node "$repo_dir/tools/verify-draw/ts/main.mts" --seed "$seed" --output "$output/ts.json"
stage='go'
# Subshell keeps the caller's working directory unchanged.
(cd -- "$repo_dir/tools/verify-draw/go" && go run . --seed "$seed" --output "$output/go.json")
stage='compare'
node --input-type=module - "$output" <<'JS'
import { readFileSync, writeFileSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import { join } from 'node:path'
const directory = process.argv[2]
const read = name => JSON.parse(readFileSync(join(directory, name), 'utf8'))
const receipt = read('seed/receipt.json'), ts = read('ts.json'), go = read('go.json')
const matches = isDeepStrictEqual(ts, go)
const summary = { state: matches ? 'verified' : 'mismatch', round: receipt.round, seed: receipt.seed, algorithm: ts.algorithm, count: ts.order.length, wordsConsumed: ts.trace.length, matches, order: ts.order }
writeFileSync(join(directory, 'comparison.json'), JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ directory, ...summary }, null, 2))
if (!matches) throw new Error('TS and Go results differ; inspect ts.json and go.json')
JS
