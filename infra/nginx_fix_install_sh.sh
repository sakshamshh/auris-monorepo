#!/bin/bash
# ==============================================================================
# Fix nginx routing: make /install.sh proxy to FastAPI instead of serving HTML
# Run this ON THE SERVER: ssh retailiq-server 'bash -s' < infra/nginx_fix_install_sh.sh
# ==============================================================================
set -e

NGINX_CONF="/etc/nginx/sites-enabled/default"

echo "Checking nginx config..."

# Only patch if not already patched
if grep -q "location = /install.sh" "$NGINX_CONF"; then
    echo "✓ Nginx already has /install.sh location block — no changes needed."
else
    echo "Adding /install.sh proxy block to nginx config..."

    # Insert the location = /install.sh block just before the first `location / {` line
    sudo sed -i '/^\s*location \/ {/i\        location = /install.sh {\n            proxy_pass http://localhost:8000/install.sh;\n            proxy_set_header Host $host;\n            proxy_set_header X-Real-IP $remote_addr;\n        }\n' "$NGINX_CONF"

    echo "✓ Location block inserted."
fi

echo "Testing nginx config..."
sudo nginx -t

echo "Reloading nginx..."
sudo systemctl reload nginx

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Done! Test with:"
echo "  curl -sSL https://auris.skymlabs.com/install.sh | head -5"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
