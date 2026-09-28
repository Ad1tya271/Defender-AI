#!/bin/sh
set -e

echo "==> Running DefenderAI Database Migrations..."
alembic upgrade head

echo "==> Starting DefenderAI API Service..."
exec "$@"
