// static/js/fleet_ops.js - Gestão de Frotas e Deploy Canário (5 Pilotos -> Frota Completa)

function getFleetAuthToken() {
    if (typeof authToken !== "undefined" && authToken) return authToken;
    if (typeof getAuthToken === "function") {
        const t = getAuthToken();
        if (t) return t;
    }
    return localStorage.getItem("fleet_token") || localStorage.getItem("access_token") || localStorage.getItem("dna_auth_token") || localStorage.getItem("token") || "";
}

async function loadCanaryPipelineStatus() {
    const targetInput = document.getElementById("canaryTargetVersion");
    const targetVer = (targetInput && targetInput.value ? targetInput.value : "1.0.21.2").trim();
    const statusGrid = document.getElementById("canaryStatusSummaryGrid");
    const pilotsListEl = document.getElementById("canaryPilotsList");
    const logBox = document.getElementById("canaryLogOutput");

    try {
        const resp = await fetch(`/api/fleet/canary-status?service_name=DNA.MonitorServiceSVC&target_version=${encodeURIComponent(targetVer)}`, {
            headers: { "Authorization": `Bearer ${getFleetAuthToken()}` }
        });
        if (!resp.ok) return;
        const data = await resp.json();

        if (statusGrid) {
            const stageLabels = {
                "frota_100_atualizada": { text: "Frota 100% na v" + data.target_version, color: "#10b981", bg: "rgba(16,185,129,0.14)" },
                "canario_homologado_pronto_frota": { text: "5 Pilotos Homologados • Pronto p/ Frota", color: "#3b82f6", bg: "rgba(59,130,246,0.14)" },
                "em_homologacao_canario": { text: "Em Homologação nos 5 Pilotos Canário", color: "#f59e0b", bg: "rgba(245,158,11,0.14)" },
                "aguardando_inicio_canario": { text: "Aguardando Disparo dos 5 Pilotos", color: "#94a3b8", bg: "rgba(148,163,184,0.12)" }
            };
            const st = stageLabels[data.stage] || stageLabels["aguardando_inicio_canario"];

            const graphColor = "#10b981";
            const graphText = "Google Cloud Ativo (<30ms)";

            statusGrid.innerHTML = `
                <div style="background: rgba(15,23,42,0.7); border: 1px solid rgba(148,163,184,0.2); border-radius: 8px; padding: 12px 14px;">
                    <div style="font-size: 11px; color: #94a3b8; text-transform: uppercase;">Estágio da Esteira</div>
                    <div style="font-size: 13px; font-weight: 700; color: ${st.color}; margin-top: 4px;">${st.text}</div>
                </div>
                <div style="background: rgba(15,23,42,0.7); border: 1px solid rgba(16,185,129,0.25); border-radius: 8px; padding: 12px 14px;">
                    <div style="font-size: 11px; color: #94a3b8; text-transform: uppercase;">Já na v${data.target_version}</div>
                    <div style="font-size: 20px; font-weight: 800; color: #10b981; margin-top: 2px;">${data.updated_count} <span style="font-size: 12px; font-weight: 500; color: #64748b;">/ ${data.total_hosts}</span></div>
                </div>
                <div style="background: rgba(15,23,42,0.7); border: 1px solid rgba(245,158,11,0.25); border-radius: 8px; padding: 12px 14px;">
                    <div style="font-size: 11px; color: #94a3b8; text-transform: uppercase;">Pilotos Homologando (Alvo: 5)</div>
                    <div style="font-size: 20px; font-weight: 800; color: #f59e0b; margin-top: 2px;">${data.in_progress_count} <span style="font-size: 12px; font-weight: 500; color: #64748b;">em update</span></div>
                </div>
                <div style="background: rgba(15,23,42,0.7); border: 1px solid rgba(148,163,184,0.2); border-radius: 8px; padding: 12px 14px;">
                    <div style="font-size: 11px; color: #94a3b8; text-transform: uppercase;">Restante da Frota (Pendentes)</div>
                    <div style="font-size: 20px; font-weight: 800; color: #e2e8f0; margin-top: 2px;">${data.pending_count} <span style="font-size: 12px; font-weight: 500; color: #64748b;">aguardando update</span></div>
                </div>
                <div style="background: rgba(15,23,42,0.7); border: 1px solid ${graphColor}; border-radius: 8px; padding: 12px 14px;">
                    <div style="font-size: 11px; color: #94a3b8; text-transform: uppercase;">Google Cloud Sentinel</div>
                    <div style="font-size: 13px; font-weight: 700; color: ${graphColor}; margin-top: 4px;">${graphText}</div>
                </div>
            `;
        }

        if (pilotsListEl) {
            const activePilots = [...(data.updated_hosts || []), ...(data.in_progress_hosts || [])];
            if (activePilots.length === 0) {
                pilotsListEl.innerHTML = `<span style="font-size: 12px; color: #94a3b8;">Nenhuma praça na v${data.target_version} ainda. Clique em <strong>"1. Homologar em 5 Praças Piloto (Canary)"</strong> para iniciar o lote piloto.</span>`;
            } else {
                pilotsListEl.innerHTML = activePilots.map(h => {
                    const isDone = h.versao_instalada === data.target_version;
                    const badgeColor = isDone ? "#10b981" : "#f59e0b";
                    const badgeBg = isDone ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)";
                    const icon = isDone ? "✅" : "⏳";
                    return `<span style="display:inline-flex; align-items:center; gap:6px; padding:5px 10px; border-radius:6px; font-size:12px; font-family:monospace; background:${badgeBg}; border:1px solid ${badgeColor}; color:#f8fafc;">
                        ${icon} <strong>${h.hostname}</strong> (${h.praca || "CS"}) • inst: ${h.versao_instalada} → alvo: ${h.versao_desejada}
                    </span>`;
                }).join("");
            }
        }
    } catch (e) {
        if (logBox && !logBox.innerText) {
            logBox.innerText = "Erro ao consultar status canário.";
        }
    }
}

async function triggerCanaryFromDashboard() {
    const targetVer = (document.getElementById("canaryTargetVersion")?.value || "1.0.21.2").trim();

    const logBox = document.getElementById("canaryLogOutput");
    if (logBox) {
        logBox.innerText = `[${new Date().toLocaleTimeString()}] 🐤 Disparando Fase 1 (Homologação Canário em 5 Praças Piloto) para DNA.MonitorServiceSVC v${targetVer}...\n`;
    }

    try {
        const resp = await fetch("/api/fleet/action", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(getFleetAuthToken() ? { "Authorization": `Bearer ${getFleetAuthToken()}` } : {})
            },
            body: JSON.stringify({
                action_type: "canary_deploy",
                host: "Canary_Pilots",
                service_name: "DNA.MonitorServiceSVC",
                target_version: targetVer
            })
        });
        const data = await resp.json();
        if (resp.ok) {
            const hostsStr = (data.dispatched_hosts || []).join(", ") || "5 praças piloto";
            if (logBox) {
                logBox.innerText += `[${new Date().toLocaleTimeString()}] ✅ ${data.message}\n`;
                logBox.innerText += `[${new Date().toLocaleTimeString()}] 🎯 Praças Piloto acionadas no SharePoint: ${hostsStr}\n`;
                logBox.innerText += `[${new Date().toLocaleTimeString()}] 🛡️ As demais praças permanecem protegidas até a confirmação das 5 piloto (Auto-Promote ativo em background).`;
            }
            if (typeof showToast === "function") showToast(data.message || "Canário disparado nas 5 praças piloto!", "success");
            await loadCanaryPipelineStatus();
            if (typeof loadAllData === "function") loadAllData();
        } else {
            if (logBox) logBox.innerText += `\n[${new Date().toLocaleTimeString()}] ❌ Erro: ${data.detail || data.error}`;
            if (typeof showToast === "function") showToast(data.detail || "Erro ao disparar canário", "error");
        }
    } catch (e) {
        if (logBox) logBox.innerText += `\n[${new Date().toLocaleTimeString()}] ❌ Falha de comunicação com o servidor: ${e.message}`;
    }
}

async function triggerPromoteFleetFromDashboard() {
    const targetVer = (document.getElementById("canaryTargetVersion")?.value || "1.0.21.2").trim();

    const logBox = document.getElementById("canaryLogOutput");
    if (logBox) {
        logBox.innerText += `\n[${new Date().toLocaleTimeString()}] 🚀 Disparando Fase 2: Despachando DNA.MonitorServiceSVC v${targetVer} para todas as demais praças da frota...`;
    }

    try {
        const resp = await fetch("/api/fleet/action", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(getFleetAuthToken() ? { "Authorization": `Bearer ${getFleetAuthToken()}` } : {})
            },
            body: JSON.stringify({
                action_type: "promote_fleet",
                host: "All_Fleet",
                service_name: "DNA.MonitorServiceSVC",
                target_version: targetVer
            })
        });
        const data = await resp.json();
        if (resp.ok) {
            if (logBox) {
                logBox.innerText += `\n[${new Date().toLocaleTimeString()}] ✅ ${data.message}`;
                if (data.dispatched_hosts && data.dispatched_hosts.length > 0) {
                    logBox.innerText += `\n[${new Date().toLocaleTimeString()}] 📦 Praças atualizadas no SharePoint (${data.dispatched_count}): ${data.dispatched_hosts.join(", ")}`;
                }
            }
            if (typeof showToast === "function") showToast(data.message || "Frota completa promovida com sucesso!", "success");
            await loadCanaryPipelineStatus();
            if (typeof loadAllData === "function") loadAllData();
        } else {
            if (logBox) logBox.innerText += `\n[${new Date().toLocaleTimeString()}] ❌ Erro: ${data.detail || data.error}`;
        }
    } catch (e) {
        if (logBox) logBox.innerText += `\n[${new Date().toLocaleTimeString()}] ❌ Falha de comunicação com o servidor: ${e.message}`;
    }
}

let cachedAutoHealingData = null;
let currentAutoHealingFilter = "all";

async function loadFleetAutoHealingStatus() {
    const grid = document.getElementById("fleetAutoHealingGrid");
    const listEl = document.getElementById("fleetAutoHealingHostsList");
    const btnRun = document.getElementById("btnRunAutoHealingBatch");

    try {
        const resp = await fetch("/api/fleet/auto-healing/status", {
            headers: { "Authorization": `Bearer ${getFleetAuthToken()}` }
        });
        if (!resp.ok) return;
        const data = await resp.json();
        cachedAutoHealingData = data;

        const summary = data.summary || {};
        if (grid) {
            grid.innerHTML = `
                <div style="background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px; padding: 12px; cursor: pointer;" onclick="filterAutoHealingList('up_to_date')" title="Clique para filtrar">
                    <div style="font-size: 10px; color: #34d399; text-transform: uppercase; font-weight: 700;">🟢 Atualizados (v${data.target_version})</div>
                    <div style="font-size: 22px; font-weight: 800; color: #10b981; margin-top: 4px;">${summary.up_to_date || 0} <span style="font-size: 11px; font-weight: 500; color: #94a3b8;">/ ${summary.total_hosts || 0}</span></div>
                    <div style="font-size: 10px; color: #6ee7b7; margin-top: 2px;">Agentes 100% Nominais</div>
                </div>
                <div style="background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 8px; padding: 12px; cursor: pointer;" onclick="filterAutoHealingList('eligible')" title="Clique para filtrar">
                    <div style="font-size: 10px; color: #fbbf24; text-transform: uppercase; font-weight: 700;">🟠 Desatualizados Elegíveis</div>
                    <div style="font-size: 22px; font-weight: 800; color: #f59e0b; margin-top: 4px;">${summary.eligible_for_update || 0} <span style="font-size: 11px; font-weight: 500; color: #94a3b8;">hosts</span></div>
                    <div style="font-size: 10px; color: #fcd34d; margin-top: 2px;">Online na v1.0.10 - v1.0.15</div>
                </div>
                <div style="background: rgba(56, 189, 248, 0.12); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 8px; padding: 12px; cursor: pointer;" onclick="filterAutoHealingList('delay')" title="Clique para filtrar">
                    <div style="font-size: 10px; color: #38bdf8; text-transform: uppercase; font-weight: 700;">🟡 Em Delay (20m a 2h)</div>
                    <div style="font-size: 22px; font-weight: 800; color: #38bdf8; margin-top: 4px;">${summary.in_delay || 0} <span style="font-size: 11px; font-weight: 500; color: #94a3b8;">hosts</span></div>
                    <div style="font-size: 10px; color: #bae6fd; margin-top: 2px;">Oscilação WAN / Intervalo</div>
                </div>
                <div style="background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; padding: 12px; cursor: pointer;" onclick="filterAutoHealingList('offline')" title="Clique para filtrar">
                    <div style="font-size: 10px; color: #f87171; text-transform: uppercase; font-weight: 700;">🔴 Offline Crítico (>24h)</div>
                    <div style="font-size: 22px; font-weight: 800; color: #ef4444; margin-top: 4px;">${summary.offline_critical || 0} <span style="font-size: 11px; font-weight: 500; color: #94a3b8;">hosts</span></div>
                    <div style="font-size: 10px; color: #fca5a5; margin-top: 2px;">Sem comunicação há > 1 dia (${summary.offline_recent || 0} em 2h-24h)</div>
                </div>
                <div style="background: rgba(168, 85, 247, 0.12); border: 1px solid rgba(168, 85, 247, 0.3); border-radius: 8px; padding: 12px; cursor: pointer;" onclick="filterAutoHealingList('stopped_services')" title="Clique para filtrar">
                    <div style="font-size: 10px; color: #c084fc; text-transform: uppercase; font-weight: 700;">⚠️ Serviços Parados</div>
                    <div style="font-size: 22px; font-weight: 800; color: #a855f7; margin-top: 4px;">${summary.stopped_services || 0} <span style="font-size: 11px; font-weight: 500; color: #94a3b8;">serviços</span></div>
                    <div style="font-size: 10px; color: #e9d5ff; margin-top: 2px;">FastMatching / Detection / WCF</div>
                </div>
            `;
        }

        renderAutoHealingHostsList();

        if (btnRun) {
            btnRun.disabled = (summary.eligible_for_update === 0 && summary.stopped_services === 0);
        }
    } catch (e) {
        console.error("Erro ao carregar telemetria de Auto-Healing da Frota:", e);
    }
}

function filterAutoHealingList(filterType) {
    currentAutoHealingFilter = filterType;
    renderAutoHealingHostsList();
}

function renderAutoHealingHostsList() {
    const listEl = document.getElementById("fleetAutoHealingHostsList");
    if (!listEl || !cachedAutoHealingData) return;

    const hosts = cachedAutoHealingData.hosts || [];
    let filtered = hosts;

    if (currentAutoHealingFilter === "up_to_date") {
        filtered = hosts.filter(h => h.agent_version === cachedAutoHealingData.target_version);
    } else if (currentAutoHealingFilter === "eligible") {
        filtered = hosts.filter(h => h.eligible_auto_update);
    } else if (currentAutoHealingFilter === "delay") {
        filtered = hosts.filter(h => h.comm_state === "DELAY");
    } else if (currentAutoHealingFilter === "offline_recent") {
        filtered = hosts.filter(h => h.comm_state === "OFFLINE_RECENT");
    } else if (currentAutoHealingFilter === "offline") {
        filtered = hosts.filter(h => h.comm_state === "OFFLINE_CRITICAL" || h.comm_state === "OFFLINE");
    } else if (currentAutoHealingFilter === "stopped_services") {
        filtered = hosts.filter(h => h.eligible_service_restart);
    }

    if (filtered.length === 0) {
        listEl.innerHTML = `<span style="font-size: 11px; color: #94a3b8; padding: 6px;">Nenhum host encontrado para o filtro selecionado.</span>`;
        return;
    }

    listEl.innerHTML = filtered.map(h => {
        let badgeColor = "#94a3b8";
        let badgeBg = "rgba(148,163,184,0.15)";
        let icon = "⚪";

        if (h.agent_version === cachedAutoHealingData.target_version) {
            badgeColor = "#10b981";
            badgeBg = "rgba(16,185,129,0.15)";
            icon = "✅";
        } else if (h.eligible_auto_update) {
            badgeColor = "#f59e0b";
            badgeBg = "rgba(245,158,11,0.15)";
            icon = "🟠";
        } else if (h.comm_state === "DELAY") {
            badgeColor = "#38bdf8";
            badgeBg = "rgba(56,189,248,0.15)";
            icon = "🟡";
        } else if (h.comm_state === "OFFLINE_RECENT") {
            badgeColor = "#fb923c";
            badgeBg = "rgba(251,146,60,0.15)";
            icon = "🟠";
        } else if (h.comm_state === "OFFLINE_CRITICAL" || h.comm_state === "OFFLINE") {
            badgeColor = "#ef4444";
            badgeBg = "rgba(239,68,68,0.15)";
            icon = "🔴";
        }

        const stoppedStr = (h.stopped_critical_services && h.stopped_critical_services.length > 0)
            ? ` • <span style="color:#f87171;">⚠️ ${h.stopped_critical_services.length} parado(s)</span>`
            : "";

        return `
            <span style="display:inline-flex; align-items:center; gap:4px; padding:4px 8px; border-radius:4px; font-size:11px; font-family:monospace; background:${badgeBg}; border:1px solid ${badgeColor}55; color:#f8fafc;" title="Último reporte: ${h.last_update || 'N/A'} (${h.hours_offline}h atrás)">
                ${icon} <strong>${h.hostname}</strong> (${h.praca} CS${h.cs}) • inst: <span style="color:${badgeColor}; font-weight:700;">${h.agent_version}</span>${stoppedStr}
            </span>
        `;
    }).join("");
}

async function triggerFleetAutoHealingBatch() {
    const logBox = document.getElementById("canaryLogOutput");
    const btn = document.getElementById("btnRunAutoHealingBatch");

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Executando Auto-Healing...`;
    }

    if (logBox) {
        logBox.innerText += `\n[${new Date().toLocaleTimeString()}] 🏥 Disparando Ciclo Automático de Auto-Healing da Frota (Atualização em Lote & Restart de Serviços Críticos)...`;
    }

    try {
        const resp = await fetch("/api/fleet/auto-healing/run", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${getFleetAuthToken()}`
            }
        });
        const data = await resp.json();

        if (resp.ok && data.status === "success") {
            if (logBox) {
                logBox.innerText += `\n[${new Date().toLocaleTimeString()}] ✅ ${data.message}`;
                if (data.actions && data.actions.length > 0) {
                    logBox.innerText += `\n[${new Date().toLocaleTimeString()}] 📋 Detalhe das ações aplicadas no SharePoint:`;
                    data.actions.forEach(act => {
                        logBox.innerText += `\n   - [${act.tipo}] ${act.hostname} (${act.praca}): ${act.detalhe}`;
                    });
                }
            }
            if (typeof showToast === "function") showToast(data.message || "Auto-Healing executado com sucesso!", "success");
            await loadFleetAutoHealingStatus();
            await loadCanaryPipelineStatus();
        } else {
            if (logBox) logBox.innerText += `\n[${new Date().toLocaleTimeString()}] ❌ Erro: ${data.message || data.detail || 'Falha ao executar auto-healing'}`;
            if (typeof showToast === "function") showToast(data.message || "Erro no auto-healing", "error");
        }
    } catch (e) {
        if (logBox) logBox.innerText += `\n[${new Date().toLocaleTimeString()}] ❌ Falha de comunicação: ${e.message}`;
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<span>🚀</span> Executar Auto-Healing da Frota (Atualizar Agentes &amp; Recuperar Serviços)`;
        }
    }
}

window.loadFleetAutoHealingStatus = loadFleetAutoHealingStatus;
window.filterAutoHealingList = filterAutoHealingList;
window.triggerFleetAutoHealingBatch = triggerFleetAutoHealingBatch;

function initFleetOps() {
    loadFleetGovernanceSummary();
    loadFleetUpdateEvolution();
    loadFleetAuditLog(false);
}

if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(initFleetOps, 300);
} else {
    document.addEventListener("DOMContentLoaded", () => setTimeout(initFleetOps, 300));
}



// ==============================================================================
// PAINEL DE EVOLUÇÃO DE ATUALIZAÇÕES DA FROTA (DNA.MonitorServiceSVC v1.0.20.0)
// ==============================================================================

let cachedFleetEvolutionData = null;
let currentFleetEvolutionFilter = "all";
let searchFleetEvolutionQuery = "";
let currentGovernanceService = "DNA.MonitorServiceSVC";
let cachedGovernanceSummary = null;

async function loadFleetGovernanceSummary(forceRefresh = false) {
    const iconReload = document.getElementById("iconReloadGovernanceSummary");
    if (iconReload) iconReload.classList.add("fa-spin");

    try {
        const resp = await fetch(`/api/fleet/governance/summary?_t=${Date.now()}`, {
            headers: { "Authorization": `Bearer ${getFleetAuthToken()}` }
        });
        if (!resp.ok) return;

        const data = await resp.json();
        cachedGovernanceSummary = data;
        renderFleetGovernanceGrid(data.services || []);

        if (forceRefresh && typeof showToast === "function") {
            showToast("Matriz de governança oficial atualizada!", "success");
        }
    } catch (e) {
        console.error("Erro ao carregar sumario de governanca:", e);
    } finally {
        if (iconReload) iconReload.classList.remove("fa-spin");
    }
}

function renderFleetGovernanceGrid(services) {
    const grid = document.getElementById("fleetGovernanceGrid");
    if (!grid) return;

    if (!services || services.length === 0) {
        grid.innerHTML = `<div style="text-align: center; color: #94a3b8; padding: 20px; grid-column: 1 / -1;">Nenhum serviço rastreado no momento.</div>`;
        return;
    }

    grid.innerHTML = services.map(s => {
        const isSelected = s.service_name === currentGovernanceService;
        const borderStyle = isSelected ? "border: 2px solid #38bdf8; box-shadow: 0 0 15px rgba(56, 189, 248, 0.3);" : "border: 1px solid rgba(148, 163, 184, 0.2);";
        const bgGrad = isSelected ? "linear-gradient(135deg, rgba(30, 58, 138, 0.4), rgba(15, 23, 42, 0.9))" : "rgba(15, 23, 42, 0.75)";
        
        let barColor = "linear-gradient(90deg, #059669, #10b981)";
        let badgeBg = "rgba(16, 185, 129, 0.2)";
        let badgeColor = "#34d399";
        if (s.health === "warning") {
            barColor = "linear-gradient(90deg, #d97706, #f59e0b)";
            badgeBg = "rgba(245, 158, 11, 0.2)";
            badgeColor = "#fbbf24";
        } else if (s.health === "critical") {
            barColor = "linear-gradient(90deg, #dc2626, #ef4444)";
            badgeBg = "rgba(239, 68, 68, 0.2)";
            badgeColor = "#f87171";
        }

        return `
            <div style="background: ${bgGrad}; ${borderStyle} border-radius: 10px; padding: 14px; display: flex; flex-direction: column; justify-content: space-between; transition: all 0.2s ease;">
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 8px;">
                        <span style="font-weight: 700; font-size: 13px; color: #f8fafc; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${s.service_name}">
                            ${s.service_name}
                        </span>
                        <span style="background: ${badgeBg}; color: ${badgeColor}; font-size: 10px; padding: 2px 7px; border-radius: 10px; font-weight: 700; white-space: nowrap;">
                            ${s.health_label}
                        </span>
                    </div>

                    <div style="display: flex; justify-content: space-between; align-items: baseline; font-size: 11px; margin-bottom: 6px;">
                        <span style="color: #94a3b8;">Homologado: <strong style="color: #38bdf8; font-family: monospace;">v${s.target_version}</strong></span>
                        <span style="color: #f8fafc; font-weight: 800; font-size: 13px;">${s.updated_pct}%</span>
                    </div>

                    <!-- Mini Barra -->
                    <div style="height: 8px; border-radius: 4px; background: rgba(30, 41, 59, 0.8); overflow: hidden; margin-bottom: 10px;">
                        <div style="height: 100%; width: ${s.updated_pct}%; background: ${barColor}; border-radius: 4px;"></div>
                    </div>

                    <div style="display: flex; justify-content: space-between; font-size: 11px; color: #cbd5e1; margin-bottom: 12px;">
                        <span>Atualizados: <strong style="color: #34d399;">${s.updated_count} / ${s.total_hosts}</strong></span>
                        <span>Pendentes: <strong style="color: #fbbf24;">${s.pending_online_count}</strong></span>
                    </div>
                </div>

                <div style="display: flex; gap: 6px;">
                    <button class="btn-sm" onclick="selectGovernanceService('${s.service_name}')" style="flex: 1; padding: 6px 10px; font-size: 11px; font-weight: 700; background: ${isSelected ? '#0284c7' : 'rgba(56, 189, 248, 0.15)'}; color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 5px;">
                        <i class="fas fa-search"></i> ${isSelected ? 'Auditando Agora' : 'Auditar Rollout'}
                    </button>
                    <button class="btn-sm" onclick="openSetTargetVersionModalFor('${s.service_name}', '${s.target_version}')" style="padding: 6px 8px; font-size: 11px; background: rgba(148, 163, 184, 0.15); color: #94a3b8; border: 1px solid rgba(148, 163, 184, 0.3); border-radius: 6px; cursor: pointer;" title="Alterar versão homologada deste serviço">
                        <i class="fas fa-cog"></i>
                    </button>
                </div>
            </div>
        `;
    }).join("");
}

async function selectGovernanceService(serviceName) {
    currentGovernanceService = serviceName;
    const selEl = document.getElementById("selectFleetGovernanceService");
    if (selEl) selEl.value = serviceName;

    const titleEl = document.getElementById("titleSelectedServiceEvolution");
    if (titleEl) titleEl.innerText = `Evolução de Atualizações da Frota — ${serviceName}`;

    // Re-renderiza o grid para destacar o selecionado
    if (!cachedGovernanceSummary || !cachedGovernanceSummary.services) {
        await loadFleetGovernanceSummary(false);
    } else {
        renderFleetGovernanceGrid(cachedGovernanceSummary.services);
    }

    await loadFleetUpdateEvolution(true);
}

async function loadFleetUpdateEvolution(forceRefresh = false) {
    const iconReload = document.getElementById("iconReloadFleetEvolution");
    if (iconReload) iconReload.classList.add("fa-spin");

    try {
        const svc = currentGovernanceService || "DNA.MonitorServiceSVC";
        const resp = await fetch(`/api/fleet/governance/service/${encodeURIComponent(svc)}?_t=${Date.now()}`, {
            headers: { "Authorization": `Bearer ${getFleetAuthToken()}` }
        });
        if (!resp.ok) return;

        const data = await resp.json();
        cachedFleetEvolutionData = data;

        // 1. Atualizar Cabeçalho e Métricas Big
        const badgeVer = document.getElementById("badgeTargetVersion");
        if (badgeVer) badgeVer.innerText = `v${data.target_version}`;

        const pctBig = document.getElementById("fleetUpdatePctBig");
        if (pctBig) pctBig.innerText = `${data.updated_pct}%`;

        const countBig = document.getElementById("fleetUpdateCountBig");
        if (countBig) countBig.innerText = `(${data.updated_count} / ${data.total_hosts} hosts)`;

        const badgeActive = document.getElementById("fleetActiveAdoptionBadge");
        if (badgeActive) {
            badgeActive.innerText = `${data.active_adoption_pct}% na frota online ativa (${data.updated_count}/${data.online_count})`;
        }

        const legUpLabel = document.getElementById("legendUpdatedLabel");
        if (legUpLabel) legUpLabel.innerText = `Atualizados (v${data.target_version}):`;

        const cardUpLabel = document.getElementById("cardUpdatedLabel");
        if (cardUpLabel) cardUpLabel.innerText = `${data.service_name} v${data.target_version}`;

        const btnBatchCount = document.getElementById("btnBatchUpdateCount");
        if (btnBatchCount) btnBatchCount.innerText = data.pending_online_count || 0;

        const lastSyncEl = document.getElementById("fleetUpdateLastSync");
        if (lastSyncEl && data.last_sync) {
            const timeStr = new Date(data.last_sync).toLocaleTimeString();
            lastSyncEl.innerText = `Atualizado às ${timeStr}`;
        }

        // 2. Atualizar Barra de Progresso Multi-Segmento
        const barUp = document.getElementById("barUpdated");
        const barPend = document.getElementById("barPendingOnline");
        const barOff = document.getElementById("barOffline");

        const pctUp = data.updated_pct;
        const pctPend = data.total_hosts > 0 ? ((data.pending_online_count / data.total_hosts) * 100).toFixed(1) : 0;
        const pctOff = data.total_hosts > 0 ? ((data.offline_count / data.total_hosts) * 100).toFixed(1) : 0;

        if (barUp) barUp.style.width = `${pctUp}%`;
        if (barPend) barPend.style.width = `${pctPend}%`;
        if (barOff) barOff.style.width = `${pctOff}%`;

        // 3. Atualizar Legendas
        const legUp = document.getElementById("legendUpdatedCount");
        if (legUp) legUp.innerText = `${data.updated_count} (${pctUp}%)`;

        const legPend = document.getElementById("legendPendingOnlineCount");
        if (legPend) legPend.innerText = `${data.pending_online_count} (${pctPend}%)`;

        const legOff = document.getElementById("legendOfflineCount");
        if (legOff) legOff.innerText = `${data.offline_count} (${pctOff}%)`;

        // 4. Atualizar 4 Cards KPIs
        const cardUp = document.getElementById("cardUpdatedCount");
        if (cardUp) cardUp.innerText = data.updated_count;

        const cardPend = document.getElementById("cardPendingOnlineCount");
        if (cardPend) cardPend.innerText = data.pending_online_count;

        const cardOff = document.getElementById("cardOfflineCount");
        if (cardOff) cardOff.innerText = data.offline_count;

        const cardGov = document.getElementById("cardGovAlignedCount");
        if (cardGov) {
            const alignedCount = (data.hosts_detail || []).filter(h => h.versao_desejada === data.target_version || h.category === "updated").length;
            cardGov.innerText = `${alignedCount} / ${data.total_hosts}`;
        }

        // 5. Atualizar Contadores de Filtro e Botão de Cópia
        const btnCopyCount = document.getElementById("btnCopyCount");
        if (btnCopyCount) btnCopyCount.innerText = data.pending_online_hosts ? data.pending_online_hosts.length : 0;

        const fAll = document.getElementById("filterCountAll");
        if (fAll) fAll.innerText = data.total_hosts;

        const fUp = document.getElementById("filterCountUpdated");
        if (fUp) fUp.innerText = data.updated_count;

        const fPend = document.getElementById("filterCountPending");
        if (fPend) fPend.innerText = data.pending_online_count;

        const fOff = document.getElementById("filterCountOffline");
        if (fOff) fOff.innerText = data.offline_count;

        // 6. Renderizar a Tabela
        renderFleetEvolutionTable();

        if (forceRefresh && typeof showToast === "function") {
            showToast(`Telemetria de evolução de ${svc} atualizada!`, "success");
        }

    } catch (e) {
        console.error("Erro ao carregar evolucao de updates:", e);
    } finally {
        if (iconReload) iconReload.classList.remove("fa-spin");
    }
}

function filterFleetEvolutionTable(category) {
    currentFleetEvolutionFilter = category;

    // Atualiza estado visual dos botões de filtro
    const btnMap = {
        "all": "btnFilterAll",
        "updated": "btnFilterUpdated",
        "pending_online": "btnFilterPending",
        "offline": "btnFilterOffline"
    };

    Object.values(btnMap).forEach(id => {
        const b = document.getElementById(id);
        if (b) b.classList.remove("active");
    });

    const activeBtn = document.getElementById(btnMap[category] || "btnFilterAll");
    if (activeBtn) activeBtn.classList.add("active");

    renderFleetEvolutionTable();
}

function handleFleetEvolutionSearch(query) {
    searchFleetEvolutionQuery = (query || "").toLowerCase().trim();
    renderFleetEvolutionTable();
}

function renderFleetEvolutionTable() {
    const tbody = document.getElementById("fleetEvolutionTableBody");
    if (!tbody || !cachedFleetEvolutionData) return;

    const hosts = cachedFleetEvolutionData.hosts_detail || [];
    const targetVer = cachedFleetEvolutionData.target_version || "1.0.21.2";

    let filtered = hosts;

    // Filtro por categoria
    if (currentFleetEvolutionFilter !== "all") {
        filtered = filtered.filter(h => h.category === currentFleetEvolutionFilter);
    }

    // Filtro por texto de busca
    if (searchFleetEvolutionQuery) {
        filtered = filtered.filter(h => 
            (h.hostname || "").toLowerCase().includes(searchFleetEvolutionQuery) ||
            (h.praca || "").toLowerCase().includes(searchFleetEvolutionQuery) ||
            (h.versao_instalada || "").toLowerCase().includes(searchFleetEvolutionQuery)
        );
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px; color: #94a3b8;">Nenhum host encontrado para os filtros selecionados.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(h => {
        const isUp = h.category === "updated";
        const isPend = h.category === "pending_online";
        const isOff = h.category === "offline";

        // Badge de Versão Instalada
        let verBadge = `<span style="background: rgba(16,185,129,0.18); color: #34d399; border: 1px solid rgba(16,185,129,0.4); padding: 2px 8px; border-radius: 12px; font-weight: 700; font-family: monospace;">🟢 ${h.versao_instalada}</span>`;
        if (isPend) {
            verBadge = `<span style="background: rgba(245,158,11,0.18); color: #fbbf24; border: 1px solid rgba(245,158,11,0.4); padding: 2px 8px; border-radius: 12px; font-weight: 700; font-family: monospace;">🟡 ${h.versao_instalada}</span>`;
        } else if (isOff) {
            verBadge = `<span style="background: rgba(148,163,184,0.14); color: #94a3b8; border: 1px solid rgba(148,163,184,0.3); padding: 2px 8px; border-radius: 12px; font-weight: 600; font-family: monospace;">⚪ ${h.versao_instalada}</span>`;
        }

        // Status do Serviço
        const isSvcRunning = (h.status_servico || "").toLowerCase().includes("execu");
        const svcBadge = isSvcRunning 
            ? `<span style="color: #34d399; font-weight: 600;"><i class="fas fa-check-circle"></i> Em Execução</span>`
            : `<span style="color: #f87171; font-weight: 600;"><i class="fas fa-exclamation-triangle"></i> ${h.status_servico || "Parado"}</span>`;

        // Telemetria Formatada
        let timeFormatted = '<span style="color: #64748b;">Sem data</span>';
        if (h.ultima_atualizacao) {
            try {
                const dt = new Date(h.ultima_atualizacao);
                const isToday = h.is_online_today;
                const hhmm = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                if (isToday) {
                    timeFormatted = `<span style="color: #38bdf8; font-weight: 600;">Hoje às ${hhmm}</span>`;
                } else {
                    const ddmm = dt.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
                    timeFormatted = `<span style="color: #94a3b8;">${ddmm} ${hhmm}</span>`;
                }
            } catch (err) {
                timeFormatted = `<span style="color: #64748b;">${h.ultima_atualizacao}</span>`;
            }
        }

        // Governança / Ação Solicitada
        let govBadge = `<span style="color: #10b981; font-weight: 600;">Atualizado</span>`;
        if (h.acao_solicitada === "Atualizar") {
            govBadge = `<span style="color: #f59e0b; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; cursor: pointer; padding: 2px 6px; background: rgba(245, 158, 11, 0.1); border-radius: 4px; border: 1px solid rgba(245, 158, 11, 0.3);" onclick="openFleetUpdateProgressModal('${h.hostname}', '${currentGovernanceService}', '${h.versao_desejada || targetVer}')" title="Atualização em andamento! Clique para acompanhar ao vivo"><i class="fas fa-spinner fa-spin"></i> Atualizar</span>`;
        } else if (h.status_atualizacao === "Desatualizado") {
            govBadge = `<span style="color: #f87171; font-weight: 600;">Desatualizado</span>`;
        }

        // Ação de Atualização Direta (1 clique via Google Cloud) + Botão de Remover Máquina (Desinstalar e Excluir da Telemetria)
        const needsUpdate = (!isUp || h.status_atualizacao === "Desatualizado");
        const updateBtn = needsUpdate
            ? `<button class="btn-sm btn-primary" onclick="dispatchSingleHostUpdate('${h.hostname}', '${currentGovernanceService}', '${h.versao_desejada || targetVer}')" style="padding: 3px 8px; font-size: 11px; font-weight: 700; background: #0284c7; border: 1px solid #38bdf8; border-radius: 4px; color: #fff; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" title="Disparar atualização direta via Google Cloud Firestore: v${h.versao_desejada || targetVer}"><i class="fas fa-bolt"></i> Atualizar</button>`
            : `<button class="btn-sm" onclick="dispatchSingleHostUpdate('${h.hostname}', '${currentGovernanceService}', '${h.versao_desejada || targetVer}')" style="padding: 3px 8px; font-size: 11px; font-weight: 600; background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.35); border-radius: 4px; color: #34d399; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" title="Em dia! Clique se desejar forçar reinstalação via Google Cloud"><i class="fas fa-check-circle"></i> Em Dia</button>`;

        const removeHostBtn = `<button class="btn-sm" onclick="removeHostFromFleet('${h.hostname}', '${h.praca}')" style="padding: 3px 7px; font-size: 11px; background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.4); border-radius: 4px; color: #f87171; cursor: pointer; display: inline-flex; align-items: center; gap: 3px;" title="Desinstalar serviço na máquina remota e remover [${h.hostname}] da telemetria"><i class="fas fa-trash-alt"></i> Remover</button>`;

        const actionBtn = `<div style="display: inline-flex; align-items: center; gap: 6px; justify-content: center;">${updateBtn}${removeHostBtn}</div>`;

        return `
            <tr style="border-bottom: 1px solid rgba(148,163,184,0.1); transition: background 0.15s ease;" onmouseover="this.style.background='rgba(51,65,85,0.3)'" onmouseout="this.style.background='transparent'">
                <td style="padding: 8px 12px; font-weight: 600; color: #f8fafc;">
                    ${h.praca} <span style="font-size: 10px; color: #64748b; font-weight: normal; margin-left: 4px;">CS ${h.cs || 1}</span>
                </td>
                <td style="padding: 8px 12px; font-family: monospace; font-size: 11px; color: #cbd5e1;">
                    ${h.hostname}
                </td>
                <td style="padding: 8px 12px; text-align: center;">
                    ${verBadge}
                </td>
                <td style="padding: 8px 12px; text-align: center; font-family: monospace; font-size: 11px;">
                    <span style="color: #38bdf8; cursor: pointer; padding: 2px 6px; border-radius: 4px; background: rgba(56,189,248,0.1); border: 1px solid rgba(56,189,248,0.25);" title="Clique para alterar a versão desejada deste host no SharePoint" onclick="openSetHostDesiredVersionModal('${h.hostname}', '${currentGovernanceService}', '${h.versao_desejada || targetVer}')">
                        ${h.versao_desejada || targetVer} <i class="fas fa-edit" style="font-size: 9px; margin-left: 2px; opacity: 0.8;"></i>
                    </span>
                </td>
                <td style="padding: 8px 12px; text-align: center; font-size: 11px;">
                    ${svcBadge}
                </td>
                <td style="padding: 8px 12px; text-align: center; font-size: 11px;">
                    ${timeFormatted}
                </td>
                <td style="padding: 8px 12px; text-align: center; font-size: 11px;">
                    ${govBadge}
                </td>
                <td style="padding: 8px 12px; text-align: center; font-size: 11px;">
                    ${actionBtn}
                </td>
            </tr>
        `;
    }).join("");
}

// ==============================================================================
// GOVERNANÇA RBAC, MODAL DE DUPLA CONFIRMAÇÃO E TRILHA DE AUDITORIA DA FROTA
// ==============================================================================

let cachedFleetAuditEntries = [];
let currentFleetAuditFilter = "all";
let currentFleetRbacUser = {
    username: "operador",
    name: "Operador NOC",
    role: "admin",
    can_update_single: true,
    can_update_batch: true,
    can_set_version: true,
    can_remove_host: true,
    can_remote_command: true
};
let pendingFleetSafetyAction = null;

async function loadFleetAuditLog(forceRefresh = false) {
    const icon = document.getElementById("iconReloadFleetAudit");
    if (icon) icon.classList.add("fa-spin");

    try {
        const resp = await fetch(`/api/fleet/governance/audit-log?limit=120&_t=${Date.now()}`, {
            headers: {
                ...(getFleetAuthToken() ? { "Authorization": `Bearer ${getFleetAuthToken()}` } : {})
            }
        });
        if (!resp.ok) return;
        const data = await resp.json();
        if (!data || !data.success) return;

        cachedFleetAuditEntries = data.entries || [];
        if (data.current_user) {
            currentFleetRbacUser = data.current_user;
            updateFleetRbacBadges();
        }
        renderFleetAuditLogTable();

        if (forceRefresh && typeof showToast === "function") {
            showToast("Trilha de auditoria e permissões atualizadas!", "success");
        }
    } catch (e) {
        console.error("Erro ao carregar trilha de auditoria da frota:", e);
    } finally {
        if (icon) icon.classList.remove("fa-spin");
    }
}

function updateFleetRbacBadges() {
    const u = currentFleetRbacUser || {};
    const roleUpper = String(u.role || "ADMIN").toUpperCase();
    const userBadge = document.getElementById("fleetRbacUserBadge");
    if (userBadge) {
        userBadge.innerText = `👤 Operador: ${u.name || u.username || "Operador"} (@${u.username || "noc"})`;
    }
    const roleBadge = document.getElementById("fleetRbacRoleBadge");
    if (roleBadge) {
        const permDesc = u.can_update_batch ? "Permissão Total (Lote / Individual / Remoção)" : (u.can_update_single ? "Operação Individual & Comandos" : "Somente Leitura (Visualização)");
        roleBadge.innerText = `🛡️ Perfil: ${roleUpper} • ${permDesc}`;
    }
    const rcBadge = document.getElementById("rcRbacOperatorBadge");
    if (rcBadge) {
        rcBadge.innerText = `🔒 Operador: @${u.username || "noc"} (${roleUpper}) • Dupla Confirmação Ativa`;
    }
}

function filterFleetAuditLog(actionType) {
    currentFleetAuditFilter = actionType || "all";
    renderFleetAuditLogTable();
}

function renderFleetAuditLogTable() {
    const tbody = document.getElementById("fleetAuditLogTableBody");
    if (!tbody) return;

    let list = cachedFleetAuditEntries || [];
    if (currentFleetAuditFilter && currentFleetAuditFilter !== "all") {
        list = list.filter(item => item.action_type === currentFleetAuditFilter);
    }

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px; color: #94a3b8;">Nenhum registro de auditoria encontrado para o filtro selecionado.</td></tr>`;
        return;
    }

    const actionBadges = {
        "UPDATE_BATCH": { label: "🚀 Atualização em Lote", bg: "rgba(16, 185, 129, 0.16)", color: "#34d399", border: "rgba(16, 185, 129, 0.4)" },
        "UPDATE_SINGLE": { label: "⚡ Atualização Individual", bg: "rgba(56, 189, 248, 0.16)", color: "#38bdf8", border: "rgba(56, 189, 248, 0.4)" },
        "SET_VERSION": { label: "⚙️ Versão Homologada", bg: "rgba(168, 85, 247, 0.16)", color: "#c084fc", border: "rgba(168, 85, 247, 0.4)" },
        "REMOVE_HOST": { label: "🗑️ Remoção de Máquina", bg: "rgba(239, 68, 68, 0.16)", color: "#f87171", border: "rgba(239, 68, 68, 0.4)" },
        "REMOTE_COMMAND": { label: "💻 Remote Command", bg: "rgba(245, 158, 11, 0.16)", color: "#fbbf24", border: "rgba(245, 158, 11, 0.4)" }
    };

    tbody.innerHTML = list.map(entry => {
        const ab = actionBadges[entry.action_type] || { label: entry.action_type || "OPERAÇÃO", bg: "rgba(148,163,184,0.15)", color: "#cbd5e1", border: "rgba(148,163,184,0.3)" };
        let timeStr = entry.timestamp || "";
        if (entry.timestamp_iso && !timeStr.includes("/")) {
            try {
                const dt = new Date(entry.timestamp_iso);
                if (!isNaN(dt.getTime())) {
                    timeStr = `${dt.toLocaleDateString("pt-BR")} ${dt.toLocaleTimeString("pt-BR")}`;
                }
            } catch (e) {}
        }

        const hostsArr = Array.isArray(entry.target_hosts) ? entry.target_hosts : [];
        const hostsText = entry.target || (hostsArr.length <= 3
            ? hostsArr.join(", ")
            : `${hostsArr.slice(0, 3).join(", ")} (+${hostsArr.length - 3} hosts)`);

        const stUpper = (entry.status || "").toUpperCase();
        const isSuccess = stUpper === "SUCCESS" || stUpper.includes("SUCESSO") || stUpper.includes("OK");
        const statusHtml = isSuccess
            ? `<span style="color: #34d399; font-weight: 700;"><i class="fas fa-check-circle"></i> ${entry.status || "Auditado"}</span>`
            : `<span style="color: #f87171; font-weight: 700;"><i class="fas fa-times-circle"></i> ${entry.status || "Bloqueado"}</span>`;

        const verInfo = entry.target_version ? ` <span style="color: #38bdf8; font-family: monospace;">(v${entry.target_version})</span>` : "";
        const opName = entry.full_name || entry.operator_name || entry.username || "Operador";

        return `
            <tr style="border-bottom: 1px solid rgba(148, 163, 184, 0.1);">
                <td style="padding: 8px 12px; font-family: monospace; font-size: 11px; color: #cbd5e1; white-space: nowrap;">${timeStr}</td>
                <td style="padding: 8px 12px; font-weight: 700; color: #f8fafc;">
                    ${opName} <span style="color: #64748b; font-weight: normal; font-size: 11px;">(@${entry.username || "noc"})</span>
                </td>
                <td style="padding: 8px 12px; text-align: center;">
                    <span style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.35); padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 700;">${entry.role || "ADMIN"}</span>
                </td>
                <td style="padding: 8px 12px; text-align: center;">
                    <span style="background: ${ab.bg}; color: ${ab.color}; border: 1px solid ${ab.border}; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 700; white-space: nowrap;">${ab.label}</span>
                </td>
                <td style="padding: 8px 12px; font-family: monospace; font-size: 11px; color: #e2e8f0;">${entry.service_name || entry.command_preview || "--"}${verInfo}</td>
                <td style="padding: 8px 12px; font-family: monospace; font-size: 11px; color: #93c5fd;" title="${hostsText}">${hostsText || "--"}</td>
                <td style="padding: 8px 12px; font-size: 11px; color: #cbd5e1;">
                    <strong>${entry.reason || "Operação manual autenticada"}</strong>
                    ${entry.details ? `<div style="font-size: 10px; color: #94a3b8; margin-top: 2px;">${entry.details}</div>` : ""}
                </td>
                <td style="padding: 8px 12px; text-align: center; font-size: 11px; white-space: nowrap;">${statusHtml}</td>
            </tr>
        `;
    }).join("");
}

function openFleetSafetyModal(config) {
    // Verifica RBAC do usuário antes de abrir o modal
    const u = currentFleetRbacUser || {};
    const act = config.actionType || "UPDATE_SINGLE";
    if (act === "UPDATE_BATCH" && u.can_update_batch === false) {
        if (typeof showToast === "function") showToast(`Acesso Negado (RBAC): Seu perfil (${String(u.role || "").toUpperCase()}) não possui permissão para disparo em lote.`, "error");
        return;
    }
    if (act === "REMOVE_HOST" && u.can_remove_host === false) {
        if (typeof showToast === "function") showToast(`Acesso Negado (RBAC): Apenas ADMIN ou Engenharia N3 podem desinstalar e remover máquinas da frota.`, "error");
        return;
    }
    if (act === "SET_VERSION" && u.can_set_version === false) {
        if (typeof showToast === "function") showToast(`Acesso Negado (RBAC): Apenas ADMIN ou Engenharia N3 podem alterar a versão homologada oficial.`, "error");
        return;
    }
    if (act === "UPDATE_SINGLE" && u.can_update_single === false) {
        if (typeof showToast === "function") showToast(`Acesso Negado (RBAC): Perfil de visualização não pode disparar atualizações nos Capture Sites.`, "error");
        return;
    }

    pendingFleetSafetyAction = config;
    const modal = document.getElementById("modalSafetyConfirmation");
    if (!modal) {
        if (typeof config.onConfirm === "function") config.onConfirm("Operação confirmada pelo operador");
        return;
    }

    const elTitle = document.getElementById("safetyModalTitle");
    if (elTitle) elTitle.innerText = config.title || "Confirmação de Segurança & Auditoria RBAC";

    const elOp = document.getElementById("safetyModalOperator");
    if (elOp) elOp.innerText = `${u.name || u.username || "Operador NOC"} (@${u.username || "admin"})`;

    const elRole = document.getElementById("safetyModalRoleBadge");
    if (elRole) elRole.innerText = `PERFIL: ${String(u.role || "ADMIN").toUpperCase()}`;

    const elBadge = document.getElementById("safetyModalActionBadge");
    if (elBadge) elBadge.innerText = config.badgeText || act;

    const hostsList = Array.isArray(config.hosts) ? config.hosts : [];
    const elCount = document.getElementById("safetyModalTargetCount");
    if (elCount) elCount.innerText = `${hostsList.length} Capture Site(s)`;

    const elSum = document.getElementById("safetyModalSummaryText");
    if (elSum) elSum.innerText = config.summaryText || "";

    const elHosts = document.getElementById("safetyModalTargetHosts");
    if (elHosts) elHosts.innerText = hostsList.join(", ") || "Frota Selecionada";

    const elWarn = document.getElementById("safetyModalImpactWarning");
    if (elWarn) elWarn.innerText = config.impactWarning || "";

    const inpReason = document.getElementById("safetyConfirmReasonInput");
    if (inpReason) inpReason.value = config.defaultReason || "Atualização homologada de rotina";

    const chk = document.getElementById("safetyConfirmCheckbox");
    if (chk) chk.checked = false;
    onSafetyConfirmCheckboxChange();

    modal.style.display = "flex";
}

function closeFleetSafetyModal() {
    const modal = document.getElementById("modalSafetyConfirmation");
    if (modal) modal.style.display = "none";
    pendingFleetSafetyAction = null;
}

function setSafetyReasonPreset(text) {
    const inp = document.getElementById("safetyConfirmReasonInput");
    if (inp) inp.value = text;
}

function onSafetyConfirmCheckboxChange() {
    const chk = document.getElementById("safetyConfirmCheckbox");
    const btn = document.getElementById("btnConfirmSafetyModalExec");
    if (!btn) return;
    if (chk && chk.checked) {
        btn.disabled = false;
        btn.style.opacity = "1";
        btn.style.cursor = "pointer";
    } else {
        btn.disabled = true;
        btn.style.opacity = "0.5";
        btn.style.cursor = "not-allowed";
    }
}

async function confirmFleetSafetyModal() {
    if (!pendingFleetSafetyAction) return;
    const actionObj = pendingFleetSafetyAction;
    const reason = (document.getElementById("safetyConfirmReasonInput")?.value || "Operação autorizada pelo operador").trim();
    closeFleetSafetyModal();
    if (typeof actionObj.onConfirm === "function") {
        await actionObj.onConfirm(reason);
    }
}

window.loadFleetAuditLog = loadFleetAuditLog;
window.filterFleetAuditLog = filterFleetAuditLog;
window.openFleetSafetyModal = openFleetSafetyModal;
window.closeFleetSafetyModal = closeFleetSafetyModal;
window.setSafetyReasonPreset = setSafetyReasonPreset;
window.onSafetyConfirmCheckboxChange = onSafetyConfirmCheckboxChange;
window.confirmFleetSafetyModal = confirmFleetSafetyModal;

async function dispatchSingleHostUpdate(hostname, serviceName, targetVersion) {
    openFleetSafetyModal({
        actionType: "UPDATE_SINGLE",
        title: `Confirmar Atualização Individual — ${hostname}`,
        badgeText: "⚡ ATUALIZAÇÃO INDIVIDUAL DE CAPTURE SITE",
        hosts: [hostname],
        summaryText: `Disparar atualização do serviço ${serviceName} para a versão v${targetVersion} via Google Cloud Firestore.`,
        impactWarning: "O agente no Capture Site fará o download silencioso do pacote no Google Cloud Storage, validará o hash SHA-256 e reiniciará apenas o serviço selecionado.",
        defaultReason: `Atualização homologada de ${serviceName} para v${targetVersion}`,
        onConfirm: async (reason) => {
            try {
                const resp = await fetch("/api/fleet/governance/dispatch-update", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...(getFleetAuthToken() ? { "Authorization": `Bearer ${getFleetAuthToken()}` } : {})
                    },
                    body: JSON.stringify({
                        service_name: serviceName,
                        target_version: targetVersion,
                        hosts: [hostname],
                        reason: reason
                    })
                });
                const data = await resp.json();
                if (resp.ok && data.success) {
                    if (typeof showToast === "function") {
                        showToast(`Atualização disparada no Google Cloud para ${hostname} (v${targetVersion})!`, "success");
                    }
                    await loadFleetUpdateEvolution(true);
                    await loadFleetGovernanceSummary(false);
                    await loadFleetAuditLog(false);
                    if (typeof loadServicesTable === "function") loadServicesTable();
                    if (typeof openFleetUpdateProgressModal === "function") {
                        openFleetUpdateProgressModal(hostname, serviceName, targetVersion);
                    }
                } else {
                    const errMsg = data.detail || data.error || (data.failed_hosts && data.failed_hosts[0]?.error) || "Falha ao disparar ordem de atualização";
                    if (typeof showToast === "function") {
                        showToast(errMsg, "error");
                    }
                }
            } catch (err) {
                console.error("Erro ao disparar atualização unitária:", err);
                if (typeof showToast === "function") showToast(err.message, "error");
            }
        }
    });
}
window.dispatchSingleHostUpdate = dispatchSingleHostUpdate;

async function dispatchBatchPendingUpdate() {
    if (!cachedFleetEvolutionData || !cachedFleetEvolutionData.pending_online_hosts || cachedFleetEvolutionData.pending_online_hosts.length === 0) {
        if (typeof showToast === "function") showToast("Nenhum host pendente online no momento para este serviço!", "info");
        return;
    }
    const pendingHosts = cachedFleetEvolutionData.pending_online_hosts;
    const count = pendingHosts.length;
    const svc = currentGovernanceService;
    const ver = cachedFleetEvolutionData.target_version;

    openFleetSafetyModal({
        actionType: "UPDATE_BATCH",
        title: `Confirmar Atualização em Lote (${count} Capture Sites)`,
        badgeText: "🚀 ATUALIZAÇÃO EM LOTE NA FROTA",
        hosts: pendingHosts,
        summaryText: `Disparar atualização em lote de ${svc} para a versão v${ver} em todos os ${count} Capture Sites pendentes online.`,
        impactWarning: "⚠️ Atenção: Esta operação enviará a ordem de atualização simultaneamente para as máquinas listadas acima e ficará registrada em seu usuário.",
        defaultReason: `Rollout em lote homologado de ${svc} v${ver}`,
        onConfirm: async (reason) => {
            try {
                const resp = await fetch("/api/fleet/governance/dispatch-update", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...(getFleetAuthToken() ? { "Authorization": `Bearer ${getFleetAuthToken()}` } : {})
                    },
                    body: JSON.stringify({
                        service_name: svc,
                        target_version: ver,
                        hosts: pendingHosts,
                        reason: reason
                    })
                });
                const data = await resp.json();
                if (resp.ok && data.success) {
                    if (typeof showToast === "function") {
                        showToast(`Atualização despachada no Google Cloud para ${data.dispatched_count} hosts!`, "success");
                    }
                    await loadFleetUpdateEvolution(true);
                    await loadFleetGovernanceSummary(false);
                    await loadFleetAuditLog(false);
                    if (typeof loadServicesTable === "function") loadServicesTable();
                } else {
                    if (typeof showToast === "function") {
                        showToast(data.detail || data.error || "Falha ao despachar lote", "error");
                    }
                }
            } catch (err) {
                console.error("Erro ao disparar lote:", err);
                if (typeof showToast === "function") showToast(err.message, "error");
            }
        }
    });
}
window.dispatchBatchPendingUpdate = dispatchBatchPendingUpdate;

function openSetHostDesiredVersionModal(hostname, serviceName, currentVer) {
    const newVer = prompt(`Definir Versão Desejada para [${hostname}] (${serviceName}):`, currentVer || "1.0.0.0");
    if (!newVer || newVer.trim() === "" || newVer.trim() === currentVer) return;
    
    dispatchSingleHostUpdate(hostname, serviceName, newVer.trim());
}
window.openSetHostDesiredVersionModal = openSetHostDesiredVersionModal;

function copyPendingHostsToClipboard() {
    if (!cachedFleetEvolutionData || !cachedFleetEvolutionData.pending_online_csv) {
        if (typeof showToast === "function") showToast("Nenhum host pendente no momento!", "info");
        return;
    }

    const textToCopy = cachedFleetEvolutionData.pending_online_csv;
    navigator.clipboard.writeText(textToCopy).then(() => {
        const count = cachedFleetEvolutionData.pending_online_hosts ? cachedFleetEvolutionData.pending_online_hosts.length : 0;
        if (typeof showToast === "function") {
            showToast(`Lista de ${count} hosts pendentes copiada para a área de transferência!`, "success");
        }
    }).catch(err => {
        const ta = document.createElement("textarea");
        ta.value = textToCopy;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        if (typeof showToast === "function") {
            showToast("Lista de hosts copiada para o clipboard!", "success");
        }
    });
}

function copyGvCommandToClipboard() {
    const cmd = `powershell -ExecutionPolicy Bypass -NoProfile -Command "& { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $ProgressPreference = 'SilentlyContinue'; $s = 'DNA.MonitorServiceSVC'; $d = if (Test-Path 'D:\\MediaDNA_V2\\Applications\\MonitorServiceSVC') { 'D:\\MediaDNA_V2\\Applications\\MonitorServiceSVC' } elseif (Test-Path 'C:\\MediaDNA_V2\\Applications\\MonitorServiceSVC') { 'C:\\MediaDNA_V2\\Applications\\MonitorServiceSVC' } else { $null }; if (-not $d) { Write-Host '[ERRO] Diretorio nao encontrado'; exit 1 }; $curr = (Get-Item (Join-Path $d 'WinServiceFleetAgent.exe') -ErrorAction SilentlyContinue).VersionInfo.FileVersion; $m = try { Invoke-RestMethod -Uri ('https://storage.googleapis.com/kantar-fleet-releases/manifest.json?t=' + (Get-Random)) -TimeoutSec 15 } catch { $null }; $targetVer = if ($m -and $m.services.$s.version) { $m.services.$s.version } else { '1.0.21.4' }; if ($curr -eq $targetVer) { Write-Host \\"[OK] Ja atualizado na versao $curr\\"; exit 0 }; $url = if ($m -and $m.services.$s.download_url) { $m.services.$s.download_url } else { 'https://storage.googleapis.com/kantar-fleet-releases/DNA.MonitorServiceSVC_v' + $targetVer + '.zip' }; $zip = \\"$env:TEMP\\$s\`_$targetVer.zip\\"; Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing; Stop-Service -Name $s -Force -ErrorAction SilentlyContinue; Expand-Archive -Path $zip -DestinationPath $d -Force; Start-Service -Name $s -ErrorAction SilentlyContinue; Write-Host \\"[OK] DNA.MonitorServiceSVC atualizado com sucesso de $curr para $targetVer via Google Cloud Storage\\"; }"`;
    
    navigator.clipboard.writeText(cmd).then(() => {
        if (typeof showToast === "function") {
            showToast("Comando PowerShell do GV copiado com sucesso!", "success");
        }
    }).catch(err => {
        const ta = document.createElement("textarea");
        ta.value = cmd;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        if (typeof showToast === "function") {
            showToast("Comando PowerShell do GV copiado com sucesso!", "success");
        }
    });
}

function openSetTargetVersionModal() {
    const modal = document.getElementById("modalSetDesiredVersion");
    if (!modal) return;
    
    const sel = document.getElementById("modalSelectService");
    if (sel) sel.value = currentGovernanceService || "DNA.MonitorServiceSVC";
    
    const inp = document.getElementById("modalInputVersion");
    if (inp && cachedFleetEvolutionData) {
        inp.value = cachedFleetEvolutionData.target_version || "";
    }
    
    modal.style.display = "flex";
}

function openSetTargetVersionModalFor(serviceName, currentVersion) {
    const modal = document.getElementById("modalSetDesiredVersion");
    if (!modal) return;

    const sel = document.getElementById("modalSelectService");
    if (sel) sel.value = serviceName;

    const inp = document.getElementById("modalInputVersion");
    if (inp) inp.value = currentVersion || "";

    modal.style.display = "flex";
}

function closeSetTargetVersionModal() {
    const modal = document.getElementById("modalSetDesiredVersion");
    if (modal) modal.style.display = "none";
}

function onModalServiceChange(serviceName) {
    if (cachedGovernanceSummary && cachedGovernanceSummary.services) {
        const item = cachedGovernanceSummary.services.find(s => s.service_name === serviceName);
        if (item) {
            const inp = document.getElementById("modalInputVersion");
            if (inp) inp.value = item.target_version || "";
        }
    }
}

async function submitSetDesiredVersion(event) {
    if (event) event.preventDefault();
    
    const sel = document.getElementById("modalSelectService");
    const inp = document.getElementById("modalInputVersion");
    const chkAuto = document.getElementById("modalAutoDispatchCloud");
    if (!sel || !inp) return;

    const serviceName = sel.value;
    const targetVersion = inp.value.trim();
    const autoDispatch = chkAuto ? chkAuto.checked : true;
    if (!serviceName || !targetVersion) {
        if (typeof showToast === "function") showToast("Selecione o serviço e informe a versão!", "warning");
        return;
    }

    closeSetTargetVersionModal();
    openFleetSafetyModal({
        actionType: "SET_VERSION",
        title: `Definir Nova Versão Homologada — ${serviceName}`,
        badgeText: "⚙️ ALTERAÇÃO DE VERSÃO OFICIAL DA FROTA",
        hosts: [autoDispatch ? "TODA_A_FROTA_ELEGIVEL" : "MATRIZ_DE_GOVERNANCA"],
        summaryText: `Alterar versão oficial homologada de ${serviceName} para v${targetVersion} (${autoDispatch ? 'Com disparo automático via Google Cloud' : 'Apenas atualizar matriz'}).`,
        impactWarning: "Esta ação atualiza a Matriz Oficial de Governança e o manifest.json no Google Cloud Storage.",
        defaultReason: `Homologação oficial da release ${serviceName} v${targetVersion}`,
        onConfirm: async (reason) => {
            try {
                const resp = await fetch("/api/fleet/governance/set-version", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...(getFleetAuthToken() ? { "Authorization": `Bearer ${getFleetAuthToken()}` } : {})
                    },
                    body: JSON.stringify({
                        service_name: serviceName,
                        target_version: targetVersion,
                        auto_dispatch: autoDispatch,
                        reason: reason
                    })
                });

                const data = await resp.json();
                if (!resp.ok || !data.success) {
                    if (typeof showToast === "function") showToast(data.detail || data.error || "Erro ao salvar versão", "error");
                    return;
                }

                if (typeof showToast === "function") {
                    const dispMsg = data.dispatched_count > 0 ? ` e atualização disparada para ${data.dispatched_count} máquinas via Google Cloud!` : "!";
                    showToast(`Versão homologada de ${serviceName} alterada para v${targetVersion}${dispMsg}`, "success");
                }

                await loadFleetGovernanceSummary(false);
                await loadFleetAuditLog(false);
                if (currentGovernanceService === serviceName) {
                    await loadFleetUpdateEvolution(false);
                }
            } catch (err) {
                console.error("Erro ao enviar set-version:", err);
                if (typeof showToast === "function") showToast("Falha de rede ao salvar versão homologada", "error");
            }
        }
    });
}

async function removeHostFromFleet(hostname, praca) {
    const label = praca ? `${praca} (${hostname})` : hostname;
    openFleetSafetyModal({
        actionType: "REMOVE_HOST",
        title: `Remover e Desinstalar Máquina — ${label}`,
        badgeText: "🗑️ REMOÇÃO E DESINSTALAÇÃO DE CAPTURE SITE",
        hosts: [hostname],
        summaryText: `Desinstalar o serviço DNA.MonitorServiceSVC na máquina remota [${label}] e removê-la da telemetria do Google Cloud Firestore e do Dashboard.`,
        impactWarning: "🚨 ATENÇÃO CRÍTICA: O serviço de monitoramento será interrompido e removido do Windows na estação remota.",
        defaultReason: `Desativação / remoção oficial da estação ${label}`,
        onConfirm: async (reason) => {
            try {
                const resp = await fetch("/api/fleet/governance/remove-host", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...(getFleetAuthToken() ? { "Authorization": `Bearer ${getFleetAuthToken()}` } : {})
                    },
                    body: JSON.stringify({ hostname: hostname, reason: reason })
                });
                const data = await resp.json();
                if (!resp.ok || !data.success) {
                    if (typeof showToast === "function") showToast(data.detail || data.error || "Erro ao remover máquina", "error");
                    return;
                }
                if (typeof showToast === "function") {
                    showToast(data.message || `Máquina ${hostname} desinstalada e removida da telemetria!`, "success");
                }
                await loadFleetUpdateEvolution(false);
                await loadFleetGovernanceSummary(false);
                await loadFleetAuditLog(false);
                if (typeof loadServicesTable === "function") loadServicesTable();
            } catch (err) {
                console.error("Erro ao remover host da frota:", err);
                if (typeof showToast === "function") showToast("Falha ao remover máquina da frota", "error");
            }
        }
    });
}
window.removeHostFromFleet = removeHostFromFleet;

window.loadFleetGovernanceSummary = loadFleetGovernanceSummary;
window.selectGovernanceService = selectGovernanceService;
window.openSetTargetVersionModal = openSetTargetVersionModal;
window.openSetTargetVersionModalFor = openSetTargetVersionModalFor;
window.closeSetTargetVersionModal = closeSetTargetVersionModal;
window.onModalServiceChange = onModalServiceChange;
window.submitSetDesiredVersion = submitSetDesiredVersion;
window.loadFleetUpdateEvolution = loadFleetUpdateEvolution;
window.filterFleetEvolutionTable = filterFleetEvolutionTable;
window.handleFleetEvolutionSearch = handleFleetEvolutionSearch;
window.copyPendingHostsToClipboard = copyPendingHostsToClipboard;
window.copyGvCommandToClipboard = copyGvCommandToClipboard;

// Auto-refresh da evolução ao vivo enquanto o usuário estiver na aba Frota
setInterval(() => {
    const activeTab = document.querySelector(".nav-btn.active")?.dataset?.tab;
    if (activeTab === "fleet") {
        loadFleetGovernanceSummary(false);
        loadFleetUpdateEvolution(false);
    }
}, 30000);


// ==============================================================================
// MODAL DE ACOMPANHAMENTO DE ATUALIZAÇÃO EM TEMPO REAL (SHAREPOINT ↔ AGENTE CS ↔ SERVIÇO)
// ==============================================================================

let currentUpdateProgressHost = null;
let currentUpdateProgressService = null;
let currentUpdateProgressTargetVersion = null;
let currentUpdateProgressTimerInterval = null;
let currentUpdateProgressPollInterval = null;
let updateProgressStartTime = null;

async function openFleetUpdateProgressModal(host, serviceName, targetVersion = null) {
    currentUpdateProgressHost = host;
    currentUpdateProgressService = serviceName || currentGovernanceService || "Atria Capture";
    currentUpdateProgressTargetVersion = targetVersion || (cachedFleetEvolutionData ? cachedFleetEvolutionData.target_version : "2.0.0.2");
    updateProgressStartTime = Date.now();

    const modal = document.getElementById("fleetUpdateProgressModal");
    if (!modal) return;
    modal.style.display = "flex";

    // Preenche dados iniciais no cabeçalho
    const elHost = document.getElementById("upProgHost");
    if (elHost) elHost.innerText = host;
    const elSvc = document.getElementById("upProgService");
    if (elSvc) elSvc.innerText = currentUpdateProgressService;
    const elDes = document.getElementById("upProgDesired");
    if (elDes && currentUpdateProgressTargetVersion) elDes.innerText = `v${currentUpdateProgressTargetVersion}`;

    // Dispara cronômetro
    if (currentUpdateProgressTimerInterval) clearInterval(currentUpdateProgressTimerInterval);
    currentUpdateProgressTimerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - updateProgressStartTime) / 1000);
        const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
        const ss = String(elapsed % 60).padStart(2, "0");
        const timerEl = document.getElementById("upProgTimer");
        if (timerEl) timerEl.innerText = `Tempo decorrido: ${mm}:${ss}`;
    }, 1000);

    // Carrega dados iniciais
    await refreshFleetUpdateProgressLive();

    // Inicia auto-polling a cada 4 segundos
    if (currentUpdateProgressPollInterval) clearInterval(currentUpdateProgressPollInterval);
    currentUpdateProgressPollInterval = setInterval(() => {
        const chk = document.getElementById("upProgAutoRefresh");
        if (chk && chk.checked) {
            refreshFleetUpdateProgressLive();
        }
    }, 4000);
}

function closeFleetUpdateProgressModal() {
    if (currentUpdateProgressTimerInterval) {
        clearInterval(currentUpdateProgressTimerInterval);
        currentUpdateProgressTimerInterval = null;
    }
    if (currentUpdateProgressPollInterval) {
        clearInterval(currentUpdateProgressPollInterval);
        currentUpdateProgressPollInterval = null;
    }
    const modal = document.getElementById("fleetUpdateProgressModal");
    if (modal) modal.style.display = "none";
}

async function refreshFleetUpdateProgressLive() {
    if (!currentUpdateProgressHost || !currentUpdateProgressService) return;
    const icon = document.getElementById("upProgRefreshIcon");
    if (icon) icon.classList.add("fa-spin");

    try {
        const targetParam = currentUpdateProgressTargetVersion ? `&target_version=${encodeURIComponent(currentUpdateProgressTargetVersion)}` : "";
        const resp = await fetch(`/api/fleet/action/status?host=${encodeURIComponent(currentUpdateProgressHost)}&service_name=${encodeURIComponent(currentUpdateProgressService)}${targetParam}&_t=${Date.now()}`, {
            headers: {
                "Authorization": `Bearer ${getFleetAuthToken()}`
            }
        });
        if (!resp.ok) return;
        const data = await resp.json();
        renderFleetUpdateProgressData(data);
    } catch (e) {
        console.warn("[FleetUpdateProgress] Erro ao obter status:", e);
    } finally {
        if (icon) icon.classList.remove("fa-spin");
    }
}

function renderFleetUpdateProgressData(data) {
    if (!data || !data.success) return;

    // Atualiza cabeçalho e pílulas
    const elPraca = document.getElementById("upProgPraca");
    if (elPraca) elPraca.innerText = `${data.praca || "Praça"} CS ${data.cs || 1}`;
    const elHost = document.getElementById("upProgHost");
    if (elHost) elHost.innerText = data.hostname;
    const elSvc = document.getElementById("upProgService");
    if (elSvc) elSvc.innerText = data.service_name;
    const elInst = document.getElementById("upProgInstalled");
    if (elInst) elInst.innerText = `v${data.versao_instalada}`;
    const elDes = document.getElementById("upProgDesired");
    if (elDes) elDes.innerText = `v${data.versao_desejada}`;

    // Badge de status
    const badgeEl = document.getElementById("upProgStatusBadge");
    if (badgeEl) {
        badgeEl.className = data.badge_color === "green" ? "badge badge-green" :
                           (data.badge_color === "red" ? "badge badge-red" :
                           (data.badge_color === "blue" ? "badge badge-blue" : "badge badge-yellow"));
        badgeEl.innerText = data.status_badge;
    }

    // Mensagem de explicação
    const msgTitle = document.getElementById("upProgMessageTitle");
    if (msgTitle) msgTitle.innerText = data.status_badge;
    const msgText = document.getElementById("upProgMessageText");
    if (msgText) msgText.innerHTML = data.message;

    // Estilo dinâmico da caixa de mensagem
    const msgBox = document.getElementById("upProgMessageBox");
    if (msgBox) {
        if (data.badge_color === "yellow" || data.contingency_recommended) {
            msgBox.style.background = "rgba(245, 158, 11, 0.12)";
            msgBox.style.border = "1px solid rgba(245, 158, 11, 0.4)";
        } else if (data.badge_color === "red") {
            msgBox.style.background = "rgba(239, 68, 68, 0.12)";
            msgBox.style.border = "1px solid rgba(239, 68, 68, 0.4)";
        } else if (data.badge_color === "green") {
            msgBox.style.background = "rgba(16, 185, 129, 0.12)";
            msgBox.style.border = "1px solid rgba(16, 185, 129, 0.4)";
        } else {
            msgBox.style.background = "rgba(2, 132, 199, 0.1)";
            msgBox.style.border = "1px solid rgba(2, 132, 199, 0.3)";
        }
    }

    // Comando manual
    const cmdInput = document.getElementById("upProgManualCmdInput");
    if (cmdInput && data.manual_command) cmdInput.value = data.manual_command;

    // Se a contingência for recomendada (agente sem heartbeat > 15 min), expande automaticamente o accordion
    if (data.contingency_recommended || data.is_stale_heartbeat) {
        const box = document.getElementById("upProgManualBox");
        const icon = document.getElementById("upProgManualToggleIcon");
        if (box && box.style.display !== "block") {
            box.style.display = "block";
            if (icon) icon.innerText = "▲";
        }
    }

    // Caixa de Ação Direta pelo Dashboard
    const directBox = document.getElementById("upProgDirectActionBox");
    if (directBox) {
        directBox.style.display = (data.is_updated) ? "none" : "flex";
    }

    // Renderiza Stepper Visual
    const container = document.getElementById("upProgStepperContainer");
    if (!container) return;

    const steps = data.steps || [];
    container.innerHTML = steps.map(s => {
        let iconHtml = '<span style="color: #64748b; font-size: 13px;">○</span>';
        let borderStyle = 'border-left: 3px solid #334155;';
        let bgStyle = 'background: rgba(15, 23, 42, 0.4);';
        let titleColor = '#94a3b8';

        if (s.status === "completed") {
            iconHtml = '<span style="color: #10b981; font-size: 13px;">✅</span>';
            borderStyle = 'border-left: 3px solid #10b981;';
            bgStyle = 'background: rgba(16, 185, 129, 0.08);';
            titleColor = '#34d399';
        } else if (s.status === "in_progress") {
            iconHtml = '<i class="fas fa-spinner fa-spin" style="color: #38bdf8; font-size: 12px;"></i>';
            borderStyle = 'border-left: 3px solid #38bdf8;';
            bgStyle = 'background: rgba(56, 189, 248, 0.12); box-shadow: 0 0 10px rgba(56, 189, 248, 0.15);';
            titleColor = '#fff';
        } else if (s.status === "warning") {
            iconHtml = '<span style="color: #f59e0b; font-size: 13px;">⚠️</span>';
            borderStyle = 'border-left: 3px solid #f59e0b;';
            bgStyle = 'background: rgba(245, 158, 11, 0.12); box-shadow: 0 0 10px rgba(245, 158, 11, 0.2);';
            titleColor = '#fbbf24';
        } else if (s.status === "failed") {
            iconHtml = '<span style="color: #ef4444; font-size: 13px;">❌</span>';
            borderStyle = 'border-left: 3px solid #ef4444;';
            bgStyle = 'background: rgba(239, 68, 68, 0.1);';
            titleColor = '#f87171';
        }

        return `
            <div style="padding: 8px 12px; border-radius: 4px; ${borderStyle} ${bgStyle} display: flex; align-items: flex-start; gap: 10px; transition: all 0.2s ease;">
                <div style="flex-shrink: 0; margin-top: 1px;">${iconHtml}</div>
                <div style="flex: 1;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <strong style="color: ${titleColor}; font-size: 12px;">Etapa ${s.step}: ${s.title}</strong>
                        <span style="font-size: 10px; color: #64748b;">${s.time_hint || ''}</span>
                    </div>
                    <div style="font-size: 11px; color: #cbd5e1; margin-top: 2px;">
                        ${s.description}
                    </div>
                </div>
            </div>
        `;
    }).join("");

    // Se finalizou com sucesso, atualiza tabelas do fundo
    if (data.is_finished && data.is_success) {
        if (typeof loadFleetUpdateEvolution === "function") loadFleetUpdateEvolution(false);
        if (typeof loadServicesTable === "function") loadServicesTable();
    }
}

function toggleUpProgManualBox() {
    const box = document.getElementById("upProgManualBox");
    const icon = document.getElementById("upProgManualToggleIcon");
    if (!box) return;
    const isOpen = box.style.display === "block";
    box.style.display = isOpen ? "none" : "block";
    if (icon) icon.innerText = isOpen ? "▼" : "▲";
}

function copyUpProgManualCmd() {
    const input = document.getElementById("upProgManualCmdInput");
    if (!input || !input.value) return;
    navigator.clipboard.writeText(input.value).then(() => {
        if (typeof showToast === "function") showToast("Comando copiado para a área de transferência!", "success");
    });
}

async function executeDirectUpdateFromDashboard() {
    const host = (currentUpdateProgressHost || document.getElementById("upProgHost")?.innerText || "").trim();
    const service = (currentUpdateProgressService || document.getElementById("upProgService")?.innerText || "").trim();
    const targetVer = (currentUpdateProgressTargetVersion || document.getElementById("upProgDesired")?.innerText || "2.0.0.2").replace("v", "").replace("V", "").trim();

    if (!host || !service) {
        if (typeof showToast === "function") showToast("Host ou serviço não selecionado no modal", "error");
        return;
    }
    const btn = document.getElementById("btnDirectExecuteModal");
    const icon = document.getElementById("btnDirectExecuteIcon");
    if (btn) btn.disabled = true;
    if (icon) icon.className = "fas fa-spinner fa-spin";

    try {
        const resp = await fetch("/api/fleet/action/force-execute", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(getFleetAuthToken() ? { "Authorization": `Bearer ${getFleetAuthToken()}` } : {})
            },
            body: JSON.stringify({
                host: host,
                service_name: service,
                target_version: targetVer
            })
        });
        const data = await resp.json();
        if (resp.ok && data.success) {
            if (btn) {
                btn.innerHTML = '<i class="fas fa-check-circle" style="color: #34d399;"></i> Disparado com Sucesso!';
                btn.style.background = "#059669";
                btn.style.borderColor = "#10b981";
            }
            if (typeof showToast === "function") {
                showToast(data.message || `Atualização disparada com sucesso diretamente pelo Dashboard para [${host}]!`, "success");
            }
            await refreshFleetUpdateProgressLive();

            setTimeout(() => {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-play" id="btnDirectExecuteIcon"></i> Executar Novamente';
                    btn.style.background = "#0284c7";
                    btn.style.borderColor = "#38bdf8";
                }
            }, 5000);
        } else {
            const err = typeof data.detail === "string" ? data.detail : (data.error || "Erro ao disparar atualização direta");
            if (typeof showToast === "function") showToast(err, "error");
            if (btn) btn.disabled = false;
            if (icon) icon.className = "fas fa-play";
        }
    } catch (e) {
        console.error("Erro na execução direta:", e);
        if (typeof showToast === "function") showToast(`Falha de comunicação ao disparar comando: ${e.message}`, "error");
        if (btn) btn.disabled = false;
        if (icon) icon.className = "fas fa-play";
    }
}

window.executeDirectUpdateFromDashboard = executeDirectUpdateFromDashboard;
window.openFleetUpdateProgressModal = openFleetUpdateProgressModal;
window.closeFleetUpdateProgressModal = closeFleetUpdateProgressModal;
window.refreshFleetUpdateProgressLive = refreshFleetUpdateProgressLive;
window.toggleUpProgManualBox = toggleUpProgManualBox;
window.copyUpProgManualCmd = copyUpProgManualCmd;
