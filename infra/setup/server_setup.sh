#!/bin/bash
# ==============================================================================
# Auris Server Setup Script
# Target OS: Ubuntu 22.04 / 24.04 / 26.04
# Run as root (sudo bash server_setup.sh)
# ==============================================================================

set -euo pipefail

# Define configuration variables
RUN_USER="saksham"
SERVER_DIR="/home/retailiq-key/auris-server"
PIP_TMP_DIR="/tmp/pip-tmp"

# ------------------------------------------------------------------------------
# Check for Root Privileges
# ------------------------------------------------------------------------------
if [ "$EUID" -ne 0 ]; then
    echo -e "\e[31mError: Please run as root (using sudo).\e[0m"
    exit 1
fi

echo -e "\e[34m[1/10] Installing system dependencies...\e[0m"
apt-get update
apt-get install -y python3 python3-pip python3-venv git curl nginx certbot \
  python3-certbot-nginx libgl1 libglib2.0-0 libpango-1.0-0 libpangoft2-1.0-0 \
  libxcb1 libxcb-xinerama0 libxkbcommon-x11-0

echo -e "\e[34m[2/10] Creating directory structure...\e[0m"
mkdir -p "$SERVER_DIR"
mkdir -p /var/www/auris-hq
mkdir -p /var/www/auris

# Set correct ownership so the deployment user can scp into these directories
chown -R "$RUN_USER":"$RUN_USER" "$SERVER_DIR"
chown -R "$RUN_USER":"$RUN_USER" /var/www/auris-hq
chown -R "$RUN_USER":"$RUN_USER" /var/www/auris

echo -e "\e[34m[3/10] Verifying copied server code...\e[0m"
if [ ! -d "$SERVER_DIR" ] || [ ! -f "$SERVER_DIR/requirements.txt" ]; then
    echo -e "\e[33mWarning: Server code or requirements.txt not found in $SERVER_DIR.\e[0m"
    echo -e "\e[33mEnsure you copy the server files via scp before or immediately after this setup.\e[0m"
else
    echo "Server code verified in $SERVER_DIR."
fi

echo -e "\e[34m[4/10] Creating Python virtual environment & installing requirements...\e[0m"
cd "$SERVER_DIR"
python3 -m venv venv
chown -R "$RUN_USER":"$RUN_USER" venv

# Setup pip temp directory to prevent any space or permission issues
mkdir -p "$PIP_TMP_DIR"
chmod 777 "$PIP_TMP_DIR"

echo "Installing requirements from requirements.txt..."
TMPDIR="$PIP_TMP_DIR" ./venv/bin/pip install --upgrade pip
TMPDIR="$PIP_TMP_DIR" ./venv/bin/pip install -r requirements.txt

echo -e "\e[34m[5/10] Installing OpenCV Headless (4.10.x — to prevent 4.13 breakages)...\e[0m"
./venv/bin/pip uninstall opencv-python -y 2>/dev/null || true
TMPDIR="$PIP_TMP_DIR" ./venv/bin/pip install "opencv-contrib-python-headless<4.11"

echo -e "\e[34m[6/10] Patching YOLO model path in routes/frames.py...\e[0m"
if [ -f "routes/frames.py" ]; then
    sed -i 's/MODEL = YOLO("yolov8m.pt")/MODEL = YOLO("yolov8n.onnx", task="detect")/' routes/frames.py
    echo "Patched routes/frames.py successfully."
else
    echo -e "\e[33mWarning: routes/frames.py not found to patch. Skipping.\e[0m"
fi

echo -e "\e[34m[7/10] Configuring systemd service...\e[0m"
cat << EOF > /etc/systemd/system/auris.service
[Unit]
Description=Auris Application Server
After=network.target

[Service]
User=$RUN_USER
WorkingDirectory=$SERVER_DIR
EnvironmentFile=$SERVER_DIR/.env
ExecStart=$SERVER_DIR/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable auris
echo "Systemd service 'auris' created and enabled."

echo -e "\e[34m[8/10] Configuring Nginx reverse proxy...\e[0m"
if [ -f "$SERVER_DIR/infra/auris.nginx" ]; then
    cp "$SERVER_DIR/infra/auris.nginx" /etc/nginx/sites-available/auris
    ln -sf /etc/nginx/sites-available/auris /etc/nginx/sites-enabled/auris
    rm -f /etc/nginx/sites-enabled/default
    
    # Try restarting Nginx, but don't exit script if it fails (due to SSL certs not being generated yet)
    echo "Testing Nginx configuration and restarting..."
    systemctl restart nginx || echo -e "\e[33mNote: Nginx restart failed. This is expected if SSL certificates are not yet generated via Certbot. Proceeding...\e[0m"
else
    echo -e "\e[33mWarning: $SERVER_DIR/infra/auris.nginx not found. Please verify nginx config manually.\e[0m"
fi

echo -e "\e[34m[9/10] Installing Tailscale...\e[0m"
curl -fsSL https://tailscale.com/install.sh | sh
echo -e "\e[32mTailscale installation complete. Run 'sudo tailscale up' to connect to your tailnet.\e[0m"

# Clean up pip temp directory
rm -rf "$PIP_TMP_DIR"

echo -e "\n\e[32m==============================================================================\e[0m"
echo -e "\e[32mServer setup complete!\e[0m"
echo -e "\e[32m==============================================================================\e[0m"
echo -e "\e[33mNext steps:\e[0m"
echo -e "1. Copy .env file: \e[36mscp .env $RUN_USER@<IP>:$SERVER_DIR/\e[0m"
echo -e "2. Copy ONNX model: \e[36mscp yolov8n.onnx $RUN_USER@<IP>:$SERVER_DIR/\e[0m"
echo -e "3. Set up SSL: \e[36msudo certbot --nginx -d auris.skymlabs.com -d hq.skymlabs.com\e[0m"
echo -e "4. Connect Tailscale: \e[36msudo tailscale up\e[0m"
echo -e "5. Deploy static files: \e[36mrun .\\deploy.ps1 from your laptop\e[0m"
echo -e "==============================================================================\n"
