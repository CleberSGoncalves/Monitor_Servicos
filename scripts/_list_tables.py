import sqlite3
conn = sqlite3.connect("dashboard/data/fleet.db")
c = conn.cursor()
c.execute("SELECT name FROM sqlite_master WHERE type='table'")
print("Tabelas:", [r[0] for r in c.fetchall()])
conn.close()
