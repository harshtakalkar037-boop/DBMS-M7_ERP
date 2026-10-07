#!/usr/bin/env bash
# -------------------------------------------------------------------------------------
# Recreate the ERP database from the SQL scripts, in dependency order.
# Usage: bash scripts/reset-db.sh [--no-seed]
# -------------------------------------------------------------------------------------
set -euo pipefail
DB="${DB_NAME:-university_erp}"
ROOT="${DB_ROOT:-sudo mariadb}"
NO_SEED="${1:-}"

echo ">> Dropping and recreating database '${DB}'"
sudo mariadb -e "DROP DATABASE IF EXISTS \`${DB}\`; CREATE DATABASE \`${DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# NOTE the deliberate order:
#   01 schema  -> 02 tables -> 03 constraints/indexes
#   07 functions (procedures + triggers call these)
#   08 views    (procedures may read them)
#   04 seed     (loaded BEFORE triggers so seeded rows are not blocked/duplicated)
#   05 procedures
#   06 triggers (installed last so they only police live application traffic)
ORDER=(01_schema.sql 02_tables.sql 03_constraints.sql 07_functions.sql 08_views.sql)
if [ "$NO_SEED" != "--no-seed" ]; then ORDER+=(04_seed.sql); fi
ORDER+=(05_procedures.sql 06_triggers.sql)

for f in "${ORDER[@]}"; do
  printf '>> %-20s ' "$f"
  if sudo mariadb "$DB" < "database/$f" 2>/tmp/sqlerr; then
    echo "OK"
  else
    echo "FAILED"; tail -n 5 /tmp/sqlerr; exit 1
  fi
done
echo ">> Database '${DB}' rebuilt successfully."
