import os
import sys
import time
import logging
import threading
import hashlib
import requests
from dotenv import load_dotenv

# Defaults to /opt/auris/ but handles Windows local dev gracefully
BASE_DIR = "/opt/auris" if os.name != "nt" else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_PATH = os.path.join(BASE_DIR, ".env")

class OTAUpdater:
    """
    Over-The-Air Update Engine for the Edge Device.
    Periodically checks the remote HTTP endpoint for updates.
    If an update is found, it downloads it and gracefully restarts the Python process.
    """
    def __init__(self, check_interval_seconds=3600, logger=None):
        self.check_interval = check_interval_seconds
        self.logger = logger or logging.getLogger(__name__)
        self.running = False
        self.thread = None
        # Load environment variables
        if os.path.exists(ENV_PATH):
            load_dotenv(ENV_PATH)

    def start(self):
        self.running = True
        self.thread = threading.Thread(target=self._update_loop, daemon=True)
        self.thread.start()
        self.logger.info(f"[OTA Updater] Started background HTTP watcher (interval: {self.check_interval}s)")

    def stop(self):
        self.running = False

    def _update_loop(self):
        # Give the main app some time to start up before checking for updates
        time.sleep(10)
        
        while self.running:
            try:
                self.logger.debug("[OTA Updater] Checking for remote updates...")
                
                # Reload env in case it was updated
                if os.path.exists(ENV_PATH):
                    load_dotenv(ENV_PATH)
                    
                endpoint = os.getenv("CLOUD_ENDPOINT", "https://auris.skymlabs.com/api/frames")
                api_key = os.getenv("CLOUD_API_KEY", "")
                
                base_url = endpoint.rsplit("/api/", 1)[0]
                download_url = f"{base_url}/api/edge/download/edge_worker"
                
                headers = {}
                if api_key:
                    headers["X-API-Key"] = api_key
                
                resp = requests.get(download_url, headers=headers, timeout=30)
                if resp.status_code == 200:
                    downloaded_content = resp.content
                    downloaded_hash = hashlib.sha256(downloaded_content).hexdigest()
                    
                    running_file = "/opt/auris/src/edge_worker.py"
                    
                    # Compute hash of currently running file
                    current_hash = ""
                    if os.path.exists(running_file):
                        h = hashlib.sha256()
                        with open(running_file, "rb") as f:
                            while chunk := f.read(8192):
                                h.update(chunk)
                        current_hash = h.hexdigest()
                    
                    if downloaded_hash != current_hash:
                        self.logger.warning("[OTA Updater] New version detected! Initiating OTA Update...")
                        
                        # Ensure directory exists
                        os.makedirs(os.path.dirname(running_file), exist_ok=True)
                        
                        # Write new file
                        with open(running_file, "wb") as f:
                            f.write(downloaded_content)
                            
                        self.logger.warning("OTA update applied")
                        time.sleep(2)  # Give logs a moment to flush
                        
                        # Gracefully restart the current Python process
                        os.execv(sys.executable, ['python'] + sys.argv)
                    else:
                        self.logger.debug("[OTA Updater] Edge system is up to date.")
                elif resp.status_code == 401:
                    self.logger.error(f"[OTA Updater] Unauthorized (401) fetching update. Check CLOUD_API_KEY.")
                elif resp.status_code == 404:
                    self.logger.error(f"[OTA Updater] Update file not found on server (404).")
                else:
                    self.logger.error(f"[OTA Updater] Failed to check for update. Status code: {resp.status_code}")
                    
            except Exception as e:
                self.logger.error(f"[OTA Updater] Unexpected error: {e}")
                
            # Wait for the next check interval
            time.sleep(self.check_interval)

