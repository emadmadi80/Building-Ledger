#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail

APP_NAME="Building Ledger"
BASE_DIR="${HOME}/building-ledger"
RELEASES_DIR="${BASE_DIR}/releases"
CURRENT_LINK="${BASE_DIR}/current"
PID_FILE="${BASE_DIR}/server.pid"
MARKER_FILE="${BASE_DIR}/installed-package"
PORT="${PORT:-3000}"
export PORT
DOWNLOADS_DIR="${HOME}/storage/downloads"
ZIP_PATTERN='Building-Ledger-Standalone-*.zip'

red='\033[0;31m'; green='\033[0;32m'; yellow='\033[1;33m'; cyan='\033[0;36m'; reset='\033[0m'

say() { printf '%b\n' "$*"; }
ok() { say "${green}✓${reset} $*"; }
warn() { say "${yellow}⚠${reset} $*"; }
fail() { say "${red}✗${reset} $*"; exit 1; }
pause() { printf '\nاضغط Enter للمتابعة...'; read -r; }

check_termux() {
  case "${PREFIX:-}" in
    *com.termux*) ;;
    *) warn "يبدو أن السكربت لا يعمل داخل Termux. يمكن المتابعة، لكن التشغيل الرسمي هو Termux." ;;
  esac
}

ensure_storage() {
  if [[ ! -d "$DOWNLOADS_DIR" ]]; then
    warn "لم يظهر مجلد تخزين الهاتف. سيتم طلب الصلاحية الآن."
    command -v termux-setup-storage >/dev/null 2>&1 && termux-setup-storage || true
    sleep 2
  fi
  [[ -d "$DOWNLOADS_DIR" ]] || fail "لم أجد $DOWNLOADS_DIR. نفّذ termux-setup-storage ثم أعد المحاولة."
}

ensure_deps() {
  command -v pkg >/dev/null 2>&1 || return 0
  local missing=()
  command -v node >/dev/null 2>&1 || missing+=(nodejs)
  command -v unzip >/dev/null 2>&1 || missing+=(unzip)
  command -v sha256sum >/dev/null 2>&1 || missing+=(coreutils)
  if ((${#missing[@]})); then
    say "سيتم تثبيت الأدوات المطلوبة: ${missing[*]}"
    pkg update -y
    pkg install -y "${missing[@]}"
  fi
}

find_latest_zip() {
  ensure_storage
  local zips
  mapfile -t zips < <(find "$DOWNLOADS_DIR" -maxdepth 1 -type f -name "$ZIP_PATTERN" -printf '%T@\t%p\n' 2>/dev/null | sort -nr | cut -f2-)
  ((${#zips[@]})) || return 1
  printf '%s\n' "${zips[0]}"
}

version_from_zip() {
  local name
  name=$(basename "$1" .zip)
  printf '%s\n' "${name#Building-Ledger-Standalone-}"
}

verify_release() {
  local dir="$1"
  for required in server.js public/index.html public/ledger.js public/styles.css; do
    [[ -f "$dir/$required" ]] || return 1
  done
  if [[ -f "$dir/CHECKSUMS.sha256" ]]; then
    (cd "$dir" && sha256sum -c CHECKSUMS.sha256 >/dev/null)
  fi
}

stop_server() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid=$(cat "$PID_FILE" 2>/dev/null || true)
    if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      for _ in {1..10}; do kill -0 "$pid" 2>/dev/null || break; sleep .2; done
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
  fi
}

install_zip() {
  local zip="$1"
  [[ -f "$zip" ]] || fail "الملف غير موجود: $zip"
  local version release tmp
  version=$(version_from_zip "$zip")
  release="$RELEASES_DIR/$version"
  tmp="${RELEASES_DIR}/.extract-${version}-$$"
  mkdir -p "$RELEASES_DIR"
  if [[ -d "$release" ]]; then
    ok "الإصدار $version مثبت مسبقًا."
    ln -sfn "$release" "$CURRENT_LINK"
    printf '%s\n' "$(basename "$zip")" > "$MARKER_FILE"
    return 0
  fi
  rm -rf "$tmp"
  mkdir -p "$tmp"
  say "فك الحزمة: $(basename "$zip")"
  unzip -q "$zip" -d "$tmp"
  local root="$tmp" nested=''
  nested=$(find "$tmp" -mindepth 1 -maxdepth 1 -type d -name 'Building-Ledger-*' | head -n1 || true)
  if [[ -n "$nested" && -d "$nested/public" ]]; then root="$nested"; fi
  verify_release "$root" || { rm -rf "$tmp"; fail "الحزمة ناقصة أو تالفة: ملفات التطبيق الأساسية غير موجودة."; }
  mv "$root" "$release"
  [[ "$root" == "$tmp" ]] && rmdir "$tmp" 2>/dev/null || rm -rf "$tmp"
  ln -sfn "$release" "$CURRENT_LINK"
  printf '%s\n' "$(basename "$zip")" > "$MARKER_FILE"
  ok "تم تثبيت الإصدار $version"
}

install_latest() {
  local zip
  zip=$(find_latest_zip) || { warn "ضع ملف Building-Ledger-Standalone-*.zip داخل Downloads أولًا."; return 1; }
  say "الحزمة الأحدث: $(basename "$zip")"
  install_zip "$zip"
}

start_server() {
  [[ -L "$CURRENT_LINK" || -d "$CURRENT_LINK" ]] || { warn "لم يتم تثبيت أي إصدار بعد."; install_latest || return 1; }
  stop_server
  (cd "$CURRENT_LINK" && nohup node server.js > "$BASE_DIR/server.log" 2>&1 & echo $! > "$PID_FILE")
  sleep 1
  local pid; pid=$(cat "$PID_FILE")
  if kill -0 "$pid" 2>/dev/null; then
    ok "الخادم يعمل على http://127.0.0.1:${PORT}"
    say "اترك Termux مفتوحًا أثناء استخدام التطبيق."
  else
    warn "تعذر تشغيل الخادم. راجع: $BASE_DIR/server.log"
    return 1
  fi
}

status_server() {
  if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    ok "الخادم يعمل: http://127.0.0.1:${PORT}"
    say "الإصدار الحالي: $(basename "$(readlink -f "$CURRENT_LINK" 2>/dev/null || printf 'غير مثبت')")"
  else
    warn "الخادم متوقف."
  fi
}

watch_updates() {
  ensure_storage
  say "وضع المراقبة يعمل. سيبحث كل 60 ثانية عن ZIP أحدث في Downloads."
  say "للإيقاف اضغط CTRL+C. التحديث التلقائي هنا يعني تثبيت ZIP جديد موجود على الهاتف؛ لا يتم تنزيل ملف من الإنترنت تلقائيًا."
  local last=''
  [[ -f "$MARKER_FILE" ]] && last=$(cat "$MARKER_FILE")
  while true; do
    local zip='' current=''
    zip=$(find_latest_zip 2>/dev/null || true)
    if [[ -n "$zip" ]]; then
      current=$(basename "$zip")
      if [[ "$current" != "$last" ]]; then
        say "تم العثور على حزمة جديدة: $current"
        install_zip "$zip"
        start_server
        last="$current"
      fi
    fi
    sleep 60
  done
}

menu() {
  while true; do
    clear 2>/dev/null || true
    say "${cyan}=== $APP_NAME — Termux ===${reset}"
    say "1) تثبيت أو تحديث من أحدث ZIP في Downloads"
    say "2) تشغيل الخادم المحلي"
    say "3) إيقاف الخادم"
    say "4) عرض حالة الخادم والإصدار"
    say "5) مراقبة التحديثات تلقائيًا"
    say "6) فتح مجلد التطبيق في الطرفية"
    say "0) خروج"
    printf '\nاختر رقمًا: '
    read -r choice
    case "$choice" in
      1) ensure_deps; install_latest; pause ;;
      2) ensure_deps; start_server; pause ;;
      3) stop_server; ok "تم إيقاف الخادم."; pause ;;
      4) status_server; pause ;;
      5) watch_updates ;;
      6) mkdir -p "$BASE_DIR"; cd "$BASE_DIR"; ok "المجلد الحالي: $BASE_DIR"; exec "${SHELL:-bash}" ;;
      0) stop_server; exit 0 ;;
      *) warn "اختيار غير صحيح."; sleep 1 ;;
    esac
  done
}

check_termux
mkdir -p "$BASE_DIR" "$RELEASES_DIR"
menu
