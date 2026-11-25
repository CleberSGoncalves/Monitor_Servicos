/**
 * rollback_ops.js — Plano de Rollback Catastrófico para Capture Sites
 * Kantar IBOPE Media — Monitor_Servicos NOC LATAM
 */

let rollbackJournalData = [];

async function loadRollbackJournal() {
    const tbody = document.getElementById("rollbackJournalTableBody");
    const kpiTotal = document.getElementById("kpiRollbackTotal");
    const kpiPending = document.getElementById("kpiRollbackPending");
    const kpiDone = document.getElementById("kpiRollbackDone");

    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 35px; color: #94a3b8;">
                    <i class="fas fa-spinner fa-spin" style="font-size: 20px; margin-bottom: 8px;"></i>
                    <div>Carregando journal de rollback e snapshots de segurança...</div>
                </td>
            </tr>
        `;
    }

    try {
        const token = (typeof getAuthToken === "function") ? getAuthToken() : (localStorage.getItem("fleet_token") || "");
        const headers = token ? { "Authorization": `Bearer ${token}` } : {};

        const hostFilter = document.getElementById("rollbackFilterHost")?.value || "";
        const typeFilter = document.getElementById("rollbackFilterType")?.value || "";
        const statusFilter = document.getElementById("rollbackFilterStatus")?.value || "";

        let url = `/api/fleet/rollback/journal?limit=150`;
        if (hostFilter) url += `&hostname=${encodeURIComponent(hostFilter)}`;
        if (typeFilter) url += `&action_type=${encodeURIComponent(typeFilter)}`;
        if (statusFilter) url += `&status=${encodeURIComponent(statusFilter)}`;

        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        rollbackJournalData = data.records || [];

        // Atualizar KPIs
        const total = rollbackJournalData.length;
        const pending = rollbackJournalData.filter(r => r.rollback_status === "PENDING").length;
        const done = rollbackJournalData.filter(r => r.rollback_status === "ROLLED_BACK").length;

        if (kpiTotal) kpiTotal.innerText = total;
        if (kpiPending) kpiPending.innerText = pending;
        if (kpiDone) kpiDone.innerText = done;

        renderRollbackJournalTable(rollbackJournalData);
    } catch (e) {
        console.error("Erro ao carregar rollback journal:", e);
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 25px; color: #f87171;">
                        <i class="fas fa-exclamation-triangle" style="margin-right: 6px;"></i>
                        Falha ao obter dados do journal de rollback: ${e.message}
                    </td>
                </tr>
            `;
        }
    }
}

function renderRollbackJournalTable(records) {
    const tbody = document.getElementById("rollbackJournalTableBody");
    if (!tbody) return;

    if (!records || records.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 40px 20px; color: #94a3b8;">
                    <i class="fas fa-shield-alt" style="font-size: 28px; color: #10b981; margin-bottom: 10px; display: block;"></i>
                    <div style="font-size: 14px; font-weight: 600; color: #f8fafc;">Nenhuma ação de risco pendente no journal</div>
                    <div style="font-size: 12px; margin-top: 4px;">Todas as alterações recentes possuem plano de reversão garantido ou estão em estado seguro.</div>
                </td>
            </tr>
        `;
        return;
    }

    const typeLabels = {
        "atria_update": { label: "Atualização Atria Capture", color: "#38bdf8", icon: "rocket" },
        "fastmatching_migration": { label: "Migração FastMatching", color: "#10b981", icon: "bolt" },
        "emu_profile_change": { label: "Perfil EMU (WMProfiles)", color: "#a855f7", icon: "file-audio" },
        "host_config": { label: "Configuração Multiplexes", color: "#f59e0b", icon: "sliders-h" },
        "remote_command": { label: "Comando Remoto", color: "#ec4899", icon: "terminal" },
        "remove_host": { label: "Remoção de Host", color: "#ef4444", icon: "trash" },
        "set_desired_version": { label: "Governança / Versão", color: "#64748b", icon: "tag" },
        "service_restart": { label: "Reinício de Serviço", color: "#06b6d4", icon: "redo" }
    };

    tbody.innerHTML = records.map((r, i) => {
        const tInfo = typeLabels[r.action_type] || { label: r.action_type, color: "#94a3b8", icon: "cog" };
        const isRolledBack = r.rollback_status === "ROLLED_BACK";
        const statusBadge = isRolledBack
            ? `<span class="badge" style="background: rgba(34, 197, 94, 0.2); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.4);"><i class="fas fa-check-circle"></i> REVERTIDO</span>`
            : `<span class="badge" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4);"><i class="fas fa-clock"></i> REVERSÍVEL</span>`;

        const snapText = r.snapshot_before ? JSON.stringify(r.snapshot_before).substring(0, 70) + (JSON.stringify(r.snapshot_before).length > 70 ? "..." : "") : "-";
        const timeStr = r.created_at ? r.created_at.replace("T", " ").substring(0, 19) : "-";

        return `
            <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05); transition: background 0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
                <td style="padding: 10px 12px; font-family: monospace; color: #64748b; text-align: center;">${i + 1}</td>
                <td style="padding: 10px 12px; font-family: monospace; color: #cbd5e1; font-size: 11.5px; white-space: nowrap;">${timeStr}</td>
                <td style="padding: 10px 12px;">
                    <div style="font-weight: 700; color: #f8fafc; font-size: 12.5px;">${r.hostname}</div>
                    <div style="font-size: 11px; color: #94a3b8;">${r.praca || 'Capture Site Oficial'}</div>
                </td>
                <td style="padding: 10px 12px;">
                    <span class="badge" style="background: ${tInfo.color}22; color: ${tInfo.color}; border: 1px solid ${tInfo.color}44; font-size: 11px;">
                        <i class="fas fa-${tInfo.icon}"></i> ${tInfo.label}
                    </span>
                </td>
                <td style="padding: 10px 12px; font-size: 11.5px; color: #cbd5e1;">
                    <div><b>${r.operator || 'NOC'}</b></div>
                    <div style="font-size: 10px; color: #64748b;">${r.operator_role || 'operador'}</div>
                </td>
                <td style="padding: 10px 12px;">
                    <code style="font-size: 10.5px; background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px; color: #94a3b8; display: inline-block; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title='${JSON.stringify(r.snapshot_before || {})}'>
                        ${snapText}
                    </code>
                </td>
                <td style="padding: 10px 12px; text-align: center;">
                    ${statusBadge}
                    ${isRolledBack && r.rolled_back_at ? `<div style="font-size: 9.5px; color: #64748b; margin-top: 3px;">Por ${r.rolled_back_by || 'NOC'}</div>` : ''}
                </td>
                <td style="padding: 10px 12px; text-align: right; white-space: nowrap;">
                    <button class="btn btn-sm" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); margin-right: 6px;" onclick="openRollbackPreviewModal('${r.action_id}')" title="Inspecionar Script PowerShell Reverso">
                        <i class="fas fa-eye"></i> Script
                    </button>
                    ${!isRolledBack ? `
                        <button class="btn btn-sm" style="background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); font-weight: 700;" onclick="triggerRollbackExecution('${r.action_id}', '${r.hostname}')" title="Executar Reversão Catastrófica">
                            <i class="fas fa-undo-alt"></i> Reverter
                        </button>
                    ` : `
                        <button class="btn btn-sm" disabled style="opacity: 0.4; background: rgba(255,255,255,0.05); color: #64748b; border: 1px solid rgba(255,255,255,0.1);">
                            <i class="fas fa-check"></i> Revertido
                        </button>
                    `}
                </td>
            </tr>
        `;
    }).join('');
}

async function openRollbackPreviewModal(actionId) {
    try {
        const token = (typeof getAuthToken === "function") ? getAuthToken() : (localStorage.getItem("fleet_token") || "");
        const headers = token ? { "Authorization": `Bearer ${token}` } : {};

        const res = await fetch(`/api/fleet/rollback/preview/${encodeURIComponent(actionId)}`, { headers });
        if (!res.ok) throw new Error("Ação não localizada");
        const data = await res.json();

        const modal = document.getElementById("modalRollbackPreview");
        if (!modal) return;

        document.getElementById("rollbackPreviewActionId").innerText = data.action_id;
        document.getElementById("rollbackPreviewHost").innerText = `${data.hostname} (${data.praca || 'CS'})`;
        document.getElementById("rollbackPreviewType").innerText = data.action_type;
        document.getElementById("rollbackPreviewOperator").innerText = data.operator || "NOC";
        document.getElementById("rollbackPreviewStatus").innerText = data.status || "PENDING";
        document.getElementById("rollbackPreviewScript").innerText = data.rollback_script || "# Nenhum script reverso gerado";

        const btnExec = document.getElementById("btnRollbackExecuteInModal");
        if (btnExec) {
            btnExec.style.display = (data.status === "ROLLED_BACK") ? "none" : "inline-flex";
            btnExec.onclick = () => {
                closeRollbackPreviewModal();
                triggerRollbackExecution(data.action_id, data.hostname);
            };
        }

        modal.style.display = "flex";
    } catch (e) {
        alert("Erro ao abrir pré-visualização de rollback: " + e.message);
    }
}

function closeRollbackPreviewModal() {
    const modal = document.getElementById("modalRollbackPreview");
    if (modal) modal.style.display = "none";
}

function copyRollbackScriptToClipboard() {
    const text = document.getElementById("rollbackPreviewScript")?.innerText || "";
    navigator.clipboard.writeText(text).then(() => {
        alert("✅ Script PowerShell de rollback copiado para a Área de Transferência!");
    });
}

async function triggerRollbackExecution(actionId, hostname) {
    if (!confirm(`🚨 ATENÇÃO: Deseja realmente executar a REVERSÃO CATASTRÓFICA para o host ${hostname}?\n\nEsta ação reverterá as alterações realizadas para o estado anterior registrado no snapshot.`)) {
        return;
    }

    try {
        const token = (typeof getAuthToken === "function") ? getAuthToken() : (localStorage.getItem("fleet_token") || "");
        const headers = token ? { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };

        const res = await fetch(`/api/fleet/rollback/execute/${encodeURIComponent(actionId)}`, {
            method: "POST",
            headers
        });

        const result = await res.json();
        if (!res.ok || !result.success) {
            throw new Error(result.error || result.detail || "Erro ao executar rollback");
        }

        alert(`✅ REVERSÃO DISPARADA COM SUCESSO!\n\nHost: ${result.hostname}\nStatus: ${result.dispatch_status}\nData: ${result.rolled_back_at}`);
        loadRollbackJournal();
    } catch (e) {
        alert("❌ Falha na execução do rollback: " + e.message);
    }
}

window.loadRollbackJournal = loadRollbackJournal;
window.openRollbackPreviewModal = openRollbackPreviewModal;
window.closeRollbackPreviewModal = closeRollbackPreviewModal;
window.copyRollbackScriptToClipboard = copyRollbackScriptToClipboard;
window.triggerRollbackExecution = triggerRollbackExecution;
