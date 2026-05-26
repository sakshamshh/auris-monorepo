"""
write_setup.py — writes edge/setup.sh with UTF-8 no-BOM and LF line endings.
Run from the monorepo root: python edge/write_setup.py
"""
import os
import sys

CONTENT = r"""#!/bin/bash
set -e

echo "Installing Auris Edge Worker..."

apt-get update -qq
apt-get install -y python3 python3-pip python3-venv libgl1 libglib2.0-0 curl

mkdir -p /opt/auris/data /opt/auris/logs

echo "Downloading edge worker files..."
curl -sSL https://auris.skymlabs.com/api/edge/download/edge_worker -o /opt/auris/edge_worker.py
curl -sSL https://auris.skymlabs.com/api/edge/download/provision -o /opt/auris/provision.py
curl -sSL https://auris.skymlabs.com/api/edge/download/requirements -o /opt/auris/requirements.txt

echo "Setting up Python environment..."
python3 -m venv /opt/auris/venv
/opt/auris/venv/bin/pip install --upgrade pip -q
/opt/auris/venv/bin/pip install -r /opt/auris/requirements.txt -q

cat > /etc/systemd/system/auris-edge.service << SERVICEEOF
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
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SERVICEEOF

systemctl daemon-reload
systemctl enable auris-edge

echo ""
echo "Running Auris setup wizard..."
/opt/auris/venv/bin/python3 /opt/auris/provision.py

systemctl start auris-edge
echo "Auris Edge is running."
"""

# Resolve output path relative to this script's location (edge/setup.sh)
script_dir = os.path.dirname(os.path.abspath(__file__))
out_path = os.path.join(script_dir, "setup.sh")

# Write with explicit UTF-8 no-BOM and LF line endings
with open(out_path, "w", encoding="utf-8", newline="\n") as f:
    f.write(CONTENT)

# Verify: first 3 bytes must be 0x23 0x21 0x2F  (#!/)
with open(out_path, "rb") as f:
    first_bytes = f.read(4)

hex_str = " ".join(f"{b:02x}" for b in first_bytes)
print(f"First 4 bytes: {hex_str}")

if first_bytes[:3] == b"\x23\x21\x2f":
    print("OK — no BOM, shebang is correct.")
elif first_bytes[:3] == b"\xef\xbb\xbf":
    print("ERROR — BOM detected! Something went wrong.", file=sys.stderr)
    sys.exit(1)
else:
    print(f"WARNING — unexpected first bytes: {hex_str}", file=sys.stderr)
    sys.exit(1)

print(f"Written: {out_path}")
