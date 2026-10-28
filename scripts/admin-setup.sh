#!/usr/bin/env bash
# Stores the Forza! administrator credentials in the macOS Keychain (never in files or git).
# The admin dashboard (admin/) reads them at start-up.
#
#   Supabase dashboard → Project Settings → API:
#     - Project URL                       e.g. https://abcd1234.supabase.co
#     - service_role / secret key         (keep it secret: it can read and change every account)
set -euo pipefail

SERVICE="forza-admin"

read -r -p "Supabase project URL: " url
read -r -s -p "Supabase service_role (secret) key: " key
echo

if [[ ! "$url" =~ ^https://.+ ]]; then
  echo "The URL must start with https://" >&2
  exit 1
fi

security add-generic-password -U -s "$SERVICE" -a "supabase-url" -w "$url"
security add-generic-password -U -s "$SERVICE" -a "service-role-key" -w "$key"

echo "Saved in the Keychain (service \"$SERVICE\"). Start the dashboard with:  cd admin && npm install && npm start"
