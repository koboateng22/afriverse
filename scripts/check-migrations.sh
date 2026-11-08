#!/usr/bin/env bash
# Shows which supabase/migrations are in your Supabase database.
#
#   DATABASE_URL='postgresql://…' bash scripts/check-migrations.sh
#
# DATABASE_URL: Supabase → Project Settings → Database → Connection string → URI
# (Session pooler), with your database password filled in. Keep it out of git.
# Needs psql:  sudo apt install postgresql-client
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Set DATABASE_URL first, e.g.:" >&2
  echo "  DATABASE_URL='postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres' bash scripts/check-migrations.sh" >&2
  exit 1
fi
if ! command -v psql >/dev/null 2>&1; then
  echo "psql is not installed. Run: sudo apt install postgresql-client" >&2
  echo "Or paste scripts/check-migrations.sql into the Supabase SQL Editor instead." >&2
  exit 1
fi

# Migration files in the repo that the check doesn't know about yet.
known=$(grep -oE "'[0-9]{4}_[a-z0-9_]+'" "$here/check-migrations.sql" | tr -d "'" | sort -u)
for f in "$here"/../supabase/migrations/*.sql; do
  name=$(basename "$f" .sql)
  grep -qx "$name" <<<"$known" || echo "note: $name is not covered by this check yet" >&2
done

psql "$DATABASE_URL" --no-psqlrc -v ON_ERROR_STOP=1 -P pager=off -f "$here/check-migrations.sql"

# Migrations recorded by `supabase db push` (empty if you only used the SQL Editor).
psql "$DATABASE_URL" --no-psqlrc -P pager=off -c \
  "select version as pushed_with_cli from supabase_migrations.schema_migrations order by version" 2>/dev/null \
  || echo "(no supabase db push history: migrations were applied from the SQL Editor)"
