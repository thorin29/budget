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
"$PRISMA" migrate deploy --schema "$SCHEMA"

# Drift is reported, never silently corrected. Automatically reshaping a
# production schema outside the migration history hides exactly the mismatch
# that becomes expensive later.
echo "==> Checking for schema drift"
set +e
"$PRISMA" migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel "$SCHEMA" \
  --exit-code >/dev/null 2>&1
DRIFT=$?
set -e

if [ "$DRIFT" -eq 2 ]; then
  echo "WARNING: the database does not match schema.prisma."
  echo "WARNING: starting anyway, but a migration is missing. Inspect with:"
  echo "WARNING:   prisma migrate diff --from-url \$DATABASE_URL \\"
  echo "WARNING:     --to-schema-datamodel prisma/schema.prisma --script"
else
  echo "==> Schema matches"
fi

echo "==> Starting on port ${PORT:-3000} as ${PUID}:${PGID}"
exec su-exec "$PUID:$PGID" "$@"
