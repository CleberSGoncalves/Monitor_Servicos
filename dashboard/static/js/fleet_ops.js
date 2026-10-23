// static/js/fleet_ops.js - Gestão de Frotas e Deploy Canário (5 Pilotos -> Frota Completa)

function getFleetAuthToken() {
    if (typeof authToken !== "undefined" && authToken) return authToken;
    return localStorage.getItem("dna_auth_token") || localStorage.getItem("token") || "";
}

async function loadCanaryPipelineStatus() {
    const targetInput = document.getElementById("canaryTargetVersion");
    const targetVer = (targetInput && targetInput.value ? targetInput.value : "1.0.16.0").trim();
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
    const targetVer = (document.getElementById("canaryTargetVersion")?.value || "1.0.16.0").trim();

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
    const targetVer = (document.getElementById("canaryTargetVersion")?.value || "1.0.16.0").trim();

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

document.addEventListener("DOMContentLoaded", () => {
    setTimeout(loadCanaryPipelineStatus, 1200);
});
