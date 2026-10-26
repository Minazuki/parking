#!/usr/bin/env bash
# 用途：用同一seed與有序池，分別執行TS／Go v2雙抽，驗證可重現。
# 前提：Node.js支援.mts、Go 1.26+；首次npm ci，Go首次下載模組需網路。
# 最新seed（預設虛構第一輪池）：
#   ./tools/verify-draw.sh --output tmp/verify-v2-live-001
# 指定池與歷史round：
#   ./tools/verify-draw.sh --round 33382601 --pools examples/verify-draw/round-two.json --output tmp/verify-v2-001
# 重用seed證據並比對已保存結果：
#   ./tools/verify-draw.sh --input tmp/verify-v2-001/seed --pools tmp/verify-v2-001/pools.json --expected tmp/verify-v2-001/ts.json --output tmp/verify-v2-replay-001
# 存檔驗證：./tools/verify-draw.sh --workspace examples/workspace --draw-round 2 --output tmp/verify-workspace-001
# --workspace唯讀驗證現存0至6斷點，按輪次自動讀池、seed及結果，不向drand請求。
# --input為含info.json／beacon.json的seed目錄；--pools為已排序的JSON輸入。
# --expected可用相同格式的2/state.json或6/state.json；未定案的其他schema須先轉換。
# --output必須不存在。產物：pools.json、seed/、ts.json、go.json、comparison.json；指定expected時另存expected.json。
# matches:true表示串流bytes及全部結果完全一致；失敗退出非零並保留failure.json。
# 所有池跳過仍取seed；--input重新驗證既有證據且不向drand請求。
# 文件：doc/tools/verify-draw/tool.md；規範：doc/conventions/tool-layout.md。
set -euo pipefail
usage() {
  cat <<'HELP'
用法：./tools/verify-draw.sh --output 新目錄 [--pools 有序池JSON] [--round 輪號 | --input seed目錄] [--expected 已保存結果JSON]
存檔：./tools/verify-draw.sh --workspace 年度目錄 --draw-round 1或2 --output 工作目錄外的新目錄

最新seed與預設虛構第一輪池：
  ./tools/verify-draw.sh --output tmp/verify-v2-live-001
指定歷史round與第二輪池：
  ./tools/verify-draw.sh --round 33382601 --pools examples/verify-draw/round-two.json --output tmp/verify-v2-001
重用seed並比對已保存結果：
  ./tools/verify-draw.sh --input tmp/verify-v2-001/seed \
    --pools tmp/verify-v2-001/pools.json --expected tmp/verify-v2-001/ts.json \
    --output tmp/verify-v2-replay-001

從正式存檔核對第二輪（範例為虛構年度資料）：
  ./tools/verify-draw.sh --workspace examples/workspace --draw-round 2 --output tmp/verify-workspace-001

--workspace與--draw-round需成對使用，不可混用input、round、pools或expected。
此模式唯讀、不連線，要求目標2/或6/已存在，輸出必須在原工作目錄外。
--input需含info.json、beacon.json，不可與--round同時使用。
--pools是已準備且有序的JSON，不在抽選時排序或補候補；省略時使用examples/verify-draw/round-one.json。
--expected依v2結果契約比對串流與全部結果，不符合即失敗；僅比TS／Go時可省略。
--output必須不存在，每次換名稱。所有路徑相對於呼叫時工作目錄。
輸出pools.json、seed/、ts.json、go.json、comparison.json，指定expected則保存expected.json。
成功matches:true，失敗退出非零並保留failure.json，不自動取新seed重抽。
需Node.js支援.mts、Go 1.26+，首次npm ci；無--input時需連網取得seed。
文件：doc/tools/verify-draw/tool.md；規範：doc/conventions/tool-layout.md。
HELP
}
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
output=''; round=''; input=''; pools=''; expected=''; workspace=''; draw_round=''
if [[ $# -eq 0 || ${1:-} == --help ]]; then usage; exit 0; fi
while [[ $# -gt 0 ]]; do
  if [[ $# -lt 2 || $2 == --* || -z $2 ]]; then usage >&2; exit 1; fi
  case "$1" in
    --workspace) [[ -z $workspace ]] || exit 1; workspace=$2 ;;
    --draw-round) [[ -z $draw_round ]] || exit 1; draw_round=$2 ;;
    --output) [[ -z $output ]] || exit 1; output=$2 ;;
    --round) [[ -z $round ]] || exit 1; round=$2 ;;
    --input) [[ -z $input ]] || exit 1; input=$2 ;;
    --pools) [[ -z $pools ]] || exit 1; pools=$2 ;;
    --expected) [[ -z $expected ]] || exit 1; expected=$2 ;;
    *) usage >&2; exit 1 ;;
  esac
  shift 2
done
if [[ -z $output || ( -n $round && -n $input ) ]]; then usage >&2; exit 1; fi
if [[ -n $workspace ]]; then
  if [[ ( $draw_round != 1 && $draw_round != 2 ) || -n $pools || -n $input || -n $round || -n $expected ]]; then usage >&2; exit 1; fi
  node --input-type=module - "$workspace" "$output" <<'JS'
import { realpathSync, existsSync } from 'node:fs'
import { resolve, dirname, basename, join, relative, isAbsolute } from 'node:path'
const root = realpathSync(process.argv[2])
let ancestor = resolve(process.argv[3]); const tail = []
while (!existsSync(ancestor)) { tail.unshift(basename(ancestor)); ancestor = dirname(ancestor) }
const destination = join(realpathSync(ancestor), ...tail)
const rel = relative(root, destination)
if (rel === '' || (!rel.startsWith('..' + '/') && rel !== '..' && !isAbsolute(rel))) throw new Error('Verification output must be outside the source workspace')
JS
elif [[ -n $draw_round ]]; then usage >&2; exit 1
fi
if [[ -z $pools ]]; then pools="$repo_dir/examples/verify-draw/round-one.json"; fi
command -v node >/dev/null
command -v go >/dev/null
mkdir -p -- "$(dirname -- "$output")"
mkdir -- "$output"
output="$(cd -- "$output" && pwd)"
stage='input'
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
if [[ -n $workspace ]]; then
  stage='workspace'
  node "$repo_dir/tools/verify-draw/ts/workspace.mts" --workspace "$workspace" --draw-round "$draw_round" --output "$output"
  expected="$output/expected.json"
else
node --input-type=module - "$pools" "$expected" "$output" <<'JS'
import { copyFileSync, constants } from 'node:fs'
import { join } from 'node:path'
const [pools, expected, output] = process.argv.slice(2)
copyFileSync(pools, join(output, 'pools.json'), constants.COPYFILE_EXCL)
if (expected) copyFileSync(expected, join(output, 'expected.json'), constants.COPYFILE_EXCL)
JS
node "$repo_dir/tools/verify-draw/ts/main.mts" --check --pools "$output/pools.json"
stage='seed'
if [[ -n $input ]]; then
  "$repo_dir/tools/drand-seed.sh" verify --input "$input" --output "$output/seed"
elif [[ -n $round ]]; then
  "$repo_dir/tools/drand-seed.sh" fetch --round "$round" --output "$output/seed"
else
  "$repo_dir/tools/drand-seed.sh" fetch --output "$output/seed"
fi
fi
seed="$(node --input-type=module - "$output/seed/receipt.json" <<'JS'
import { readFileSync } from 'node:fs'
const receipt = JSON.parse(readFileSync(process.argv[2], 'utf8'))
if (receipt.signatureVerified !== true || !/^[0-9a-f]{64}$/.test(receipt.seed)) throw new Error('Invalid verified seed receipt')
console.log(receipt.seed)
JS
)"
stage='typescript'
node "$repo_dir/tools/verify-draw/ts/main.mts" --seed "$seed" --pools "$output/pools.json" --output "$output/ts.json"
stage='go'
(cd -- "$repo_dir/tools/verify-draw/go" && go run . --seed "$seed" --pools "$output/pools.json" --output "$output/go.json")
stage='compare'
node --input-type=module - "$output" "$expected" "$workspace" <<'JS'
import { readFileSync, writeFileSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import { join } from 'node:path'
const [directory, expectedPath, workspace] = process.argv.slice(2)
const read = name => JSON.parse(readFileSync(join(directory, name), 'utf8'))
const receipt = read('seed/receipt.json'), ts = read('ts.json'), go = read('go.json')
const implementationsMatch = isDeepStrictEqual(ts, go)
const expected = expectedPath ? read('expected.json') : null
const expectedMatches = expectedPath ? isDeepStrictEqual(ts, expected) && isDeepStrictEqual(go, expected) : null
const matches = implementationsMatch && expectedMatches !== false
const summary = { state: matches ? 'verified' : 'mismatch', workspace: workspace || null, round: receipt.round, algorithm: ts.algorithm, bytesConsumed: ts.streamHex.length / 2, implementationsMatch, expectedMatches, matches }
writeFileSync(join(directory, 'comparison.json'), JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ directory, ...summary }, null, 2))
if (!matches) throw new Error('Stream or result mismatch; inspect ts.json, go.json and expected.json if provided')
JS
