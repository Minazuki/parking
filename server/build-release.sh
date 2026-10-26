#!/usr/bin/env bash
# Go後端release建置入口；完整的內嵌前端發布包尚待完成。
# 用法：./server/build-release.sh [--output bin/parking]
# 預設輸出：repo/bin/parking-vYYYY.MMDD.HHmm（臺灣時間）；已存在則拒絕覆寫。
# 範例：./server/build-release.sh --output tmp/parking-release-test
# 查版本：./tmp/parking-release-test version
# 注入version、githash（工作樹異動加-dirty）、UTC buildtime；OS／ARCH由Go編譯目標提供。
# 依賴：Go 1.26+、Git、BSD/GNU date；首次建置需下載Go modules。
# Wire產物已在來源中；變更providers後先go -C server generate ./src/internal/app。
# --output相對呼叫位置；不建立年度工作目錄、不啟動服務或Chrome。
# 文件：doc/architecture/cli.md
set -euo pipefail
output=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)
      cat <<'HELP'
用法：./server/build-release.sh [--output 執行檔路徑]
例：./server/build-release.sh --output tmp/parking-release-test
    ./tmp/parking-release-test version
預設輸出repo/bin/parking-vYYYY.MMDD.HHmm，版本採臺灣建置時間。
注入version、githash、UTC buildtime；OS／ARCH為Go編譯目標。
拒絕覆寫既有檔案；此腳本只建置後端，完整前端發布包尚待完成。
文件：doc/architecture/cli.md
HELP
      exit 0 ;;
    --output)
      if [[ $# -lt 2 || -z "$2" || "$2" == -* ]]; then
        echo '--output需要執行檔路徑' >&2; exit 2
      fi
      output="$2"; shift 2 ;;
    *) echo "未知參數：$1" >&2; exit 2 ;;
  esac
done
server_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd -- "$server_dir/.." && pwd)"
build_epoch="$(date +%s)"
if date -u -r "$build_epoch" +%Y >/dev/null 2>&1; then
  version="$(TZ=Asia/Taipei date -r "$build_epoch" +%Y.%m%d.%H%M)"
  build_time="$(date -u -r "$build_epoch" +%Y-%m-%dT%H:%M:%SZ)"
else
  version="$(TZ=Asia/Taipei date -d "@$build_epoch" +%Y.%m%d.%H%M)"
  build_time="$(date -u -d "@$build_epoch" +%Y-%m-%dT%H:%M:%SZ)"
fi
git_hash="$(git -C "$repo_dir" rev-parse --verify HEAD)"
if [[ -n "$(git -C "$repo_dir" status --porcelain --untracked-files=normal)" ]]; then
  git_hash="$git_hash-dirty"
fi
output="${output:-$repo_dir/bin/parking-v$version}"
case "$output" in /*) ;; *) output="$PWD/$output" ;; esac
if [[ -e "$output" || -L "$output" ]]; then
  echo "拒絕覆寫既有路徑：$output" >&2; exit 1
fi
mkdir -p -- "$(dirname -- "$output")"
metadata_package='github.com/Minazuki/parking/server/src/internal/buildinfo'
ldflags="-X $metadata_package.Version=$version -X $metadata_package.GitHash=$git_hash -X $metadata_package.BuildTime=$build_time"
(cd -- "$server_dir" && go build -trimpath -ldflags "$ldflags" -o "$output" ./src)
printf 'Built: %s\n' "$output"
