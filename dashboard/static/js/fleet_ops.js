// static/js/fleet_ops.js - Gestão de Frotas e Deploy Canário (5 Pilotos -> Frota Completa)

function getFleetAuthToken() {
    if (typeof authToken !== "undefined" && authToken) return authToken;
    return localStorage.getItem("dna_auth_token") || localStorage.getItem("token") || "";
}

async function loadCanaryPipelineStatus() {
    const targetInput = document.getElementById("canaryTargetVersion");
    const targetVer = (targetInput && targetInput.value ? targetInput.value : "1.0.18.0").trim();
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

            const graphStatus = data.graph_rate_limit || { is_throttled: false, status: "Healthy" };
            const graphColor = graphStatus.is_throttled ? "#f43f5e" : "#10b981";
            const graphText = graphStatus.is_throttled ? (graphStatus.status || "Throttling 429") : "Cota Normal • Conectado";

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
                    <div style="font-size: 11px; color: #94a3b8; text-transform: uppercase;">Restante da Frota (Protegida)</div>
                    <div style="font-size: 20px; font-weight: 800; color: #e2e8f0; margin-top: 2px;">${data.pending_count} <span style="font-size: 12px; font-weight: 500; color: #64748b;">aguardando 5 pilotos</span></div>
                </div>
                <div style="background: rgba(15,23,42,0.7); border: 1px solid ${graphColor}; border-radius: 8px; padding: 12px 14px;">
                    <div style="font-size: 11px; color: #94a3b8; text-transform: uppercase;">MS Graph Cloud Sentinel</div>
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
    const targetVer = (document.getElementById("canaryTargetVersion")?.value || "1.0.18.0").trim();

    const logBox = document.getElementById("canaryLogOutput");
    if (logBox) {
        logBox.innerText = `[${new Date().toLocaleTimeString()}] 🐤 Disparando Fase 1 (Homologação Canário em 5 Praças Piloto) para DNA.MonitorServiceSVC v${targetVer}...\n`;
    }

    try {
        const resp = await fetch("/api/fleet/action", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${getFleetAuthToken()}`
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
    const targetVer = (document.getElementById("canaryTargetVersion")?.value || "1.0.18.0").trim();

    const logBox = document.getElementById("canaryLogOutput");
    if (logBox) {
        logBox.innerText += `\n[${new Date().toLocaleTimeString()}] 🚀 Disparando Fase 2: Despachando DNA.MonitorServiceSVC v${targetVer} para todas as demais praças da frota...`;
    }

    try {
        const resp = await fetch("/api/fleet/action", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${getFleetAuthToken()}`
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
                    <div style="font-size: 10px; color: #38bdf8; text-transform: uppercase; font-weight: 700;">🟡 Em Delay (2h a 6h)</div>
                    <div style="font-size: 22px; font-weight: 800; color: #38bdf8; margin-top: 4px;">${summary.in_delay || 0} <span style="font-size: 11px; font-weight: 500; color: #94a3b8;">hosts</span></div>
                    <div style="font-size: 10px; color: #bae6fd; margin-top: 2px;">Oscilação WAN / Intervalo</div>
                </div>
                <div style="background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; padding: 12px; cursor: pointer;" onclick="filterAutoHealingList('offline')" title="Clique para filtrar">
                    <div style="font-size: 10px; color: #f87171; text-transform: uppercase; font-weight: 700;">🔴 Offline Crítico (>24h)</div>
                    <div style="font-size: 22px; font-weight: 800; color: #ef4444; margin-top: 4px;">${summary.offline || 0} <span style="font-size: 11px; font-weight: 500; color: #94a3b8;">hosts</span></div>
                    <div style="font-size: 10px; color: #fca5a5; margin-top: 2px;">Sem comunicação recente</div>
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
    } else if (currentAutoHealingFilter === "offline") {
        filtered = hosts.filter(h => h.comm_state === "OFFLINE_CRITICAL" || h.comm_state === "OFFLINE_RECENT");
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
        } else if (h.comm_state.startsWith("OFFLINE")) {
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

document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
        loadCanaryPipelineStatus();
        loadFleetAutoHealingStatus();
    }, 1200);
});
