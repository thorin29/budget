#!/bin/sh
set -e

PUID="${PUID:-99}"
PGID="${PGID:-100}"
DATA_DIR="${DATA_DIR:-/app/data}"
PRISMA="/opt/prisma-cli/node_modules/.bin/prisma"
SCHEMA="/app/prisma/schema.prisma"

if [ -z "$DATABASE_URL" ]; then
  echo "FATAL: DATABASE_URL is not set." >&2
  exit 1
fi

mkdir -p "$DATA_DIR"
chown -R "$PUID:$PGID" "$DATA_DIR" 2>/dev/null || true

echo "==> Applying migrations"
if ! "$PRISMA" migrate deploy --schema "$SCHEMA"; then
  echo "==> migrate deploy failed; falling back to a direct schema push"
  "$PRISMA" db push --schema "$SCHEMA"
  "$PRISMA" migrate resolve --schema "$SCHEMA" --applied 0000_init || true
fi

# `migrate deploy` can succeed and still leave the database out of step with the
# schema if a migration was written by hand. Compare the two and reconcile.
# `db push` without --accept-data-loss refuses anything destructive, so this is
# safe to run against a populated database.
if [ "${AUTO_RECONCILE_SCHEMA:-true}" = "true" ]; then
  echo "==> Checking for schema drift"
  set +e
  "$PRISMA" migrate diff \
    --from-url "$DATABASE_URL" \
    --to-schema-datamodel "$SCHEMA" \
    --exit-code >/dev/null 2>&1
  DRIFT=$?
  set -e

  if [ "$DRIFT" -eq 2 ]; then
    echo "==> Drift found; reconciling from schema.prisma"
    "$PRISMA" db push --schema "$SCHEMA"
    echo "==> Reconciled"
  else
    echo "==> No drift"
  fi
fi

echo "==> Starting on port ${PORT:-3000} as ${PUID}:${PGID}"
exec su-exec "$PUID:$PGID" "$@"
