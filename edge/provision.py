#!/usr/bin/env python3
"""
Auris Edge Provisioning Wizard
This script runs once to configure a fresh Auris N100 edge device.
Compatible with both Windows (dev) and Linux (production).
Uses only standard library modules and the requests package.
"""

import os
import sys
import socket
import datetime
import concurrent.futures
import requests
import builtins

# ------------------------------------------------------------------------------
# ROBUST UNICODE-SAFE PRINT OVERRIDE
# ------------------------------------------------------------------------------
def safe_print(*args, **kwargs):
    sep = kwargs.get('sep', ' ')
    end = kwargs.get('end', '\n')
    file = kwargs.get('file', sys.stdout)
    
    if file == sys.stdout:
        text = sep.join(str(arg) for arg in args)
        try:
            sys.stdout.write(text + end)
            sys.stdout.flush()
        except UnicodeEncodeError:
            # Safe ASCII fallback for older terminal encodings
            fallback = (
                text.replace("✓", "[v]")
                    .replace("✗", "[x]")
                    .replace("→", "->")
                    .replace("●", "*")
                    .replace("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "--------------------------------------")
            )
            clean_parts = []
            for char in fallback:
                if ord(char) < 128:
                    clean_parts.append(char)
                elif char in "━─":
                    clean_parts.append("-")
                elif char in "│":
                    clean_parts.append("|")
                else:
                    clean_parts.append("?")
            sys.stdout.write("".join(clean_parts) + end)
            sys.stdout.flush()
    else:
        builtins._original_print(*args, **kwargs)

# Save original print and override
builtins._original_print = print
print = safe_print

# ------------------------------------------------------------------------------
# CONSTANTS & CONFIGURATION
# ------------------------------------------------------------------------------
SERVER_URL = "https://auris.skymlabs.com"
CONFIG_ENDPOINT = f"{SERVER_URL}/api/edge/config"
FRAMES_ENDPOINT = f"{SERVER_URL}/api/frames"

# ------------------------------------------------------------------------------
# HELPER FUNCTIONS
# ------------------------------------------------------------------------------
def clear_screen():
    """Clears the console screen."""
    os.system('cls' if os.name == 'nt' else 'clear')

def get_local_ip():
    """Retrieves the local IP address of the machine."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # Connect to an external IP (does not actually send packets)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    finally:
        s.close()
    return ip

def check_port(ip, port, timeout=0.2):
    """Checks if a specific port is open on the target IP address."""
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(timeout)
    try:
        s.connect((ip, port))
        return True
    except Exception:
        return False
    finally:
        s.close()

# ------------------------------------------------------------------------------
# INTERACTIVE STEPS
# ------------------------------------------------------------------------------
def run_provisioning():
    clear_screen()
    print("==================================================")
    print("           AURIS EDGE PROVISIONING WIZARD         ")
    print("==================================================")
    print()

    # --------------------------------------------------------------------------
    # STEP 1 — Enter API Key & STEP 2 — Fetch config from server
    # --------------------------------------------------------------------------
    print("STEP 1 — Enter API Key")
    print("Welcome to Auris Edge Setup")
    print("Find your API key in HQ portal → Registry → [Client Name] → System tab")
    print()

    while True:
        api_key = input("Enter API Key: ").strip()

        # Validate format
        if not api_key.startswith("sk_") or len(api_key) < 10:
            print("Error: API key must start with 'sk_' and be at least 10 chars")
            print("Please check your credentials and try again.")
            print()
            continue

        print()
        print("STEP 2 — Fetch config from server")
        print("Connecting to Auris cloud registry...")

        # Request config from cloud registry
        headers = {"X-API-Key": api_key}
        try:
            response = requests.get(CONFIG_ENDPOINT, headers=headers, timeout=10)
            if response.status_code == 401:
                print("Invalid API key. Check HQ portal.")
                print("Returning to Step 1...")
                print()
                continue
            elif response.status_code != 200:
                print(f"✗ Server error: Received status code {response.status_code} from registry.")
                retry = input("Do you want to retry with the same key? (y/n): ").strip().lower()
                if retry == 'y':
                    continue
                else:
                    print()
                    continue

            # Connected successfully
            config = response.json()
            store_id = config.get("store_id")
            store_name = config.get("store_name", store_id)
            cameras = config.get("cameras", [])
            print("✓ Connected to Auris server")
            print(f"Store: {store_name}")
            print(f"Cameras configured: {len(cameras)}")
            print()
            break

        except requests.exceptions.RequestException as e:
            print(f"✗ Connection failed: {e}")
            print("Please check your internet connection and try again.")
            print()
            continue

    # --------------------------------------------------------------------------
    # STEP 3 — Camera discovery (if no cameras configured yet)
    # --------------------------------------------------------------------------
    print("STEP 3 — Camera Discovery")
    if not cameras:
        print("No cameras configured yet. Let's find them.")
        print("Scanning network for cameras...")

        local_ip = get_local_ip()
        ip_parts = local_ip.split('.')
        
        # Determine subnet base (use current subnet or default fallback to 192.168.1.x)
        if len(ip_parts) == 4 and ip_parts[0] != '127':
            subnet_base = ".".join(ip_parts[:3])
            print(f"Scanning base subnet: {subnet_base}.x on port 554 (RTSP)...")
        else:
            subnet_base = "192.168.1"
            print(f"Could not determine local subnet. Scanning default base: 192.168.1.x on port 554...")

        # Run multi-threaded socket scan for port 554
        ips_to_scan = [f"{subnet_base}.{i}" for i in range(1, 255)]
        found_devices = []

        with concurrent.futures.ThreadPoolExecutor(max_workers=50) as executor:
            future_to_ip = {executor.submit(check_port, ip, 554, 0.25): ip for ip in ips_to_scan}
            for future in concurrent.futures.as_completed(future_to_ip):
                ip = future_to_ip[future]
                try:
                    if future.result():
                        found_devices.append(ip)
                        print(f"Found device at {ip}:554")
                except Exception:
                    pass

        print()
        print("Enter RTSP URLs manually or configure in HQ portal first.")
        
        # Provide RTSP tips with either a found IP or placeholder
        tip_ip = found_devices[0] if found_devices else "{ip}"
        print(f"Tip: Default CPPlus RTSP: rtsp://admin:password@{tip_ip}:554/avstream/channel=1")
        print(f"Tip: Default Hikvision RTSP: rtsp://admin:password@{tip_ip}:554/Streaming/Channels/101")
        print()
    else:
        print("Cameras configured on server:")
        for idx, cam in enumerate(cameras, 1):
            cam_id = cam.get("camera_id", f"CAM_{idx}")
            label = cam.get("label", "No label")
            rtsp = cam.get("rtsp_url", "No RTSP URL")
            print(f"  {idx}. [{cam_id}] {label} -> {rtsp}")
        print("✓ Camera config loaded from HQ portal")
        print()

    # --------------------------------------------------------------------------
    # STEP 4 — Write .env file
    # --------------------------------------------------------------------------
    print("STEP 4 — Write .env file")
    
    # Path depends on OS (Linux production vs Windows dev)
    if os.name == 'nt':
        env_path = os.path.join("edge", ".env")
    else:
        env_path = "/opt/auris/.env"

    # Ensure parent directory exists
    parent_dir = os.path.dirname(env_path)
    if parent_dir and not os.path.exists(parent_dir):
        try:
            os.makedirs(parent_dir, exist_ok=True)
        except Exception as e:
            print(f"Warning: Could not create folder {parent_dir}: {e}")

    # Construct file contents
    env_content = (
        f"CLOUD_API_KEY={api_key}\n"
        f"STORE_ID={store_id}\n"
        f"CLOUD_ENDPOINT={FRAMES_ENDPOINT}\n"
    )

    try:
        with open(env_path, "w") as env_file:
            env_file.write(env_content)
        print(f"✓ Environment configuration successfully written to: {env_path}")
    except Exception as e:
        print(f"✗ Failed to write .env file: {e}")
        print("Please check your file permissions.")
        sys.exit(1)
    print()

    # --------------------------------------------------------------------------
    # STEP 5 — Test connection
    # --------------------------------------------------------------------------
    print("STEP 5 — Test connection")
    print(f"Sending test diagnostic frame to {FRAMES_ENDPOINT}...")

    test_payload = {
        "store_id": store_id,
        "camera_id": "test_camera",
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "frame_id": 0,
        "frame_resolution": [1920, 1080],
        "calibration_mode": False,
        "crops": []
    }
    test_headers = {
        "X-API-Key": api_key,
        "Content-Type": "application/json"
    }

    try:
        res = requests.post(FRAMES_ENDPOINT, json=test_payload, headers=test_headers, timeout=10)
        if res.status_code == 200:
            print("✓ Connection to Auris server confirmed")
        else:
            print(f"✗ Connection failed. Server returned status code: {res.status_code}")
    except Exception as e:
        print(f"✗ Connection failed. Check internet connection. Error: {e}")
    print()

    # --------------------------------------------------------------------------
    # STEP 6 — Done
    # --------------------------------------------------------------------------
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("Auris Edge is configured and ready.")
    print("Run edge_worker.py to start streaming.")
    print("Or if using systemd: sudo systemctl start auris-edge")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print()

if __name__ == "__main__":
    try:
        run_provisioning()
    except KeyboardInterrupt:
        print("\n\nSetup process aborted by user.")
        sys.exit(0)
