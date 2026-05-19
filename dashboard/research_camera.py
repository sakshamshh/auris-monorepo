import sys

with open(r"C:\Users\SAKSHAM\Auris\src\camera_worker.py", "r", encoding="utf-8", errors="ignore") as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if "conf" in line or "threshold" in line or "zone" in line or "entrance" in line:
        print(f"L{i}: {line.strip()}")
