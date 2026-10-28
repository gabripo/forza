#!/usr/bin/env bash
# Stores the Forza! administrator credentials in the macOS Keychain (never in files or git).
# The admin dashboard (admin/) reads them at start-up.
#
#   ./scripts/admin-setup.sh <project-ref>   fetch them with the Supabase CLI (after `supabase login`)
#   ./scripts/admin-setup.sh                 type them in (Supabase dashboard → Project Settings → API Keys)
#
# The secret / service_role key can read and change every account: it is never printed.
set -euo pipefail

SERVICE="forza-admin"
REF="${1:-}"

if [[ -n "$REF" ]]; then
  url="https://$REF.supabase.co"
  key=$(supabase projects api-keys --project-ref "$REF" --reveal -o json | python3 -c '
import json, sys
keys = json.load(sys.stdin)
secret = [k for k in keys if k.get("type") == "secret"] or [k for k in keys if k.get("name") == "service_role"]
print(secret[0]["api_key"])')
else
  read -r -p "Supabase project URL: " url
  read -r -s -p "Supabase secret (service_role) key: " key
  echo
fi

if [[ -z "$key" || "$key" == *[!\ -~]* ]]; then
  echo "Could not read the full secret key (it looks masked). Copy it from the dashboard and run without arguments." >&2
  exit 1
fi

if [[ ! "$url" =~ ^https://.+ ]]; then
  echo "The URL must start with https://" >&2
  exit 1
fi

security add-generic-password -U -s "$SERVICE" -a "supabase-url" -w "$url"
security add-generic-password -U -s "$SERVICE" -a "service-role-key" -w "$key"

echo "Saved in the Keychain (service \"$SERVICE\") for $url."
echo "Start the dashboard with:  cd admin && npm install && npm start"
