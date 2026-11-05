import json, os

with open("dashboard/data/fleet_cache.json", "r", encoding="utf-8") as f:
    cache = json.load(f)

# 1. Services mapping
s_dict = {}
for s in cache.get("services", []):
    h = s.get("hostname")
    ns = s.get("nome_servico")
    sid = s.get("id")
    if h and ns and sid:
        s_dict[f"{str(h).strip()}_{str(ns).strip()}"] = str(sid)

# 2. Channels mapping
c_dict = {}
for c in cache.get("channels", []):
    canal = c.get("canal")
    cs = c.get("cs")
    cid = c.get("id")
    if canal and cs and cid:
        try:
            cs_int = int(float(cs))
            cid_clean = str(cid).split("_")[0]
            c_dict[f"{str(canal).strip()}_{cs_int}"] = str(cid_clean)
            c_dict[str(canal).strip()] = str(cid_clean)
        except Exception:
            pass

target_dirs = [
    "WinServiceFleetAgent",
    "publish/agent"
]

for d in target_dirs:
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "sharepoint_service_ids.json"), "w", encoding="utf-8") as f:
        json.dump(s_dict, f, indent=2, ensure_ascii=False)
    with open(os.path.join(d, "sharepoint_channel_ids.json"), "w", encoding="utf-8") as f:
        json.dump(c_dict, f, indent=2, ensure_ascii=False)

print(f"Salvos {len(s_dict)} servicos e {len(c_dict)} canais em {target_dirs}")
