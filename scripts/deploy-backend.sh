#!/usr/bin/env bash
# Deploys the Forza! backend to your Supabase project: database schema, server functions, secrets.
# Requirements: Supabase CLI (https://supabase.com/docs/guides/cli) and `supabase login` done once.
# Forza! Coach does the same without the CLI, on macOS, Windows and Linux (docs/advanced-setup.md).
#
#   ./scripts/deploy-backend.sh <project-ref>
#
# The project ref is the "abcd1234" part of https://abcd1234.supabase.co
set -euo pipefail
cd "$(dirname "$0")/.."

REF="${1:-}"
if [[ -z "$REF" ]]; then
  read -r -p "Supabase project ref (the abcd1234 in https://abcd1234.supabase.co): " REF
fi

echo "→ Linking project $REF"
supabase link --project-ref "$REF"

echo "→ Applying the database schema"
supabase db push --linked

echo "→ Deploying server functions"
supabase functions deploy food-estimate --no-verify-jwt
supabase functions deploy health-ingest --no-verify-jwt
supabase functions deploy bws-ingest --no-verify-jwt

read -r -s -p "Google Gemini API key for food photos (leave empty to skip): " GEMINI
echo
if [[ -n "$GEMINI" ]]; then
  supabase secrets set GEMINI_API_KEY="$GEMINI"
  echo "  Gemini key saved as a server secret."
fi

# Sign-ups must be closed: only the administrator creates accounts.
URL="https://$REF.supabase.co"
# The publishable key is public by design (row-level security protects the data).
ANON=$(supabase projects api-keys --project-ref "$REF" -o json | python3 -c '
import json, sys
keys = json.load(sys.stdin)
pub = [k for k in keys if k.get("type") == "publishable"] or [k for k in keys if k.get("name") == "anon"]
print(pub[0]["api_key"])')
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/auth/v1/signup" \
  -H "apikey: $ANON" -H 'content-type: application/json' \
  -d "{\"email\":\"signup-check-$RANDOM@example.com\",\"password\":\"Check-$RANDOM-$RANDOM\"}")
if [[ "$CODE" == "200" ]]; then
  echo
  echo "⚠️  PUBLIC SIGN-UPS ARE OPEN. Anyone could create an account."
  echo "   Supabase dashboard → Authentication → Sign In / Providers → turn OFF \"Allow new users to sign up\"."
  echo "   (Then delete the test user signup-check-… from Authentication → Users.)"
else
  echo "✓ Public sign-ups are closed (HTTP $CODE)."
fi

echo
echo "Backend ready. Next: start Forza! Coach (double-click the launcher in the forza folder,"
echo "or: cd coach && npm start) and connect it to project $REF in its Setup screen."
