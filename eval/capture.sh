#!/bin/zsh
# Capture one day's raw v1 menus for every hall and period into eval/menus/<date>.json.
#
# Runs in a real (headless) browser because the v1 API only answers browsers
# (spec §2.2). Run it by hand from your own machine; never from a server or cron.
# Usage: eval/capture.sh [YYYY-MM-DD]   (default: today in America/Chicago)
set -euo pipefail
cd "$(dirname "$0")/.."

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
PORT="${PORT:-5199}"
DATE="${1:-$(TZ=America/Chicago date +%Y-%m-%d)}"
OUT="eval/menus/$DATE.json"
[[ -x "$CHROME" ]] || { echo "Chrome not found at $CHROME (set CHROME=...)" >&2; exit 1; }

npx vite --port "$PORT" --strictPort > /dev/null 2>&1 &
VITE_PID=$!
trap 'kill $VITE_PID 2>/dev/null' EXIT
for _ in {1..40}; do curl -sf -o /dev/null "http://localhost:$PORT/uchicagomacros/" && break; sleep 0.5; done

# Headless Chrome's default user agent says "HeadlessChrome" and gets blocked;
# present as the installed desktop Chrome instead.
MAJOR=$("$CHROME" --version | grep -oE '[0-9]+' | head -1)
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/$MAJOR.0.0.0 Safari/537.36"
DUMP=$(mktemp)
"$CHROME" --headless=new --disable-gpu --user-agent="$UA" --virtual-time-budget=60000 \
  --dump-dom "http://localhost:$PORT/uchicagomacros/eval/capture.html?date=$DATE" 2>/dev/null > "$DUMP"

mkdir -p eval/menus
node - "$DUMP" "$OUT" <<'JS'
const fs = require("node:fs");
const [dump, out] = process.argv.slice(2);
const html = fs.readFileSync(dump, "utf8");
const m = html.match(/<pre id="out" data-done="(\w+)">([\s\S]*?)<\/pre>/);
if (!m) { console.error("capture page did not finish (no data-done marker)"); process.exit(1); }
const text = m[2].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
if (m[1] !== "ok") { console.error(`capture failed: ${text}`); process.exit(1); }
const data = JSON.parse(text);
if (!Array.isArray(data.responses) || data.responses.length === 0) { console.error("capture returned no responses"); process.exit(1); }
fs.writeFileSync(out, JSON.stringify(data) + "\n");
console.log(`wrote ${out}: ${data.responses.length} responses for ${data.date}`);
JS
rm -f "$DUMP"
