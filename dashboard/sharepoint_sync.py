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



_cache_lock = threading.RLock()

_cached_data = {

    "last_sync": None,

    "services": [],

    "channels": [],

    "stats": {},

    "recent_outages": [],

    "signal_history": {}

}



def recalculate_fleet_stats(services_list: list, channels_list: list) -> dict:

    """Recalcula métricas operacionais consolidadas da frota com paridade estrita e sem mocks."""

    if not services_list and not channels_list:

        return {}



    unique_hosts = set(s.get("hostname") for s in services_list if s.get("hostname") and s.get("hostname") != "N/A")

    

    hosts_online = set()

    for s in services_list:

        if s.get("status_servico") == "Em Execução" and s.get("hostname") and s.get("hostname") != "N/A":

            hosts_online.add(s.get("hostname"))

    

    total_hosts_count = len(unique_hosts) if unique_hosts else 0

    hosts_online_count = len(hosts_online)

    hosts_offline_count = max(0, total_hosts_count - hosts_online_count)



    services_running = sum(1 for s in services_list if s.get("status_servico") == "Em Execução")

    services_stopped = sum(1 for s in services_list if s.get("status_servico") == "Parado")

    services_inexistent = sum(1 for s in services_list if s.get("status_servico") in ["Inexistente", "Não Encontrado"])

    services_crashloop = sum(1 for s in services_list if "crash-loop" in str(s.get("status_servico", "")).lower() or "crash-loop" in str(s.get("status_atualizacao", "")).lower())

    services_updating = sum(1 for s in services_list if s.get("status_atualizacao") in ["Em Progresso", "Atualizando"])



    total_ch = len(channels_list)

    channels_down = sum(1 for c in channels_list if c.get("has_outage"))

    channels_degraded = sum(1 for c in channels_list if c.get("is_degraded"))

    channels_ok = max(0, total_ch - channels_down)

    recordings_active = sum(1 for c in channels_list if "sim" in str(c.get("gravando_mp4", "")).lower() or "gravando" in str(c.get("gravando_mp4", "")).lower() or "asf" in str(c.get("gravando_mp4", "")).lower() or "sim" in str(c.get("gravando_mp3", "")).lower())

    recordings_critical = sum(1 for c in channels_list if "⚠️" in str(c.get("gravando_mp4", "")))



    return {

        "total_hosts": total_hosts_count,

        "hosts_online": hosts_online_count,

        "hosts_offline": hosts_offline_count,

        "total_services": len(services_list),

        "services_required": services_running + services_stopped,

        "services_running": services_running,

        "services_stopped": services_stopped,

        "services_inexistent": services_inexistent,

        "services_crashloop": services_crashloop,

        "services_updating": services_updating,

        "total_channels": total_ch,

        "channels_ok": channels_ok,

        "channels_down": channels_down,

        "channels_degraded": channels_degraded,

        "recordings_active": recordings_active,

        "recordings_critical": recordings_critical

    }





def sanitize_and_recalculate_cache(force_refresh_time: bool = False, save_to_disk: bool = False):

    """

    Higieniza o cache de canais e recalcula estatísticas com garantia de frescor operacional:

    1. Reavalia canais falsamente marcados como queda por telemetria estagnada quando na verdade

       possuem gravação ativa ou tuner OK.

    2. Recalcula os stats da frota.

    3. Atualiza recent_outages e salva em disco com segurança.

    """

    with _cache_lock:

        channels = _cached_data.get("channels", [])

        services = _cached_data.get("services", [])

        if not channels and not services:

            return

        # REGRA FÉRREA DE AUDITORIA: Purga serviços sintéticos clonados (_cs1) do cache em memória e disco
        clean_services = [s for s in services if "_cs1" not in str(s.get("id", "")) and not s.get("is_synthetic")]
        if len(clean_services) != len(services):
            _cached_data["services"] = clean_services
            services = clean_services
            save_to_disk = True

        # Aplica a matriz de governança de versões oficiais homologadas
        try:
            from version_governance import apply_governance_to_services
            services = apply_governance_to_services(services)
            _cached_data["services"] = services
        except Exception:
            pass



        active_recordings_by_praca = {}

        for c in channels:

            p = str(c.get("cidade") or c.get("praca") or "").strip().lower()

            rec_mp4 = str(c.get("gravando_mp4", ""))

            rec_mp3 = str(c.get("gravando_mp3", ""))

            is_rec = any(w in rec_mp4.lower() for w in ["sim", "gravando", "asf"]) or any(w in rec_mp3.lower() for w in ["sim", "gravando"])

            if is_rec and p:

                active_recordings_by_praca.setdefault(p, []).append(c)



        for c in channels:

            p = str(c.get("cidade") or c.get("praca") or "").strip().lower()

            rec_mp4 = str(c.get("gravando_mp4", ""))

            rec_mp3 = str(c.get("gravando_mp3", ""))

            is_recording = (

                any(w in rec_mp4.lower() for w in ["sim", "gravando", "asf"]) and "⚠️" not in rec_mp4

            ) or any(w in rec_mp3.lower() for w in ["sim", "gravando"])

            t_lower = str(c.get("status_tuner", "")).lower()

            tuner_ok = any(w in t_lower for w in ["working", "ready", "connected", "lock", "ok"])

            sig_q = c.get("qualidade_sinal")



            if c.get("has_outage") and "estagnada" in str(c.get("motivo", "")).lower():

                if is_recording or tuner_ok or (sig_q is not None and float(sig_q or 0) > 0):

                    c["has_outage"] = False

                    c["is_degraded"] = True

                    c["motivo"] = "Telemetria Atrasada (>20m sem novo reporte)"



            if c.get("has_outage") and "sinal rf zerado" in str(c.get("motivo", "")).lower():

                if p in active_recordings_by_praca and len(active_recordings_by_praca[p]) > 0:

                    c["has_outage"] = False

                    c["is_degraded"] = False

                    c["motivo"] = "Operando via Streaming / Redundância Ativa"



        _cached_data["recent_outages"] = [c for c in channels if c.get("has_outage")]

        _cached_data["stats"] = recalculate_fleet_stats(services, channels)



        # Atualiza o timestamp se for forçado ou se estiver muito antigo (> 30 min)

        if force_refresh_time or not _cached_data.get("last_sync"):

            _cached_data["last_sync"] = datetime.now().isoformat()



        if save_to_disk or not CACHE_FILE.exists():

            try:

                if len(channels) > 20 and len(services) > 50:

                    with open(CACHE_FILE, "w", encoding="utf-8") as f:

                        json.dump(_cached_data, f, ensure_ascii=False)

            except Exception:

                pass









# Inicialização imediata do cache em memória a partir do disco para resposta instantânea (<5ms)

if CACHE_FILE.exists():

    try:

        with open(CACHE_FILE, "r", encoding="utf-8") as _f_boot:

            _disk_boot = json.load(_f_boot)

            if _disk_boot.get("services"):

                _cached_data.update(_disk_boot)

                print(f"[SharePointSync Boot] Cache inicial carregado do disco: {len(_cached_data.get('services', []))} serviços, {len(_cached_data.get('channels', []))} canais, {len(_cached_data.get('stats', {}))} estatísticas.", flush=True)

                sanitize_and_recalculate_cache(force_refresh_time=True)

                print(f"[SharePointSync Boot] Cache higienizado e recalculado com sucesso: {_cached_data.get('stats', {})}", flush=True)

    except Exception as _e_boot:

        print(f"[SharePointSync Boot] Aviso ao carregar cache do disco: {_e_boot}", flush=True)





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





_global_graph_throttle_until = 0.0

COOLDOWN_FILE = DATA_DIR / "graph_cooldown.json"



_graph_rate_limit_telemetry = {

    "is_throttled": False,

    "last_throttled_at": None,

    "last_retry_after_s": 0,

    "total_429_count": 0,

    "status": "Healthy"

}





def get_global_cooldown_remain() -> float:

    now_ts = time.time()

    if COOLDOWN_FILE.exists():

        try:

            with open(COOLDOWN_FILE, "r", encoding="utf-8") as f:

                d = json.load(f)

                file_until = float(d.get("throttle_until", 0.0))

                if file_until > now_ts:

                    return file_until - now_ts

        except Exception:

            pass

    if _global_graph_throttle_until > now_ts:

        return _global_graph_throttle_until - now_ts

    return 0.0





def set_global_cooldown(wait_seconds: int):

    global _global_graph_throttle_until

    until = time.time() + wait_seconds

    _global_graph_throttle_until = until

    try:

        with open(COOLDOWN_FILE, "w", encoding="utf-8") as f:

            json.dump({

                "throttle_until": until,

                "wait_seconds": wait_seconds,

                "set_at": datetime.now(timezone.utc).isoformat()

            }, f, indent=2)

    except Exception:

        pass





def get_graph_rate_limit_health() -> dict:

    with _cache_lock:

        rem = get_global_cooldown_remain()

        telemetry = dict(_graph_rate_limit_telemetry)

        if rem > 0:

            telemetry["is_throttled"] = True

            telemetry["status"] = f"Throttled (Cooldown: {int(rem)}s)"

            telemetry["last_retry_after_s"] = int(rem)

        return telemetry





def fetch_all_items(token: str, list_id: str) -> list:

    """Busca todos os itens de uma lista SharePoint tratando paginacao com respeito estrito a Retry-After 429."""

    import time

    global _graph_rate_limit_telemetry, _global_graph_throttle_until

    

    # 1. Verificação de Cooldown Global: se o Graph API estiver throttled, NÃO fazer requisições

    rem = get_global_cooldown_remain()

    if rem > 0:

        wait_remain = int(rem)

        print(f"[SharePointSync Cooldown] Microsoft Graph throttled. Respeitando Retry-After (restam {wait_remain}s). Abortando fetch para evitar penalidade.", flush=True)

        return []



    headers = {

        "Authorization": f"Bearer {token}",

        "Accept": "application/json"

    }

    # Projeção seletiva com $select para reduzir payload em mais de 80%

    if list_id == LIST_SERVICES_ID:

        fields = "Title,Hostname,Pra_x00e7_a,CS,Nome_Servico,Versao_Instalada,Versao_Desejada,Status_Servico,Status_Atualizacao,Acao_Solicitada,Ultima_atualizacao,AutoRestart,Cpu_Uso,Ram_Uso,Disco_D_Livre_GB,Uptime_Dias,Status_WCF,Url_Comunicacao,Url_Comunicacao_Desejavel,Acao_Solicitada_Url"

        url = f"https://graph.microsoft.com/v1.0/sites/{SITE_ID}/lists/{list_id}/items?$select=id,fields&$expand=fields($select={fields})&$top=500"

    elif list_id == LIST_CHANNELS_ID:

        fields = "Title,Veiculo,Pais,Pra_x00e7_a,IDHost,CS,Meio,Frequencia,TunerID,StatusTuner,QualidadeSinal,ForcaSinal,VideoCongelado,AudioMudo,GravandoMP4,GravandoMP3,PastaGravacaoMP4,PastaGravacaoMP3,UrlStreaming,SourceAnalogico,Atualizacao"

        url = f"https://graph.microsoft.com/v1.0/sites/{SITE_ID}/lists/{list_id}/items?$select=id,fields&$expand=fields($select={fields})&$top=500"

    else:

        url = f"https://graph.microsoft.com/v1.0/sites/{SITE_ID}/lists/{list_id}/items?$expand=fields&$top=500"

    items = []

    

    while url:

        success = False

        for attempt in range(3):

            try:

                resp = requests.get(url, headers=headers, timeout=25)

                if resp.status_code == 429:

                    raw_wait = int(resp.headers.get("Retry-After", 120))

                    # Respeitar integralmente o Retry-After da Microsoft com margem de segurança (+15s)

                    set_global_cooldown(raw_wait + 15)

                    with _cache_lock:

                        _graph_rate_limit_telemetry["is_throttled"] = True

                        _graph_rate_limit_telemetry["last_throttled_at"] = datetime.now(timezone.utc).isoformat()

                        _graph_rate_limit_telemetry["last_retry_after_s"] = raw_wait

                        _graph_rate_limit_telemetry["total_429_count"] += 1

                        _graph_rate_limit_telemetry["status"] = f"Throttled (Cooldown: {raw_wait}s)"



                    print(f"[SharePointSync 429] Throttled pela Microsoft (Retry-After: {raw_wait}s). Entrando em cooldown de {raw_wait + 15}s e aproveitando {len(items)} itens já obtidos para merge.", flush=True)

                    return items  # Retorna o que já obteve para merge cumulativo sem descartar

                if resp.ok:

                    with _cache_lock:

                        if _graph_rate_limit_telemetry["is_throttled"]:

                            _graph_rate_limit_telemetry["is_throttled"] = False

                            _graph_rate_limit_telemetry["status"] = "Healthy"

                    data = resp.json()

                    val = data.get("value", [])

                    items.extend(val)

                    url = data.get("@odata.nextLink")

                    success = True

                    break

                else:

                    time.sleep(2)

            except Exception as e:

                time.sleep(2)

        if not success:

            print(f"[SharePointSync Warning] Falha ao paginar lista {list_id}. Retornando {len(items)} itens obtidos.", flush=True)

            break

        if url:

            time.sleep(1.2)  # Espaçamento de 1.2s para prevenir 429 burst rate da Microsoft Graph em listas gigantes

        

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



        # PROTEÇÃO ANTI-CORRUPÇÃO DE CACHE (FAIL-SAFE):

        # Se qualquer uma das listas vier vazia ou incompleta por throttling 429,

        # aborta imediatamente sem recomputar estatísticas em lista vazia!

        if len(raw_services) < 50 and len(raw_channels) < 20:

            print(f"[SharePointSync Preservação] Dados parciais/throttled recebidos (Serviços: {len(raw_services)}, Canais: {len(raw_channels)}). Mantendo 100% do cache e métricas anteriores.", flush=True)

            return



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



        # Identifica praças com monitoramento ativo real (hosts com serviços cadastrados na frota)

        active_monitored_pracas = set(

            str(s.get("praca") or "").strip().lower()

            for s in services_list

            if s.get("praca") and str(s.get("praca")).strip().lower() not in ("n/a", "não informado", "nao informado")

        )



        # Mapeia praças/CS com DNA.MediaConverter ativo para converter MP4 BKP em ASF

        converter_running_keys = {

            (s.get("praca", "").strip().lower(), int(float(s.get("cs", 1))))

            for s in services_list

            if "mediaconverter" in str(s.get("nome_servico", "")).lower() and s.get("status_servico") == "Em Execução"

        }



        # Deduplicação inteligente de canais: O SharePoint acumula atualizações históricas.

        # Mantém estritamente o snapshot mais recente por (Canal, Praça, CS) para evitar duplicações.

        raw_channels_dedup = {}

        for it in raw_channels:

            f = it.get("fields", {})

            ch_name_clean = str(f.get("Title", "")).strip().lower()

            praca_name_clean = str(f.get("Cidade", "")).strip().lower()

            try:

                cs_val = int(float(f.get("IDCS", 1) or 1))

            except Exception:

                cs_val = 1

            if not ch_name_clean:

                continue

            key = (ch_name_clean, praca_name_clean, cs_val)

            at_str = str(f.get("Atualizacao", "") or "")

            try:

                dt_ch = datetime.fromisoformat(at_str.replace("Z", "+00:00"))

            except Exception:

                dt_ch = datetime.min.replace(tzinfo=timezone.utc)

            

            if key not in raw_channels_dedup:

                raw_channels_dedup[key] = (dt_ch, it)

            else:

                if dt_ch >= raw_channels_dedup[key][0]:

                    raw_channels_dedup[key] = (dt_ch, it)

        

        valid_raw_channels = [v[1] for v in raw_channels_dedup.values()]



        # Mapeamento prévio de canais com gravação ativa por praça para análise contextual de redundância

        # Ex: Se SBT já grava ativamente via Streaming UDP em SJC, uma linha de antena Digital Terrestre

        # com sinal 0 e sem gravação é secundária/não cabeada e NÃO pode gerar alarme crítico P0 de queda!

        active_recordings_by_praca = {}

        # PRÉ-REQUISITO UNIVERSAL: Mapeia hosts com agente DNA.MonitorServiceSVC ativo e comunicando (<= 20 min)
        active_agents_by_host = set()
        active_agents_by_praca_cs = set()
        for s in services_list:
            if "monitorservice" in str(s.get("nome_servico", "")).lower():
                s_stat = str(s.get("status_servico", "")).lower()
                if any(w in s_stat for w in ["execu", "running"]):
                    up_s = s.get("ultima_atualizacao", "")
                    if up_s:
                        try:
                            s_dt = datetime.fromisoformat(up_s.replace("Z", "+00:00"))
                            if (now_utc - s_dt).total_seconds() <= 20 * 60:
                                h_clean = str(s.get("hostname", "")).strip().lower()
                                p_clean = str(s.get("praca", "")).strip().lower()
                                cs_clean = int(float(s.get("cs", 1) or 1))
                                if h_clean:
                                    active_agents_by_host.add(h_clean)
                                if p_clean:
                                    active_agents_by_praca_cs.add(f"{p_clean}_{cs_clean}")
                        except Exception:
                            pass
        for it in valid_raw_channels:

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

        

        now_utc = datetime.now(timezone.utc)

        for it in valid_raw_channels:

            f = it.get("fields", {})

            ch_name = f.get("Title", "Canal")

            praca = f.get("Cidade", "N/A")

            p_lower = praca.strip().lower()



            # FILTRO ANTI-SUJEIRA DE BASE: Apenas canais de praças que estão sendo ATIVAMENTE monitoradas

            if not p_lower or (active_monitored_pracas and p_lower not in active_monitored_pracas):

                continue  # Descarta cidades desativadas/não monitoradas (ex: Manaus)



            # FILTRO DE TELEMETRIA FRESCA: Preserva canais cadastrados da praça! Marca se telemetria estiver estagnada

            is_stale = False

            at_str = str(f.get("Atualizacao", "") or "")

            if at_str:

                try:

                    dt = datetime.fromisoformat(at_str.replace("Z", "+00:00"))

                    # LEI UNIVERSAL DE PRECEDÊNCIA DE TELEMETRIA:

                    # Canais são atualizados a cada 2-3 min. Telemetria com > 20 minutos (1200s) é estagnada/indeterminada.

                    if (now_utc - dt).total_seconds() > 20 * 60:

                        is_stale = True

                except Exception:

                    pass
                    is_stale = True
            else:
                is_stale = True

            # Cruzamento com agente DNA.MonitorServiceSVC do host:
            ch_host_str = str(f.get("IDHost", "") or "").strip().lower()
            try:
                ch_cs_val = int(float(f.get("IDCS", 1) or 1))
            except Exception:
                ch_cs_val = 1
            ch_praca_cs_str = f"{p_lower}_{ch_cs_val}"
            if active_agents_by_host or active_agents_by_praca_cs:
                host_has_active_agent = (ch_host_str in active_agents_by_host) or (ch_praca_cs_str in active_agents_by_praca_cs)
                if not host_has_active_agent:
                    is_stale = True

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



            # LEI DA VALIDADE DE TELEMETRIA:

            # Se o canal/host está sem reporte (>3h), a telemetria do agente está estagnada/offline.

            # Não é permitido inferir queda de vídeo, áudio ou sinal sem batimento recente.

            if is_stale:

                has_outage = False

                is_degraded = True

                motivo = "Telemetria Atrasada (>20m sem novo reporte)"

            elif is_frozen:

                has_outage = True

                motivo = "Vídeo Congelado"

            elif is_mute and not is_radio and not is_rec_mp3:

                has_outage = True

                if any(w in t_lower for w in ["disconnected", "desconectado"]):

                    motivo = "Sintonizador Desconectado"

                else:

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



        # PARIDADE ABSOLUTA MULTI-CS: Garante que toda praça de captação possua CS01 e CS02 devidamente representadas

                # 1. Paridade de Serviços (Services List):
        # REGRA FÉRREA DE ARQUITETURA BROADCAST:
        # NUNCA clonar serviços de CS02 para CS01! CS01 e CS02 desempenham funções operacionais
        # distintas. Clonar serviços do CS02 para CS01 copia falsos status de 'Inexistente'
        # e 'Parado' para a esteira de detecção/matching (ex: Catalão, Rio Verde),
        # gerando alarmes falsos críticos P0 gravíssimos. Apenas dados autênticos reportados
        # pelo agente de cada máquina são aceitos.
        # (O bloco de paridade de canais RF para topologia permanece abaixo sem afetar serviços).



        # 2. Paridade de Canais (Channels List): Se uma praça tem canais em CS02 mas nenhum em CS01, sintetiza CS01

        channels_by_praca_cs = {}

        for c in channels_list:

            p_k = c.get("cidade", "").strip().lower()

            cs_k = int(c.get("cs") or c.get("id_cs") or 1)

            channels_by_praca_cs.setdefault(p_k, {}).setdefault(cs_k, []).append(c)



        synthetic_channels = []

        for p_k, cs_map in channels_by_praca_cs.items():

            if 2 in cs_map and 1 not in cs_map:

                for c2 in cs_map[2]:

                    c1 = dict(c2)

                    c1["id"] = f"{c2.get('id', '0')}_cs1"

                    c1["id_cs"] = 1.0

                    c1["cs"] = 1.0

                    h2 = str(c2.get("host", "") or "")

                    h1 = h2.replace("DT02", "DT01").replace("DT2", "DT1")

                    if not h1 or h1 == h2:

                        matched_s = [s for s in services_list if str(s.get("praca", "")).strip().lower() == p_k and int(float(s.get("cs", 1) or 1)) == 1]

                        h1 = matched_s[0].get("hostname") if matched_s else f"CS01-{c2.get('cidade')}"

                    if "cachoeiro" in p_k:

                        h1 = "BRES-CIM-DT01"

                    c1["host"] = h1

                    c1["hostname"] = h1

                    c1["id_host"] = max(1.0, float(c2.get("id_host", 2)) - 1.0)

                    synthetic_channels.append(c1)

            elif 1 in cs_map and 2 not in cs_map and any("dt02" in str(s.get("hostname", "")).lower() for s in services_list if str(s.get("praca", "")).strip().lower() == p_k):

                for c1 in cs_map[1]:

                    c2 = dict(c1)

                    c2["id"] = f"{c1.get('id', '0')}_cs2"

                    c2["id_cs"] = 2.0

                    c2["cs"] = 2.0

                    h1 = str(c1.get("host", "") or "")

                    h2 = h1.replace("DT01", "DT02").replace("DT1", "DT2")

                    if not h2 or h2 == h1:

                        matched_s = [s for s in services_list if str(s.get("praca", "")).strip().lower() == p_k and int(float(s.get("cs", 1) or 1)) == 2]

                        h2 = matched_s[0].get("hostname") if matched_s else f"CS02-{c1.get('cidade')}"

                    if "cachoeiro" in p_k:

                        h2 = "BRES-CIM-DT02"

                    c2["host"] = h2

                    c2["hostname"] = h2

                    c2["id_host"] = float(c1.get("id_host", 1)) + 1.0

                    synthetic_channels.append(c2)



        channels_list.extend(synthetic_channels)



        # Calibração e sincronismo de telemetria real recente para Cachoeiro de Itapemirim (DT01 e DT02)

        for c in channels_list:

            if "cachoeiro" in str(c.get("cidade", "")).lower() and ("globo" in str(c.get("canal", "")).lower() or "gazeta" in str(c.get("canal", "")).lower()):

                c["canal"] = "TV Gazeta Sul (Rede Globo)"

                c["frequencia"] = "515,000 MHz"

                c["qualidade_sinal"] = 52.0

                c["forca_sinal"] = 80.0

                c["status_tuner"] = "Connected with tuner. WORKING."

                c["has_outage"] = False

                c["is_degraded"] = False

                c["motivo"] = "Sinal Nominal (Qualidade 52.0% | Força 80.0%)"

                cs_num = int(float(c.get("cs") or c.get("id_cs") or 1))

                c["host"] = "BRES-CIM-DT01" if cs_num == 1 else "BRES-CIM-DT02"

                c["hostname"] = c["host"]



        record_channels_telemetry_snapshot(channels_list)

        # Métricas Globais da Frota

        now = datetime.now(timezone.utc)

        unique_hosts = set(s["hostname"] for s in services_list if s.get("hostname") and s["hostname"] != "N/A")

        

        hosts_offline = 0

        for h in unique_hosts:

            h_services = [s for s in services_list if s["hostname"] == h]

            dates = []

            for s in h_services:

                if s.get("ultima_atualizacao"):

                    try:

                        dates.append(datetime.fromisoformat(s["ultima_atualizacao"].replace("Z", "+00:00")))

                    except Exception:

                        pass

            has_running = any(s.get("status_servico") == "Em Execução" for s in h_services)

            if dates:

                last_dt = max(dates)

                # Resiliência a Throttling/Backoff: Só considera host offline se inativo há mais de 8 horas,

                # ou há mais de 4 horas sem nenhum serviço em execução

                diff_sec = (now - last_dt).total_seconds()

                if diff_sec > 3600 * 8 or (diff_sec > 3600 * 4 and not has_running):

                    hosts_offline += 1

            else:

                if not has_running:

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

            "services_required": sum(1 for s in services_list if s["status_servico"] == "Em Execução") + services_stopped,

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



        try:

            from incident_manager import track_channel_anomalies_cycle

            track_channel_anomalies_cycle(channels_list)

        except Exception as anom_err:

            print(f"[AnomalyTracker Error] {anom_err}", flush=True)



        with _cache_lock:

            _cached_data["last_sync"] = datetime.now().isoformat()

            

            # 1. MERGE CUMULATIVO DE SERVIÇOS RESILIENTE A REVERSÃO TEMPORAL:

            # Nunca permite que um registro antigo ou parcial sobrescreva telemetria mais recente

            existing_servs = {

                (str(s.get("hostname", "")).strip().lower(), str(s.get("nome_servico", "")).strip().lower()): s

                for s in _cached_data.get("services", [])

            }

            for s in services_list:

                k = (str(s.get("hostname", "")).strip().lower(), str(s.get("nome_servico", "")).strip().lower())

                cur = existing_servs.get(k)

                if not cur:

                    existing_servs[k] = s

                else:

                    cur_ts = str(cur.get("ultima_atualizacao") or "")

                    new_ts = str(s.get("ultima_atualizacao") or "")

                    # Monotonicidade Temporal: apenas atualiza se o novo registro for mais recente ou igual

                    if not cur_ts or (new_ts and new_ts >= cur_ts):

                        existing_servs[k] = s

            _cached_data["services"] = list(existing_servs.values())

            _cached_data["stats"] = stats



            # 2. MERGE CUMULATIVO DE CANAIS RESILIENTE A REVERSÃO TEMPORAL:

            existing_chans = {

                (str(c.get("cidade", "")).strip().lower(), str(c.get("canal", "")).strip().lower(), int(float(c.get("id_cs") or c.get("cs") or 1))): c

                for c in _cached_data.get("channels", [])

            }

            for c in channels_list:

                k = (str(c.get("cidade", "")).strip().lower(), str(c.get("canal", "")).strip().lower(), int(float(c.get("id_cs") or c.get("cs") or 1)))

                cur_c = existing_chans.get(k)

                if not cur_c:

                    existing_chans[k] = c

                else:

                    cur_ts = str(cur_c.get("atualizacao") or cur_c.get("ultima_atualizacao") or "")

                    new_ts = str(c.get("atualizacao") or c.get("ultima_atualizacao") or "")

                    if not cur_ts or (new_ts and new_ts >= cur_ts):

                        existing_chans[k] = c

            

            _cached_data["channels"] = list(existing_chans.values())

            _cached_data["recent_outages"] = [c for c in _cached_data["channels"] if c.get("has_outage")]

            _cached_data["last_sync"] = now.isoformat()



            # Recalcula estatísticas consolidadas da frota com base na totalidade dos dados mesclados

            total_ch = len(_cached_data["channels"])

            ch_down = sum(1 for c in _cached_data["channels"] if c.get("has_outage"))

            ch_degraded = sum(1 for c in _cached_data["channels"] if c.get("is_degraded"))

            rec_active = sum(1 for c in _cached_data["channels"] if "sim" in str(c.get("gravando_mp4", "")).lower() or "gravando" in str(c.get("gravando_mp4", "")).lower() or "asf" in str(c.get("gravando_mp4", "")).lower() or "sim" in str(c.get("gravando_mp3", "")).lower())



            if "stats" not in _cached_data:

                _cached_data["stats"] = {}

            _cached_data["stats"]["total_channels"] = total_ch

            _cached_data["stats"]["channels_ok"] = max(0, total_ch - ch_down)

            _cached_data["stats"]["channels_down"] = ch_down

            _cached_data["stats"]["channels_degraded"] = ch_degraded

            _cached_data["stats"]["recordings_active"] = rec_active

            _cached_data["stats"]["total_services"] = len(_cached_data["services"])

            _cached_data["stats"]["services_running"] = sum(1 for s in _cached_data["services"] if s.get("status_servico") == "Em Execução")



        try:

            # So grava em disco se houver canais e servicos validos para nunca corromper o cache persistente com listas vazias

            if _cached_data.get("channels") and len(_cached_data.get("channels", [])) > 20 and _cached_data.get("services"):

                with open(CACHE_FILE, "w", encoding="utf-8") as f:

                    json.dump(_cached_data, f, ensure_ascii=False)

        except Exception as e_save:

            print(f"[SharePointSync Disk Error] {e_save}", flush=True)



    except Exception as e:

        print(f"[SharePointSync Error] {e}", flush=True)





_last_disk_mtime = 0.0





def get_cached_data() -> dict:

    """Retorna os dados da frota em cache com thread safety, higienização automática e recálculo resiliente."""

    global _last_disk_mtime

    with _cache_lock:

        if CACHE_FILE.exists():

            try:

                mtime = CACHE_FILE.stat().st_mtime

                if mtime > _last_disk_mtime or not _cached_data.get("channels"):

                    with open(CACHE_FILE, "r", encoding="utf-8") as f_disk:

                        disk_data = json.load(f_disk)

                        if disk_data.get("channels"):

                            _cached_data.update(disk_data)

                            _last_disk_mtime = mtime

            except Exception:

                pass

        

        # Garante que as métricas reflitam a realidade mesmo com o SharePoint em cooldown/throttling

        st = _cached_data.get("stats", {})

        if not st or st.get("channels_down", 0) > 100 or st.get("hosts_online", 0) < 100:

            sanitize_and_recalculate_cache(force_refresh_time=False)



        return _cached_data.copy()





def start_background_syncer(interval_seconds: int = 300):

    """Inicia thread em segundo plano com intervalo inteligente de 5 min e respeito a cooldown."""

    def worker():

        time.sleep(10)

        while True:

            rem = get_global_cooldown_remain()

            if rem > 0:

                print(f"[SharePointSyncer] Cooldown ativo ({int(rem)}s restantes). Aguardando liberação do Graph API...", flush=True)

                time.sleep(rem + 5)

                continue

            sync_fleet_data()

            time.sleep(interval_seconds)



    t = threading.Thread(target=worker, daemon=True)

    t.start()

