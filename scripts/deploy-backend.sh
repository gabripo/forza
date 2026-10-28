#!/usr/bin/env bash
# Deploys the Forza! backend to your Supabase project: database schema, server functions, secrets.
# Requirements: Supabase CLI (brew install supabase/tap/supabase) and `supabase login` done once.
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
supabase db push

echo "→ Deploying server functions"
supabase functions deploy food-estimate --no-verify-jwt
supabase functions deploy health-ingest --no-verify-jwt

read -r -s -p "Google Gemini API key for food photos (leave empty to skip): " GEMINI
echo
if [[ -n "$GEMINI" ]]; then
  supabase secrets set GEMINI_API_KEY="$GEMINI"
  echo "  Gemini key saved as a server secret."
fi

# Sign-ups must be closed: only the administrator creates accounts.
URL="https://$REF.supabase.co"
read -r -p "Publishable (anon) key, to verify that public sign-ups are closed: " ANON
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
echo "Backend ready. Next:"
echo "  1. GitHub → Settings → Secrets and variables → Actions → Variables:"
echo "       VITE_SUPABASE_URL = $URL"
echo "       VITE_SUPABASE_KEY = <publishable key>"
echo "  2. ./scripts/admin-setup.sh   (stores the service key in your Keychain)"
