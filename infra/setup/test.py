#!/usr/bin/env python3
"""
AURIS API Verification Test Script.
Verifies all API routes are functioning correctly.
Run manually before any deployment.
"""

import os
import sys
import time
import subprocess
from pathlib import Path

import httpx
from dotenv import load_dotenv
from colorama import init, Fore, Style

# Initialize colorama
init(autoreset=True)

# Reconfigure stdout to use UTF-8 to handle unicode symbols on Windows
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Load environment variables from .env if present
load_dotenv()

# Configuration defaults
API_BASE = os.getenv("API_BASE", "https://auris.skymlabs.com").rstrip("/")
ADMIN_KEY = os.getenv("ADMIN_KEY", "PandatThelka")
TEST_STORE_ID = os.getenv("TEST_STORE_ID", "sharma_fab_1")
TEST_PASSWORD = os.getenv("TEST_PASSWORD", "auris123")

def test_server_health(client):
    try:
        start_time = time.perf_counter()
        r = client.get("/")
        duration = (time.perf_counter() - start_time) * 1000
        return "PASS", duration, ""
    except httpx.ConnectError:
        return "FAIL", 0, "Server unreachable"
    except httpx.TimeoutException:
        return "FAIL", 15000, "Request timeout"
    except httpx.RequestError:
        return "FAIL", 0, "Server unreachable"

def test_login(client):
    try:
        start_time = time.perf_counter()
        r = client.post(
            "/api/login",
            json={"store_id": TEST_STORE_ID, "password": TEST_PASSWORD}
        )
        duration = (time.perf_counter() - start_time) * 1000
        
        if r.status_code == 401:
            return "FAIL", duration, "Auth failed"
        elif r.status_code == 404:
            return "FAIL", duration, "Route not found"
        elif r.status_code == 500:
            return "FAIL", duration, "Server error"
        elif r.is_error:
            return "FAIL", duration, f"HTTP status {r.status_code}"
            
        data = r.json()
        if "store_id" not in data or "store_name" not in data:
            return "FAIL", duration, "Missing store_id/store_name in response"
            
        return "PASS", duration, ""
    except httpx.ConnectError:
        return "FAIL", 0, "Server unreachable"
    except httpx.TimeoutException:
        return "FAIL", 15000, "Request timeout"
    except httpx.RequestError as e:
        return "FAIL", 0, f"Network error: {str(e)}"
    except ValueError:
        return "FAIL", duration, "Invalid JSON response"

def test_factory_onboard(client):
    try:
        start_time = time.perf_counter()
        headers = {"X-Admin-Key": ADMIN_KEY}
        body = {
            "store_id": TEST_STORE_ID,
            "factory_name": "Sharma Fab 1",
            "city": "Jaipur",
            "numShifts": 1,
            "shifts": [
                {
                    "label": "Day Shift",
                    "startTime": "09:00",
                    "endTime": "17:00",
                    "days": {
                        "monday": True,
                        "tuesday": True,
                        "wednesday": True,
                        "thursday": True,
                        "friday": True,
                        "saturday": True,
                        "sunday": False
                    }
                }
            ],
            "totalHeadcount": 10,
            "operatorWage": 500,
            "supervisorWage": 800,
            "contractorWage": 600,
            "whatsAppNumber": "+919999999999"
        }
        r = client.post("/api/factory/onboard", headers=headers, json=body)
        duration = (time.perf_counter() - start_time) * 1000
        
        if r.status_code == 401:
            return "FAIL", duration, "Auth failed"
        elif r.status_code == 404:
            return "FAIL", duration, "Route not found"
        elif r.status_code == 500:
            return "FAIL", duration, "Server error"
        elif r.is_error:
            return "FAIL", duration, f"HTTP status {r.status_code}"
            
        data = r.json()
        if not data.get("success"):
            return "FAIL", duration, "Expected success: true in response"
            
        return "PASS", duration, ""
    except httpx.ConnectError:
        return "FAIL", 0, "Server unreachable"
    except httpx.TimeoutException:
        return "FAIL", 15000, "Request timeout"
    except httpx.RequestError as e:
        return "FAIL", 0, f"Network error: {str(e)}"
    except ValueError:
        return "FAIL", duration, "Invalid JSON response"

def test_factory_zones(client):
    try:
        start_time = time.perf_counter()
        headers = {
            "X-Store-ID": TEST_STORE_ID,
            "X-Password": TEST_PASSWORD,
            "X-Admin-Key": ADMIN_KEY
        }
        # Provide store_id query parameter since the FastAPI endpoint expects it
        params = {"store_id": TEST_STORE_ID}
        r = client.get("/api/factory/zones", headers=headers, params=params)
        duration = (time.perf_counter() - start_time) * 1000
        
        if r.status_code == 401:
            return "FAIL", duration, "Auth failed"
        elif r.status_code == 404:
            return "FAIL", duration, "Route not found"
        elif r.status_code == 500:
            return "FAIL", duration, "Server error"
        elif r.is_error:
            return "FAIL", duration, f"HTTP status {r.status_code}"
            
        return "PASS", duration, ""
    except httpx.ConnectError:
        return "FAIL", 0, "Server unreachable"
    except httpx.TimeoutException:
        return "FAIL", 15000, "Request timeout"
    except httpx.RequestError as e:
        return "FAIL", 0, f"Network error: {str(e)}"

def test_factory_get_route(client, route, expect_keys=None, headers=None):
    try:
        start_time = time.perf_counter()
        req_headers = {
            "X-Store-ID": TEST_STORE_ID,
            "X-Password": TEST_PASSWORD,
            **(headers or {})
        }
        r = client.get(route, headers=req_headers)
        duration = (time.perf_counter() - start_time) * 1000
        
        if r.status_code == 401:
            return "FAIL", duration, "Auth failed"
        elif r.status_code == 404:
            return "FAIL", duration, "Route not found"
        elif r.status_code == 500:
            return "FAIL", duration, "Server error"
        elif r.is_error:
            return "FAIL", duration, f"HTTP status {r.status_code}"
            
        if expect_keys:
            data = r.json()
            for key in expect_keys:
                if key not in data:
                    return "FAIL", duration, f"Missing '{key}' in response"
                    
        return "PASS", duration, ""
    except httpx.ConnectError:
        return "FAIL", 0, "Server unreachable"
    except httpx.TimeoutException:
        return "FAIL", 15000, "Request timeout"
    except httpx.RequestError as e:
        return "FAIL", 0, f"Network error: {str(e)}"
    except ValueError:
        return "FAIL", duration, "Invalid JSON response"

def test_factory_configs_admin(client):
    try:
        start_time = time.perf_counter()
        headers = {"X-Admin-Key": ADMIN_KEY}
        r = client.get("/api/factory/configs", headers=headers)
        duration = (time.perf_counter() - start_time) * 1000
        
        if r.status_code == 401:
            return "FAIL", duration, "Auth failed"
        elif r.status_code == 404:
            return "FAIL", duration, "Route not found"
        elif r.status_code == 500:
            return "FAIL", duration, "Server error"
        elif r.is_error:
            return "FAIL", duration, f"HTTP status {r.status_code}"
            
        return "PASS", duration, ""
    except httpx.ConnectError:
        return "FAIL", 0, "Server unreachable"
    except httpx.TimeoutException:
        return "FAIL", 15000, "Request timeout"
    except httpx.RequestError as e:
        return "FAIL", 0, f"Network error: {str(e)}"

def test_retail_route(client, route):
    try:
        start_time = time.perf_counter()
        headers = {
            "X-Store-ID": "test_store2",
            "X-Password": "auris123"
        }
        r = client.get(route, headers=headers)
        duration = (time.perf_counter() - start_time) * 1000
        
        if r.status_code == 401:
            return "FAIL", duration, "Auth failed"
        elif r.status_code == 404:
            return "FAIL", duration, "Route not found"
        elif r.status_code == 500:
            return "FAIL", duration, "Server error"
        elif r.is_error:
            return "FAIL", duration, f"HTTP status {r.status_code}"
            
        return "PASS", duration, ""
    except httpx.ConnectError:
        return "FAIL", 0, "Server unreachable"
    except httpx.TimeoutException:
        return "FAIL", 15000, "Request timeout"
    except httpx.RequestError as e:
        return "FAIL", 0, f"Network error: {str(e)}"

def test_whatsapp_logs(client):
    try:
        start_time = time.perf_counter()
        headers = {"X-Admin-Key": ADMIN_KEY}
        r = client.get("/api/whatsapp/logs", headers=headers, params={"store_id": "sharma_fab_1"})
        duration = (time.perf_counter() - start_time) * 1000
        
        if r.status_code == 401:
            return "FAIL", duration, "Auth failed"
        elif r.status_code == 404:
            return "FAIL", duration, "Route not found"
        elif r.status_code == 500:
            return "FAIL", duration, "Server error"
        elif r.is_error:
            return "FAIL", duration, f"HTTP status {r.status_code}"
            
        data = r.json()
        if "logs" not in data:
            return "FAIL", duration, "Missing 'logs' in response"
            
        return "PASS", duration, ""
    except httpx.ConnectError:
        return "FAIL", 0, "Server unreachable"
    except httpx.TimeoutException:
        return "FAIL", 15000, "Request timeout"
    except httpx.RequestError as e:
        return "FAIL", 0, f"Network error: {str(e)}"
    except ValueError:
        return "FAIL", duration, "Invalid JSON response"

def test_pdf_report(client):
    try:
        start_time = time.perf_counter()
        headers = {
            "X-Store-ID": TEST_STORE_ID,
            "X-Password": TEST_PASSWORD
        }
        r = client.get("/api/factory/report/pdf", headers=headers)
        duration = (time.perf_counter() - start_time) * 1000
        
        if r.status_code == 401:
            return "FAIL", duration, "Auth failed"
        elif r.status_code == 404:
            return "FAIL", duration, "Route not found"
        elif r.status_code == 500:
            return "FAIL", duration, "Server error"
        elif r.is_error:
            return "FAIL", duration, f"HTTP status {r.status_code}"
            
        content_type = r.headers.get("content-type", "")
        if "application/pdf" not in content_type:
            return "FAIL", duration, f"Expected application/pdf, got '{content_type}'"
            
        return "PASS", duration, ""
    except httpx.ConnectError:
        return "FAIL", 0, "Server unreachable"
    except httpx.TimeoutException:
        return "FAIL", 15000, "Request timeout"
    except httpx.RequestError as e:
        return "FAIL", 0, f"Network error: {str(e)}"

def test_aggregator_syntax():
    files = [
        "aggregator/zone_hour.py",
        "aggregator/pattern.py",
        "aggregator/bottleneck.py"
    ]
    # Check if files exist relative to current working directory
    # Only works when run on the server itself.
    if not os.path.exists("aggregator/zone_hour.py"):
        return "SKIP", 0, "run on server only"
        
    start_time = time.perf_counter()
    for f in files:
        if not os.path.exists(f):
            return "FAIL", 0, f"File {f} not found"
        try:
            res = subprocess.run(
                [sys.executable, "-m", "py_compile", f],
                capture_output=True,
                text=True,
                check=False
            )
            if res.returncode != 0:
                err = res.stderr.strip() or res.stdout.strip() or "Syntax error"
                err_lines = err.splitlines()
                brief_err = err_lines[-1] if err_lines else err
                return "FAIL", (time.perf_counter() - start_time) * 1000, f"Compile error in {f}: {brief_err}"
        except Exception as e:
            return "FAIL", 0, f"Failed to execute py_compile: {str(e)}"
            
    duration = (time.perf_counter() - start_time) * 1000
    return "PASS", duration, ""

def test_edge_download(client):
    try:
        start_time = time.perf_counter()
        
        # 1. Get the API key for the test store
        headers = {"X-Admin-Key": ADMIN_KEY}
        r = client.get(f"/api/admin/stores/{TEST_STORE_ID}", headers=headers)
        if r.status_code == 200:
            api_key = r.json().get("api_key", os.getenv("TEST_API_KEY", "test"))
        else:
            api_key = os.getenv("TEST_API_KEY", "test")
            
        # 2. Test the edge worker download endpoint with the real API key
        r2 = client.get("/api/edge/download/edge_worker", headers={"X-API-Key": api_key})
        duration = (time.perf_counter() - start_time) * 1000
        
        if r2.status_code == 401:
            return "FAIL", duration, "Auth failed"
        elif r2.is_error:
            return "FAIL", duration, f"HTTP status {r2.status_code}"
            
        return "PASS", duration, ""
    except httpx.ConnectError:
        return "FAIL", 0, "Server unreachable"
    except Exception as e:
        return "FAIL", 0, str(e)

def main():
    print(f"\n🚀 {Fore.CYAN}Starting Auris API Routes Verification...{Style.RESET_ALL}")
    print(f"🔗 {Fore.WHITE}API Base Url: {API_BASE}{Style.RESET_ALL}\n")

    # Define test suite
    test_cases = [
        (1, "Server reachable", lambda c: test_server_health(c)),
        (2, "Login route", lambda c: test_login(c)),
        (3, "Factory onboard route", lambda c: test_factory_onboard(c)),
        (4, "Factory zones route", lambda c: test_factory_zones(c)),
        (5, "Dead time route", lambda c: test_factory_get_route(c, "/api/factory/deadtime", ["summary", "by_zone"])),
        (6, "Bottleneck route", lambda c: test_factory_get_route(c, "/api/factory/bottleneck")),
        (7, "Patterns route", lambda c: test_factory_get_route(c, "/api/factory/patterns")),
        (8, "Factory configs admin route", lambda c: test_factory_configs_admin(c)),
        (9, "WhatsApp logs route", lambda c: test_whatsapp_logs(c)),
        (10, "PDF report route", lambda c: test_pdf_report(c)),
        (11, "Aggregator syntax check", lambda c: test_aggregator_syntax()),
        (12, "Edge download endpoint", lambda c: test_edge_download(c)),
        (13, "Live snapshot endpoint", lambda c: test_factory_get_route(
            c, f"/api/live/snapshot?store_id={TEST_STORE_ID}&camera_id=cam1",
            headers={"X-Admin-Key": ADMIN_KEY}
        )),
        (14, "Training stats endpoint", lambda c: test_factory_get_route(
            c, "/api/training/stats",
            headers={"X-Admin-Key": ADMIN_KEY}
        ))
    ]

    passed = 0
    failed = 0
    skipped = 0
    total = len(test_cases)

    # Run tests using a single httpx Client for connection pooling
    with httpx.Client(base_url=API_BASE, timeout=15.0) as client:
        for idx, label, test_fn in test_cases:
            # Print temporary running indicator
            print(f"  ⌛ Running [{idx}/{total}]: {label}...", end="\r", flush=True)
            
            try:
                if idx == 11:
                    status, duration, err_msg = test_aggregator_syntax()
                else:
                    status, duration, err_msg = test_fn(client)
            except Exception as e:
                status, duration, err_msg = "FAIL", 0, str(e)
            
            # Clear the temporary line
            print(" " * 80, end="\r", flush=True)
            
            # Format and print the final result line
            if status == "PASS":
                passed += 1
                formatted_line = f"  {Fore.GREEN}✓ PASS{Style.RESET_ALL}  {label:<26}({duration:.0f}ms)"
            elif status == "FAIL":
                failed += 1
                formatted_line = f"  {Fore.RED}✗ FAIL{Style.RESET_ALL}  {label:<26}({duration:.0f}ms) — {err_msg}"
            else:  # SKIP
                skipped += 1
                formatted_line = f"  {Fore.YELLOW}⚠ SKIP{Style.RESET_ALL}  {label:<26}— {err_msg}"
                
            print(formatted_line)

    # Clear screen space and print consolidated results in the exact requested format
    print(f"\n  {Fore.CYAN}{'─' * 37}{Style.RESET_ALL}")
    print(f"  Results: {passed} passed  {failed} failed  {skipped} skipped")
    print(f"  {Fore.CYAN}{'─' * 37}{Style.RESET_ALL}\n")

    if failed > 0:
        print(f"❌ {Fore.RED}Fix failures before deploying.{Style.RESET_ALL}")
        sys.exit(1)
    else:
        print(f"✅ {Fore.GREEN}All systems go. Safe to deploy.{Style.RESET_ALL}")
        sys.exit(0)

if __name__ == "__main__":
    main()

