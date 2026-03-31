#!/usr/bin/env bash
set -e

cd /var/www/blog

echo "==> Pulling latest code..."
git pull

echo "==> Installing dependencies..."
pnpm install --frozen-lockfile

echo "==> Building..."
pnpm build

echo "==> Done! Blog updated at $(date '+%Y-%m-%d %H:%M:%S')"
echo "    No restart needed — Nginx serves static files directly."
