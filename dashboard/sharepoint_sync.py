from signals_analysis import record_channels_telemetry_snapshot
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

        # Mapeia praças/CS com DNA.MediaConverter ativo para converter MP4 BKP em ASF
        converter_running_keys = {
            (s.get("praca", "").strip().lower(), int(float(s.get("cs", 1))))
            for s in services_list
            if "mediaconverter" in str(s.get("nome_servico", "")).lower() and s.get("status_servico") == "Em Execução"
        }

        # Mapeamento prévio de canais com gravação ativa por praça para análise contextual de redundância
        # Ex: Se SBT já grava ativamente via Streaming UDP em SJC, uma linha de antena Digital Terrestre
        # com sinal 0 e sem gravação é secundária/não cabeada e NÃO pode gerar alarme crítico P0 de queda!
        active_recordings_by_praca = {}
        for it in raw_channels:
            f_temp = it.get("fields", {})
            p_temp = f_temp.get("Cidade", "").strip().lower()
            ch_temp = f_temp.get("Title", "").strip()
            rec_mp4_t = str(f_temp.get("GravandoMP4", ""))
            rec_mp3_t = str(f_temp.get("GravandoMP3", ""))
            m_temp = str(f_temp.get("MeiodeTransmiss_x00e3_o", "")).lower()
            is_rad_t = any(x in m_temp for x in ["radio", "fm", "mp3"]) or any(x in ch_temp.lower() for x in ["rádio", "radio", " fm"])
            
            is_act_rec = (any(w in rec_mp3_t.lower() for w in ["sim", "gravando"])) if is_rad_t else (
                any(w in rec_mp4_t.lower() for w in ["sim", "gravando", "asf"]) and "⚠️" not in rec_mp4_t
            )
            if is_act_rec:
                if p_temp not in active_recordings_by_praca:
                    active_recordings_by_praca[p_temp] = []
                active_recordings_by_praca[p_temp].append({
                    "canal": ch_temp,
                    "veiculo": str(f_temp.get("Veiculo", "")).strip(),
                    "meio": m_temp,
                    "cs": f_temp.get("IDCS", 1)
                })
        
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
            m_lower = meio_str.lower()
            is_rtsp = any(x in m_lower for x in ["rtsp", "udp", "ip", "stream"])
            is_digital = any(x in m_lower for x in ["digital", "terrestre"])
            is_analog = any(x in m_lower for x in ["analóg", "analog", "directshow"])
            is_radio = (
                "radio" in m_lower
                or "fm" in m_lower
                or "mp3" in m_lower
                or "rádio" in ch_name.lower()
                or "radio" in ch_name.lower()
                or " fm" in ch_name.lower()
            )
            id_cs = f.get("IDCS", 1)
            parsed_cs = int(float(id_cs or 1))
            p_lower = praca.strip().lower()
            veic = str(f.get("Veiculo", "")).strip()

            # Regra Arquitetural DNA.MediaConverter:
            # Em CS02 ou nós com DNA.MediaConverterSVC ativo, o ATRIA grava BKP em .MP4 e o conversor
            # gera .ASF para D:\MediaDNA_V2\data\video. Se o conversor estiver rodando ou for CS 2,
            # nunca reportar falso alerta de "Sem Arquivos MP4" ou "Travado".
            is_converter_node = (p_lower, parsed_cs) in converter_running_keys or parsed_cs == 2 or "bkp" in ch_name.lower()
            if is_converter_node and ("sem arquivos" in rec_mp4.lower() or "travado" in rec_mp4.lower()):
                rec_mp4 = "Gravando (.ASF BKP)"

            rec_mp3 = f.get("GravandoMP3", "Não")
            is_rec_mp4 = any(w in rec_mp4.lower() for w in ["sim", "gravando", "asf"]) and ("⚠️" not in rec_mp4)
            is_rec_mp3 = any(w in str(rec_mp3).lower() for w in ["sim", "gravando"])
            is_recording = is_rec_mp3 if is_radio else (is_rec_mp4 or is_rec_mp3)

            t_lower = str(tuner_stat).lower()
            tuner_ok = any(w in t_lower for w in ["working", "ready", "connected", "lock", "ok"])

            # Validação contextual de redundância na mesma praça
            has_active_redundancy = False
            redundancy_note = ""
            for act in active_recordings_by_praca.get(p_lower, []):
                act_v = act.get("veiculo", "")
                act_ch = act.get("canal", "").lower()
                c_words = [w for w in ch_name.lower().split() if len(w) > 2 and w not in ['rede', 'tv', 'hd', 'digital', 'bkp']]
                same_veic = (veic and veic != "N/A" and not veic.isalpha() and veic == act_v)
                same_name = any(w in act_ch for w in c_words)
                if same_veic or same_name:
                    has_active_redundancy = True
                    redundancy_note = f"Gravação Ativa via {act.get('canal')} (Meio: {act.get('meio')})"
                    break

            # Classificação Preditiva de Falha e Queda baseada no Contexto Operacional Real
            has_outage = False
            is_degraded = False
            motivo = "Estável"

            if is_frozen:
                has_outage = True
                motivo = "Vídeo Congelado"
            elif is_mute and not is_radio and not is_rec_mp3:
                has_outage = True
                motivo = "Áudio Mudo"
            elif any(err in t_lower for err in ["falha", "security", "500"]):
                has_outage = True
                motivo = "Falha API Atria (Porta 9000)" if ("api" in t_lower or "500" in t_lower or "security" in t_lower) else "Falha no Sintonizador TBS"
            elif "⚠️" in rec_mp4:
                has_outage = True
                motivo = f"Erro de Gravação ({rec_mp4})"
            elif is_rtsp:
                # Streams IP / RTSP / UDP: Não possuem sinal RF / UHF. Integridade aferida por conexão e gravação.
                if not tuner_ok and not is_recording:
                    if has_active_redundancy:
                        motivo = f"Stream Secundário Inativo ({redundancy_note})"
                    else:
                        has_outage = True
                        motivo = f"Stream Interrompido ({tuner_stat})"
                elif not is_recording and not tuner_ok:
                    if has_active_redundancy:
                        motivo = f"Stream Secundário Inativo ({redundancy_note})"
                    else:
                        has_outage = True
                        motivo = f"Stream Sem Gravação Ativa ({tuner_stat})"
            elif is_digital:
                # Sinal Digital Terrestre: Portadora RF UHF
                if (sig_q == 0 or sig_q is None) and not is_recording:
                    if has_active_redundancy:
                        # Antena UHF sem sinal porque o canal é gravado via Streaming IP ou redundância na mesma praça
                        motivo = f"Operando via Streaming / Redundância ({redundancy_note})"
                    else:
                        has_outage = True
                        motivo = "Sinal RF Zerado e Sem Gravação"
                elif sig_q is not None and 0 < sig_q < 45:
                    if not is_recording:
                        if not has_active_redundancy:
                            has_outage = True
                            motivo = f"Sinal RF Degradado ({sig_q}%) e Sem Gravação"
                        else:
                            motivo = f"Sinal RF Secundário Degradado ({sig_q}%)"
                    else:
                        is_degraded = True
                        motivo = f"Sinal RF Degradado ({sig_q}%) - Margem Crítica"
            elif is_analog:
                # Analógico: Q=0 e S=0 é o comportamento padrão (não há portadora digital ISDB-Tb)
                if not is_recording and not tuner_ok:
                    if not has_active_redundancy:
                        has_outage = True
                        motivo = f"Canal Analógico Inativo ({tuner_stat})"
                    else:
                        motivo = f"Analógico Secundário Inativo ({redundancy_note})"
            else:
                # Outros meios
                if not is_recording and not tuner_ok:
                    if not has_active_redundancy:
                        has_outage = True
                        motivo = f"Canal Inativo ({tuner_stat})"

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
                "motivo": motivo,
                "has_outage": has_outage,
                "is_degraded": is_degraded
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
                    "meio": meio_str,
                    "detalhe": f"Meio: {meio_str} | Status: {tuner_stat} | Qualidade: {ch_item['qualidade_sinal']}% | Força: {ch_item['forca_sinal']}% | Gravação: {rec_mp4}",
                    "atualizacao": ch_item["atualizacao"]
                })

        record_channels_telemetry_snapshot(channels_list)
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

        services_stopped = sum(1 for s in services_list if s["status_servico"] == "Parado")
        services_inexistent = sum(1 for s in services_list if s["status_servico"] in ["Inexistente", "Não Encontrado"])
        services_crashloop = sum(1 for s in services_list if "crash-loop" in s["status_servico"].lower() or "crash-loop" in s["status_atualizacao"].lower())
        services_updating = sum(1 for s in services_list if s["status_atualizacao"] in ["Em Progresso", "Atualizando"])
        channels_down = sum(1 for c in channels_list if c["has_outage"])
        channels_degraded = sum(1 for c in channels_list if c.get("is_degraded", False))
        recordings_critical = sum(1 for c in channels_list if "⚠️" in str(c.get("gravando_mp4", "")))

        stats = {
            "total_hosts": len(unique_hosts),
            "hosts_online": len(unique_hosts) - hosts_offline,
            "hosts_offline": hosts_offline,
            "total_services": len(services_list),
            "services_running": sum(1 for s in services_list if s["status_servico"] == "Em Execução"),
            "services_stopped": services_stopped,
            "services_inexistent": services_inexistent,
            "services_crashloop": services_crashloop,
            "services_updating": services_updating,
            "total_channels": len(channels_list),
            "channels_ok": len(channels_list) - channels_down,
            "channels_down": channels_down,
            "channels_degraded": channels_degraded,
            "recordings_active": sum(1 for c in channels_list if "sim" in str(c.get("gravando_mp4", "")).lower() or "gravando" in str(c.get("gravando_mp4", "")).lower() or "asf" in str(c.get("gravando_mp4", "")).lower() or "sim" in str(c.get("gravando_mp3", "")).lower()),
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
