#!/bin/bash
# scripts/docker-entrypoint.sh

set -e

echo "═══════════════════════════════════════"
echo "🚀 TLS Notary Docker Container"
echo "═══════════════════════════════════════"

# Перевірити wstcp
echo "🔍 Checking wstcp..."
if ! command -v wstcp &> /dev/null; then
    echo "❌ wstcp not found!"
    exit 1
fi
echo "✅ wstcp found: $(which wstcp)"

# Перевірити що test-build існує
if [ ! -f "test-build/index.html" ]; then
    echo "❌ test-build not found, running build..."
    npm run build:test
fi
echo "✅ test-build exists"

# Перевірити notary server
if [ -n "$NOTARY_URL" ]; then
    echo "📡 Checking Notary Server: $NOTARY_URL"
    MAX_RETRIES=30
    RETRY_COUNT=0

    until curl -sf "$NOTARY_URL/info" > /dev/null 2>&1 || [ $RETRY_COUNT -eq $MAX_RETRIES ]; do
        echo "⏳ Waiting for Notary Server... ($RETRY_COUNT/$MAX_RETRIES)"
        sleep 2
        RETRY_COUNT=$((RETRY_COUNT + 1))
    done

    if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
        echo "❌ Notary Server not available after $MAX_RETRIES attempts"
        echo "⚠️  Continuing anyway..."
    else
        echo "✅ Notary Server is ready"
    fi
fi

# Показати конфігурацію
echo "═══════════════════════════════════════"
echo "Configuration:"
echo "  PORT:        $PORT"
echo "  PROOFS_DIR:  $PROOFS_DIR"
echo "  NOTARY_URL:  $NOTARY_URL"
echo "  HEADLESS:    $BROWSER_HEADLESS"
echo "  wstcp:       $(which wstcp)"
echo "═══════════════════════════════════════"

# Запустити Express server
echo "🌐 Starting Express server..."
echo "═══════════════════════════════════════"
exec node server.js