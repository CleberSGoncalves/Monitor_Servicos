import json
import sys
from collections import defaultdict

sys.stdout.reconfigure(encoding='utf-8')

with open('dashboard/data/fleet_cache.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

services = data.get("services", [])
channels = data.get("channels", [])

print(f"=== AUDITORIA GERAL DA FROTA (TOTAL: {len(services)} SERVIÇOS, {len(channels)} CANAIS) ===\n")

# 1. Hosts com CS Misto / Dividido (anomalia onde o mesmo hostname tem serviços em CS 1 e CS 2)
hosts_by_cs = defaultdict(set)
host_services = defaultdict(dict)
host_pracas = defaultdict(set)

for s in services:
    h = str(s.get("hostname", "")).strip()
    if not h or h == "N/A":
        continue
    cs_val = str(s.get("cs", "1")).replace(".0", "")
    hosts_by_cs[h].add(cs_val)
    praca = s.get("praca", "N/A")
    host_pracas[h].add(praca)
    svc_name = s.get("nome_servico", "")
    host_services[h][svc_name] = {
        "status": s.get("status_servico"),
        "cs": cs_val,
        "versao": s.get("versao_instalada"),
        "id": s.get("id")
    }

mixed_cs_hosts = {h: css for h, css in hosts_by_cs.items() if len(css) > 1}
print(f"1. HOSTS COM ANOMALIA DE CS DIVIDIDO (CS1 E CS2 NO MESMO HOST): {len(mixed_cs_hosts)}")
for h, css in mixed_cs_hosts.items():
    praca = list(host_pracas[h])[0] if host_pracas[h] else "N/A"
    print(f"   • {h} ({praca}): CSs encontrados = {list(css)}")
    for svc, details in host_services[h].items():
        if any(k in svc.lower() for k in ["detection", "matching", "configmonitor", "tracking", "monitorservice"]):
            print(f"       - {svc}: CS {details['cs']} | {details['status']} (v{details['versao']})")

# 2. Diagnóstico da Esteira de Detecção nos Hosts CS01
print(f"\n2. AUDITORIA DA ESTEIRA DE DETECÇÃO NOS CAPTURE SITES CS01:")
detection_anomalies = []
for h, svcs in host_services.items():
    # Identifica se é CS01
    css = hosts_by_cs[h]
    praca = list(host_pracas[h])[0] if host_pracas[h] else "N/A"
    
    det = svcs.get("DNA.DetectionSVC", {})
    fm = svcs.get("FastMatchingSvc", {})
    cfg = svcs.get("DNA.ConfigMonitorSVC", {})
    trk = svcs.get("DNA.TrackingSVC", {})
    agent = svcs.get("DNA.MonitorServiceSVC", {})
    
    det_status = str(det.get("status", "Inexistente"))
    fm_status = str(fm.get("status", "Inexistente"))
    cfg_status = str(cfg.get("status", "Inexistente"))
    trk_status = str(trk.get("status", "Inexistente"))
    
    det_run = "execu" in det_status.lower()
    fm_run = "execu" in fm_status.lower()
    cfg_run = "execu" in cfg_status.lower()
    trk_run = "execu" in trk_status.lower()
    
    # Inconsistência 1: Nenhum motor rodando
    if not det_run and not fm_run:
        detection_anomalies.append({
            "host": h, "praca": praca, "tipo": "SEM_MOTOR_MATCHING",
            "det": det_status, "fm": fm_status, "cfg": cfg_status, "trk": trk_status
        })
    # Inconsistência 2: Motor rodando mas ConfigMonitor parado (WCF bloqueado / tracking acumula)
    elif (det_run or fm_run) and not cfg_run:
        detection_anomalies.append({
            "host": h, "praca": praca, "tipo": "CONFIGMONITOR_PARADO_WCF_BLOQUEADO",
            "det": det_status, "fm": fm_status, "cfg": cfg_status, "trk": trk_status
        })
    # Inconsistência 3: Motor rodando mas Tracking parado
    elif (det_run or fm_run) and not trk_run:
        detection_anomalies.append({
            "host": h, "praca": praca, "tipo": "TRACKING_PARADO_DETECTION_ACUMULA",
            "det": det_status, "fm": fm_status, "cfg": cfg_status, "trk": trk_status
        })

print(f"   Total de hosts com inconsistências na esteira de detecção: {len(detection_anomalies)}")
for a in detection_anomalies[:20]:
    print(f"   • [{a['tipo']}] {a['host']} ({a['praca']}) | Det: {a['det']} | FM: {a['fm']} | CfgMonitor(WCF): {a['cfg']} | Tracking: {a['trk']}")
