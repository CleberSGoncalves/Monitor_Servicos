import time
import json
import threading
from datetime import datetime, timezone
import requests
from config import (
    TENANT_ID, CLIENT_ID, CLIENT_SECRET, SITE_ID,
    LIST_SERVICES_ID, LIST_CHANNELS_ID, DATA_DIR
)

CACHE_FILE = DATA_DIR / "fleet_cache.json"

_cache_lock = threading.Lock()
_cached_data = {
    "last_sync": None,
    "services": [],
    "channels": [],
    "stats": {},
    "recent_outages": [],
    "signal_history": {}
}


def get_graph_token() -> str:
    """Obtém o token OAuth2 de aplicativo via client_credentials."""
    url = f"https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/token"
    data = {
        "grant_type": "client_credentials",
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "scope": "https://graph.microsoft.com/.default"
    }
    resp = requests.post(url, data=data, timeout=8)
    resp.raise_for_status()
    return resp.json().get("access_token", "")


def fetch_all_items(token: str, list_id: str) -> list:
    """Busca todos os itens de uma lista SharePoint tratando paginação."""
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json"
    }
    url = f"https://graph.microsoft.com/v1.0/sites/{SITE_ID}/lists/{list_id}/items?$expand=fields&$top=200"
    items = []
    
    while url:
        resp = requests.get(url, headers=headers, timeout=12)
        if not resp.ok:
            break
        data = resp.json()
        val = data.get("value", [])
        items.extend(val)
        url = data.get("@odata.nextLink")
        
    return items


def sync_fleet_data():
    """Sincroniza as duas listas do SharePoint e computa métricas consolidadas."""
    global _cached_data
    try:
        token = get_graph_token()
        if not token:
            return

        raw_services = fetch_all_items(token, LIST_SERVICES_ID)
        raw_channels = fetch_all_items(token, LIST_CHANNELS_ID)

        services_list = []
        for it in raw_services:
            f = it.get("fields", {})
            services_list.append({
                "id": it.get("id"),
                "title": f.get("Title", "Brasil"),
                "hostname": f.get("Hostname", "N/A"),
                "praca": f.get("Pra_x00e7_a", "N/A"),
                "cs": f.get("CS", 1),
                "nome_servico": f.get("Nome_Servico", "N/A"),
                "versao_instalada": f.get("Versao_Instalada", "N/A"),
                "versao_desejada": f.get("Versao_Desejada", "N/A"),
                "status_servico": f.get("Status_Servico", "Desconhecido"),
                "status_atualizacao": f.get("Status_Atualizacao", "Desatualizado"),
                "acao_solicitada": f.get("Acao_Solicitada", "Nenhuma"),
                "ultima_atualizacao": f.get("Ultima_atualizacao", ""),
                "autorestart": f.get("AutoRestart", "Não"),
                "cpu_uso": f.get("Cpu_Uso", "N/A"),
                "ram_uso": f.get("Ram_Uso", "N/A"),
                "disco_d_livre": f.get("Disco_D_Livre_GB", "N/A"),
                "uptime": f.get("Uptime_Dias", "N/A"),
                "status_wcf": f.get("Status_WCF", "N/A"),
                "log_erro": f.get("Log_Erro_Servico", "")
            })

        channels_list = []
        outages = []
        
        for it in raw_channels:
            f = it.get("fields", {})
            ch_name = f.get("Title", "Canal")
            praca = f.get("Cidade", "N/A")
            is_frozen = "sim" in str(f.get("VideoCongelado", "")).lower()
            is_mute = "sim" in str(f.get("AudioMudo", "")).lower()
            sig_q = f.get("QualidadeSinal")
            sig_s = f.get("ForcaSinal")
            tuner_stat = f.get("StatusTuner", "N/A")
            rec_mp4 = f.get("GravandoMP4", "Não")
            
            # Meio de Transmissão e CS
            meio_str = str(f.get("MeiodeTransmiss_x00e3_o", "Digital Terrestre"))
            is_rtsp = "rtsp" in meio_str.lower() or "udp" in meio_str.lower() or "ip" in meio_str.lower()
            is_digital = "digital" in meio_str.lower() or "terrestre" in meio_str.lower()
            id_cs = f.get("IDCS", 1)

            # Classificação Preditiva de Falha e Queda
            has_outage = False
            motivo = "Estável"

            if is_frozen:
                has_outage = True
                motivo = "Vídeo Congelado"
            elif is_mute:
                has_outage = True
                motivo = "Áudio Mudo"
            elif "falha" in str(tuner_stat).lower() or "security" in str(tuner_stat).lower() or "500" in str(tuner_stat).lower() or "api" in str(tuner_stat).lower():
                has_outage = True
                motivo = "Falha API Atria (Porta 9000)" if ("api" in str(tuner_stat).lower() or "500" in str(tuner_stat).lower() or "security" in str(tuner_stat).lower()) else "Falha no Sintonizador TBS"
            elif is_rtsp:
                # Streams IP / RTSP: sinal vem nil="true", saúde é medida por status e gravação
                t_lower = str(tuner_stat).lower()
                if t_lower not in ["connected_working", "working", "connected", "lock", "n/a", ""] or "⚠️" in rec_mp4:
                    has_outage = True
                    motivo = f"Stream RTSP Interrompido ({tuner_stat})"
            elif is_digital:
                # Sinal Digital Terrestre
                if (sig_q == 0 or sig_q is None) and (sig_s == 0 or sig_s is None):
                    has_outage = True
                    motivo = "Sinal RF Zerado"
                elif sig_q is not None and 0 < sig_q < 45:
                    has_outage = True
                    motivo = f"Sinal RF Degradado / Instável ({sig_q}%) - Risco de Perda de Lock"

            ch_item = {
                "id": it.get("id"),
                "canal": ch_name,
                "veiculo": f.get("Veiculo", ch_name),
                "pais": f.get("Pais", "Brasil"),
                "cidade": praca,
                "id_host": f.get("IDHost", 1),
                "id_cs": id_cs,
                "cs": id_cs,
                "meio": meio_str,
                "frequencia": f.get("Frequencia", "N/A"),
                "tuner_id": f.get("TunerID", -1),
                "status_tuner": tuner_stat,
                "qualidade_sinal": sig_q if sig_q is not None else 0,
                "forca_sinal": sig_s if sig_s is not None else 0,
                "video_congelado": f.get("VideoCongelado", "Não"),
                "audio_mudo": f.get("AudioMudo", "Não"),
                "gravando_mp4": rec_mp4,
                "gravando_mp3": f.get("GravandoMP3", "Não"),
                "pasta_mp4": f.get("PastaGravacaoMP4", "N/A"),
                "pasta_mp3": f.get("PastaGravacaoMP3", "N/A"),
                "url_stream": f.get("UrlStreaming", "N/A"),
                "device_analog": f.get("SourceAnalogico", "N/A"),
                "atualizacao": f.get("Atualizacao", ""),
                "has_outage": has_outage
            }
            channels_list.append(ch_item)
            
            if has_outage:
                outages.append({
                    "canal": ch_name,
                    "praca": praca,
                    "id_cs": id_cs,
                    "cs": id_cs,
                    "tuner_id": ch_item["tuner_id"],
                    "motivo": motivo,
                    "detalhe": f"Meio: {meio_str} | Status: {tuner_stat} | Qualidade: {ch_item['qualidade_sinal']}% | Força: {ch_item['forca_sinal']}%",
                    "atualizacao": ch_item["atualizacao"]
                })

        # Métricas Globais da Frota
        now = datetime.now(timezone.utc)
        unique_hosts = set(s["hostname"] for s in services_list)
        
        hosts_offline = 0
        for h in unique_hosts:
            h_services = [s for s in services_list if s["hostname"] == h]
            dates = []
            for s in h_services:
                if s["ultima_atualizacao"]:
                    try:
                        dates.append(datetime.fromisoformat(s["ultima_atualizacao"].replace("Z", "+00:00")))
                    except Exception:
                        pass
            if dates:
                last_dt = max(dates)
                if (now - last_dt).total_seconds() > 3600 * 2: # Mais de 2 horas offline
                    hosts_offline += 1

        services_stopped = sum(1 for s in services_list if s["status_servico"] in ["Parado", "Inexistente"])
        services_crashloop = sum(1 for s in services_list if "crash-loop" in s["status_servico"].lower() or "crash-loop" in s["status_atualizacao"].lower())
        services_updating = sum(1 for s in services_list if s["status_atualizacao"] in ["Em Progresso", "Atualizando"])
        channels_down = sum(1 for c in channels_list if c["has_outage"])
        recordings_critical = sum(1 for c in channels_list if "⚠️" in c["gravando_mp4"])

        stats = {
            "total_hosts": len(unique_hosts),
            "hosts_online": len(unique_hosts) - hosts_offline,
            "hosts_offline": hosts_offline,
            "total_services": len(services_list),
            "services_running": len(services_list) - services_stopped,
            "services_stopped": services_stopped,
            "services_crashloop": services_crashloop,
            "services_updating": services_updating,
            "total_channels": len(channels_list),
            "channels_ok": len(channels_list) - channels_down,
            "channels_down": channels_down,
            "recordings_active": sum(1 for c in channels_list if "sim" in c["gravando_mp4"].lower()),
            "recordings_critical": recordings_critical
        }

        with _cache_lock:
            _cached_data["last_sync"] = datetime.now().isoformat()
            _cached_data["services"] = services_list
            _cached_data["channels"] = channels_list
            _cached_data["stats"] = stats
            _cached_data["recent_outages"] = outages

        try:
            with open(CACHE_FILE, "w", encoding="utf-8") as f:
                json.dump(_cached_data, f, ensure_ascii=False, indent=2)
        except Exception:
            pass

    except Exception as e:
        print(f"[SharePointSync Error] {e}", flush=True)


def get_cached_data() -> dict:
    """Retorna os dados da frota em cache com thread safety."""
    with _cache_lock:
        return _cached_data.copy()


def start_background_syncer(interval_seconds: int = 30):
    """Inicia thread em segundo plano para manter o cache sempre atualizado."""
    def worker():
        while True:
            sync_fleet_data()
            time.sleep(interval_seconds)

    t = threading.Thread(target=worker, daemon=True)
    t.start()
