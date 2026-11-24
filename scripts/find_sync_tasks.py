import os
for root, dirs, files in os.walk(r'E:\desenvolvimento\Monitor_Esportes'):
    if '.git' in root:
        continue
    for f in files:
        if any(k in f.lower() for k in ['sync', 'portal', 'sharepoint', 'cron', 'task', 'scheduler', 'build']):
            print(os.path.join(root, f))
