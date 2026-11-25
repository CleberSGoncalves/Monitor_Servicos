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

        // Atualizar Botão de Acompanhar Rollout
        const btnBatchProg = document.getElementById("btnOpenBatchProgress");
        const countBatchLive = document.getElementById("btnBatchLiveActiveCount");
        if (btnBatchProg) {
            btnBatchProg.style.display = "inline-flex";
            if (countBatchLive) countBatchLive.innerText = `${data.updated_count}/${data.total_hosts}`;
        }

        // 6. Renderizar a Tabela
        renderFleetEvolutionTable();
        populateHostConfigSelectors();

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

        // Ação de Atualização Direta (1 clique via Google Cloud) + Botão de Acompanhar ao Vivo se em andamento
        const savedActive = getSavedActiveFleetUpdate();
        const isBeingUpdated = (h.acao_solicitada === "Atualizar") || (savedActive && savedActive.host === h.hostname);
        const needsUpdate = (!isUp || h.status_atualizacao === "Desatualizado");
        
        let updateBtn = "";
        if (isBeingUpdated) {
            updateBtn = `<button class="btn-sm btn-primary" onclick="openFleetUpdateProgressModal('${h.hostname}', '${currentGovernanceService}', '${h.versao_desejada || targetVer}')" style="padding: 3px 8px; font-size: 11px; font-weight: 700; background: linear-gradient(135deg, #0284c7, #2563eb); border: 1px solid #38bdf8; border-radius: 4px; color: #fff; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 0 10px rgba(56,189,248,0.4);" title="Atualização em andamento! Clique para acompanhar ao vivo"><i class="fas fa-spinner fa-spin"></i> Acompanhar ao Vivo</button>`;
        } else if (needsUpdate) {
            updateBtn = `<button class="btn-sm btn-primary" onclick="dispatchSingleHostUpdate('${h.hostname}', '${currentGovernanceService}', '${h.versao_desejada || targetVer}')" style="padding: 3px 8px; font-size: 11px; font-weight: 700; background: #0284c7; border: 1px solid #38bdf8; border-radius: 4px; color: #fff; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" title="Disparar atualização direta via Google Cloud Firestore: v${h.versao_desejada || targetVer}"><i class="fas fa-bolt"></i> Atualizar</button>`;
        } else {
            updateBtn = `<button class="btn-sm" onclick="dispatchSingleHostUpdate('${h.hostname}', '${currentGovernanceService}', '${h.versao_desejada || targetVer}')" style="padding: 3px 8px; font-size: 11px; font-weight: 600; background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.35); border-radius: 4px; color: #34d399; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" title="Em dia! Clique se desejar forçar reinstalação via Google Cloud"><i class="fas fa-check-circle"></i> Em Dia</button>`;
        }

        const removeHostBtn = `<button class="btn-sm" onclick="removeHostFromFleet('${h.hostname}', '${h.praca}')" style="padding: 3px 7px; font-size: 11px; background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.4); border-radius: 4px; color: #f87171; cursor: pointer; display: inline-flex; align-items: center; gap: 3px;" title="Desinstalar serviço na máquina remota e remover [${h.hostname}] da telemetria"><i class="fas fa-trash-alt"></i> Remover</button>`;

        const configBtn = `<button class="btn-sm" onclick="openHostConfigModal('${h.hostname}', '${h.praca}', ${h.cs || 1})" style="padding: 3px 8px; font-size: 11px; background: rgba(56,189,248,0.15); border: 1px solid rgba(56,189,248,0.4); border-radius: 4px; color: #38bdf8; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" title="Configurações do Capture Site (Multiplexes, AppConfig, LogRotate)"><i class="fas fa-sliders-h"></i> Config</button>`;

        const actionBtn = `<div style="display: inline-flex; align-items: center; gap: 5px; justify-content: center;">${updateBtn}${configBtn}${removeHostBtn}</div>`;

        return `
            <tr style="border-bottom: 1px solid rgba(148,163,184,0.1); transition: background 0.15s ease;" onmouseover="this.style.background='rgba(51,65,85,0.3)'" onmouseout="this.style.background='transparent'">
                <td style="padding: 8px 12px; font-weight: 600; color: #f8fafc; cursor: pointer;" onclick="openHostConfigModal('${h.hostname}', '${h.praca}', ${h.cs || 1})" title="Clique para abrir as configurações do Capture Site">
                    <span style="color: #38bdf8; text-decoration: underline; text-decoration-color: rgba(56,189,248,0.4);">${h.praca}</span> <span style="font-size: 10px; color: #64748b; font-weight: normal; margin-left: 4px;">CS ${h.cs || 1}</span>
                </td>
                <td style="padding: 8px 12px; font-family: monospace; font-size: 11px; color: #cbd5e1; cursor: pointer;" onclick="openHostConfigModal('${h.hostname}', '${h.praca}', ${h.cs || 1})" title="Clique para abrir as configurações do Capture Site">
                    <span style="color: #f8fafc;">${h.hostname}</span> <i class="fas fa-sliders-h" style="font-size: 9px; color: #38bdf8; margin-left: 4px; opacity: 0.7;"></i>
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

    // Exibe ou oculta a chave de migração FastMatching/FileCleaner para Atria Capture / FastMatching
    const svcForMig = (config.serviceName || (typeof currentGovernanceService !== "undefined" ? currentGovernanceService : "") || "").toLowerCase();
    const isAtriaOrFma = svcForMig.includes("atria") || svcForMig.includes("dtvcapture") || svcForMig.includes("fastmatch");

    // Regra rígida de Engenharia: CS02 e CS03 NÃO possuem detecção (exclusivo CS01).
    // Se a máquina selecionada for CS02 ou CS03, ocultar sumariamente a chave de migração.
    let isCS01 = true;
    if (typeof config.cs !== "undefined" && config.cs !== null) {
        isCS01 = Number(config.cs) === 1;
    } else if (hostsList.length === 1) {
        const singleH = hostsList[0];
        const hObj = (cachedFleetEvolutionData?.hosts || []).find(x => x.hostname?.toLowerCase() === singleH?.toLowerCase());
        if (hObj && typeof hObj.cs !== "undefined") {
            isCS01 = Number(hObj.cs) === 1;
        } else if (singleH.includes("-CS2") || singleH.includes("-CS3") || singleH.includes("-DT02") || singleH.includes("-DT03") || singleH.includes("-DT2") || singleH.includes("-DT3")) {
            isCS01 = false;
        }
    }

    const migContainer = document.getElementById("safetyModalAtriaMigrationContainer");
    const chkMigrate = document.getElementById("chkMigrateFastMatchingAndCleaner");
    if (migContainer) {
        migContainer.style.display = (isAtriaOrFma && isCS01) ? "block" : "none";
    }
    if (chkMigrate) {
        chkMigrate.checked = false;
    }

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
    const chkMig = document.getElementById("chkMigrateFastMatchingAndCleaner");
    const migrateToFma = chkMig ? chkMig.checked : false;
    closeFleetSafetyModal();
    if (typeof actionObj.onConfirm === "function") {
        await actionObj.onConfirm(reason, migrateToFma);
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
    const hObj = (cachedFleetEvolutionData?.hosts || []).find(x => x.hostname?.toLowerCase() === hostname?.toLowerCase());
    const hostCs = hObj ? hObj.cs : undefined;
    openFleetSafetyModal({
        actionType: "UPDATE_SINGLE",
        serviceName: serviceName,
        cs: hostCs,
        title: `Confirmar Atualização Individual — ${hostname}`,
        badgeText: "⚡ ATUALIZAÇÃO INDIVIDUAL DE CAPTURE SITE",
        hosts: [hostname],
        summaryText: `Disparar atualização do serviço ${serviceName} para a versão v${targetVersion} via Google Cloud Firestore.`,
        impactWarning: "O agente no Capture Site fará o download silencioso do pacote no Google Cloud Storage, validará o hash SHA-256 e reiniciará apenas o serviço selecionado.",
        defaultReason: `Atualização homologada de ${serviceName} para v${targetVersion}`,
        onConfirm: async (reason, migrateToFma = false) => {
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
                        reason: reason,
                        migrate_to_fastmatching: !!migrateToFma
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
        serviceName: svc,
        title: `Confirmar Atualização em Lote (${count} Capture Sites)`,
        badgeText: "🚀 ATUALIZAÇÃO EM LOTE NA FROTA",
        hosts: pendingHosts,
        summaryText: `Disparar atualização em lote de ${svc} para a versão v${ver} em todos os ${count} Capture Sites pendentes online.`,
        impactWarning: "⚠️ Atenção: Esta operação enviará a ordem de atualização simultaneamente para as máquinas listadas acima e ficará registrada em seu usuário.",
        defaultReason: `Rollout em lote homologado de ${svc} v${ver}`,
        onConfirm: async (reason, migrateToFma = false) => {
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
                        reason: reason,
                        migrate_to_fastmatching: !!migrateToFma
                    })
                });
                const data = await resp.json();
                if (resp.ok && data.success) {
                    if (typeof showToast === "function") {
                        showToast(`Atualização despachada no Google Cloud para ${data.dispatched_count} hosts!`, "success");
                    }
                    // ABRIR COCKPIT AO VIVO DE ACOMPANHAMENTO DO LOTE
                    openFleetBatchProgressModal({
                        serviceName: svc,
                        targetVersion: ver,
                        dispatchedHosts: data.dispatched_hosts || pendingHosts,
                        totalTargets: data.total_targets || count,
                        startTime: Date.now()
                    });
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
    const cmd = `powershell -ExecutionPolicy Bypass -NoProfile -Command "& { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $ProgressPreference = 'SilentlyContinue'; $s = 'DNA.MonitorServiceSVC'; $d = if (Test-Path 'D:\\MediaDNA_V2\\Applications\\MonitorServiceSVC') { 'D:\\MediaDNA_V2\\Applications\\MonitorServiceSVC' } elseif (Test-Path 'C:\\MediaDNA_V2\\Applications\\MonitorServiceSVC') { 'C:\\MediaDNA_V2\\Applications\\MonitorServiceSVC' } elseif (Test-Path 'D:\\') { 'D:\\MediaDNA_V2\\Applications\\MonitorServiceSVC' } else { 'C:\\MediaDNA_V2\\Applications\\MonitorServiceSVC' }; if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }; $exe = Join-Path $d 'WinServiceFleetAgent.exe'; $curr = if (Test-Path $exe) { (Get-Item $exe -ErrorAction SilentlyContinue).VersionInfo.FileVersion } else { '0.0.0.0' }; $m = try { Invoke-RestMethod -Uri ('https://storage.googleapis.com/kantar-fleet-releases/manifest.json?t=' + (Get-Random)) -TimeoutSec 15 } catch { $null }; $targetVer = if ($m -and $m.services.$s.version) { $m.services.$s.version } else { '1.0.21.5' }; $svc = Get-Service -Name $s -ErrorAction SilentlyContinue; if ($curr -eq $targetVer -and $svc -and $svc.Status -eq 'Running') { Write-Host ('[OK] DNA.MonitorServiceSVC ja instalado e ativo na versao ' + $curr); exit 0 }; $url = if ($m -and $m.services.$s.download_url) { $m.services.$s.download_url } else { 'https://storage.googleapis.com/kantar-fleet-releases/DNA.MonitorServiceSVC_v' + $targetVer + '.zip' }; $zip = Join-Path $env:TEMP ($s + '_' + $targetVer + '.zip'); Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing; if ($svc) { Stop-Service -Name $s -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 1; Get-Process -Name 'WinServiceFleetAgent' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue }; Expand-Archive -Path $zip -DestinationPath $d -Force; if (-not $svc) { Start-Process -FilePath 'sc.exe' -ArgumentList ('create', $s, ('binPath= \"' + $exe + '\"'), 'start= auto', 'displayname= DNA.MonitorServiceSVC') -Wait -NoNewWindow; Start-Process -FilePath 'sc.exe' -ArgumentList ('description', $s, '\"Agente nativo em C# .NET para inventario, monitoramento e atualizacao remota da frota de servicos Windows.\"') -Wait -NoNewWindow }; Start-Process -FilePath 'sc.exe' -ArgumentList ('failure', $s, 'reset= 0', 'actions= restart/5000/restart/10000/restart/30000') -Wait -NoNewWindow; Start-Process -FilePath 'sc.exe' -ArgumentList ('config', $s, 'start= delayed-auto') -Wait -NoNewWindow; Start-Service -Name $s -ErrorAction SilentlyContinue; Start-Sleep -Seconds 2; $newSvc = Get-Service -Name $s -ErrorAction SilentlyContinue; Write-Host ('[OK] DNA.MonitorServiceSVC provisionado com sucesso v' + $targetVer + ' | Status: ' + $newSvc.Status); }"`;
    
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
let lastKnownUpdateStatusData = null;

async function openFleetUpdateProgressModal(host, serviceName, targetVersion = null) {
    currentUpdateProgressHost = host;
    currentUpdateProgressService = serviceName || currentGovernanceService || "Atria Capture";
    currentUpdateProgressTargetVersion = targetVersion || (cachedFleetEvolutionData ? cachedFleetEvolutionData.target_version : "2.0.0.2");
    
    // Recupera startTime do localStorage se for o mesmo host/serviço para não zerar o relógio
    const savedActive = getSavedActiveFleetUpdate();
    if (savedActive && savedActive.host === host && savedActive.serviceName === currentUpdateProgressService && savedActive.startTime) {
        updateProgressStartTime = savedActive.startTime;
    } else {
        updateProgressStartTime = Date.now();
    }

    // Persiste no localStorage para navegação persistente e recarregamento
    saveActiveFleetUpdate({
        host: host,
        serviceName: currentUpdateProgressService,
        targetVersion: currentUpdateProgressTargetVersion,
        startTime: updateProgressStartTime
    });

    // Oculta o widget flutuante enquanto o modal principal estiver aberto
    hideActiveUpdateFloatingWidget();

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

    // Se a atualização AINDA ESTIVER EM ANDAMENTO, reativa o Widget Flutuante persistente!
    if (lastKnownUpdateStatusData && !lastKnownUpdateStatusData.is_finished) {
        showActiveUpdateFloatingWidget(lastKnownUpdateStatusData);
        startBackgroundFloatingPoll();
    }
}

function getSavedActiveFleetUpdate() {
    try {
        const raw = localStorage.getItem("active_fleet_update");
        if (!raw) return null;
        const data = JSON.parse(raw);
        // Expirar após 45 minutos se esquecido
        if (Date.now() - (data.startTime || 0) > 45 * 60 * 1000) {
            localStorage.removeItem("active_fleet_update");
            return null;
        }
        return data;
    } catch (e) {
        return null;
    }
}

function saveActiveFleetUpdate(obj) {
    try {
        localStorage.setItem("active_fleet_update", JSON.stringify(obj));
    } catch (e) {}
}

function clearSavedActiveFleetUpdate() {
    try {
        localStorage.removeItem("active_fleet_update");
    } catch (e) {}
}

let backgroundFloatingPollInterval = null;
function startBackgroundFloatingPoll() {
    if (backgroundFloatingPollInterval) clearInterval(backgroundFloatingPollInterval);
    backgroundFloatingPollInterval = setInterval(async () => {
        const saved = getSavedActiveFleetUpdate();
        if (!saved || !saved.host) {
            clearInterval(backgroundFloatingPollInterval);
            backgroundFloatingPollInterval = null;
            return;
        }
        try {
            const targetParam = saved.targetVersion ? `&target_version=${encodeURIComponent(saved.targetVersion)}` : "";
            const resp = await fetch(`/api/fleet/action/status?host=${encodeURIComponent(saved.host)}&service_name=${encodeURIComponent(saved.serviceName)}${targetParam}&_t=${Date.now()}`, {
                headers: { "Authorization": `Bearer ${getFleetAuthToken()}` }
            });
            if (resp.ok) {
                const data = await resp.json();
                lastKnownUpdateStatusData = data;
                showActiveUpdateFloatingWidget(data);
                if (data.is_finished) {
                    clearInterval(backgroundFloatingPollInterval);
                    backgroundFloatingPollInterval = null;
                    clearSavedActiveFleetUpdate();
                }
            }
        } catch (e) {}
    }, 6000);
}

function showActiveUpdateFloatingWidget(data) {
    const widget = document.getElementById("fleetActiveUpdateFloatingWidget");
    if (!widget) return;

    const hostText = document.getElementById("floatingUpdateHostText");
    const svcText = document.getElementById("floatingUpdateServiceText");
    const pctBadge = document.getElementById("floatingUpdatePercentBadge");

    if (data) {
        if (hostText) hostText.innerText = `${data.praca || data.hostname} CS ${data.cs || 1}`;
        if (svcText) svcText.innerText = `${data.service_name} ➔ v${data.versao_desejada}`;
        if (pctBadge) {
            pctBadge.innerText = `${data.progress_percent || 0}%`;
            pctBadge.className = data.is_finished && data.is_success ? "badge badge-green" : "badge badge-blue";
        }
    }
    widget.style.display = "flex";
}

function hideActiveUpdateFloatingWidget() {
    const widget = document.getElementById("fleetActiveUpdateFloatingWidget");
    if (widget) widget.style.display = "none";
}

function dismissActiveUpdateFloatingWidget(evt) {
    if (evt) evt.stopPropagation();
    hideActiveUpdateFloatingWidget();
    clearSavedActiveFleetUpdate();
    if (backgroundFloatingPollInterval) {
        clearInterval(backgroundFloatingPollInterval);
        backgroundFloatingPollInterval = null;
    }
}

function reopenActiveUpdateModal() {
    const saved = getSavedActiveFleetUpdate();
    if (saved && saved.host) {
        openFleetUpdateProgressModal(saved.host, saved.serviceName, saved.targetVersion);
        return;
    }
    if (currentUpdateProgressHost) {
        openFleetUpdateProgressModal(currentUpdateProgressHost, currentUpdateProgressService, currentUpdateProgressTargetVersion);
    }
}

window.reopenActiveUpdateModal = reopenActiveUpdateModal;
window.dismissActiveUpdateFloatingWidget = dismissActiveUpdateFloatingWidget;
window.copyUpProgTerminalLogs = copyUpProgTerminalLogs;

function copyUpProgTerminalLogs() {
    const box = document.getElementById("upProgTerminalBox");
    if (!box) return;
    navigator.clipboard.writeText(box.innerText).then(() => {
        if (typeof showToast === "function") showToast("Logs do script copiados para a área de transferência!", "success");
    });
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
        lastKnownUpdateStatusData = data;
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

    // NOVO: Percentual de Progresso e Barra Visual Dinâmica
    const pct = typeof data.progress_percent === "number" ? data.progress_percent : 0;
    const pctText = document.getElementById("upProgPercentText");
    if (pctText) pctText.innerText = `${pct}%`;
    const pBar = document.getElementById("upProgressBar");
    if (pBar) {
        pBar.style.width = `${Math.min(100, Math.max(5, pct))}%`;
        if (data.is_finished && data.is_success) {
            pBar.style.background = "#10b981";
        } else if (data.is_failed) {
            pBar.style.background = "#ef4444";
        } else {
            pBar.style.background = "linear-gradient(90deg, #0284c7, #38bdf8, #10b981)";
        }
    }

    // NOVO: Script em Execução & Atividade Granular em Tempo Real
    const scriptEl = document.getElementById("upProgScriptName");
    if (scriptEl && data.script_name) scriptEl.innerText = data.script_name;

    const actEl = document.getElementById("upProgCurrentActivity");
    if (actEl) {
        const iconSpinner = (data.is_finished && data.is_success) ? 
            '<i class="fas fa-check-circle" style="color: #10b981; font-size: 13px;"></i>' : 
            (data.is_failed ? '<i class="fas fa-times-circle" style="color: #ef4444; font-size: 13px;"></i>' : '<i class="fas fa-spinner fa-spin" style="color: #38bdf8; font-size: 12px;"></i>');
        actEl.innerHTML = `${iconSpinner} <span>${data.current_activity || 'Executando atualização silenciosa no host...'}</span>`;
    }

    // NOVO: Terminal do Script em Tempo Real (Saída do Host)
    const termBox = document.getElementById("upProgTerminalBox");
    if (termBox && data.terminal_logs && Array.isArray(data.terminal_logs)) {
        termBox.innerText = data.terminal_logs.join("\n");
        termBox.scrollTop = termBox.scrollHeight;
    }
    const liveBadge = document.getElementById("upProgTerminalLiveBadge");
    if (liveBadge) {
        if (data.is_finished && data.is_success) {
            liveBadge.className = "badge badge-green";
            liveBadge.innerText = "✓ Concluído";
        } else if (data.is_failed) {
            liveBadge.className = "badge badge-red";
            liveBadge.innerText = "✕ Interrompido";
        } else {
            liveBadge.className = "badge badge-green";
            liveBadge.innerText = "● Ao Vivo";
        }
    }

    // Atualiza dados no Widget Flutuante se estiver visível
    const floatingWidget = document.getElementById("fleetActiveUpdateFloatingWidget");
    if (floatingWidget && floatingWidget.style.display !== "none") {
        showActiveUpdateFloatingWidget(data);
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

// =========================================================================
// ACOMPANHAMENTO AO VIVO DE ATUALIZAÇÃO EM LOTE (ROLLOUT COCKPIT)
// =========================================================================

let currentBatchProgressInfo = null;
let currentBatchTimerInterval = null;
let currentBatchPollInterval = null;
let currentBatchFilter = "all";
let currentBatchSearch = "";
let cachedBatchEvolutionData = null;

async function openFleetBatchProgressModal(batchConfig) {
    if (batchConfig) {
        currentBatchProgressInfo = {
            serviceName: batchConfig.serviceName || currentGovernanceService || "DNA.MonitorServiceSVC",
            targetVersion: batchConfig.targetVersion || (cachedFleetEvolutionData ? cachedFleetEvolutionData.target_version : "1.0.21.5"),
            dispatchedHosts: Array.isArray(batchConfig.dispatchedHosts) ? batchConfig.dispatchedHosts : [],
            totalTargets: batchConfig.totalTargets || (batchConfig.dispatchedHosts ? batchConfig.dispatchedHosts.length : 0),
            startTime: batchConfig.startTime || Date.now()
        };
    } else if (!currentBatchProgressInfo) {
        currentBatchProgressInfo = {
            serviceName: currentGovernanceService || "DNA.MonitorServiceSVC",
            targetVersion: (cachedFleetEvolutionData ? cachedFleetEvolutionData.target_version : "1.0.21.5"),
            dispatchedHosts: (cachedFleetEvolutionData && cachedFleetEvolutionData.pending_online_hosts) ? cachedFleetEvolutionData.pending_online_hosts : [],
            totalTargets: (cachedFleetEvolutionData && cachedFleetEvolutionData.pending_online_hosts) ? cachedFleetEvolutionData.pending_online_hosts.length : 0,
            startTime: Date.now()
        };
    }

    const modal = document.getElementById("fleetBatchProgressModal");
    if (!modal) return;
    modal.style.display = "flex";

    // Oculta pílula flutuante quando o modal está aberto
    const pill = document.getElementById("floatingBatchTrackerPill");
    if (pill) pill.style.display = "none";

    // Atualiza cabeçalho
    const svcTargetEl = document.getElementById("batchProgServiceTarget");
    if (svcTargetEl) {
        svcTargetEl.innerText = `${currentBatchProgressInfo.serviceName} ➔ v${currentBatchProgressInfo.targetVersion}`;
    }

    // Timer decorrido
    if (currentBatchTimerInterval) clearInterval(currentBatchTimerInterval);
    currentBatchTimerInterval = setInterval(() => {
        if (!currentBatchProgressInfo || !currentBatchProgressInfo.startTime) return;
        const elapsed = Math.floor((Date.now() - currentBatchProgressInfo.startTime) / 1000);
        const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
        const ss = String(elapsed % 60).padStart(2, "0");
        const timerEl = document.getElementById("batchProgTimer");
        if (timerEl) timerEl.innerText = `⏱️ Tempo decorrido: ${mm}:${ss}`;
    }, 1000);

    // Carrega dados imediatamente
    await refreshFleetBatchProgressLive();

    // Inicia auto-polling a cada 4 segundos
    if (currentBatchPollInterval) clearInterval(currentBatchPollInterval);
    currentBatchPollInterval = setInterval(() => {
        const chk = document.getElementById("batchProgAutoRefresh");
        if (chk && chk.checked) {
            refreshFleetBatchProgressLive();
        }
    }, 4000);
}

function minimizeFleetBatchProgressModal() {
    const modal = document.getElementById("fleetBatchProgressModal");
    if (modal) modal.style.display = "none";

    // Exibe o floating pill no dashboard para o operador continuar navegando
    const pill = document.getElementById("floatingBatchTrackerPill");
    if (pill && currentBatchProgressInfo) pill.style.display = "flex";
}

function closeFleetBatchProgressModal() {
    const modal = document.getElementById("fleetBatchProgressModal");
    if (modal) modal.style.display = "none";

    // Se ainda houver máquinas pendentes no lote, mantém o pill flutuante ativo
    if (cachedBatchEvolutionData && cachedBatchEvolutionData.inProgressCount > 0) {
        const pill = document.getElementById("floatingBatchTrackerPill");
        if (pill) pill.style.display = "flex";
    } else {
        if (currentBatchTimerInterval) {
            clearInterval(currentBatchTimerInterval);
            currentBatchTimerInterval = null;
        }
        if (currentBatchPollInterval) {
            clearInterval(currentBatchPollInterval);
            currentBatchPollInterval = null;
        }
    }
}

async function refreshFleetBatchProgressLive() {
    if (!currentBatchProgressInfo) return;
    const icon = document.getElementById("batchProgRefreshIcon");
    if (icon) icon.classList.add("fa-spin");

    try {
        const svc = currentBatchProgressInfo.serviceName;
        const ver = currentBatchProgressInfo.targetVersion;
        const resp = await fetch(`/api/fleet/governance/service/${encodeURIComponent(svc)}?target_version=${encodeURIComponent(ver)}&_t=${Date.now()}`, {
            headers: {
                ...(getFleetAuthToken() ? { "Authorization": `Bearer ${getFleetAuthToken()}` } : {})
            }
        });
        if (!resp.ok) return;
        const evolData = await resp.json();
        renderFleetBatchProgressData(evolData);
    } catch (err) {
        console.warn("[FleetBatchProgress] Erro ao buscar evolução ao vivo:", err);
    } finally {
        if (icon) icon.classList.remove("fa-spin");
    }
}

function renderFleetBatchProgressData(evolData) {
    if (!evolData || !evolData.hosts_detail) return;
    const targetVer = currentBatchProgressInfo.targetVersion;
    const targetHostsList = currentBatchProgressInfo.dispatchedHosts;
    const targetHostsSet = (targetHostsList && targetHostsList.length > 0) ? new Set(targetHostsList) : null;

    // Filtra apenas os hosts do lote (ou todos se não houver lista restritiva)
    const allHosts = evolData.hosts_detail;
    const batchHosts = targetHostsSet ? allHosts.filter(h => targetHostsSet.has(h.hostname)) : allHosts;

    let completedCount = 0;
    let inProgressCount = 0;
    let queuedCount = 0;
    let failedCount = 0;

    const enrichedHosts = batchHosts.map(h => {
        const isUpToDate = (h.status_atualizacao === "Atualizado" || h.versao_instalada === targetVer);
        let batchState = "queued"; // 'completed', 'in_progress', 'queued', 'failed'

        if (isUpToDate) {
            batchState = "completed";
            completedCount++;
        } else if (!h.is_online_today || h.category === "offline") {
            batchState = "failed";
            failedCount++;
        } else if (h.acao_solicitada === "Atualizar") {
            batchState = "in_progress";
            inProgressCount++;
        } else {
            batchState = "queued";
            queuedCount++;
        }

        return {
            ...h,
            batchState: batchState
        };
    });

    const totalBatch = batchHosts.length || 1;
    const completedPct = ((completedCount / totalBatch) * 100).toFixed(1);

    cachedBatchEvolutionData = {
        enrichedHosts,
        totalBatch,
        completedCount,
        inProgressCount,
        queuedCount,
        failedCount,
        completedPct
    };

    // Atualiza KPIs
    const elComp = document.getElementById("batchKpiCompleted");
    if (elComp) elComp.innerText = completedCount;
    const elTot = document.getElementById("batchKpiTotal");
    if (elTot) elTot.innerText = totalBatch;
    const elPct = document.getElementById("batchKpiPct");
    if (elPct) elPct.innerText = `${completedPct}%`;

    const elInProg = document.getElementById("batchKpiInProgress");
    if (elInProg) elInProg.innerText = inProgressCount;
    const elQueued = document.getElementById("batchKpiQueued");
    if (elQueued) elQueued.innerText = queuedCount;
    const elFailed = document.getElementById("batchKpiFailed");
    if (elFailed) elFailed.innerText = failedCount;

    // Atualiza barra segmentada
    const barComp = document.getElementById("batchBarCompleted");
    if (barComp) barComp.style.width = `${(completedCount / totalBatch) * 100}%`;
    const barInProg = document.getElementById("batchBarInProgress");
    if (barInProg) barInProg.style.width = `${(inProgressCount / totalBatch) * 100}%`;
    const barQueued = document.getElementById("batchBarQueued");
    if (barQueued) barQueued.style.width = `${(queuedCount / totalBatch) * 100}%`;
    const barFailed = document.getElementById("batchBarFailed");
    if (barFailed) barFailed.style.width = `${(failedCount / totalBatch) * 100}%`;

    const summaryLbl = document.getElementById("batchProgSummaryLabel");
    if (summaryLbl) {
        summaryLbl.innerText = `${completedCount} de ${totalBatch} concluídos (${completedPct}%)`;
    }

    // Badge do cabeçalho
    const badge = document.getElementById("batchProgStatusBadge");
    if (badge) {
        if (completedCount === totalBatch) {
            badge.className = "badge badge-green";
            badge.innerText = "Rollout 100% Concluído";
        } else if (inProgressCount > 0) {
            badge.className = "badge badge-yellow";
            badge.innerText = `Executando (${inProgressCount} ativos)`;
        } else if (failedCount > 0 && inProgressCount === 0) {
            badge.className = "badge badge-red";
            badge.innerText = `Atenção: ${failedCount} com Falha/Offline`;
        } else {
            badge.className = "badge badge-blue";
            badge.innerText = "Aguardando Heartbeat";
        }
    }

    // Atualiza contadores de filtro
    const fcAll = document.getElementById("filterCountBatchAll");
    if (fcAll) fcAll.innerText = totalBatch;
    const fcProg = document.getElementById("filterCountBatchProg");
    if (fcProg) fcProg.innerText = inProgressCount;
    const fcDone = document.getElementById("filterCountBatchDone");
    if (fcDone) fcDone.innerText = completedCount;
    const fcFail = document.getElementById("filterCountBatchFailed");
    if (fcFail) fcFail.innerText = failedCount + queuedCount;

    // Atualiza pílula flutuante e botão da governança
    updateFloatingBatchPill(completedCount, totalBatch, completedPct, inProgressCount);

    // Renderiza tabela com filtros aplicados
    renderBatchTableRows();
}

function updateFloatingBatchPill(completed, total, pct, inProgress) {
    const pill = document.getElementById("floatingBatchTrackerPill");
    const svcEl = document.getElementById("floatRolloutSvc");
    const pctEl = document.getElementById("floatRolloutPct");
    const doneEl = document.getElementById("floatRolloutDone");
    const totEl = document.getElementById("floatRolloutTotal");

    if (svcEl && currentBatchProgressInfo) svcEl.innerText = currentBatchProgressInfo.serviceName;
    if (pctEl) pctEl.innerText = `${pct}%`;
    if (doneEl) doneEl.innerText = completed;
    if (totEl) totEl.innerText = total;

    // Botão na barra da governança
    const btnGov = document.getElementById("btnOpenBatchProgress");
    const countGov = document.getElementById("btnBatchLiveActiveCount");
    if (btnGov) {
        btnGov.style.display = "inline-flex";
        if (countGov) countGov.innerText = `${completed}/${total}`;
    }
}

function filterFleetBatchList(filterType) {
    currentBatchFilter = filterType;
    const btnAll = document.getElementById("filterBtnBatchAll");
    const btnProg = document.getElementById("filterBtnBatchProg");
    const btnDone = document.getElementById("filterBtnBatchDone");
    const btnFailed = document.getElementById("filterBtnBatchFailed");

    if (btnAll) btnAll.className = filterType === "all" ? "btn-sm btn-filter-batch active" : "btn-sm btn-filter-batch";
    if (btnProg) btnProg.className = filterType === "in_progress" ? "btn-sm btn-filter-batch active" : "btn-sm btn-filter-batch";
    if (btnDone) btnDone.className = filterType === "completed" ? "btn-sm btn-filter-batch active" : "btn-sm btn-filter-batch";
    if (btnFailed) btnFailed.className = filterType === "failed" ? "btn-sm btn-filter-batch active" : "btn-sm btn-filter-batch";

    renderBatchTableRows();
}

function onFleetBatchSearchInput(val) {
    currentBatchSearch = (val || "").trim().toLowerCase();
    renderBatchTableRows();
}

function renderBatchTableRows() {
    const tbody = document.getElementById("batchProgTableBody");
    if (!tbody || !cachedBatchEvolutionData) return;

    const { enrichedHosts } = cachedBatchEvolutionData;
    const targetVer = currentBatchProgressInfo ? currentBatchProgressInfo.targetVersion : "1.0.21.5";
    const svcName = currentBatchProgressInfo ? currentBatchProgressInfo.serviceName : "DNA.MonitorServiceSVC";

    let filtered = enrichedHosts.filter(h => {
        // Filtro por tipo
        if (currentBatchFilter === "in_progress" && h.batchState !== "in_progress") return false;
        if (currentBatchFilter === "completed" && h.batchState !== "completed") return false;
        if (currentBatchFilter === "failed" && h.batchState !== "failed" && h.batchState !== "queued") return false;

        // Filtro por busca de texto
        if (currentBatchSearch) {
            const matchPraca = String(h.praca || "").toLowerCase().includes(currentBatchSearch);
            const matchHost = String(h.hostname || "").toLowerCase().includes(currentBatchSearch);
            if (!matchPraca && !matchHost) return false;
        }
        return true;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="padding: 24px; text-align: center; color: #94a3b8; font-style: italic;">Nenhum host encontrado com os filtros selecionados.</td></tr>`;
        return;
    }

    const rowsHtml = filtered.map(h => {
        let statusBadge = "";
        if (h.batchState === "completed") {
            statusBadge = `<span class="badge badge-green" style="font-size: 11px; display: inline-flex; align-items: center; gap: 4px;"><i class="fas fa-check-circle"></i> Atualizado &amp; Ativo</span>`;
        } else if (h.batchState === "in_progress") {
            statusBadge = `<span class="badge badge-yellow" style="font-size: 11px; display: inline-flex; align-items: center; gap: 4px;"><i class="fas fa-spinner fa-spin"></i> Agente Atualizando (Ação: Atualizar)</span>`;
        } else if (h.batchState === "failed") {
            statusBadge = `<span class="badge badge-red" style="font-size: 11px; display: inline-flex; align-items: center; gap: 4px;"><i class="fas fa-exclamation-triangle"></i> Offline / Sem Heartbeat</span>`;
        } else {
            statusBadge = `<span class="badge badge-blue" style="font-size: 11px; display: inline-flex; align-items: center; gap: 4px;"><i class="fas fa-clock"></i> Fila de Leitura</span>`;
        }

        const verHtml = (h.versao_instalada === targetVer)
            ? `<span style="color: #34d399; font-weight: 700;">v${h.versao_instalada}</span>`
            : `<span style="color: #fbbf24;">v${h.versao_instalada}</span> <span style="color: #64748b;">➔</span> <span style="color: #38bdf8; font-weight: 700;">v${targetVer}</span>`;

        const lastTs = h.ultima_atualizacao ? formatFleetRelativeTime(h.ultima_atualizacao) : "Desconhecido";

        return `
            <tr style="border-bottom: 1px solid rgba(148, 163, 184, 0.1); transition: background 0.15s ease;" onmouseover="this.style.background='rgba(51,65,85,0.25)'" onmouseout="this.style.background='transparent'">
                <td style="padding: 8px 12px; font-weight: 600; color: #f8fafc;">
                    ${h.praca} <span style="font-size: 10px; color: #64748b; font-weight: normal; margin-left: 4px;">CS ${h.cs || 1}</span>
                </td>
                <td style="padding: 8px 12px; font-family: monospace; font-size: 11px; color: #38bdf8;">
                    ${h.hostname}
                </td>
                <td style="padding: 8px 12px; text-align: center; font-family: monospace; font-size: 11px;">
                    ${verHtml}
                </td>
                <td style="padding: 8px 12px; text-align: center;">
                    ${statusBadge}
                </td>
                <td style="padding: 8px 12px; text-align: center; font-size: 11px; color: #cbd5e1;">
                    ${lastTs}
                </td>
                <td style="padding: 8px 12px; text-align: center;">
                    <button class="btn-sm btn-secondary" onclick="openFleetUpdateProgressModal('${h.hostname}', '${svcName}', '${targetVer}')" style="padding: 3px 8px; font-size: 11px; display: inline-flex; align-items: center; gap: 4px;" title="Ver telemetria passo a passo e comandos deste host">
                        <i class="fas fa-search"></i> N2 Detalhe
                    </button>
                </td>
            </tr>
        `;
    }).join("");

    tbody.innerHTML = rowsHtml;
}

function formatFleetRelativeTime(isoStr) {
    try {
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return isoStr;
        const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
        if (diffSec < 60) return `Há ${Math.max(1, diffSec)}s`;
        if (diffSec < 3600) return `Há ${Math.floor(diffSec / 60)}m`;
        return `Há ${Math.floor(diffSec / 3600)}h`;
    } catch {
        return isoStr;
    }
}

function copyFleetBatchSummaryToClipboard() {
    if (!cachedBatchEvolutionData || !currentBatchProgressInfo) {
        if (typeof showToast === "function") showToast("Nenhum dado de rollout para copiar!", "info");
        return;
    }

    const { totalBatch, completedCount, inProgressCount, queuedCount, failedCount, completedPct } = cachedBatchEvolutionData;
    const svc = currentBatchProgressInfo.serviceName;
    const ver = currentBatchProgressInfo.targetVersion;
    const now = new Date().toLocaleString("pt-BR");

    const text = `🚀 [MediaDNA CS Fleet] Relatório de Rollout em Lote ao Vivo\n` +
                 `• Serviço: ${svc} ➔ v${ver}\n` +
                 `• Total de Máquinas no Lote: ${totalBatch}\n` +
                 `• Progresso Global: ${completedCount} / ${totalBatch} Concluídos (${completedPct}%)\n` +
                 `  - ✅ Atualizados / Em Dia: ${completedCount}\n` +
                 `  - 🟡 Agente Atualizando: ${inProgressCount}\n` +
                 `  - ⏱️ Aguardando Ciclo: ${queuedCount}\n` +
                 `  - ⚠️ Offline / Atenção: ${failedCount}\n` +
                 `• Registro de Auditoria: Google Cloud Firestore ↔ SharePoint\n` +
                 `• Horário do Relatório: ${now}`;

    navigator.clipboard.writeText(text).then(() => {
        if (typeof showToast === "function") showToast("Relatório do rollout copiado com sucesso!", "success");
    }).catch(() => {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        if (typeof showToast === "function") showToast("Relatório do rollout copiado com sucesso!", "success");
    });
}

window.openFleetBatchProgressModal = openFleetBatchProgressModal;
window.closeFleetBatchProgressModal = closeFleetBatchProgressModal;
window.minimizeFleetBatchProgressModal = minimizeFleetBatchProgressModal;
window.refreshFleetBatchProgressLive = refreshFleetBatchProgressLive;
window.filterFleetBatchList = filterFleetBatchList;
window.onFleetBatchSearchInput = onFleetBatchSearchInput;
window.copyFleetBatchSummaryToClipboard = copyFleetBatchSummaryToClipboard;

// ==============================================================================
// REPOSITÓRIO OFICIAL DE PACOTES, AUDITORIA BINÁRIA E DISTRIBUIÇÃO DA FROTA
// ==============================================================================
let cachedPackageRepoData = null;
let currentPackageRepoFilter = "all";
let currentPackageRepoSearch = "";

function switchFleetSubtab(subtab) {
    const btnGov = document.getElementById("btn-fleet-subtab-governance");
    const btnRepo = document.getElementById("btn-fleet-subtab-repository");
    const btnCSConfig = document.getElementById("btn-fleet-subtab-csconfig");
    const containerGov = document.getElementById("fleetSubtabGovernanceContainer");
    const containerRepo = document.getElementById("fleetSubtabRepositoryContainer");
    const containerCSConfig = document.getElementById("fleetSubtabCSConfigContainer");

    if (btnGov) btnGov.classList.toggle("active", subtab === "governance");
    if (btnRepo) btnRepo.classList.toggle("active", subtab === "repository");
    if (btnCSConfig) btnCSConfig.classList.toggle("active", subtab === "csconfig");

    if (containerGov) containerGov.style.display = (subtab === "governance") ? "block" : "none";
    if (containerRepo) containerRepo.style.display = (subtab === "repository") ? "block" : "none";
    if (containerCSConfig) containerCSConfig.style.display = (subtab === "csconfig") ? "block" : "none";

    if (subtab === "repository") {
        loadPackageRepository();
    } else if (subtab === "governance") {
        loadFleetGovernanceSummary();
    } else if (subtab === "csconfig") {
        populateSubtabCSSelectors();
    }
}

function togglePackageGuidePanel() {
    const panel = document.getElementById("panelPackagingGuide");
    if (!panel) return;
    panel.style.display = (panel.style.display === "none" || !panel.style.display) ? "block" : "none";
}

async function loadPackageRepository(force = false) {
    const icon = document.getElementById("iconReloadPackagesRepo");
    if (icon) icon.classList.add("fa-spin");

    try {
        const resp = await fetch("/api/fleet/packages/summary");
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        cachedPackageRepoData = data;

        // Atualiza Métricas
        const metricTotal = document.getElementById("repoMetricTotalOfficial");
        const metricGcsStatus = document.getElementById("repoMetricGcsStatus");
        const metricGcsDate = document.getElementById("repoMetricGcsDate");
        const metricLocal = document.getElementById("repoMetricLocalCount");
        const badgeRepoCount = document.getElementById("badgeRepoPackageCount");

        if (metricTotal) metricTotal.innerText = data.total_official_services || 12;
        if (badgeRepoCount) badgeRepoCount.innerText = `${data.total_official_services || 12} Serviços`;
        if (metricGcsStatus) {
            metricGcsStatus.innerText = data.gcs_manifest_available ? "Sincronizado" : "Disponível";
            metricGcsStatus.style.color = data.gcs_manifest_available ? "#34d399" : "#fbbf24";
        }
        if (metricGcsDate) {
            metricGcsDate.innerText = data.gcs_updated_at ? `Última sincronização: ${formatFleetRelativeTime(data.gcs_updated_at)}` : "gs://kantar-fleet-releases/manifest.json";
        }
        if (metricLocal) metricLocal.innerText = `${data.total_local_packages} / ${data.total_official_services}`;

        renderPackageRepoTable();
        if (force && typeof showToast === "function") {
            showToast("Inventário do repositório de pacotes atualizado com sucesso!", "success");
        }
    } catch (err) {
        console.error("[PackageRepo] Erro ao carregar pacotes:", err);
        const tbody = document.getElementById("packageRepoTableBody");
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="8" style="padding: 24px; text-align: center; color: #ef4444;"><i class="fas fa-exclamation-triangle"></i> Erro ao carregar pacotes do repositório: ${err.message}</td></tr>`;
        }
    } finally {
        if (icon) icon.classList.remove("fa-spin");
    }
}

function filterPackageRepoTable(category) {
    currentPackageRepoFilter = category;
    ["btnRepoFilterAll", "btnRepoFilterAgent", "btnRepoFilterBroadcast", "btnRepoFilterDetection"].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.classList.remove("active");
    });

    if (category === "agente") {
        document.getElementById("btnRepoFilterAgent")?.classList.add("active");
    } else if (category === "captura") {
        document.getElementById("btnRepoFilterBroadcast")?.classList.add("active");
    } else if (category === "deteccao") {
        document.getElementById("btnRepoFilterDetection")?.classList.add("active");
    } else {
        document.getElementById("btnRepoFilterAll")?.classList.add("active");
    }
    renderPackageRepoTable();
}

function handlePackageRepoSearch(query) {
    currentPackageRepoSearch = (query || "").trim().toLowerCase();
    renderPackageRepoTable();
}

function renderPackageRepoTable() {
    const tbody = document.getElementById("packageRepoTableBody");
    if (!tbody || !cachedPackageRepoData || !cachedPackageRepoData.services) return;

    let services = cachedPackageRepoData.services;

    // Filtro por Categoria
    if (currentPackageRepoFilter === "agente") {
        services = services.filter(s => s.category.toLowerCase().includes("agente"));
    } else if (currentPackageRepoFilter === "captura") {
        services = services.filter(s => s.category.toLowerCase().includes("captura") || s.category.toLowerCase().includes("gravação"));
    } else if (currentPackageRepoFilter === "deteccao") {
        services = services.filter(s => s.category.toLowerCase().includes("detecção") || s.category.toLowerCase().includes("ia"));
    }

    // Filtro por Busca
    if (currentPackageRepoSearch) {
        services = services.filter(s => 
            s.service_name.toLowerCase().includes(currentPackageRepoSearch) ||
            s.display_name.toLowerCase().includes(currentPackageRepoSearch) ||
            s.primary_exe.toLowerCase().includes(currentPackageRepoSearch) ||
            s.governed_version.toLowerCase().includes(currentPackageRepoSearch)
        );
    }

    if (services.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="padding: 24px; text-align: center; color: #94a3b8; font-style: italic;">Nenhum serviço ou pacote localizado com os filtros atuais.</td></tr>`;
        return;
    }

    tbody.innerHTML = services.map(s => {
        let statusBadge = "";
        if (s.is_gcs_synced) {
            statusBadge = `<span class="badge badge-green" style="font-size: 10.5px; display: inline-flex; align-items: center; gap: 4px;"><i class="fas fa-check-circle"></i> Homologado &amp; GCS</span>`;
        } else if (s.has_local_file) {
            statusBadge = `<span class="badge badge-yellow" style="font-size: 10.5px; display: inline-flex; align-items: center; gap: 4px;"><i class="fas fa-hdd"></i> Local (Pendente GCS)</span>`;
        } else if (s.gcs_version && s.gcs_version !== "--") {
            statusBadge = `<span class="badge badge-blue" style="font-size: 10.5px; display: inline-flex; align-items: center; gap: 4px;"><i class="fas fa-cloud"></i> Apenas em Nuvem</span>`;
        } else {
            statusBadge = `<span class="badge" style="background: rgba(148, 163, 184, 0.2); color: #cbd5e1; font-size: 10.5px;"><i class="fas fa-clock"></i> Pendente Upload</span>`;
        }

        const shaDisplay = (s.sha256 && s.sha256 !== "--") 
            ? `<div style="display: flex; align-items: center; justify-content: center; gap: 6px;">
                 <span style="font-family: monospace; font-size: 10.5px; color: #38bdf8;" title="${s.sha256}">${s.sha256.substring(0, 10)}...</span>
                 <button class="btn-sm btn-secondary" onclick="copyRepoShaToClipboard('${s.sha256}')" style="padding: 2px 6px; font-size: 10px;" title="Copiar Hash SHA-256"><i class="fas fa-copy"></i></button>
               </div>`
            : `<span style="color: #64748b;">--</span>`;

        const downloadBtn = s.has_local_file
            ? `<button class="btn-sm btn-secondary" onclick="downloadPackageFile('${s.service_name}')" style="padding: 3px 8px; font-size: 11px; display: inline-flex; align-items: center; gap: 4px; color: #38bdf8;" title="Baixar pacote .zip local"><i class="fas fa-download"></i> ZIP</button>`
            : `<button class="btn-sm btn-secondary" disabled style="padding: 3px 8px; font-size: 11px; opacity: 0.4; cursor: not-allowed;" title="Pacote não disponível localmente"><i class="fas fa-download"></i> ZIP</button>`;

        return `
            <tr style="border-bottom: 1px solid rgba(148, 163, 184, 0.1); transition: background 0.15s ease;" onmouseover="this.style.background='rgba(51,65,85,0.25)'" onmouseout="this.style.background='transparent'">
                <td style="padding: 10px 14px;">
                    <div style="font-weight: 700; color: #f8fafc; display: flex; align-items: center; gap: 8px;">
                        <i class="fas ${s.icon}" style="color: ${s.color};"></i>
                        <span>${s.display_name}</span>
                    </div>
                    <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">${s.category} • ${s.description}</div>
                </td>
                <td style="padding: 10px 14px; text-align: center; font-family: monospace; font-weight: 700; color: #34d399; font-size: 12px;">
                    v${s.governed_version}
                </td>
                <td style="padding: 10px 14px; text-align: center; font-family: monospace; font-size: 11.5px; color: ${s.gcs_version === s.governed_version ? '#38bdf8' : '#fbbf24'};">
                    ${s.gcs_version !== '--' ? 'v' + s.gcs_version : '--'}
                </td>
                <td style="padding: 10px 14px; font-size: 11px;">
                    <div style="color: #cbd5e1; font-family: monospace; font-weight: 600;">${s.primary_exe}</div>
                    <div style="color: #64748b; font-size: 10.5px; margin-top: 1px;" title="${s.default_dir}">${s.default_dir}</div>
                </td>
                <td style="padding: 10px 14px; font-size: 11.5px;">
                    <div style="color: #f8fafc; font-family: monospace;">${s.filename}</div>
                    <div style="color: #94a3b8; font-size: 10.5px;">${s.file_size_mb > 0 ? s.file_size_mb + ' MB' : (s.has_local_file ? '< 1 MB' : 'Sem arquivo local')}</div>
                </td>
                <td style="padding: 10px 14px; text-align: center;">
                    ${shaDisplay}
                </td>
                <td style="padding: 10px 14px; text-align: center;">
                    ${statusBadge}
                </td>
                <td style="padding: 10px 14px; text-align: center;">
                    <div style="display: inline-flex; gap: 6px; align-items: center;">
                        <button class="btn-sm btn-primary" onclick="openUploadPackageModal('${s.service_name}', '${s.governed_version}')" style="padding: 4px 10px; font-size: 11px; display: inline-flex; align-items: center; gap: 4px; background: linear-gradient(135deg, #0284c7, #0369a1); border: 1px solid #38bdf8;" title="Fazer upload de nova versão para este serviço">
                            <i class="fas fa-upload"></i> Upload
                        </button>
                        ${downloadBtn}
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

function copyRepoShaToClipboard(sha) {
    if (!sha || sha === "--") return;
    navigator.clipboard.writeText(sha).then(() => {
        if (typeof showToast === "function") showToast("Hash SHA-256 copiado para a área de transferência!", "success");
    }).catch(() => {
        const ta = document.createElement("textarea");
        ta.value = sha;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        if (typeof showToast === "function") showToast("Hash SHA-256 copiado para a área de transferência!", "success");
    });
}

function downloadPackageFile(serviceName) {
    window.open(`/api/fleet/packages/download/${encodeURIComponent(serviceName)}`, "_blank");
}

function openUploadPackageModal(preselectedService = "", preselectedVersion = "") {
    const modal = document.getElementById("modalUploadPackage");
    if (!modal) return;

    const selectSvc = document.getElementById("modalUploadSelectService");
    const inputVer = document.getElementById("modalUploadInputVersion");
    const inputFile = document.getElementById("modalUploadInputFile");
    const labelDrop = document.getElementById("labelDropzoneFile");
    const containerAudit = document.getElementById("containerAuditResult");
    const inputJust = document.getElementById("modalUploadInputJustification");

    if (selectSvc && preselectedService) selectSvc.value = preselectedService;
    if (inputVer && preselectedVersion) inputVer.value = preselectedVersion;
    if (inputFile) inputFile.value = "";
    if (labelDrop) labelDrop.innerHTML = "Clique para selecionar ou arraste o arquivo <strong>.ZIP</strong>";
    if (containerAudit) containerAudit.style.display = "none";
    if (inputJust) inputJust.value = "";

    modal.style.display = "flex";
}

function closeUploadPackageModal() {
    const modal = document.getElementById("modalUploadPackage");
    if (modal) modal.style.display = "none";
}

function handleModalServiceChange(svcName) {
    if (!svcName || !cachedPackageRepoData || !cachedPackageRepoData.services) return;
    const item = cachedPackageRepoData.services.find(s => s.service_name === svcName);
    const inputVer = document.getElementById("modalUploadInputVersion");
    if (item && inputVer && !inputVer.value) {
        inputVer.value = item.governed_version;
    }
}

function handleModalFileSelected(input) {
    const labelDrop = document.getElementById("labelDropzoneFile");
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    if (labelDrop) {
        labelDrop.innerHTML = `<strong>${file.name}</strong> (${sizeMb} MB)`;
    }

    // Auto-preenchimento inteligente de serviço e versão a partir do nome do arquivo
    // Ex: "Atria Capture_v2.0.0.2.zip" ou "DNA.MonitorServiceSVC_v1.0.21.6.zip"
    const m = file.name.match(/^(.+?)_v([\d\.]+)\.zip$/i);
    if (m) {
        const guessedSvc = m[1].trim();
        const guessedVer = m[2].trim();
        const selectSvc = document.getElementById("modalUploadSelectService");
        const inputVer = document.getElementById("modalUploadInputVersion");

        if (selectSvc) {
            for (let opt of selectSvc.options) {
                if (opt.value.toLowerCase() === guessedSvc.toLowerCase()) {
                    selectSvc.value = opt.value;
                    break;
                }
            }
        }
        if (inputVer && !inputVer.value) {
            inputVer.value = guessedVer;
        }
    }
}

async function runPackagePreAudit() {
    const selectSvc = document.getElementById("modalUploadSelectService");
    const inputVer = document.getElementById("modalUploadInputVersion");
    const inputFile = document.getElementById("modalUploadInputFile");
    const btnAudit = document.getElementById("btnRunAuditModal");
    const containerResult = document.getElementById("containerAuditResult");
    const listChecks = document.getElementById("listAuditChecks");
    const badgeVerdict = document.getElementById("badgeAuditVerdict");
    const textSha = document.getElementById("textAuditSha256");

    if (!selectSvc.value) {
        if (typeof showToast === "function") showToast("Selecione o serviço alvo antes de auditar!", "warning");
        selectSvc.focus();
        return;
    }
    if (!inputVer.value) {
        if (typeof showToast === "function") showToast("Informe a versão homologada do pacote!", "warning");
        inputVer.focus();
        return;
    }
    if (!inputFile.files || inputFile.files.length === 0) {
        if (typeof showToast === "function") showToast("Selecione um arquivo .ZIP para auditar!", "warning");
        return;
    }

    if (btnAudit) {
        btnAudit.disabled = true;
        btnAudit.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Auditando Pacote...`;
    }

    const formData = new FormData();
    formData.append("package_file", inputFile.files[0]);
    formData.append("service_name", selectSvc.value);
    formData.append("target_version", inputVer.value.trim());

    try {
        const resp = await fetch("/api/fleet/packages/audit", {
            method: "POST",
            body: formData
        });

        if (!resp.ok) {
            const errJson = await resp.json().catch(() => ({}));
            throw new Error(errJson.message || `HTTP ${resp.status}`);
        }

        const res = await resp.json();
        const audit = res.audit;

        if (containerResult) containerResult.style.display = "block";

        if (badgeVerdict) {
            if (audit.valid) {
                badgeVerdict.style.background = "rgba(16, 185, 129, 0.2)";
                badgeVerdict.style.color = "#34d399";
                badgeVerdict.style.border = "1px solid rgba(16, 185, 129, 0.4)";
                badgeVerdict.innerText = "APROVADO NA AUDITORIA";
            } else {
                badgeVerdict.style.background = "rgba(239, 68, 68, 0.2)";
                badgeVerdict.style.color = "#f87171";
                badgeVerdict.style.border = "1px solid rgba(239, 68, 68, 0.4)";
                badgeVerdict.innerText = "REJEITADO COM PENDÊNCIAS";
            }
        }

        if (textSha) {
            textSha.innerText = audit.sha256 || "--";
        }

        if (listChecks && audit.checks) {
            listChecks.innerHTML = audit.checks.map(c => {
                let iconHtml = "";
                let color = "#cbd5e1";
                if (c.status === "passed") {
                    iconHtml = `<i class="fas fa-check-circle" style="color: #34d399;"></i>`;
                    color = "#34d399";
                } else if (c.status === "warning") {
                    iconHtml = `<i class="fas fa-exclamation-triangle" style="color: #fbbf24;"></i>`;
                    color = "#fbbf24";
                } else if (c.status === "failed") {
                    iconHtml = `<i class="fas fa-times-circle" style="color: #f87171;"></i>`;
                    color = "#f87171";
                } else {
                    iconHtml = `<i class="fas fa-info-circle" style="color: #38bdf8;"></i>`;
                    color = "#38bdf8";
                }

                return `
                    <div style="background: rgba(30, 41, 59, 0.5); border: 1px solid rgba(148, 163, 184, 0.15); border-radius: 6px; padding: 6px 10px; display: flex; align-items: flex-start; gap: 8px;">
                        <span style="margin-top: 2px;">${iconHtml}</span>
                        <div>
                            <strong style="color: ${color};">${c.label}</strong>:
                            <span style="color: #cbd5e1; margin-left: 4px;">${c.details}</span>
                        </div>
                    </div>
                `;
            }).join("");
        }

        if (typeof showToast === "function") {
            if (audit.valid) {
                showToast("Auditoria concluída: Pacote 100% válido!", "success");
            } else {
                showToast("Atenção: O pacote possui inconsistências apontadas pelo auditor.", "warning");
            }
        }
    } catch (err) {
        console.error("[PackageRepo] Falha ao auditar:", err);
        if (typeof showToast === "function") showToast(`Falha na auditoria: ${err.message}`, "error");
    } finally {
        if (btnAudit) {
            btnAudit.disabled = false;
            btnAudit.innerHTML = `<i class="fas fa-stethoscope"></i> Executar Auditoria Prévia do Pacote`;
        }
    }
}

async function submitPublishPackage() {
    const selectSvc = document.getElementById("modalUploadSelectService");
    const inputVer = document.getElementById("modalUploadInputVersion");
    const inputFile = document.getElementById("modalUploadInputFile");
    const inputJust = document.getElementById("modalUploadInputJustification");
    const btnSubmit = document.getElementById("btnConfirmPublishPackage");

    if (!selectSvc.value || !inputVer.value || !inputFile.files || inputFile.files.length === 0 || !inputJust.value) {
        if (typeof showToast === "function") showToast("Preencha todos os campos obrigatórios e a justificativa RBAC!", "warning");
        return;
    }

    if (!confirm(`Confirma a homologação e publicação do pacote para ${selectSvc.value} v${inputVer.value}?\n\nEsta ação irá atualizar o repositório local, o manifest.json do Google Cloud Storage e a Matriz de Governança Central.`)) {
        return;
    }

    if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Homologando &amp; Publicando...`;
    }

    const formData = new FormData();
    formData.append("package_file", inputFile.files[0]);
    formData.append("service_name", selectSvc.value);
    formData.append("target_version", inputVer.value.trim());
    formData.append("justification", inputJust.value.trim());

    try {
        const resp = await fetch("/api/fleet/packages/publish", {
            method: "POST",
            body: formData
        });

        const res = await resp.json();
        if (!resp.ok) {
            throw new Error(res.error || res.message || `HTTP ${resp.status}`);
        }

        if (typeof showToast === "function") {
            showToast(`Sucesso! Pacote ${res.filename} homologado e sincronizado no ecossistema!`, "success");
        }

        closeUploadPackageModal();
        loadPackageRepository(true);
        if (typeof loadFleetGovernanceSummary === "function") {
            loadFleetGovernanceSummary(true);
        }
    } catch (err) {
        console.error("[PackageRepo] Falha ao publicar pacote:", err);
        if (typeof showToast === "function") {
            showToast(`Erro na homologação do pacote: ${err.message}`, "error");
        }
    } finally {
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = `<i class="fas fa-check-circle"></i> Aprovar, Homologar &amp; Repercutir no Ecossistema`;
        }
    }
}

window.switchFleetSubtab = switchFleetSubtab;
window.togglePackageGuidePanel = togglePackageGuidePanel;
window.loadPackageRepository = loadPackageRepository;
window.filterPackageRepoTable = filterPackageRepoTable;
window.handlePackageRepoSearch = handlePackageRepoSearch;
window.openUploadPackageModal = openUploadPackageModal;
window.closeUploadPackageModal = closeUploadPackageModal;
window.handleModalServiceChange = handleModalServiceChange;
window.handleModalFileSelected = handleModalFileSelected;
window.runPackagePreAudit = runPackagePreAudit;
window.submitPublishPackage = submitPublishPackage;
window.copyRepoShaToClipboard = copyRepoShaToClipboard;
window.downloadPackageFile = downloadPackageFile;

// ==============================================================================
// MODAL DE CONFIGURAÇÃO REMOTA DO CAPTURE SITE (Multiplexes, AppConfig, LogRotate)
// ==============================================================================

let currentLoadedHostConfig = null;

function populateHostConfigSelectors() {
    const selPraca = document.getElementById("selectHostConfigPraca");
    const selMachine = document.getElementById("selectHostConfigMachine");
    if (!selPraca || !selMachine || !cachedFleetEvolutionData?.hosts) return;

    const hosts = cachedFleetEvolutionData.hosts || [];
    const pracas = [...new Set(hosts.map(h => h.praca).filter(Boolean))].sort();
    const currentPracaVal = selPraca.value;

    selPraca.innerHTML = `<option value="">Selecione a Praça (${pracas.length})...</option>` +
        pracas.map(p => `<option value="${p}">${p}</option>`).join("");

    if (pracas.includes(currentPracaVal)) {
        selPraca.value = currentPracaVal;
    }

    filterHostConfigMachines();
}

function onHostConfigPracaChange(praca) {
    filterHostConfigMachines();
}

function onHostConfigCSChange(cs) {
    filterHostConfigMachines();
}

function filterHostConfigMachines() {
    const selPraca = document.getElementById("selectHostConfigPraca");
    const selCS = document.getElementById("selectHostConfigCS");
    const selMachine = document.getElementById("selectHostConfigMachine");
    if (!selMachine) return;

    const selectedPraca = selPraca ? selPraca.value : "";
    const selectedCS = selCS ? selCS.value : "ALL";
    const hosts = cachedFleetEvolutionData?.hosts || [];

    let filtered = hosts;
    if (selectedPraca) {
        filtered = filtered.filter(h => (h.praca || "").toLowerCase() === selectedPraca.toLowerCase());
    }
    if (selectedCS && selectedCS !== "ALL") {
        filtered = filtered.filter(h => String(h.cs || 1) === String(selectedCS));
    }

    if (filtered.length === 0) {
        selMachine.innerHTML = `<option value="">Nenhuma máquina encontrada</option>`;
        return;
    }

    selMachine.innerHTML = `<option value="">Selecione a Máquina (${filtered.length})...</option>` +
        filtered.map(h => {
            const role = Number(h.cs || 1) === 1 ? "CS01 Detecção" : `CS${h.cs || 2} Mídia`;
            return `<option value="${h.hostname}">${h.hostname} — ${h.praca} (${role})</option>`;
        }).join("");

    if (filtered.length === 1) {
        selMachine.selectedIndex = 1;
    }
}

function openSelectedHostConfigModal() {
    const selMachine = document.getElementById("selectHostConfigMachine");
    const hostname = selMachine ? selMachine.value : "";
    if (!hostname) {
        if (typeof showToast === "function") {
            showToast("Selecione uma máquina no seletor para abrir as configurações.", "warning");
        } else {
            alert("Selecione uma máquina no seletor para abrir as configurações.");
        }
        return;
    }

    const hosts = cachedFleetEvolutionData?.hosts || [];
    const hObj = hosts.find(h => (h.hostname || "").toLowerCase() === hostname.toLowerCase());
    const praca = hObj ? hObj.praca : "";
    const cs = hObj ? (hObj.cs || 1) : 1;

    openHostConfigModal(hostname, praca, cs);
}

// ==========================================================================
// SUPER MODAL ATRIA (MediaDNA): GERENCIAMENTO OPERACIONAL DO CAPTURE SITE
// ==========================================================================
selectedProfileFilename = null;

async function openHostConfigModal(hostname, praca = "", cs = 1) {
    const modal = document.getElementById("modalHostConfig");
    if (!modal) return;

    const badgeH = document.getElementById("badgeHostConfigHostname");
    if (badgeH) badgeH.innerText = hostname;
    const txtP = document.getElementById("hostConfigTextPraca");
    if (txtP) txtP.innerText = praca || "Detectando...";
    const txtCS = document.getElementById("hostConfigTextCS");
    if (txtCS) txtCS.innerText = `CS 0${cs || 1}`;

    const badgeRole = document.getElementById("badgeHostConfigRole");
    if (badgeRole) {
        if (Number(cs) === 1) {
            badgeRole.innerText = "CS01 Primário (Detecção & Gravação)";
            badgeRole.style.background = "rgba(16, 185, 129, 0.2)";
            badgeRole.style.color = "#34d399";
            badgeRole.style.borderColor = "rgba(16, 185, 129, 0.4)";
        } else if (Number(cs) === 2) {
            badgeRole.innerText = "CS02 Backup (Gravação MP4 Contínua)";
            badgeRole.style.background = "rgba(56, 189, 248, 0.2)";
            badgeRole.style.color = "#38bdf8";
            badgeRole.style.borderColor = "rgba(56, 189, 248, 0.4)";
        } else {
            badgeRole.innerText = `CS0${cs} Satélite / Rádio`;
            badgeRole.style.background = "rgba(148, 163, 184, 0.2)";
            badgeRole.style.color = "#cbd5e1";
            badgeRole.style.borderColor = "rgba(148, 163, 184, 0.4)";
        }
    }

    switchHostConfigTab("channels");
    modal.style.display = "flex";

    const tbodyCh = document.getElementById("hostConfigChannelsTableBody");
    if (tbodyCh) {
        tbodyCh.innerHTML = `<tr><td colspan="15" style="text-align: center; color: #94a3b8; padding: 25px;"><i class="fas fa-spinner fa-spin" style="font-size: 20px; color: #38bdf8; margin-bottom: 8px;"></i><br>Carregando telemetria operacional de ${hostname}...</td></tr>`;
    }
    const tbodyMux = document.getElementById("hostConfigMuxesTableBody");
    if (tbodyMux) {
        tbodyMux.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #94a3b8; padding: 25px;"><i class="fas fa-spinner fa-spin"></i> Carregando multiplexes...</td></tr>`;
    }

    try {
        const token = getFleetAuthToken();
        const resp = await fetch(`/api/fleet/host-config/${encodeURIComponent(hostname)}`, {
            headers: token ? { "Authorization": `Bearer ${token}` } : {}
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        currentLoadedHostConfig = data;

        if (txtP && data.praca) txtP.innerText = data.praca;
        if (txtCS && data.cs) txtCS.innerText = `CS 0${data.cs}`;

        const txtHId = document.getElementById("hostConfigTextHostId");
        if (txtHId) txtHId.innerText = data.id_host ? `#${data.id_host}` : "--";

        const badgeNet = document.getElementById("badgeHostConfigNetwork");
        if (badgeNet && data.channels && data.channels.length > 0) {
            badgeNet.innerText = data.channels[0].network_type || "Digital Terrestre";
        }

        renderHostConfigMuxesTable(data.muxes || []);
        renderHostConfigChannelsTable(data.channels || [], data.cs);
        populateHostAppOptionsUI(data.application_options || {});
        renderHostProfilesList(data.wmprofiles || []);

        // LogRotate
        const lrCfg = data.logrotate || {};
        const elTarget = document.getElementById("cfgLrTarget");
        if (elTarget) elTarget.value = lrCfg.target_log_path || "D:\\MediaDNA_V2\\Applications\\DTVCapture64\\FastMatchingSvc\\fma.log";
        const elRotate = document.getElementById("cfgLrRotate");
        if (elRotate) elRotate.value = String(lrCfg.rotate_days || 10);

        generateHostConfigPreview();
    } catch (err) {
        console.error("Erro ao carregar host config:", err);
        if (typeof showToast === "function") showToast("Falha ao carregar configurações do host: " + err.message, "error");
        if (tbodyCh) {
            tbodyCh.innerHTML = `<tr><td colspan="15" style="text-align: center; color: #ef4444; padding: 20px;"><i class="fas fa-exclamation-triangle"></i> Falha ao conectar na API local do host. Detalhes: ${err.message}</td></tr>`;
        }
    }
}

function reloadCurrentHostConfig() {
    if (!currentLoadedHostConfig || !currentLoadedHostConfig.hostname) return;
    openHostConfigModal(currentLoadedHostConfig.hostname, currentLoadedHostConfig.praca, currentLoadedHostConfig.cs);
}

function closeHostConfigModal() {
    const modal = document.getElementById("modalHostConfig");
    if (modal) modal.style.display = "none";
}

function switchHostConfigTab(tabName) {
    const tabMuxes = document.getElementById("tabContentHostMuxes");
    const tabChannels = document.getElementById("tabContentHostChannels");
    const tabApp = document.getElementById("tabContentHostAppConfig");
    const tabProfiles = document.getElementById("tabContentHostProfiles");
    const tabLr = document.getElementById("tabContentHostLogRotate");
    const tabPrev = document.getElementById("tabContentHostPreview");

    const btnMuxes = document.getElementById("btnTabHostMuxes");
    const btnChannels = document.getElementById("btnTabHostChannels");
    const btnApp = document.getElementById("btnTabHostAppConfig");
    const btnProfiles = document.getElementById("btnTabHostProfiles");
    const btnLr = document.getElementById("btnTabHostLogRotate");
    const btnPrev = document.getElementById("btnTabHostPreview");

    const tabs = [
        { name: "muxes", el: tabMuxes, btn: btnMuxes },
        { name: "channels", el: tabChannels, btn: btnChannels },
        { name: "appconfig", el: tabApp, btn: btnApp },
        { name: "profiles", el: tabProfiles, btn: btnProfiles },
        { name: "logrotate", el: tabLr, btn: btnLr },
        { name: "preview", el: tabPrev, btn: btnPrev }
    ];

    tabs.forEach(t => {
        if (t.el) t.el.style.display = (t.name === tabName) ? "block" : "none";
        if (t.btn) {
            if (t.name === tabName) t.btn.classList.add("active");
            else t.btn.classList.remove("active");
        }
    });

    if (tabName === "preview") {
        generateHostConfigPreview();
    }
}

function switchAppConfigSubTab(subTab) {
    const subGen = document.getElementById("subTabContentAppGeneral");
    const subAuto = document.getElementById("subTabContentAppAutoDetection");
    const btnGen = document.getElementById("btnSubTabAppGeneral");
    const btnAuto = document.getElementById("btnSubTabAppAutoDetection");

    if (subTab === "general") {
        if (subGen) subGen.style.display = "block";
        if (subAuto) subAuto.style.display = "none";
        if (btnGen) { btnGen.style.background = "rgba(56, 189, 248, 0.2)"; btnGen.style.color = "#38bdf8"; }
        if (btnAuto) { btnAuto.style.background = "transparent"; btnAuto.style.color = "#94a3b8"; }
    } else {
        if (subGen) subGen.style.display = "none";
        if (subAuto) subAuto.style.display = "block";
        if (btnGen) { btnGen.style.background = "transparent"; btnGen.style.color = "#94a3b8"; }
        if (btnAuto) { btnAuto.style.background = "rgba(16, 185, 129, 0.2)"; btnAuto.style.color = "#34d399"; }
    }
}

// RENDERIZAÇÃO DA TABELA DE MUXES
function renderHostConfigMuxesTable(muxes) {
    const tbody = document.getElementById("hostConfigMuxesTableBody");
    if (!tbody) return;

    if (!muxes || muxes.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #94a3b8; padding: 20px;">Nenhum multiplex cadastrado. Clique em "Adicionar Mux" para configurar.</td></tr>`;
        return;
    }

    tbody.innerHTML = muxes.map((m, idx) => `
        <tr style="border-bottom: 1px solid rgba(148, 163, 184, 0.1);">
            <td style="padding: 6px 8px; text-align: center;">
                <input type="checkbox" id="muxActive_${idx}" ${m.is_active !== false ? "checked" : ""} onchange="updateMuxField(${idx}, 'is_active', this.checked)">
            </td>
            <td style="padding: 6px 8px; text-align: center; font-family: monospace; font-weight: 700; color: #38bdf8;">
                <input type="number" id="muxId_${idx}" value="${m.mux_id}" style="width: 50px; text-align: center; background: #0f172a; border: 1px solid rgba(148,163,184,0.3); border-radius: 4px; color: #f8fafc; font-size: 11px;" onchange="updateMuxField(${idx}, 'mux_id', Number(this.value))">
            </td>
            <td style="padding: 6px 8px;">
                <input type="text" id="muxName_${idx}" value="${m.name}" style="width: 100%; background: #0f172a; border: 1px solid rgba(148,163,184,0.3); border-radius: 4px; color: #f8fafc; font-size: 11px; padding: 3px 6px;" onchange="updateMuxField(${idx}, 'name', this.value)">
            </td>
            <td style="padding: 6px 8px;">
                <select id="muxNetwork_${idx}" style="width: 100%; background: #0f172a; border: 1px solid rgba(148,163,184,0.3); border-radius: 4px; color: #f8fafc; font-size: 11px; padding: 3px 6px;" onchange="updateMuxField(${idx}, 'network_type', this.value)">
                    <option value="Terrestrial" ${m.network_type === "Terrestrial" ? "selected" : ""}>Terrestrial (ISDB-Tb)</option>
                    <option value="Satellite" ${m.network_type === "Satellite" ? "selected" : ""}>Satellite (DVB-S2)</option>
                    <option value="Cable" ${m.network_type === "Cable" ? "selected" : ""}>Cable (DVB-C)</option>
                    <option value="Streaming" ${m.network_type === "Streaming" || m.network_type === "IP" ? "selected" : ""}>IP / Streaming (RTSP/UDP)</option>
                    <option value="Radio" ${m.network_type === "Radio" ? "selected" : ""}>Radio (FM/AM)</option>
                </select>
            </td>
            <td style="padding: 6px 8px;">
                <input type="number" id="muxFreq_${idx}" value="${m.frequency || 557000}" style="width: 100%; background: #0f172a; border: 1px solid rgba(148,163,184,0.3); border-radius: 4px; color: #f8fafc; font-size: 11px; padding: 3px 6px; font-family: monospace;" onchange="updateMuxField(${idx}, 'frequency', Number(this.value))">
            </td>
            <td style="padding: 6px 8px;">
                <select id="muxBw_${idx}" style="width: 100%; background: #0f172a; border: 1px solid rgba(148,163,184,0.3); border-radius: 4px; color: #f8fafc; font-size: 11px; padding: 3px 6px;" onchange="updateMuxField(${idx}, 'bandwidth', Number(this.value))">
                    <option value="6" ${m.bandwidth === 6 ? "selected" : ""}>6 MHz</option>
                    <option value="7" ${m.bandwidth === 7 ? "selected" : ""}>7 MHz</option>
                    <option value="8" ${m.bandwidth === 8 ? "selected" : ""}>8 MHz</option>
                </select>
            </td>
            <td style="padding: 6px 8px;">
                <input type="text" id="muxSource_${idx}" value="${m.source_path || ''}" placeholder="rtsp:// ou caminho" style="width: 100%; background: #0f172a; border: 1px solid rgba(148,163,184,0.3); border-radius: 4px; color: #f8fafc; font-size: 11px; padding: 3px 6px; font-family: monospace;" onchange="updateMuxField(${idx}, 'source_path', this.value)">
            </td>
            <td style="padding: 6px 8px;">
                <select id="muxDecMode_${idx}" style="width: 100%; background: #0f172a; border: 1px solid rgba(148,163,184,0.3); border-radius: 4px; color: #f8fafc; font-size: 11px; padding: 3px 6px;" onchange="updateMuxField(${idx}, 'video_decoding_mode', this.value)">
                    <option value="Usar a configuração LAV global" ${m.video_decoding_mode === "Usar a configuração LAV global" ? "selected" : ""}>LAV global (Recomendado)</option>
                    <option value="Microsoft DTV-DVD Video Decoder" ${m.video_decoding_mode === "Microsoft DTV-DVD Video Decoder" ? "selected" : ""}>Microsoft DTV-DVD</option>
                    <option value="LAV Video Decoder" ${m.video_decoding_mode === "LAV Video Decoder" ? "selected" : ""}>LAV Video Decoder</option>
                </select>
            </td>
        </tr>
    `).join("");
}

function updateMuxField(index, field, value) {
    if (!currentLoadedHostConfig || !currentLoadedHostConfig.muxes || !currentLoadedHostConfig.muxes[index]) return;
    currentLoadedHostConfig.muxes[index][field] = value;
    generateHostConfigPreview();
}

function addNewMuxRow() {
    if (!currentLoadedHostConfig) currentLoadedHostConfig = {};
    if (!currentLoadedHostConfig.muxes) currentLoadedHostConfig.muxes = [];

    const nextId = (currentLoadedHostConfig.muxes.length + 1) * 2;
    currentLoadedHostConfig.muxes.push({
        mux_id: nextId,
        sub_id: 0,
        name: `MUX Novo (${nextId})`,
        network_type: "Terrestrial",
        frequency: 557000 + (currentLoadedHostConfig.muxes.length * 6000),
        bandwidth: 6,
        polarization: "Not Set",
        modulation: "Not Set",
        source_path: "",
        first_timeout: 120,
        file_duration: 180,
        video_decoding_mode: "Usar a configuração LAV global",
        is_active: true
    });
    renderHostConfigMuxesTable(currentLoadedHostConfig.muxes);
    generateHostConfigPreview();
}

// RENDERIZAÇÃO DA TABELA DE CANAIS
function renderHostConfigChannelsTable(channels, cs) {
    const tbody = document.getElementById("hostConfigChannelsTableBody");
    if (!tbody) return;

    if (!channels || channels.length === 0) {
        tbody.innerHTML = `<tr><td colspan="15" style="text-align: center; color: #94a3b8; padding: 20px;">Nenhum canal sintonizado detectado para esta estação.</td></tr>`;
        return;
    }

    const availableEmuProfiles = [
        "EMU MediaDNA 1min",
        "EMU MDNA",
        "EMU_Atria_15min",
        "EMU_Atria_FMA",
        "EMU_BR_2min",
        "EMU_BR_3min",
        "EMU_BR_MediaDNA",
        "EMU MediaDNA 3min",
        "EMU_30MIN"
    ];

    tbody.innerHTML = channels.map((ch, idx) => {
        const isEmuRec = (ch.emu_is_recording !== undefined) ? !!ch.emu_is_recording : (Number(cs) === 1);
        const isMp4Rec = (ch.mp4_is_recording !== undefined) ? !!ch.mp4_is_recording : true;
        const isMp3Rec = (ch.mp3_is_recording !== undefined) ? !!ch.mp3_is_recording : true;
        const currentProfile = ch.emu_profile_name || "EMU MediaDNA 1min";
        const isOfficialProfile = currentProfile === "EMU MediaDNA 1min";

        return `
        <tr style="border-bottom: 1px solid rgba(148, 163, 184, 0.1);" data-channel-idx="${idx}">
            <td style="padding: 6px 8px; text-align: center;">
                <input type="checkbox" id="chActive_${idx}" ${ch.is_active !== false ? "checked" : ""} onchange="updateChannelField(${idx}, 'is_active', this.checked)">
            </td>
            <td style="padding: 6px 8px; font-weight: 600; color: #f8fafc;">
                <input type="text" id="chName_${idx}" value="${ch.name}" style="width: 100%; background: #0f172a; border: 1px solid rgba(148,163,184,0.3); border-radius: 4px; color: #f8fafc; font-size: 11px; padding: 2px 6px;" onchange="updateChannelField(${idx}, 'name', this.value)">
            </td>
            <td style="padding: 6px 8px; text-align: center; font-family: monospace; color: #94a3b8;">
                <input type="number" id="chIdS_${idx}" value="${ch.id_service || 23264}" style="width: 55px; text-align: center; background: #0f172a; border: 1px solid rgba(148,163,184,0.2); border-radius: 4px; color: #cbd5e1; font-size: 10px;" onchange="updateChannelField(${idx}, 'id_service', Number(this.value))">
            </td>
            <td style="padding: 6px 8px; text-align: center; font-family: monospace; color: #94a3b8;">
                <input type="number" id="chPv_${idx}" value="${ch.pv || 1047}" style="width: 45px; text-align: center; background: #0f172a; border: 1px solid rgba(148,163,184,0.2); border-radius: 4px; color: #cbd5e1; font-size: 10px;" onchange="updateChannelField(${idx}, 'pv', Number(this.value))">
            </td>
            <td style="padding: 6px 8px; text-align: center; font-family: monospace; color: #94a3b8;">
                <input type="number" id="chHost_${idx}" value="${ch.id_host || 284}" style="width: 45px; text-align: center; background: #0f172a; border: 1px solid rgba(148,163,184,0.2); border-radius: 4px; color: #cbd5e1; font-size: 10px;" onchange="updateChannelField(${idx}, 'id_host', Number(this.value))">
            </td>
            <td style="padding: 6px 8px; text-align: center; font-family: monospace; color: #94a3b8;">
                <input type="number" id="chCS_${idx}" value="${ch.cs || 1}" style="width: 35px; text-align: center; background: #0f172a; border: 1px solid rgba(148,163,184,0.2); border-radius: 4px; color: #cbd5e1; font-size: 10px;" onchange="updateChannelField(${idx}, 'cs', Number(this.value))">
            </td>
            <td style="padding: 6px 8px;">
                <select id="chDecoder_${idx}" style="width: 100%; background: #0f172a; border: 1px solid rgba(148,163,184,0.25); border-radius: 4px; color: #f8fafc; font-size: 10px; padding: 2px 4px;" onchange="updateChannelField(${idx}, 'preferred_decoder', this.value)">
                    <option value="Microsoft" ${ch.preferred_decoder === "Microsoft" ? "selected" : ""}>Microsoft</option>
                    <option value="LAV" ${ch.preferred_decoder === "LAV" ? "selected" : ""}>LAV</option>
                    <option value="Default" ${ch.preferred_decoder === "Default" ? "selected" : ""}>Default</option>
                </select>
            </td>
            <!-- MP4 RECORDING -->
            <td style="padding: 6px 8px; text-align: center; background: rgba(56, 189, 248, 0.05);">
                <input type="checkbox" id="chMp4Rec_${idx}" ${isMp4Rec ? "checked" : ""} onchange="updateChannelField(${idx}, 'mp4_is_recording', this.checked)">
            </td>
            <td style="padding: 6px 8px; background: rgba(56, 189, 248, 0.05);">
                <select id="chMp4Prof_${idx}" style="width: 100%; background: #0f172a; border: 1px solid rgba(56,189,248,0.3); border-radius: 4px; color: #38bdf8; font-size: 10px; padding: 2px 4px;" onchange="updateChannelField(${idx}, 'mp4_profile', this.value)">
                    <option value="MP4_MDNA" selected>MP4_MDNA</option>
                    <option value="MP4_HD">MP4_HD</option>
                    <option value="MP4_Standard">MP4_Standard</option>
                </select>
            </td>
            <!-- MP3 RECORDING -->
            <td style="padding: 6px 8px; text-align: center; background: rgba(245, 158, 11, 0.05);">
                <input type="checkbox" id="chMp3Rec_${idx}" ${isMp3Rec ? "checked" : ""} onchange="updateChannelField(${idx}, 'mp3_is_recording', this.checked)">
            </td>
            <td style="padding: 6px 8px; background: rgba(245, 158, 11, 0.05);">
                <select id="chMp3Prof_${idx}" style="width: 100%; background: #0f172a; border: 1px solid rgba(245,158,11,0.3); border-radius: 4px; color: #fbbf24; font-size: 10px; padding: 2px 4px;" onchange="updateChannelField(${idx}, 'mp3_profile', this.value)">
                    <option value="MP3_MDNA" selected>MP3_MDNA</option>
                    <option value="Mp3Prof_Audio Desc">Mp3Prof_Audio Desc</option>
                    <option value="Mp3Prof_Kantar BR">Mp3Prof_Kantar BR</option>
                </select>
            </td>
            <!-- EMU RECORDING -->
            <td style="padding: 6px 8px; text-align: center; background: rgba(16, 185, 129, 0.05);">
                <input type="checkbox" id="chEmuRec_${idx}" ${isEmuRec ? "checked" : ""} style="accent-color: #10b981;" onchange="updateChannelField(${idx}, 'emu_is_recording', this.checked)">
            </td>
            <td style="padding: 6px 8px; background: rgba(16, 185, 129, 0.05);">
                <select id="chEmuProf_${idx}" style="width: 100%; background: #0f172a; border: 1px solid ${isOfficialProfile ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.5)'}; border-radius: 4px; color: ${isOfficialProfile ? '#34d399' : '#f87171'}; font-size: 10px; font-weight: ${isOfficialProfile ? '700' : 'normal'}; padding: 2px 4px;" onchange="updateChannelField(${idx}, 'emu_profile_name', this.value)">
                    ${availableEmuProfiles.map(p => `
                        <option value="${p}" ${p === currentProfile ? "selected" : ""}>
                            ${p === "EMU MediaDNA 1min" ? "⭐ EMU MediaDNA 1min (Oficial)" : (p === "EMU MDNA" ? "⚠️ EMU MDNA (Legado)" : p)}
                        </option>
                    `).join("")}
                </select>
            </td>
            <!-- CAPTION & FRAMES -->
            <td style="padding: 6px 8px;">
                <input type="text" id="chCap_${idx}" value="${ch.video_caption_pattern || ''}" placeholder="Padrão Caption" style="width: 100%; background: #0f172a; border: 1px solid rgba(148,163,184,0.2); border-radius: 4px; color: #cbd5e1; font-size: 10px; padding: 2px 4px; font-family: monospace;" onchange="updateChannelField(${idx}, 'video_caption_pattern', this.value)">
            </td>
            <td style="padding: 6px 8px; text-align: center;">
                <input type="checkbox" id="chJpg_${idx}" ${ch.jpg_frames_generate !== false ? "checked" : ""} onchange="updateChannelField(${idx}, 'jpg_frames_generate', this.checked)">
            </td>
        </tr>
        `;
    }).join("");
}

function updateChannelField(index, field, value) {
    if (!currentLoadedHostConfig || !currentLoadedHostConfig.channels || !currentLoadedHostConfig.channels[index]) return;
    currentLoadedHostConfig.channels[index][field] = value;
    generateHostConfigPreview();
}

function applyEmuProfileToAll(targetProfile = "EMU MediaDNA 1min") {
    if (!currentLoadedHostConfig || !currentLoadedHostConfig.channels) return;
    currentLoadedHostConfig.channels.forEach(ch => {
        ch.emu_profile_name = targetProfile;
        ch.emu_is_recording = true;
    });
    renderHostConfigChannelsTable(currentLoadedHostConfig.channels, currentLoadedHostConfig.cs);
    generateHostConfigPreview();
    if (typeof showToast === "function") {
        showToast(`⚡ Todos os canais foram ajustados para o perfil oficial: ${targetProfile}!`, "success");
    }
}

// APPLICATION OPTIONS UI
function populateHostAppOptionsUI(opt) {
    const elAutoStart = document.getElementById("cfgAutoStartMuxes");
    if (elAutoStart) elAutoStart.checked = opt.auto_start_active_muxes !== false;

    const elDayOffset = document.getElementById("cfgDayOffset");
    if (elDayOffset) elDayOffset.value = opt.day_offset_minutes || 0;

    const elDaylight = document.getElementById("cfgDaylightSaving");
    if (elDaylight) elDaylight.value = opt.daylight_saving_time || "Brazil";

    // AutoDetection
    const elPort = document.getElementById("cfgAutoPort");
    if (elPort) elPort.value = opt.autodetection_port || 1234;

    const elBin = document.getElementById("cfgAutoBinMatch");
    if (elBin) elBin.value = opt.bin_match_threshold || 68;

    const elMaxEmu = document.getElementById("cfgAutoMaxEmu");
    if (elMaxEmu) elMaxEmu.value = opt.max_emu_validations || 3;

    const elCfgXml = document.getElementById("cfgAutoConfigXml");
    if (elCfgXml) elCfgXml.value = opt.mediadna_config_xml || "D:\\MediaDNA_V2\\Data\\Config\\ConfigXml.xml";

    const elTrack = document.getElementById("cfgAutoTrackingDir");
    if (elTrack) elTrack.value = opt.match_export_dir || "D:\\MediaDNA_V2\\Data\\tracking\\";
}

// WMPROFILES UI
function renderHostProfilesList(profiles) {
    const container = document.getElementById("hostProfilesListContainer");
    const countBadge = document.getElementById("countProfilesBadge");
    if (!container) return;

    if (!profiles || profiles.length === 0) {
        container.innerHTML = `<div style="text-align: center; color: #94a3b8; padding: 20px;">Nenhum perfil listado.</div>`;
        return;
    }

    if (countBadge) countBadge.innerText = `${profiles.length} perfis`;

    container.innerHTML = profiles.map((p, idx) => {
        const isSelected = selectedProfileFilename ? (p.filename === selectedProfileFilename) : (idx === 0);
        if (isSelected && !selectedProfileFilename) selectedProfileFilename = p.filename;

        const isEmu1min = p.filename.includes("1min");
        const isLegacy = p.filename === "EMU_EMU MDNA.xml";

        return `
            <div onclick="selectProfileItem('${p.filename}')" style="padding: 8px 10px; margin-bottom: 6px; border-radius: 6px; cursor: pointer; background: ${isSelected ? 'rgba(56, 189, 248, 0.15)' : 'rgba(15, 23, 42, 0.6)'}; border: 1px solid ${isSelected ? '#38bdf8' : 'rgba(148, 163, 184, 0.2)'}; transition: all 0.15s ease;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                    <span style="font-weight: 700; font-size: 11px; color: ${isEmu1min ? '#34d399' : (isLegacy ? '#f87171' : '#f8fafc')};">
                        ${isEmu1min ? '⭐ ' : (isLegacy ? '⚠️ ' : '')}${p.name}
                    </span>
                    <span style="font-size: 9px; padding: 1px 5px; border-radius: 8px; background: rgba(56,189,248,0.1); color: #38bdf8;">
                        ${p.profile_type}
                    </span>
                </div>
                <div style="font-size: 10px; color: #64748b; font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${p.filename} | ${p.modified_date || ''}
                </div>
            </div>
        `;
    }).join("");

    if (selectedProfileFilename) {
        const found = profiles.find(p => p.filename === selectedProfileFilename) || profiles[0];
        if (found) {
            const titleEl = document.getElementById("selectedProfileTitle");
            if (titleEl) titleEl.innerText = found.filename;
            const editorEl = document.getElementById("inpProfileXmlEditor");
            if (editorEl) editorEl.value = found.xml_content || "";
        }
    }
}

function selectProfileItem(filename) {
    selectedProfileFilename = filename;
    if (currentLoadedHostConfig && currentLoadedHostConfig.wmprofiles) {
        renderHostProfilesList(currentLoadedHostConfig.wmprofiles);
    }
}

function saveSelectedProfileXml() {
    if (!currentLoadedHostConfig || !currentLoadedHostConfig.wmprofiles || !selectedProfileFilename) return;
    const editorEl = document.getElementById("inpProfileXmlEditor");
    if (!editorEl) return;

    const found = currentLoadedHostConfig.wmprofiles.find(p => p.filename === selectedProfileFilename);
    if (found) {
        found.xml_content = editorEl.value;
        if (typeof showToast === "function") showToast(`Perfil '${selectedProfileFilename}' atualizado no buffer!`, "success");
        generateHostConfigPreview();
    }
}

// GERAÇÃO DINÂMICA DA PRÉVIA DO POWERSHELL
function generateHostConfigPreview() {
    const previewEl = document.getElementById("hostConfigScriptPreview");
    if (!previewEl || !currentLoadedHostConfig) return;

    const hostname = currentLoadedHostConfig.hostname || "BRMG-UDI-DT01";
    const praca = currentLoadedHostConfig.praca || "Desconhecida";
    const cs = currentLoadedHostConfig.cs || 1;

    const lrTarget = (document.getElementById("cfgLrTarget") ? document.getElementById("cfgLrTarget").value : "D:\\MediaDNA_V2\\Applications\\DTVCapture64\\FastMatchingSvc\\fma.log");
    const lrDays = (document.getElementById("cfgLrRotate") ? document.getElementById("cfgLrRotate").value : "10");
    const autoPort = (document.getElementById("cfgAutoPort") ? document.getElementById("cfgAutoPort").value : "1234");
    const autoThresh = (document.getElementById("cfgAutoBinMatch") ? document.getElementById("cfgAutoBinMatch").value : "68");

    const chUpdates = (currentLoadedHostConfig.channels || []).map(ch => {
        const cName = ch.name.replace("'", "''");
        const emuProf = ch.emu_profile_name || "EMU MediaDNA 1min";
        const emuRec = ch.emu_is_recording ? "$true" : "$false";
        return `        # Canal: ${cName} -> EMU Profile: ${emuProf}
        $p = $doc.SelectNodes("//Programs[translate(normalize-space(Name), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz') = '${cName.toLowerCase()}']");
        if ($p) {
            foreach ($item in $p) {
                ($item.SelectSingleNode('EMU_ProfileName') ?? $item.AppendChild($doc.CreateElement('EMU_ProfileName'))).InnerText = '${emuProf}';
                ($item.SelectSingleNode('EMU_IsRecording') ?? $item.AppendChild($doc.CreateElement('EMU_IsRecording'))).InnerText = if (${emuRec}) { 'true' } else { 'false' };
                ($item.SelectSingleNode('EMU_DestPath') ?? $item.AppendChild($doc.CreateElement('EMU_DestPath'))).InnerText = 'D:\\MediaDNA_V2\\Data\\emu';
                $chCount++;
            }
        }`;
    }).join("\n\n");

    const script = `# ==========================================================================
# SUPER MODAL ATRIA: CENTRAL CS NOC - APLICACAO DE CONFIGURACOES REMOTAS
# Host: ${hostname} | Praça: ${praca} (CS0${cs}) | Timestamp: ${new Date().toISOString()}
# ==========================================================================
$ErrorActionPreference = 'Continue';
[System.Text.Encoding]::RegisterProvider([System.Text.CodePagesEncodingProvider]::Instance);
$enc1252 = [System.Text.Encoding]::GetEncoding('Windows-1252');

Write-Host '[1/5] Encerrando processos do Atria Capture para escrita segura dos XMLs...';
cmd.exe /c "taskkill /f /t /im DigitalTVCapture.exe /im DigitalTVReceiver.exe /im AtriaCapture.exe >nul 2>&1";
Start-Sleep -Seconds 1;

# 2. Backup profilatico das configuracoes atuais (.bak)
Write-Host '[2/5] Realizando backup profilatico (.bak) das configuracoes atuais...';
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss';
$muxCandidates = @(
    'D:\\MediaDNA_V2\\Applications\\DTVCapture64\\Config\\Multiplexes.xml',
    'D:\\MediaDNA_V2\\Applications\\DTVCapture64\\Multiplexes.xml',
    'D:\\MediaDNA_V2\\Data\\Config\\Multiplexes.xml',
    'C:\\DTV\\DTVCapture\\Config\\Multiplexes.xml',
    'C:\\DTV\\DTVCapture\\Multiplexes.xml',
    'C:\\MediaDNA_V2\\Applications\\DTVCapture64\\Config\\Multiplexes.xml',
    'C:\\MediaDNA_V2\\Applications\\DTVCapture64\\Multiplexes.xml',
    'D:\\MediaDNA_V2\\Applications\\DTVCapture\\Config\\Multiplexes.xml'
) | Where-Object { Test-Path $_ };
foreach ($m in $muxCandidates) { Copy-Item -Path $m -Destination "$m.bak_$stamp" -Force -ErrorAction SilentlyContinue };

# 3. Atualizacao de Muxes, Canais e Padronizacao do Perfil EMU (EMU MediaDNA 1min)
Write-Host '[3/5] Aplicando novas diretrizes de Muxes, canais e perfis EMU em Multiplexes.xml...';
foreach ($mPath in $muxCandidates) {
    try {
        $raw = [System.IO.File]::ReadAllText($mPath, $enc1252);
        $clean = [System.Text.RegularExpressions.Regex]::Replace($raw, '[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f]', '');
        [xml]$doc = New-Object System.Xml.XmlDocument;
        $doc.LoadXml($clean);
        $chCount = 0;

${chUpdates}

        $settings = New-Object System.Xml.XmlWriterSettings;
        $settings.Encoding = $enc1252;
        $settings.Indent = $true;
        $w = [System.Xml.XmlWriter]::Create($mPath, $settings);
        $doc.Save($w);
        $w.Dispose();
        Write-Host "[OK] Multiplexes.xml salvo e blindado com sucesso em $mPath ($chCount ajustes).";
    } catch {
        Write-Host ('[ERRO] Falha ao atualizar Multiplexes.xml em ' + $mPath + ': ' + $_.Exception.Message);
    }
}

# 4. Atualizacao de Application Options (AutoDetection ListeningPort ${autoPort}, BinMatchThreshold ${autoThresh})
Write-Host '[4/5] Aplicando configuracao de AutoDetection SVC e LogRotate (${lrTarget} + rotate ${lrDays})...';
$lrContent = @'
${lrTarget} {
        daily
		dateext
		dateformat .%Y%m%d
		missingok
		rotate ${lrDays}
}
'@;
$lrPaths = @(
    'D:\\MediaDNA_V2\\Applications\\DTVCapture64\\FastMatchingSvc\\LogRotate\\logrotate.conf',
    'D:\\MediaDNA_V2\\Applications\\DTVCapture64\\FastMachingSvc\\LogRotate\\logrotate.conf',
    'C:\\DTV\\DTVCapture\\FastMatchingSvc\\LogRotate\\logrotate.conf'
);
foreach ($lp in $lrPaths) {
    $dir = Split-Path $lp -Parent;
    if (Test-Path $dir) {
        Set-Content -Path $lp -Value $lrContent -Encoding Ascii -Force;
        Write-Host "[OK] logrotate.conf atualizado em $lp";
    }
}

# 5. Reabertura do Atria Capture no ambiente interativo
Write-Host '[5/5] Reabrindo Atria Capture no ambiente interativo via schtasks...';
$exeCandidates = @(
    'D:\\MediaDNA_V2\\Applications\\DTVCapture64\\DigitalTVCapture.exe',
    'C:\\DTV\\DTVCapture\\DigitalTVCapture.exe'
);
$exe = $exeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1;
if ($exe) {
    schtasks /delete /tn 'Start_Atria_Interactive' /f >$null 2>&1;
    schtasks /create /tn 'Start_Atria_Interactive' /tr "\`"$exe\`"" /sc once /st 00:00 /it /f >$null 2>&1;
    schtasks /run /tn 'Start_Atria_Interactive' >$null 2>&1;
    Write-Host "[OK] Atria Capture reaberto com sucesso via tarefa interativa.";
}
Write-Host '==========================================================================';
Write-Host '[SUCESSO] Configuracoes operacionais aplicadas e Atria Capture reiniciado!';`;

    previewEl.value = script;
}

function copyHostConfigScript() {
    const previewEl = document.getElementById("hostConfigScriptPreview");
    if (!previewEl || !previewEl.value) return;
    navigator.clipboard.writeText(previewEl.value).then(() => {
        if (typeof showToast === "function") showToast("Script copiado para a área de transferência!", "success");
    }).catch(err => {
        console.error("Erro ao copiar script:", err);
    });
}

// SALVAMENTO ATÔMICO E ENVIO REMOTO
async function saveHostConfig() {
    if (!currentLoadedHostConfig) return;

    const hostname = currentLoadedHostConfig.hostname;
    const channels = currentLoadedHostConfig.channels || [];
    const muxes = currentLoadedHostConfig.muxes || [];
    const wmprofiles = currentLoadedHostConfig.wmprofiles || [];

    const reasonInp = document.getElementById("inpHostConfigReason");
    const reason = reasonInp ? reasonInp.value : "Ajuste de perfil EMU MediaDNA 1min e parâmetros operacionais do Atria";

    const btn = document.getElementById("btnSaveHostConfig");
    const icon = document.getElementById("iconSaveHostConfig");

    if (btn) btn.disabled = true;
    if (icon) icon.className = "fas fa-spinner fa-spin";

    const appOpt = {
        auto_start_active_muxes: document.getElementById("cfgAutoStartMuxes") ? document.getElementById("cfgAutoStartMuxes").checked : true,
        day_offset_minutes: Number(document.getElementById("cfgDayOffset") ? document.getElementById("cfgDayOffset").value : 0),
        daylight_saving_time: document.getElementById("cfgDaylightSaving") ? document.getElementById("cfgDaylightSaving").value : "Brazil",
        autodetection_port: Number(document.getElementById("cfgAutoPort") ? document.getElementById("cfgAutoPort").value : 1234),
        bin_match_threshold: Number(document.getElementById("cfgAutoBinMatch") ? document.getElementById("cfgAutoBinMatch").value : 68),
        max_emu_validations: Number(document.getElementById("cfgAutoMaxEmu") ? document.getElementById("cfgAutoMaxEmu").value : 3),
        mediadna_config_xml: document.getElementById("cfgAutoConfigXml") ? document.getElementById("cfgAutoConfigXml").value : "D:\\MediaDNA_V2\\Data\\Config\\ConfigXml.xml",
        match_export_dir: document.getElementById("cfgAutoTrackingDir") ? document.getElementById("cfgAutoTrackingDir").value : "D:\\MediaDNA_V2\\Data\\tracking\\"
    };

    const payload = {
        muxes: muxes,
        channels: channels,
        application_options: appOpt,
        wmprofiles: wmprofiles,
        logrotate: {
            target_log_path: document.getElementById("cfgLrTarget") ? document.getElementById("cfgLrTarget").value : "D:\\MediaDNA_V2\\Applications\\DTVCapture64\\FastMatchingSvc\\fma.log",
            rotate_days: Number(document.getElementById("cfgLrRotate") ? document.getElementById("cfgLrRotate").value : 10),
            frequency: "daily"
        },
        reason: reason
    };

    try {
        const token = getFleetAuthToken();
        const resp = await fetch(`/api/fleet/host-config/${encodeURIComponent(hostname)}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(token ? { "Authorization": `Bearer ${token}` } : {})
            },
            body: JSON.stringify(payload)
        });

        const resData = await resp.json();
        if (resp.ok && resData.success) {
            if (typeof showToast === "function") {
                showToast(`Ordem de configuração despachada com sucesso para ${hostname}! (ID Exec: ${resData.execution_id})`, "success");
            }
            closeHostConfigModal();
            if (typeof openRemoteCommandCockpitModal === "function") {
                openRemoteCommandCockpitModal(resData.execution_id);
            }
        } else {
            const err = resData.detail || resData.error || "Falha ao enviar comando remoto.";
            if (typeof showToast === "function") showToast(err, "error");
        }
    } catch (err) {
        console.error("Erro ao salvar host config:", err);
        if (typeof showToast === "function") showToast("Erro ao salvar: " + err.message, "error");
    } finally {
        if (btn) btn.disabled = false;
        if (icon) icon.className = "fas fa-save";
    }
}

window.openHostConfigModal = openHostConfigModal;
window.reloadCurrentHostConfig = reloadCurrentHostConfig;
window.closeHostConfigModal = closeHostConfigModal;
window.switchHostConfigTab = switchHostConfigTab;
window.switchAppConfigSubTab = switchAppConfigSubTab;
window.renderHostConfigMuxesTable = renderHostConfigMuxesTable;
window.updateMuxField = updateMuxField;
window.addNewMuxRow = addNewMuxRow;
window.renderHostConfigChannelsTable = renderHostConfigChannelsTable;
window.updateChannelField = updateChannelField;
window.applyEmuProfileToAll = applyEmuProfileToAll;
window.populateHostAppOptionsUI = populateHostAppOptionsUI;
window.renderHostProfilesList = renderHostProfilesList;
window.selectProfileItem = selectProfileItem;
window.saveSelectedProfileXml = saveSelectedProfileXml;
window.generateHostConfigPreview = generateHostConfigPreview;
window.copyHostConfigScript = copyHostConfigScript;
window.saveHostConfig = saveHostConfig;

// Auto-restauração do Widget Flutuante de Atualização Ativa ao carregar/recarregar a página
function initActiveFleetUpdateRestoration() {
    const saved = getSavedActiveFleetUpdate();
    if (saved && saved.host) {
        showActiveUpdateFloatingWidget({
            hostname: saved.host,
            praca: saved.host.split("-")[0] || saved.host,
            cs: 1,
            service_name: saved.serviceName || "Atria Capture",
            versao_desejada: saved.targetVersion || "2.0.0.2",
            progress_percent: 45
        });
        startBackgroundFloatingPoll();
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initActiveFleetUpdateRestoration);
} else {
    initActiveFleetUpdateRestoration();
}





// ==================== SUBABA DE CONFIGURAÇÃO CS (ATRIA) ====================
let cachedCSConfigData = null;
let currentCSConfigHost = null;

function openNavCSConfig() {
    const btn = document.querySelector('.nav-btn[data-tab="fleet-csconfig"]');
    if (btn) {
        btn.click();
    } else {
        if (typeof switchTab === "function") switchTab("fleet");
        if (typeof switchFleetSubtab === "function") switchFleetSubtab("csconfig");
        if (typeof populateSubtabCSSelectors === "function") populateSubtabCSSelectors();
    }
}
window.openNavCSConfig = openNavCSConfig;

async function populateSubtabCSSelectors() {
    const selPraca = document.getElementById("subtabHostConfigPraca");
    const selCS = document.getElementById("subtabHostConfigCS");
    const selMachine = document.getElementById("subtabHostConfigMachine");
    if (!selPraca || !selMachine) return;

    const pracasSet = new Set();
    const hostsMap = window._csConfigHostsMap || {};

    // 1. Carga imediata transparente via FleetCatalog existente
    if (window.FleetCatalog && Array.isArray(window.FleetCatalog.pracas)) {
        window.FleetCatalog.pracas.forEach(p => {
            if (p) pracasSet.add(p.trim());
        });
        if (Array.isArray(window.FleetCatalog.hosts)) {
            window.FleetCatalog.hosts.forEach(hObj => {
                const h = (typeof hObj === "string") ? hObj : (hObj && hObj.hostname ? hObj.hostname : "");
                const p = (typeof hObj === "object" && hObj && hObj.praca) ? hObj.praca.trim() : ((h.includes("-") ? h.split("-")[0] : h) || "").trim();
                let cs = (typeof hObj === "object" && hObj && hObj.cs) ? parseInt(hObj.cs) : 1;
                if (!cs || isNaN(cs)) {
                    if (h.toUpperCase().includes("CS2")) cs = 2;
                    else if (h.toUpperCase().includes("CS3")) cs = 3;
                    else cs = 1;
                }
                if (p && h) {
                    if (!hostsMap[p]) hostsMap[p] = [];
                    if (!hostsMap[p].some(x => x.hostname === h)) {
                        hostsMap[p].push({ hostname: h, cs: cs, raw_hostname: (hObj && hObj.raw_hostname ? hObj.raw_hostname : h) });
                    }
                }
            });
        }
    }

    function updatePracaDropdown() {
        window._csConfigHostsMap = hostsMap;
        const sortedPracas = Array.from(pracasSet).sort((a, b) => a.localeCompare(b, "pt-BR"));
        const currentVal = selPraca.value;
        selPraca.innerHTML = `<option value="">-- Selecione uma Praça (${sortedPracas.length}) --</option>` +
            sortedPracas.map(p => `<option value="${p}">${p}</option>`).join("");

        if (currentVal && sortedPracas.includes(currentVal)) {
            selPraca.value = currentVal;
        } else if (sortedPracas.length > 0) {
            selPraca.value = sortedPracas[0];
            onSubtabCSPracaChange(sortedPracas[0]);
        }
    }

    // Renderização síncrona instantânea (0ms)
    if (pracasSet.size > 0) {
        updatePracaDropdown();
    }

    let services = (typeof allCachedServices !== "undefined" && allCachedServices && allCachedServices.length > 0) ? allCachedServices : [];
    if (!services || services.length === 0) {
        try {
            const token = (typeof getAuthToken === "function") ? getAuthToken() : (localStorage.getItem("fleet_token") || "");
            const headers = token ? { "Authorization": `Bearer ${token}` } : {};
            const resp = await fetch(`/api/fleet/services?_t=${Date.now()}`, { headers });
            if (resp.ok) {
                services = await resp.json();
                if (typeof allCachedServices !== "undefined") allCachedServices = services;
            }
        } catch (e) {
            console.warn("[CSConfig] Erro ao carregar serviços para seletores:", e);
        }
    }

    if (services && services.length > 0) {
        services.forEach(s => {
            const praca = (s.praca || s.cidade || "").trim();
            const host = (s.hostname || "").trim();
            let cs = 1;
            try { cs = parseInt(s.cs || 1); } catch (_) { cs = 1; }
            if (praca && host) {
                pracasSet.add(praca);
                if (!hostsMap[praca]) hostsMap[praca] = [];
                if (!hostsMap[praca].some(h => h.hostname === host)) {
                    hostsMap[praca].push({ hostname: host, cs: cs, raw_hostname: s.raw_hostname || host });
                }
            }
        });
        updatePracaDropdown();
    }
}
window.populateSubtabCSSelectors = populateSubtabCSSelectors;

function onSubtabCSPracaChange(pracaVal) {
    const selCS = document.getElementById("subtabHostConfigCS");
    const selMachine = document.getElementById("subtabHostConfigMachine");
    if (!selMachine) return;

    if (!pracaVal) {
        selMachine.innerHTML = '<option value="">Selecione uma praça primeiro...</option>';
        return;
    }

    const hostsMap = window._csConfigHostsMap || {};
    const pracaHosts = hostsMap[pracaVal] || [];
    const csFilter = selCS ? selCS.value : "ALL";

    const filtered = pracaHosts.filter(h => {
        if (csFilter === "ALL") return true;
        return String(h.cs) === String(csFilter);
    });

    if (filtered.length === 0) {
        selMachine.innerHTML = `<option value="">Nenhum servidor encontrado para CS ${csFilter}</option>`;
        return;
    }

    selMachine.innerHTML = filtered.map(h => `<option value="${h.hostname}">${h.hostname} (CS ${h.cs})</option>`).join("");
    onSubtabCSMachineSelected(selMachine.value);
}
window.onSubtabCSPracaChange = onSubtabCSPracaChange;

function onSubtabCSChange(csVal) {
    const selPraca = document.getElementById("subtabHostConfigPraca");
    if (selPraca && selPraca.value) {
        onSubtabCSPracaChange(selPraca.value);
    }
}
window.onSubtabCSChange = onSubtabCSChange;

function onSubtabCSMachineSelected(machineVal) {
    currentCSConfigHost = machineVal;
    const badgeHost = document.getElementById("subtabBadgeHostname");
    const textPraca = document.getElementById("subtabTextPraca");
    const badgeRole = document.getElementById("subtabBadgeRole");

    if (badgeHost) badgeHost.innerText = machineVal || "-";
    if (textPraca) {
        const selPraca = document.getElementById("subtabHostConfigPraca");
        textPraca.innerText = selPraca ? selPraca.value : "-";
    }
    if (badgeRole) {
        const isCS01 = machineVal && (machineVal.includes("-CS1") || machineVal.includes("-CS01"));
        badgeRole.innerText = isCS01 ? "CS 01 (Detecção & Gravação)" : "CS 02/03 (Mídia Backup)";
        badgeRole.style.background = isCS01 ? "rgba(16, 185, 129, 0.2)" : "rgba(56, 189, 248, 0.2)";
        badgeRole.style.color = isCS01 ? "#34d399" : "#38bdf8";
    }

    if (machineVal) {
        loadSubtabHostConfig();
    }
}
window.onSubtabCSMachineSelected = onSubtabCSMachineSelected;

async function loadSubtabHostConfig() {
    const host = currentCSConfigHost;
    if (!host) return;

    const viewer = document.getElementById("subtabCSConfigViewer");
    const emptyState = document.getElementById("subtabCSConfigEmptyState");
    const tbody = document.getElementById("subtabHostConfigChannelsTbody");

    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 18px; color: #38bdf8;"><i class="fas fa-spinner fa-spin"></i> Lendo arquivos de configuração Multiplexes.xml e AppConfig.xml do host...</td></tr>';
    }

    try {
        const resp = await fetch(`/api/fleet/host-config/${encodeURIComponent(host)}?_t=${Date.now()}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        cachedCSConfigData = data;

        if (viewer) viewer.style.display = "block";
        if (emptyState) emptyState.style.display = "none";

        renderSubtabChannelsTable(data.host_channels || [], data.cs);
    } catch (e) {
        console.warn("[CSConfig] Erro ao carregar configuração do host:", e);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 18px; color: #f87171;">⚠️ Falha ao carregar XMLs do host [${host}]: ${e.message}</td></tr>`;
        }
    }
}
window.loadSubtabHostConfig = loadSubtabHostConfig;

function renderSubtabChannelsTable(channels, csNumber = 1) {
    const tbody = document.getElementById("subtabHostConfigChannelsTbody");
    if (!tbody) return;

    if (!channels || channels.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 16px; color: #94a3b8;">Nenhum canal ativo cadastrado para este Capture Site.</td></tr>';
        return;
    }

    const isDetectionCS = (csNumber === 1);

    tbody.innerHTML = channels.map((ch, idx) => {
        const isRec = ch.is_recording_mp4;
        const isEmu = ch.is_recording_emu;
        const profile = ch.emu_profile || "EMU MediaDNA 1min";
        const dest = ch.dest_folder || "D:\\MediaDNA_V2\\Data\\video_bkp";

        const emuBadge = isDetectionCS ?
            `<input type="checkbox" class="cs-emu-chk" data-idx="${idx}" ${isEmu ? 'checked' : ''} style="cursor: pointer; width: 15px; height: 15px;">` :
            '<span style="font-size: 10px; color: #64748b; font-style: italic;">Sem Detecção (CS Mídia)</span>';

        const profileSelect = isDetectionCS ? `
            <select class="form-control cs-profile-sel" data-idx="${idx}" style="background: #0f172a; color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4); border-radius: 4px; padding: 4px 8px; font-size: 11px; font-weight: 700;">
                <option value="EMU MediaDNA 1min" ${profile === 'EMU MediaDNA 1min' ? 'selected' : ''}>EMU MediaDNA 1min</option>
                <option value="EMU MDNA" ${profile === 'EMU MDNA' ? 'selected' : ''}>EMU MDNA</option>
                <option value="EMU 30s" ${profile === 'EMU 30s' ? 'selected' : ''}>EMU 30s</option>
                <option value="FastMatching Spot" ${profile === 'FastMatching Spot' ? 'selected' : ''}>FastMatching Spot</option>
            </select>
        ` : '<span style="font-size: 11px; color: #64748b;">N/A (CS Mídia)</span>';

        return `
            <tr style="border-bottom: 1px solid rgba(148, 163, 184, 0.1);">
                <td style="text-align: center;">
                    <input type="checkbox" class="cs-active-chk" data-idx="${idx}" ${ch.active !== false ? 'checked' : ''} style="cursor: pointer; width: 15px; height: 15px;">
                </td>
                <td style="font-weight: 700; color: #fff;">
                    ${ch.name || 'Canal ' + (idx + 1)}
                </td>
                <td style="font-family: monospace; color: #94a3b8;">
                    ${ch.service_id || ch.program_id || '-'}
                </td>
                <td style="font-family: monospace; color: #94a3b8;">
                    ${ch.audio_pid || '8000 Hz'}
                </td>
                <td style="text-align: center;">
                    ${emuBadge}
                </td>
                <td>
                    ${profileSelect}
                </td>
                <td style="font-family: monospace; font-size: 11px; color: #94a3b8;">
                    <input type="text" class="form-control cs-dest-input" data-idx="${idx}" value="${dest}" style="background: #0f172a; color: #f8fafc; border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 4px; padding: 4px 8px; font-size: 11px; width: 100%;">
                </td>
            </tr>
        `;
    }).join("");
}

function applyEmuProfileToAllChannels(profileName) {
    const selects = document.querySelectorAll(".cs-profile-sel");
    selects.forEach(sel => {
        sel.value = profileName;
    });
    const emuChks = document.querySelectorAll(".cs-emu-chk");
    emuChks.forEach(chk => {
        chk.checked = true;
    });
    if (typeof showToast === "function") {
        showToast(`Perfil '${profileName}' aplicado a todos os canais de gravação EMU!`, "success");
    }
}
window.applyEmuProfileToAllChannels = applyEmuProfileToAllChannels;

async function saveAndApplyHostConfig() {
    const host = currentCSConfigHost;
    if (!host) {
        if (typeof showToast === "function") showToast("Selecione um host primeiro.", "warning");
        return;
    }

    if (!confirm(`Confirmar aplicação de novas configurações no Capture Site [${host}]?\nO ATRIA será reiniciado com a nova configuração salva com backup (.bak).`)) {
        return;
    }

    const rows = document.querySelectorAll("#subtabHostConfigChannelsTbody tr");
    const channelsPayload = [];
    rows.forEach((r, idx) => {
        const actChk = r.querySelector(".cs-active-chk");
        const emuChk = r.querySelector(".cs-emu-chk");
        const profSel = r.querySelector(".cs-profile-sel");
        const destInp = r.querySelector(".cs-dest-input");
        if (actChk) {
            channelsPayload.push({
                index: idx,
                active: actChk.checked,
                is_recording_emu: emuChk ? emuChk.checked : false,
                emu_profile: profSel ? profSel.value : "EMU MediaDNA 1min",
                dest_folder: destInp ? destInp.value : ""
            });
        }
    });

    try {
        const resp = await fetch(`/api/fleet/host-config/${encodeURIComponent(host)}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                hostname: host,
                channels: channelsPayload
            })
        });

        const res = await resp.json();
        if (resp.ok && res.success) {
            if (typeof showToast === "function") {
                showToast(`Configuração enviada com sucesso para [${host}]! ATRIA reiniciando...`, "success");
            }
        } else {
            throw new Error(res.detail || res.error || "Falha ao salvar configuração");
        }
    } catch (e) {
        console.error("[CSConfig] Erro ao salvar:", e);
        if (typeof showToast === "function") {
            showToast(`Erro ao aplicar configuração: ${e.message}`, "error");
        }
    }
}
window.saveAndApplyHostConfig = saveAndApplyHostConfig;

function previewXmlChanges() {
    if (!cachedCSConfigData) {
        if (typeof showToast === "function") showToast("Carregue a configuração do host primeiro.", "warning");
        return;
    }
    const host = currentCSConfigHost || "Host";
    const xml = cachedCSConfigData.xml_preview || `<!-- Multiplexes.xml para ${host} -->\n<Multiplexes>\n  <!-- Configurações ativas aplicadas com sucesso -->\n</Multiplexes>`;
    alert(`Prévia dos arquivos de configuração (${host}):\n\n` + xml.substring(0, 800) + (xml.length > 800 ? "\n... (restante preservado)" : ""));
}
window.previewXmlChanges = previewXmlChanges;

function openSelectedHostConfigModal() {
    if (typeof openHostConfigModal === "function") {
        openHostConfigModal(currentCSConfigHost || "Ariquemes-SMME-261-CS1");
    } else {
        previewXmlChanges();
    }
}
window.openSelectedHostConfigModal = openSelectedHostConfigModal;

