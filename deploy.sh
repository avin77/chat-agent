#!/bin/bash
# ============================================
# EzyBot Deploy Script
# Run by Andy to build and deploy to Vercel
# Usage: bash deploy.sh [commit message]
# ============================================

set -e

COMMIT_MSG=${1:-"chore: deploy update"}
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "[1/3] Building project..."
cd "$PROJECT_DIR"
npm run build

echo "[2/3] Committing and pushing to GitHub..."
git add -A
git diff --cached --quiet && echo "No changes to commit." || git commit -m "$COMMIT_MSG"
git push origin main

echo "[3/3] Done! Vercel will auto-deploy from GitHub."
echo ""
echo "Live URL: https://chat-agent-git-main-avin77.vercel.app"
echo "(or check https://vercel.com/dashboard for the exact preview URL)"
