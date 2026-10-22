# dashboard/app.py
"""
Central de Monitoração Proativa dos Capture Sites (CS Fleet Control Center).
Servidor FastAPI completo com autenticação local/LDAP, métricas em tempo real,
gestão de incidentes, limiares de alerta customizáveis e Motor de IA Proativa.
"""
import os
import sys
from pathlib import Path
from typing import Dict, Any, List, Optional
from fastapi import FastAPI, Depends, HTTPException, status, Header, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

ROOT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT_DIR))

from config import PORT, DOMAIN_NAME
from auth import (
    authenticate_user, create_session, validate_session,
    search_ldap_users, hash_password, DB_PATH
)
from sharepoint_sync import get_cached_data, start_background_syncer, sync_fleet_data
from incident_manager import register_incident_action, get_incident_history
from thresholds_manager import get_all_thresholds, update_threshold
from ai_insights import run_ai_fleet_analysis, get_active_ai_suggestions, apply_ai_suggestion
from fleet_actions import execute_predefined_action
from remote_commands import (
    get_command_catalog, create_catalog_command, delete_catalog_command,
    dispatch_remote_command, get_execution_details, get_ai_command_recommendations
)

app = FastAPI(title="Central de Monitoração Proativa dos Capture Sites", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Servir arquivos estáticos
STATIC_DIR = ROOT_DIR / "static"
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


# Modelos Pydantic
class LoginRequest(BaseModel):
    username: str
    password: str

class UserCreateRequest(BaseModel):
    username: str
    password: Optional[str] = "CSp@ss2020"
    full_name: str
    email: Optional[str] = ""
    role: str = "operator"
    auth_type: str = "local"

class IncidentActionRequest(BaseModel):
    incident_key: str
    host: str
    target_name: str
    incident_type: str
    action_taken: str
    resolution_status: str = "em_analise"

class FleetActionRequest(BaseModel):
    action_type: str
    host: str
    service_name: Optional[str] = None
    channel_id: Optional[str] = None
    target_version: Optional[str] = None

class ThresholdUpdateRequest(BaseModel):
    key: str
    value: float
    is_enabled: bool

class RemoteCommandCatalogCreateRequest(BaseModel):
    title: str
    description: str = ""
    category: str = "consulta"
    shell_type: str = "powershell"
    command_script: str

class RemoteCommandExecuteRequest(BaseModel):
    hosts: List[str]
    shell_type: str = "powershell"
    command_script: str
    command_title: str = "Comando Livre"

class AiDecisionRequest(BaseModel):
    suggestion_id: str
    approve: bool


def get_current_user(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    """Dependency injection para validação de token de sessão."""
    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Não autenticado")
    token = authorization.replace("Bearer ", "").strip()
    session = validate_session(token)
    if not session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessão inválida ou expirada")
    return session


# Startup Event
@app.on_event("startup")
def on_startup():
    print(f"🚀 [Fleet Dashboard] Central de Monitoração online na porta {PORT}...", flush=True)
    # Inicia sincronização contínua com SharePoint em thread daemon não bloqueante
    start_background_syncer(interval_seconds=30)


@app.get("/", response_class=HTMLResponse)
async def index_page():
    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return HTMLResponse("<h1>Central de Monitoração CS - Carregando frontend...</h1>")


@app.get("/api/health")
async def healthcheck():
    data = get_cached_data()
    return {
        "status": "online",
        "service": "CS Fleet Control Center",
        "tunnel": DOMAIN_NAME,
        "last_sync": data.get("last_sync"),
        "total_hosts": data.get("stats", {}).get("total_hosts", 0)
    }


# Endpoints de Autenticação e Usuários
@app.post("/api/auth/login")
async def login(req: LoginRequest):
    user = authenticate_user(req.username, req.password)
    if not user:
        raise HTTPException(status_code=400, detail="Usuário ou senha inválidos")
    token = create_session(user["username"], user["role"])
    return {
        "token": token,
        "username": user["username"],
        "full_name": user["full_name"],
        "role": user["role"]
    }


@app.get("/api/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    return user


@app.get("/api/users/ldap-search")
async def search_ldap(q: str = "", user: dict = Depends(get_current_user)):
    return search_ldap_users(q)


@app.get("/api/users")
async def list_users(user: dict = Depends(get_current_user)):
    import sqlite3
    with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT id, username, full_name, email, role, auth_type, is_active, created_at, last_login FROM users ORDER BY username")
        return [dict(r) for r in cursor.fetchall()]


@app.post("/api/users")
async def create_user(req: UserCreateRequest, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Apenas administradores podem cadastrar usuários")
    
    import sqlite3
    with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
        cursor = conn.cursor()
        pass_hash = hash_password(req.password or "CSp@ss2020")
        try:
            cursor.execute("""
                INSERT INTO users (username, password_hash, full_name, email, role, auth_type, is_active, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))
            """, (req.username.strip().lower(), pass_hash, req.full_name.strip(), req.email.strip() if req.email else "", req.role, req.auth_type))
            conn.commit()
            return {"success": True, "message": "Usuário cadastrado com sucesso"}
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=400, detail="Nome de usuário já cadastrado")


# Endpoints de Telemetria e Monitoração da Frota
@app.get("/api/fleet/summary")
async def get_summary(user: dict = Depends(get_current_user)):
    data = get_cached_data()
    return {
        "stats": data.get("stats", {}),
        "last_sync": data.get("last_sync"),
        "recent_outages": data.get("recent_outages", [])[:10]
    }


@app.get("/api/fleet/services")
async def get_services(country: Optional[str] = None, city: Optional[str] = None, status_filter: Optional[str] = None, user: dict = Depends(get_current_user)):
    data = get_cached_data()
    services = data.get("services", [])
    
    if country:
        services = [s for s in services if country.lower() in s["title"].lower()]
    if city:
        services = [s for s in services if city.lower() in s["praca"].lower()]
    if status_filter:
        if status_filter == "parado":
            services = [s for s in services if s["status_servico"] in ["Parado", "Inexistente"]]
        elif status_filter == "crash_loop":
            services = [s for s in services if "crash-loop" in s["status_servico"].lower() or "crash-loop" in s["status_atualizacao"].lower()]
        elif status_filter == "atualizando":
            services = [s for s in services if s["status_atualizacao"] in ["Em Progresso", "Atualizando"]]
            
    return services


@app.get("/api/fleet/channels")
async def get_channels(city: Optional[str] = None, outage_only: bool = False, user: dict = Depends(get_current_user)):
    data = get_cached_data()
    channels = data.get("channels", [])
    
    if city:
        channels = [c for c in channels if city.lower() in c["cidade"].lower()]
    if outage_only:
        channels = [c for c in channels if c["has_outage"]]
        
    return channels


@app.get("/api/fleet/rf-analytics")
async def get_rf_analytics(user: dict = Depends(get_current_user)):
    data = get_cached_data()
    channels = data.get("channels", [])
    
    # Distribuição de Qualidade e Força de Sinal
    q_ranges = {"0-20%": 0, "21-50%": 0, "51-75%": 0, "76-100%": 0}
    s_ranges = {"0-20%": 0, "21-50%": 0, "51-75%": 0, "76-100%": 0}
    
    by_city = {}
    for c in channels:
        q = c.get("qualidade_sinal", 0)
        s = c.get("forca_sinal", 0)
        city = c.get("cidade", "Outros")
        
        if city not in by_city:
            by_city[city] = {"total": 0, "qualidade_media": 0, "forca_media": 0, "outages": 0}
        by_city[city]["total"] += 1
        by_city[city]["qualidade_media"] += q
        by_city[city]["forca_media"] += s
        if c.get("has_outage"):
            by_city[city]["outages"] += 1
            
        if q <= 20: q_ranges["0-20%"] += 1
        elif q <= 50: q_ranges["21-50%"] += 1
        elif q <= 75: q_ranges["51-75%"] += 1
        else: q_ranges["76-100%"] += 1
        
        if s <= 20: s_ranges["0-20%"] += 1
        elif s <= 50: s_ranges["21-50%"] += 1
        elif s <= 75: s_ranges["51-75%"] += 1
        else: s_ranges["76-100%"] += 1

    for k, v in by_city.items():
        if v["total"] > 0:
            v["qualidade_media"] = round(v["qualidade_media"] / v["total"], 1)
            v["forca_media"] = round(v["forca_media"] / v["total"], 1)

    return {
        "quality_distribution": q_ranges,
        "strength_distribution": s_ranges,
        "city_performance": by_city
    }


# Ações Operacionais e Incident Response
@app.post("/api/fleet/action")
async def trigger_action(req: FleetActionRequest, user: dict = Depends(get_current_user)):
    res = execute_predefined_action(
        action_type=req.action_type,
        host=req.host,
        service_name=req.service_name,
        channel_id=req.channel_id,
        target_version=req.target_version,
        operator_username=user["username"],
        operator_name=user.get("full_name", user["username"])
    )
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error", "Erro ao executar ação"))
    return res


@app.get("/api/incidents/history")
async def list_incident_history(key: Optional[str] = None, user: dict = Depends(get_current_user)):
    return get_incident_history(key)


@app.post("/api/incidents/worklog")
async def add_worklog(req: IncidentActionRequest, user: dict = Depends(get_current_user)):
    rowid = register_incident_action(
        incident_key=req.incident_key,
        host=req.host,
        target_name=req.target_name,
        incident_type=req.incident_type,
        operator_username=user["username"],
        operator_name=user.get("full_name", user["username"]),
        action_taken=req.action_taken,
        resolution_status=req.resolution_status
    )
    return {"success": True, "id": rowid}


# Limiares de Alerta (Thresholds)
@app.get("/api/thresholds")
async def list_thresholds(user: dict = Depends(get_current_user)):
    return get_all_thresholds()


@app.post("/api/thresholds")
async def save_threshold(req: ThresholdUpdateRequest, user: dict = Depends(get_current_user)):
    ok = update_threshold(req.key, req.value, req.is_enabled)
    if not ok:
        raise HTTPException(status_code=400, detail="Limiar não encontrado")
    return {"success": True}


# Inteligência Artificial Proativa
@app.post("/api/ai/analyze")
async def analyze_with_ai(user: dict = Depends(get_current_user)):
    data = get_cached_data()
    suggestions = run_ai_fleet_analysis(data)
    return {"suggestions": suggestions}


@app.get("/api/ai/suggestions")
async def get_suggestions(user: dict = Depends(get_current_user)):
    return get_active_ai_suggestions()


@app.post("/api/ai/decision")
async def decide_suggestion(req: AiDecisionRequest, user: dict = Depends(get_current_user)):
    ok = apply_ai_suggestion(req.suggestion_id, req.approve)
    if not ok:
        raise HTTPException(status_code=400, detail="Sugestão não encontrada")
    return {"success": True, "status": "aprovada" if req.approve else "recusada"}


# ==========================================
# Remote Command Orchestrator Endpoints
# ==========================================
@app.get("/api/remote-commands/catalog")
async def list_command_catalog(category: Optional[str] = None, user: dict = Depends(get_current_user)):
    return get_command_catalog(category)

@app.post("/api/remote-commands/catalog")
async def add_catalog_command(req: RemoteCommandCatalogCreateRequest, user: dict = Depends(get_current_user)):
    res = create_catalog_command(req.title, req.description, req.category, req.shell_type, req.command_script, user.get("username", "admin"))
    return {"success": True, "command": res}

@app.delete("/api/remote-commands/catalog/{cmd_id}")
async def remove_catalog_command(cmd_id: int, user: dict = Depends(get_current_user)):
    ok = delete_catalog_command(cmd_id)
    if not ok:
        raise HTTPException(status_code=400, detail="Comando não encontrado ou não pode ser excluído")
    return {"success": True}

@app.post("/api/remote-commands/execute")
async def execute_remote_cmd(req: RemoteCommandExecuteRequest, user: dict = Depends(get_current_user)):
    if not req.hosts:
        raise HTTPException(status_code=400, detail="Selecione ao menos um host para execução")
    if not req.command_script.strip():
        raise HTTPException(status_code=400, detail="Comando não pode ser vazio")
    
    res = dispatch_remote_command(
        hosts=req.hosts,
        shell_type=req.shell_type,
        command_script=req.command_script,
        command_title=req.command_title,
        user=user.get("username", "admin")
    )
    return res

@app.get("/api/remote-commands/executions/{exec_id}")
async def get_execution_status(exec_id: str, user: dict = Depends(get_current_user)):
    details = get_execution_details(exec_id)
    if not details:
        raise HTTPException(status_code=404, detail="Execução de comando não encontrada")
    return details

@app.get("/api/remote-commands/executions/{exec_id}/export")
async def export_execution(exec_id: str, format: str = Query("txt", regex="^(txt|csv)$"), user: dict = Depends(get_current_user)):
    details = get_execution_details(exec_id)
    if not details:
        raise HTTPException(status_code=404, detail="Execução não encontrada")
    
    from fastapi.responses import Response
    if format == "csv":
        import csv, io
        output = io.StringIO()
        writer = csv.writer(output, delimiter=";")
        writer.writerow(["Host", "Praca", "Status", "Duracao_ms", "Exit_Code", "Saida_Stdout"])
        for r in details.get("results", []):
            clean_stdout = r.get("stdout", "").replace("\n", " ").replace("\r", "")
            writer.writerow([r.get("host"), r.get("praca"), r.get("status"), r.get("duration_ms"), r.get("exit_code"), clean_stdout])
        
        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=remote_command_{exec_id[:8]}.csv"}
        )
    else:
        lines = [
            f"RELATÓRIO DE EXECUÇÃO DE COMANDO REMOTO - DNA FLEET CONTROL",
            f"ID: {details.get('id')}",
            f"Comando: {details.get('command_title')} [{details.get('shell_type').upper()}]",
            f"Data: {details.get('created_at')} por {details.get('executed_by')}",
            "=" * 80,
            f"SCRIPT EXECUTADO:\n{details.get('command_script')}",
            "=" * 80,
            ""
        ]
        for r in details.get("results", []):
            lines.append(f"--- HOST: {r.get('host')} ({r.get('praca')}) ---")
            lines.append(f"Status: {r.get('status')} | Codigo de Saida: {r.get('exit_code')} | Tempo: {r.get('duration_ms')}ms")
            lines.append("Saida:")
            lines.append(r.get("stdout") or "(Sem saída)")
            lines.append("-" * 60)
            
        return Response(
            content="\n".join(lines),
            media_type="text/plain; charset=utf-8",
            headers={"Content-Disposition": f"attachment; filename=remote_command_{exec_id[:8]}.txt"}
        )

@app.get("/api/remote-commands/ai-suggestions")
async def get_remote_cmd_ai_suggestions(refresh: bool = False, user: dict = Depends(get_current_user)):
    data = get_cached_data()
    return get_ai_command_recommendations(fleet_data=data, refresh=refresh)
