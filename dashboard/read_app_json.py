import sys
import json

try:
    with open(r"C:\Users\SAKSHAM\auris-app\app.json", "r", encoding="utf-8") as f:
        print(f.read())
except Exception as e:
    print(f"Error: {e}")
