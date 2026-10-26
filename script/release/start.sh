#!/usr/bin/env bash
# 發布包啟動入口：程式與年度資料分離；執行不需要Go、Node或Vite。
# 用法：./start.sh --workspace "../停車位抽籤資料/116年度"
# 例：./start.sh --workspace "/path/to/116年度" --no-browser
# 版本：./start.sh version（或--version）；選項：./start.sh --help
# 預設只綁127.0.0.1，自選可用port並以Google Chrome開啟首頁。
# workspace相對呼叫位置解析，所有Cobra server選項原樣轉交。
# Ctrl+C等待已開始的核心操作完成。不要將年度資料放在發布目錄內。
set -euo pipefail
if [[ $# -eq 0 || ${1:-} == --help || ${1:-} == -h ]]; then
  cat <<'HELP'
用法：./start.sh --workspace 年度工作目錄 [--test-mode] [--no-browser] [--addr 127.0.0.1:埠號]
例：./start.sh --workspace "../停車位抽籤資料/116年度"
    ./start.sh --workspace "/path/to/116年度" --no-browser
    ./start.sh --workspace "/path/to/test-workspace" --test-mode
    ./start.sh version
預設自選本機埠號並開啟Google Chrome。Ctrl+C關閉；不需要Go或Node。
工作目錄相對呼叫位置；發布包與年度資料分開保存。
預設正式活動，不顯示模式標籤；--test-mode僅標示演練，仍會請求seed及存檔。
HELP
  exit 0
fi
package_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ ! -x "$package_dir/parking" ]]; then
  echo "找不到同目錄的parking執行檔：$package_dir/parking" >&2; exit 1
fi
if [[ $# -eq 1 && ( "$1" == version || "$1" == --version ) ]]; then
  exec "$package_dir/parking" version
fi
export GIN_MODE="${GIN_MODE:-release}"
exec "$package_dir/parking" server --addr 127.0.0.1:0 "$@"
