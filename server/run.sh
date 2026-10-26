#!/usr/bin/env bash
# Go debug開發入口；使用Cobra子指令，不需要Node。
# 版本：./server/run.sh version（或--version）；預設dev／none／none。
# 啟動：./server/run.sh server --workspace tmp/server-demo --no-browser
# Vite：./server/run.sh server --workspace tmp/server-demo --dev-origin http://localhost:5173 --no-browser
# 詳細CLI help：./server/run.sh server --help
# Go 1.26+；首次下載模組需連網。workspace相對呼叫位置；不要指定examples/workspace。
# Ctrl+C正常關閉；回退前先停程式，保留logs。
# Release執行檔建置：./server/build-release.sh --output bin/parking
# 文件：doc/architecture/cli.md、doc/architecture/backend.md；Vue與完整發布包尚待完成。
set -euo pipefail
if [[ $# -eq 0 || ${1:-} == --help || ${1:-} == -h ]]; then
  cat <<'HELP'
用法：./server/run.sh <指令> [選項]
  version                         顯示version、githash、buildtime、OS、ARCH
  --version                       同version
  server --workspace 年度目錄     啟動本機Gin與Chrome
  server --help                   顯示服務參數
例：./server/run.sh server --workspace tmp/server-demo --no-browser
Debug metadata預設dev／none／none；Go 1.26+，執行後端不需要Node。
工作目錄相對呼叫位置；不要直接指定examples/workspace。
Release：./server/build-release.sh --output bin/parking
文件：doc/architecture/cli.md
HELP
  exit 0
fi
server_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
build_dir="$(mktemp -d "${TMPDIR:-/tmp}/parking-server.XXXXXX")"
cleanup() { rm -f -- "$build_dir/parking"; rmdir -- "$build_dir"; }
trap cleanup EXIT
(cd -- "$server_dir" && go build -o "$build_dir/parking" ./src)
"$build_dir/parking" "$@"
