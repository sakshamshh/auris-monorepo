with open(r"C:\Users\SAKSHAM\Auris\src\report_generator.py", "r", encoding="utf-8", errors="ignore") as f:
    lines = f.readlines()
    print("Total lines:", len(lines))
    print("Last 15 lines:")
    for i, line in enumerate(lines[-15:]):
        print(f"[{len(lines) - 15 + i}] {line.rstrip()}")
