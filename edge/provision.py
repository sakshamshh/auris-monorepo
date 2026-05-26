#!/usr/bin/env python3
"""
Auris Edge Provisioning Wizard (Upgraded)
This script runs once to configure a fresh Auris N100 edge device.
Performs automatic camera discovery, OpenCV validation, and HQ syncing.
Compatible with both Windows (dev) and Linux (production).
Uses standard library modules + requests + cv2.
"""

import os
import sys
import socket
import datetime
import concurrent.futures
import threading
import requests
import builtins
import cv2

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
CAMERAS_UPDATE_ENDPOINT = f"{SERVER_URL}/api/factory/cameras/update"
ADMIN_KEY = "dcd62cb40e5fa0870d73c79fbd521d05"

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
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    finally:
        s.close()
    return ip

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
    # STEP 3 — Auto Camera Discovery
    # --------------------------------------------------------------------------
    print("STEP 3 — Auto Camera Discovery")
    
    working_cameras = []

    if cameras:
        print("Cameras configured on server:")
        for idx, cam in enumerate(cameras, 1):
            cam_id = cam.get("camera_id", f"CAM_{idx}")
            label = cam.get("label", "No label")
            rtsp = cam.get("rtsp_url", "No RTSP URL")
            print(f"  {idx}. [{cam_id}] {label} -> {rtsp}")
        print("✓ Camera config loaded from HQ portal")
        print()
    else:
        print("No cameras configured on the server yet. Let's find them automatically!")
        print("Starting auto-discovery system...")
        print()

        # 3a. Get local subnet automatically
        local_ip = get_local_ip()
        ip_parts = local_ip.split('.')
        
        if len(ip_parts) == 4 and ip_parts[0] != '127':
            subnet_base = ".".join(ip_parts[:3])
        else:
            subnet_base = "192.168.1"

        # 3b. Port scan for cameras (max 50 threads)
        potential_cameras = []
        potential_lock = threading.Lock()
        
        semaphore = threading.BoundedSemaphore(50)
        scanned_count = 0
        count_lock = threading.Lock()
        
        def scan_ip(ip):
            nonlocal scanned_count
            with semaphore:
                for port in [554, 5543, 8554]:
                    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                    s.settimeout(1.0)
                    res = s.connect_ex((ip, port))
                    s.close()
                    if res == 0:
                        with potential_lock:
                            potential_cameras.append((ip, port))
                
                with count_lock:
                    scanned_count += 1
                    percent = int((scanned_count / 254) * 100)
                    sys.stdout.write(f"\rScanning {subnet_base}.x... {scanned_count}/254 IPs checked ({percent}%) — found {len(potential_cameras)} devices")
                    sys.stdout.flush()

        threads = []
        print(f"Scanning subnet {subnet_base}.0/24 on camera ports 554, 5543, 8554...")
        for i in range(1, 255):
            ip = f"{subnet_base}.{i}"
            t = threading.Thread(target=scan_ip, args=(ip,), daemon=True)
            threads.append(t)
            t.start()

        for t in threads:
            t.join()
        
        print() # Move to next line after scan finishes
        print(f"Port scan completed. Found {len(potential_cameras)} potential devices.")
        print()

        if potential_cameras:
            # 3c. Ask for camera password
            print(f"Found {len(potential_cameras)} potential cameras on the network")
            entered_pwd = input("Enter camera password (press Enter to try 'admin123'): ").strip()
            if not entered_pwd:
                entered_pwd = "admin123"

            # Create unique passwords list to try
            passwords_to_try = []
            for p in [entered_pwd, "admin", "password", "12345", ""]:
                if p not in passwords_to_try:
                    passwords_to_try.append(p)

            # 3d. Test each potential camera with common RTSP patterns
            print("Verifying RTSP feeds using OpenCV video capture...")

            RTSP_PATTERNS = [
                # EZYKAM / generic
                "rtsp://admin:{password}@{ip}:{port}/live/channel0",
                "rtsp://admin:{password}@{ip}:{port}/live/channel1",
                "rtsp://admin:{password}@{ip}:{port}/live/main",
                # CPPlus
                "rtsp://admin:{password}@{ip}:{port}/avstream/channel=1",
                "rtsp://admin:{password}@{ip}:{port}/avstream/channel=0",
                # Hikvision
                "rtsp://admin:{password}@{ip}:{port}/Streaming/Channels/101",
                "rtsp://admin:{password}@{ip}:{port}/Streaming/Channels/1",
                "rtsp://admin:{password}@{ip}:{port}/h264/ch1/main/av_stream",
                # Dahua
                "rtsp://admin:{password}@{ip}:{port}/cam/realmonitor?channel=1&subtype=0",
                "rtsp://admin:{password}@{ip}:{port}/cam/realmonitor?channel=1&subtype=1",
                # Generic
                "rtsp://admin:{password}@{ip}:{port}/stream1",
                "rtsp://admin:{password}@{ip}:{port}/stream0",
                "rtsp://admin:{password}@{ip}:{port}/video1",
                "rtsp://admin:{password}@{ip}:{port}/video0",
                "rtsp://admin:{password}@{ip}:{port}/1",
                "rtsp://admin:{password}@{ip}:{port}/0",
                # ONVIF
                "rtsp://admin:{password}@{ip}:{port}/onvif1",
                "rtsp://admin:{password}@{ip}:{port}/onvif/profile1/media.smp",
                # No auth
                "rtsp://{ip}:{port}/live/channel0",
                "rtsp://{ip}:{port}/stream1",
                # Alternative username
                "rtsp://user:{password}@{ip}:{port}/stream1",
                "rtsp://root:{password}@{ip}:{port}/stream1",
            ]

            for ip, port in potential_cameras:
                found_working_for_ip = False
                tried_urls = []
                
                for password in passwords_to_try:
                    # 1. First, try standard RTSP_PATTERNS in order
                    for pat in RTSP_PATTERNS:
                        url = pat.format(password=password, ip=ip, port=port)
                        if password == "":
                            url = url.replace("admin:@", "")
                            url = url.replace("user:@", "")
                            url = url.replace("root:@", "")
                        if url not in tried_urls:
                            tried_urls.append(url)
                    
                    # 2. Also try all username variants for all paths to cover any missed combinations
                    usernames = ["admin", "user", "root", ""]
                    for username in usernames:
                        for pat in RTSP_PATTERNS:
                            parts = pat.split("{ip}:{port}/")
                            if len(parts) < 2:
                                continue
                            path = parts[1]
                            if username:
                                if password:
                                    url = f"rtsp://{username}:{password}@{ip}:{port}/{path}"
                                else:
                                    url = f"rtsp://{username}@{ip}:{port}/{path}"
                            else:
                                url = f"rtsp://{ip}:{port}/{path}"
                            if url not in tried_urls:
                                tried_urls.append(url)

                for url in tried_urls:
                    cap = cv2.VideoCapture(url)
                    cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 3000)  # 3 seconds timeout
                    ret, frame = cap.read()
                    
                    if ret and frame is not None:
                        working_cameras.append((ip, port, url))
                        print(f"✓ Camera found: {ip}:{port} — {url}")
                        found_working_for_ip = True
                        cap.release()
                        break
                    cap.release()

                if not found_working_for_ip:
                    print(f"✗ {ip}:{port} — tried {len(tried_urls)} patterns, none worked")

        # 3e. If no cameras found automatically
        if not working_cameras:
            print()
            print("Could not auto-detect cameras.")
            print("Please add cameras manually in HQ portal:")
            print("hq.skymlabs.com → Registry → [Client] → System → Edit Cameras")
            try:
                input("Press Enter to continue without cameras, or Ctrl+C to exit")
            except KeyboardInterrupt:
                print("\nAborted.")
                sys.exit(0)
            print()
        else:
            # 3f. If cameras found
            print()
            print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            print(f"Found {len(working_cameras)} working cameras:")
            for idx, (_, _, url) in enumerate(working_cameras, 1):
                print(f"  cam{idx}: {url}")
            print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            print()

            save_choice = input("Save these cameras to HQ portal? [Y/n]: ").strip().lower()
            if save_choice in ('', 'y', 'yes'):
                print("Saving to cloud registry...")
                
                # Format payload
                cams_payload = []
                for idx, (_, _, url) in enumerate(working_cameras, 1):
                    cams_payload.append({
                        "camera_id": f"cam{idx}",
                        "rtsp_url": url,
                        "label": f"Camera {idx}",
                        "fps": 2
                    })
                
                req_body = {
                    "store_id": store_id,
                    "cameras": cams_payload
                }
                req_headers = {
                    "X-Admin-Key": ADMIN_KEY,
                    "Content-Type": "application/json"
                }

                try:
                    res = requests.post(CAMERAS_UPDATE_ENDPOINT, json=req_body, headers=req_headers, timeout=10)
                    if res.status_code == 200:
                        print("✓ Cameras saved to HQ portal")
                    else:
                        print(f"✗ Failed to save cameras to HQ: Server returned status code {res.status_code}")
                except Exception as e:
                    print(f"✗ Failed to save cameras to HQ: {e}")
            
            # Update local config.py
            if os.name == 'nt':
                config_path = os.path.join("edge", "src", "config.py")
            else:
                config_path = "/opt/auris/config.py"
                
            config_dir = os.path.dirname(config_path)
            if config_dir and not os.path.exists(config_dir):
                os.makedirs(config_dir, exist_ok=True)
                
            config_content = "# Auris Edge Configuration\n"
            config_content += "CAMERAS = {\n"
            for idx, (_, _, url) in enumerate(working_cameras, 1):
                config_content += f'    "cam{idx}": {{"url": "{url}", "fps": 2}},\n'
            config_content += "}\n\n"
            config_content += f'STORE_ID = "{store_id}"\n'
            config_content += f'API_BASE = "{SERVER_URL}"\n'
            config_content += f'API_KEY = "{api_key}"\n'
            
            try:
                with open(config_path, "w") as cf:
                    cf.write(config_content)
                print(f"✓ Updated local config file: {config_path}")
            except Exception as e:
                print(f"✗ Failed to write local config file: {e}")
            print()

    # --------------------------------------------------------------------------
    # STEP 4 — Write .env file
    # --------------------------------------------------------------------------
    print("STEP 4 — Write .env file")
    
    if os.name == 'nt':
        env_path = os.path.join("edge", ".env")
    else:
        env_path = "/opt/auris/.env"

    parent_dir = os.path.dirname(env_path)
    if parent_dir and not os.path.exists(parent_dir):
        try:
            os.makedirs(parent_dir, exist_ok=True)
        except Exception as e:
            print(f"Warning: Could not create folder {parent_dir}: {e}")

    env_content = (
        f"CLOUD_API_KEY={api_key}\n"
        f"STORE_ID={store_id}\n"
        f"CLOUD_ENDPOINT={FRAMES_ENDPOINT}\n"
    )
    
    # Save all working RTSP URLs to .env
    for idx, (_, _, url) in enumerate(working_cameras, 1):
        env_content += f"CAM_{idx}_URL={url}\n"

    try:
        with open(env_path, "w") as env_file:
            env_file.write(env_content)
        print(f"✓ Environment configuration successfully written to: {env_path}")
    except Exception as e:
        print(f"✗ Failed to write .env file: {e}")
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
    total_cameras = len(cameras) if cameras else len(working_cameras)
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print(f"Auris Edge is configured and ready with {total_cameras} cameras.")
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
