#!/bin/bash
# ==============================================================================
# Auris Edge Worker Setup Script (Ubuntu N100)
# This script runs ONCE on a fresh Ubuntu mini PC to configure and start the edge.
# ==============================================================================

# Ensure script is run as root
if [ "$EUID" -ne 0 ]; then
  echo "Error: Please run as root (using sudo)."
  exit 1
fi

echo "=================================================="
echo " Starting Auris Edge Device Provisioning "
echo "=================================================="

# 1. Update system packages and install base dependencies
echo "[1/7] Installing system dependencies..."
apt-get update
apt-get install -y python3 python3-pip python3-venv libgl1 libglib2.0-0

# 2. Create the target deployment directory
echo "[2/7] Creating /opt/auris/ environment..."
mkdir -p /opt/auris/

# 3. Copy application files from repo to target directory
echo "[3/7] Deploying application scripts..."
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
if [ -f "$SCRIPT_DIR/src/edge_worker.py" ]; then
    cp "$SCRIPT_DIR/src/edge_worker.py" /opt/auris/edge_worker.py
    cp "$SCRIPT_DIR/provision.py" /opt/auris/provision.py
    cp "$SCRIPT_DIR/requirements.txt" /opt/auris/requirements.txt
else
    # Fallback to copy from relative path
    cp src/edge_worker.py /opt/auris/edge_worker.py
    cp provision.py /opt/auris/provision.py
    cp requirements.txt /opt/auris/requirements.txt
fi

# 4. Create isolated Python virtual environment
echo "[4/7] Constructing Python virtualenv..."
python3 -m venv /opt/auris/venv

# 5. Install Python dependencies inside virtualenv
echo "[5/7] Installing Python requirements..."
/opt/auris/venv/bin/pip install --upgrade pip
/opt/auris/venv/bin/pip install -r /opt/auris/requirements.txt

# 6. Create credentials environment file placeholder
echo "[6/7] Generating environment credentials file..."
cat << 'EOF' > /opt/auris/.env
CLOUD_API_KEY=REPLACE_WITH_CLIENT_API_KEY
STORE_ID=REPLACE_WITH_STORE_ID
CLOUD_ENDPOINT=https://auris.skymlabs.com/api/frames
EOF

# 7. Create systemd service wrapper configuration
echo "[7/7] Installing Systemd process wrapper..."
cat << 'EOF' > /etc/systemd/system/auris-edge.service
[Unit]
Description=Auris Edge Worker
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/auris
EnvironmentFile=/opt/auris/.env
ExecStart=/opt/auris/venv/bin/python3 /opt/auris/edge_worker.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd configuration and enable service to start on boot
systemctl daemon-reload
systemctl enable auris-edge

echo ""
echo "=================================================="
echo " Starting Auris Edge interactive configuration... "
echo "=================================================="
echo ""

# Run provisioning wizard automatically
python3 /opt/auris/provision.py

# Start the service after configuration is written
echo "Starting Auris Edge worker systemd service..."
systemctl start auris-edge
echo "Service started successfully."
echo ""
