#!/usr/bin/env bash
# Send canned surf questions to the agent, one new session each, to generate traces.
#   scripts/demo.sh                                  # local `eve dev` on :2000
#   scripts/demo.sh https://surf-agent-eve.vercel.app  # deployed agent (OIDC login prompt)
set -euo pipefail
URL="${1:-http://127.0.0.1:2000}"
PROMPTS=(
  "How's the surf at Pipeline, Oahu today?"
  "I'm a beginner in Lisbon. Is Carcavelos good this weekend?"
  "Compare Uluwatu and Padang Padang for tomorrow morning."
  "What's the swell doing at Mavericks?"
)
for p in "${PROMPTS[@]}"; do
  echo "──── you> $p"
  pnpm exec eve remote connect --url "$URL" --print "$p" || echo "  (turn failed, see above)"
  echo
done
