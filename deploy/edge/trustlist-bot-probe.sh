#!/usr/bin/env bash
# ============================================================
# Identify what is hammering trustlist.uk
# ------------------------------------------------------------
# Caddy is not logging access by default, so this:
#   1. temporarily adds a JSON access log to the trustlist.uk site block
#      (written to /data, which is a persisted volume in edge-caddy),
#   2. restarts Caddy to apply (reload silently no-ops on this box),
#   3. captures CAPTURE_SECS of traffic,
#   4. aggregates top User-Agents, top client IPs, top URIs, and the
#      share of requests hitting the combinatorial comma-facet trap.
#
# Run on the VPS:  bash /opt/rutba-erp/deploy/edge/trustlist-bot-probe.sh
# ============================================================
set -euo pipefail
cd /opt/rutba-erp
CAPTURE_SECS="${1:-150}"
LOG=/data/trustlist-access.log
CF=deploy/edge/Caddyfile

echo "== backup Caddyfile =="
cp "$CF" "/tmp/Caddyfile.pre-botprobe.$(date +%s 2>/dev/null || echo bak)"

if ! grep -q "trustlist-access.log" "$CF"; then
  echo "== injecting temporary access log into trustlist.uk block =="
  perl -0pi -e 's/(trustlist\.uk \{\n\tencode zstd gzip\n)/$1\tlog {\n\t\toutput file \/data\/trustlist-access.log { roll_size 100mb roll_keep 2 }\n\t\tformat json\n\t}\n/' "$CF"
fi
docker exec edge-caddy caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1 && echo "  config valid"

echo "== truncate old log + restart caddy to apply =="
docker exec edge-caddy sh -c ": > $LOG" 2>/dev/null || true
docker restart edge-caddy >/dev/null
sleep 4

echo "== capturing ${CAPTURE_SECS}s of trustlist.uk traffic... =="
sleep "$CAPTURE_SECS"

echo "== pulling log =="
docker exec edge-caddy sh -c "cat $LOG" > /tmp/tl-access.json
TOTAL=$(wc -l < /tmp/tl-access.json)
echo "  captured $TOTAL requests in ${CAPTURE_SECS}s  (~$(( TOTAL * 60 / (CAPTURE_SECS>0?CAPTURE_SECS:1) ))/min)"

# crude JSON field extraction (no jq on host); fields are stable in Caddy's json format
ip()  { grep -oE '"client_ip":"[^"]*"|"remote_ip":"[^"]*"' | sed -E 's/.*:"//;s/"//'; }
ua()  { grep -oE '"User-Agent":\["[^"]*"' | sed -E 's/.*\["//;s/"$//'; }
uri() { grep -oE '"uri":"[^"]*"' | sed -E 's/"uri":"//;s/"//'; }

echo; echo "===== TOP 15 USER-AGENTS ====="
cat /tmp/tl-access.json | ua | sort | uniq -c | sort -rn | head -15
echo; echo "===== TOP 15 CLIENT IPs ====="
cat /tmp/tl-access.json | ip | sort | uniq -c | sort -rn | head -15
echo; echo "===== TOP 20 URIs ====="
cat /tmp/tl-access.json | uri | sort | uniq -c | sort -rn | head -20
echo; echo "===== combinatorial comma-facet hits (the Strapi-killer pattern) ====="
echo -n "  requests whose URI is a multi-term facet (comma/%2C): "
cat /tmp/tl-access.json | uri | grep -ciE '%2c|,' || true

echo
echo "To revert the temporary log: restore the backup in /tmp/Caddyfile.pre-botprobe.* and 'docker restart edge-caddy'."
