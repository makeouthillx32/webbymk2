#!/bin/sh
# Keeps the runOnReady hook workers from piling up.
#
# WHY THIS EXISTS. MediaMTX re-fires runOnReady on every publisher reconnect
# and does not reliably stop the previous worker. Each worker now pins the
# readyTime it started with and stands down when a newer session takes over
# (see on-preview-ready.sh), which stops NEW accumulation — but it cannot help
# with workers already running older code, and it depends on the control API
# answering. Four times since launch the count has climbed until MediaMTX was
# burning 400-750% CPU and the admin console stopped responding, each time
# cleared by hand mid-incident.
#
# So this runs continuously and reaps on a one-minute cadence instead. Small,
# boring, and constant beats a rescue: by the time a human notices, the show is
# already degraded.
#
# Supervised by MediaMTX via the _hook_janitor path, exactly like
# archive-transcode.sh — cheapest reliable supervisor available without adding
# another container.

set -u

INTERVAL="${TANK_HOOK_JANITOR_INTERVAL_SECONDS:-60}"
MTX_API="${MTX_API_URL:-http://127.0.0.1:9997}"
# Below this, do nothing at all. A handful of overlapping workers during a
# reconnect is normal and self-corrects; reaping them would fight the system
# rather than help it.
# Six cameras plus the OBS preview run ~14 legitimate workers, so this only
# engages once there are clearly duplicates, not during normal churn.
FLOOR="${TANK_HOOK_JANITOR_FLOOR:-18}"

log() { echo "[hook-janitor] $*"; }

# A worker's path lives only in its environment — `ps` shows just the script
# name, so every worker for every camera looks identical from the outside.
path_of() {
  tr '\0' '\n' < "/proc/$1/environ" 2>/dev/null | sed -n 's/^MTX_PATH=//p' | head -n 1
}

# Field 22 of /proc/<pid>/stat is starttime in clock ticks since boot. Higher
# is newer. Used instead of PID order because PIDs wrap and would eventually
# make the janitor kill the newest worker instead of the oldest.
starttime_of() {
  awk '{ print $22 }' "/proc/$1/stat" 2>/dev/null
}

path_is_ready() {
  encoded=$(printf '%s' "$1" | sed 's#/#%2F#g')
  body=$(curl -s -S --max-time 5 "${MTX_API}/v3/paths/get/${encoded}" 2>/dev/null) || return 0
  [ -n "$body" ] || return 0
  case "$body" in
    *'"ready":true'*) return 0 ;;
    *) return 1 ;;
  esac
}

sweep() {
  total=$(ps -eo args 2>/dev/null | grep -cE 'on-(preview|loop)-ready\.sh')
  [ "$total" -le "$FLOOR" ] && return 0

  log "sweeping — ${total} hook workers alive (floor ${FLOOR})"

  # pid<TAB>script<TAB>path<TAB>starttime, one per worker.
  inventory=""
  for pid in $(ps -eo pid,args 2>/dev/null \
                 | grep -E 'on-(preview|loop)-ready\.sh' \
                 | grep -v grep \
                 | awk '{ print $1 }'); do
    [ -d "/proc/$pid" ] || continue
    script=$(tr '\0' '\n' < "/proc/$pid/cmdline" 2>/dev/null | sed -n '2p')
    [ -n "$script" ] || continue
    mpath=$(path_of "$pid")
    [ -n "$mpath" ] || mpath="(unknown)"
    stime=$(starttime_of "$pid")
    [ -n "$stime" ] || continue
    inventory="${inventory}${pid}	${script}	${mpath}	${stime}
"
  done

  [ -n "$inventory" ] || return 0

  killed=0
  termed=""
  # One group per (script, path): keep the newest worker, retire the rest.
  for group in $(printf '%s' "$inventory" | awk -F'\t' '{ print $2 "|" $3 }' | sort -u); do
    gscript=${group%%|*}
    gpath=${group#*|}

    newest_pid=""
    newest_time=-1
    group_pids=""
    while IFS='	' read -r pid script mpath stime; do
      [ -n "$pid" ] || continue
      [ "$script" = "$gscript" ] && [ "$mpath" = "$gpath" ] || continue
      group_pids="$group_pids $pid"
      if [ "$stime" -gt "$newest_time" ] 2>/dev/null; then
        newest_time=$stime
        newest_pid=$pid
      fi
    done <<EOF
$inventory
EOF

    # A path that is no longer ready keeps nothing; otherwise the newest
    # worker is the live one and survives.
    keep="$newest_pid"
    if [ "$gpath" != "(unknown)" ] && ! path_is_ready "$gpath"; then
      keep=""
    fi

    for pid in $group_pids; do
      [ "$pid" = "$keep" ] && continue
      if kill -TERM "$pid" 2>/dev/null; then
        killed=$((killed + 1))
        termed="$termed $pid"
      fi
    done
  done

  if [ "$killed" -gt 0 ]; then
    # SIGTERM runs each worker's EXIT trap, which releases its encode slot and
    # removes its temp files — worth waiting for.
    #
    # But a trap does NOT interrupt a running command in POSIX sh: a worker
    # sitting in `sleep 60` only handles the signal once that sleep returns.
    # Without the escalation below the first sweep appeared to do nothing
    # ("retired 11 — 25 remain") while the workers quietly kept climbing.
    sleep 8
    forced=0
    for pid in $termed; do
      if [ -d "/proc/$pid" ]; then
        kill -KILL "$pid" 2>/dev/null && forced=$((forced + 1))
      fi
    done
    sleep 2
    remaining=$(ps -eo args 2>/dev/null | grep -cE 'on-(preview|loop)-ready\.sh')
    log "retired ${killed} duplicate workers (${forced} needed SIGKILL) — ${remaining} remain"
  fi

  # Layer 3: Kill hook workers older than 30 minutes (timeout guard)
  old_count=0
  for old_worker in $(ps -eo pid,etime,args 2>/dev/null | grep -E 'on-(preview|loop)-ready\.sh' | grep -v grep | awk '$2 ~ /([0-9]+:){2,}/ || $2 ~ /^[3-5][0-9]:/ {print $1}'); do
    if kill -TERM "$old_worker" 2>/dev/null; then
      old_count=$((old_count + 1))
    fi
  done
  [ "$old_count" -gt 0 ] && log "reaped ${old_count} workers older than 30 minutes"
}

log "started — sweeping every ${INTERVAL}s above ${FLOOR} workers"
while :; do
  sweep || log "sweep failed, continuing"
  sleep "$INTERVAL"
done
