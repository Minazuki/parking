#!/usr/bin/env bash
# 本機預覽build-query輸出的靜態網站，使用loopback HTTP及Chrome。
# 用法：./script/preview-query.sh --site tmp/r1
# 不開Chrome：./script/preview-query.sh --site tmp/r1 --no-browser
# 需要python3；Ctrl+C關閉。文件：doc/tools/preview-query/tool.md
set -euo pipefail
if [[ $# -eq 0 || ${1:-} == --help || ${1:-} == -h ]]; then
  cat <<'HELP'
用法：./script/preview-query.sh --site 查詢網站目錄 [--no-browser]
例：./script/preview-query.sh --site tmp/r1
使用Python 3啟動127.0.0.1的臨時HTTP埠並開啟Google Chrome。
僅預覽，不啟動抽選後端、不修改資料、不對外發布；Ctrl+C關閉。
HELP
  exit 0
fi
command -v python3 >/dev/null || { echo '需要python3' >&2; exit 1; }
exec python3 - "$@" <<'PY'
import argparse
import http.server
from pathlib import Path
import subprocess
import sys
from urllib.parse import unquote, urlsplit
parser = argparse.ArgumentParser()
parser.add_argument('--site', required=True)
parser.add_argument('--no-browser', action='store_true')
args = parser.parse_args()
root = Path(args.site).resolve()
if not (root / 'index.html').is_file() or not (root / 'assets').is_dir() or not list(root.glob('query-data-*.json')):
    parser.error('--site必須是build-query產生的網站目錄')
class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(root), **kw)
    def send_head(self):
        path = unquote(urlsplit(self.path).path)
        relative = path.lstrip('/') or 'index.html'
        target = (root / relative).resolve()
        if not target.is_relative_to(root) or not target.is_file() or any(p.startswith('.') for p in Path(relative).parts):
            self.send_error(404)
            return
        return super().send_head()
    def log_message(self, *a):
        pass
with http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler) as server:
    url = f'http://127.0.0.1:{server.server_port}/'
    print(f'Query preview: {url}', flush=True)
    print('按Ctrl+C停止預覽。', flush=True)
    if not args.no_browser and sys.platform == 'darwin':
        subprocess.run(['open', '-a', 'Google Chrome', url], check=False)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
PY
