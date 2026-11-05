with open(r'dashboard\app.py', 'r', encoding='utf-8') as f:
    text = f.read()

sub = 'res[f"{ch_name}_{cs_num}"] = item_id\n    return res'
if sub not in text:
    sub = 'res[f"{ch_name}_{cs_num}"] = item_id\r\n    return res'

if sub in text:
    addition = '''

@app.get("/api/fleet/pending-actions/{hostname}")
async def get_pending_actions_by_host(hostname: str):
    """Retorna as acoes pendentes de servicos para o host."""
    data = get_cached_data()
    services = data.get("services", [])
    h_clean = hostname.strip().lower()
    res = []
    for s in services:
        h = str(s.get("hostname", "")).strip().lower()
        if h == h_clean:
            acao = str(s.get("acao_solicitada", "")).strip()
            if acao and acao.lower() != "nenhuma":
                res.append({
                    "Id": int(s.get("id", 0)) if str(s.get("id")).isdigit() else 0,
                    "Title": s.get("pais", "") or s.get("title", ""),
                    "NomeServico": s.get("nome_servico", ""),
                    "VersaoInstalada": s.get("versao_instalada", ""),
                    "VersaoDesejada": s.get("versao_desejada", ""),
                    "AcaoSolicitada": acao,
                    "StatusAtualizacao": s.get("status_atualizacao", ""),
                    "AutoRestart": s.get("autorestart", "Não"),
                    "HoraAgendada": s.get("hora_agendada", "")
                })
    return res


@app.get("/api/fleet/pending-url-actions/{hostname}")
async def get_pending_url_actions_by_host(hostname: str):
    """Retorna as acoes pendentes de URL para o host."""
    data = get_cached_data()
    services = data.get("services", [])
    h_clean = hostname.strip().lower()
    res = []
    for s in services:
        h = str(s.get("hostname", "")).strip().lower()
        if h == h_clean:
            acao = str(s.get("acao_solicitada_url", "")).strip()
            if acao and acao.lower() == "atualizar":
                res.append({
                    "Id": int(s.get("id", 0)) if str(s.get("id")).isdigit() else 0,
                    "Title": s.get("pais", "") or s.get("title", ""),
                    "NomeServico": s.get("nome_servico", ""),
                    "UrlComunicacaoDesejavel": s.get("url_comunicacao_desejavel", ""),
                    "AcaoSolicitadaUrl": acao
                })
    return res'''
    text = text.replace(sub, sub + addition, 1)
    with open(r'dashboard\app.py', 'w', encoding='utf-8') as f:
        f.write(text)
    print("SUCCESS: Endpoints added to dashboard/app.py!")
else:
    print("ERROR: sub not found in dashboard/app.py")
