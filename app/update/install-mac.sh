#!/bin/bash
# Private helper copied outside the app before the old app exits.
set -eu
work=$1
target=$2
old_pid=$3
token=$4
result=$5
exec >> "$work/install.log" 2>&1
touch "$work/helper-ready"
for ((i=0; i<120; i++)); do
  if ! kill -0 "$old_pid" 2>/dev/null; then break; fi
  sleep 1
done
if kill -0 "$old_pid" 2>/dev/null; then
  printf '%s' '旧版尚未退出，更新未安装。' > "$result"
  exit 1
fi
backup="$work/previous.app"
new_pid=''
installed=0
rollback() {
  trap - ERR
  if [ -n "$new_pid" ]; then kill "$new_pid" 2>/dev/null || true; wait "$new_pid" 2>/dev/null || true; fi
  if [ "$installed" = 1 ] && [ -e "$target" ]; then mv "$target" "$work/failed.app" || true; fi
  if [ -e "$backup" ]; then
    if [ ! -e "$target" ]; then mv "$backup" "$target" || true; fi
  fi
  printf '%s' '更新未完成，已尝试恢复旧版。更新文件保留在应用旁的 .lanyue-update 目录中。' > "$result"
  /usr/bin/open "$target" || true
  exit 1
}
trap rollback ERR
mv "$target" "$backup"
mv "$work/stage/LanYue.app" "$target"
installed=1
"$target/Contents/MacOS/LanYue" "--lanyue-update=$token" &
new_pid=$!
for ((i=0; i<90; i++)); do
  if [ -f "$work/ack" ]; then
    trap - ERR
    rm -rf -- "$work"
    exit 0
  fi
  if ! kill -0 "$new_pid" 2>/dev/null; then break; fi
  sleep 1
done
rollback
