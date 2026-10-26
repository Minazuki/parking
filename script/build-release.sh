#!/usr/bin/env bash
# 完整發布包建置入口：Vue資源內嵌Go，發布時不需Node／Go／Vite。
# 用法：./script/build-release.sh [--output-dir dist]
# 例：./script/build-release.sh --output-dir "tmp/release test"
# 輸出：<output-dir>/parking-release-vYYYY.MMDD.HHmm/（臺灣建置時間）
# 包含parking、start.sh、README.md、LICENSE及manifest.json；不含年度資料。
# 須先npm ci；建置需要Node、Go 1.26+及Git，首次下載依賴需網路。
# 已存在的版本目錄拒絕覆寫。同一repo同時僅能進行一次完整發布建置。
# 版本／help：發布包的./start.sh version或./start.sh --help。
# 文件：doc/architecture/local-launch.md
set -euo pipefail
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
output_dir="$repo_dir/dist"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)
      cat <<'HELP'
用法：./script/build-release.sh [--output-dir 發布目錄的父目錄]
例：./script/build-release.sh --output-dir "tmp/release test"
先npm ci；需Node、Go 1.26+及Git。發布後執行不需這些建置工具。
預設產生dist/parking-release-vYYYY.MMDD.HHmm（臺灣時間），拒絕覆寫既有版本。
執行：./parking-release-v版本/start.sh --workspace 年度工作目錄
文件：doc/architecture/local-launch.md
HELP
      exit 0 ;;
    --output-dir)
      if [[ $# -lt 2 || -z "$2" || "$2" == -* ]]; then echo '--output-dir需要路徑' >&2; exit 2; fi
      output_dir="$2"; shift 2 ;;
    *) echo "未知參數：$1" >&2; exit 2 ;;
  esac
done
for dependency in node npm go git; do
  if ! command -v "$dependency" >/dev/null 2>&1; then echo "缺少建置工具：$dependency" >&2; exit 1; fi
done
if [[ ! -d "$repo_dir/node_modules" ]]; then echo '請先在repository根目錄執行npm ci' >&2; exit 1; fi
build_epoch="${PARKING_BUILD_EPOCH:-$(date +%s)}"
if [[ ! "$build_epoch" =~ ^[0-9]+$ ]]; then echo "PARKING_BUILD_EPOCH必須是epoch秒數" >&2; exit 2; fi
if date -u -r "$build_epoch" +%Y >/dev/null 2>&1; then
  version="$(TZ=Asia/Taipei date -r "$build_epoch" +%Y.%m%d.%H%M)"
else
  version="$(TZ=Asia/Taipei date -d "@$build_epoch" +%Y.%m%d.%H%M)"
fi
mkdir -p -- "$output_dir"
output_dir="$(cd -- "$output_dir" && pwd)"
target="$output_dir/parking-release-v$version"
if [[ -e "$target" || -L "$target" ]]; then echo "拒絕覆寫既有版本：$target" >&2; exit 1; fi
webui_dir="$repo_dir/server/src/internal/webui"
lock="$webui_dir/.build-lock"
if ! mkdir -- "$lock" 2>/dev/null; then echo "已有發布建置或未清理的建置鎖：$lock" >&2; exit 1; fi
printf '%s\n' "$$" > "$lock/pid"
staging=''
cleanup() {
  if [[ -n "$staging" && -d "$staging" ]]; then rm -rf -- "$staging"; fi
  rm -f -- "$lock/pid"; rmdir -- "$lock"
}
trap cleanup EXIT
staging="$(mktemp -d "$output_dir/.parking-release-building.XXXXXX")"
npm --prefix "$repo_dir" run build --workspace @parking/client -- --outDir "$webui_dir/dist" --emptyOutDir
if [[ ! -f "$webui_dir/dist/index.html" ]]; then echo '前端缺少index.html，停止建置' >&2; exit 1; fi
PARKING_BUILD_EPOCH="$build_epoch" "$repo_dir/script/build-server.sh" --with-frontend --output "$staging/parking"
cp -- "$repo_dir/script/release/start.sh" "$staging/start.sh"
cp -- "$repo_dir/script/release/README.md" "$staging/README.md"
cp -- "$repo_dir/LICENSE" "$staging/LICENSE"
chmod +x "$staging/start.sh"
node --input-type=module - "$staging" "$version" <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
const [directory, expected] = process.argv.slice(2)
const fields = Object.fromEntries(execFileSync(join(directory, 'parking'), ['version'], { encoding: 'utf8' }).trim().split('\n').map(line => {
  const colon = line.indexOf(':'); return [line.slice(0, colon), line.slice(colon + 1).trim()]
}))
if (fields.version !== expected) throw new Error('Release directory and executable versions differ')
const files = Object.fromEntries(['parking', 'start.sh', 'README.md', 'LICENSE'].map(name => [name, createHash('sha256').update(readFileSync(join(directory, name))).digest('hex')]))
writeFileSync(join(directory, 'manifest.json'), JSON.stringify({ schemaVersion: 1, version: fields.version, gitHash: fields.githash, buildTime: fields.buildtime, os: fields.OS, arch: fields.ARCH, frontendEmbedded: true, files }, null, 2) + '\n')
NODE
if [[ -e "$target" || -L "$target" ]]; then echo "拒絕覆寫既有版本：$target" >&2; exit 1; fi
mv -- "$staging" "$target"
staging=''
printf 'Release package: %s\n' "$target"
