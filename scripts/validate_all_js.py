import os
import subprocess

js_dir = r"dashboard\static\js"
errors = []
for f in os.listdir(js_dir):
    if f.endswith('.js'):
        p = os.path.join(js_dir, f)
        res = subprocess.run(["node", "-c", p], capture_output=True, text=True)
        if res.returncode != 0:
            errors.append((f, res.stderr.strip()))
        else:
            print(f"OK: {f}")

if errors:
    print("\n--- SYNTAX ERRORS FOUND ---")
    for f, err in errors:
        print(f"File {f}: {err}\n")
else:
    print("\nALL JS FILES ARE 100% VALID!")
