#!/usr/bin/env bash
# Apply a SQL migration to Supabase via Management API.
# Usage: ./scripts/apply-migration.sh supabase/NN-migration.sql

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 path/to/migration.sql"
  exit 1
fi

FILE="$1"
if [ ! -f "$FILE" ]; then
  echo "File not found: $FILE"
  exit 1
fi

# Load env
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
set -a
# shellcheck disable=SC1091
source "$ROOT/.env.local"
set +a

: "${SUPABASE_MANAGEMENT_TOKEN:?missing in .env.local}"
: "${SUPABASE_PROJECT_REF:?missing in .env.local}"

SQL=$(cat "$FILE")
echo "Applying $(basename "$FILE")…"

RESPONSE=$(curl -s -X POST "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_MANAGEMENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg q "$SQL" '{query:$q}')")

if echo "$RESPONSE" | grep -q '"message"'; then
  echo "❌ Failed:"
  echo "$RESPONSE"
  exit 1
fi

echo "✅ Applied."
echo "$RESPONSE" | head -c 500
echo
