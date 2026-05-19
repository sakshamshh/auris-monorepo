import sys

try:
    with open(r"C:\Users\SAKSHAM\Auris\src\main.py", "r", encoding="utf-8", errors="ignore") as f:
        print(f.read())
except Exception as e:
    print(f"Error: {e}")
