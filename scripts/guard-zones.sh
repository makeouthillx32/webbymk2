#!/bin/sh
# Fails if any zone file references an identifier that does not exist.
#
# Deliberately narrow: it reports ONLY TS2304 (cannot find name) and TS2552
# (cannot find name, did you mean). The zone tree has hundreds of other type
# errors that are noise for this purpose — these two are the ones that survive
# compilation and throw at render time, blanking the page with
# "Application error: a client-side exception has occurred".
set -e
OUT=$(./node_modules/.bin/tsc --noEmit -p tsconfig.zones.json 2>&1 | grep -E "TS2304|TS2552" || true)
if [ -n "$OUT" ]; then
  echo "Undeclared identifiers in zone sources — these crash at render time:"
  echo "$OUT" | sed 's/^/  /'
  exit 1
fi
echo "zone guard: no undeclared identifiers"
