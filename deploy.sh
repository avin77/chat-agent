#!/bin/bash
# ============================================
# EzyBot Deploy Script
# Run by Andy to build and deploy to Vercel
# Usage: bash deploy.sh [commit message]
# ============================================

set -e

COMMIT_MSG=${1:-"chore: deploy update"}
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

echo "[1/3] Building project..."
npm run build

echo "[2/3] Committing and pushing to GitHub..."
git add -A
git diff --cached --quiet && echo "No changes to commit." || git commit -m "$COMMIT_MSG"
git push origin main

echo "[3/3] Deploying to Vercel (ezysrs-projects/chat-agent)..."
if [ -n "$VERCEL_TOKEN" ]; then
    npx vercel --prod --token="$VERCEL_TOKEN" --scope=ezysrs-projects --yes 2>&1 | tail -5
else
    echo "No VERCEL_TOKEN set — relying on GitHub auto-deploy via Vercel integration."
fi

echo ""
echo "Live URL: https://vercel.com/ezysrs-projects/chat-agent"
