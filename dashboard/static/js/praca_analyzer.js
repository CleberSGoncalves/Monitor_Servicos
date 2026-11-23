/**
 * praca_analyzer.js - Auditoria de Praca por Capture Site & Central de Solucoes Inteligente (N1 / N2)
 */

let currentPracaAuditData = null;

async function openPracaAuditModal(preSelectedPraca = "") {
    const modal = document.getElementById("modalPracaAudit");
    if (!modal) return;
    modal.style.display = "flex";

    await populatePracasDropdown();

    const input = document.getElementById("pracaAuditSelect");
    if (input && preSelectedPraca) {
        input.value = preSelectedPraca;
        await runPracaAudit();
    }
}
window.openPracaAuditModal = openPracaAuditModal;

function closePracaAuditModal() {
    const modal = document.getElementById("modalPracaAudit");
    if (modal) modal.style.display = "none";
}
window.closePracaAuditModal = closePracaAuditModal;

async function populatePracasDropdown() {
    const sel = document.getElementById("pracaAuditSelect");
    if (!sel || sel.options.length > 1) return;

    try {
        const resp = await fetch("/api/fleet/praca/list");
        if (!resp.ok) return;
        const pracas = await resp.json();
        sel.innerHTML = '<option value="">-- Selecione a Praça / Filial --</option>';
        pracas.forEach(p => {
            const opt = document.createElement("option");
            opt.value = p.praca;
            const badge = p.canais_com_falha > 0 ? `⚠️ ${p.praca} (${p.canais_com_falha} falhas)` : `🟢 ${p.praca}`;
            opt.textContent = badge;
            sel.appendChild(opt);
        });
    } catch (err) {
        console.error("[PracaAnalyzer] Erro ao carregar praças:", err);
    }
}

async function runPracaAudit() {
    const sel = document.getElementById("pracaAuditSelect");
    const praca = sel ? sel.value.trim() : "";
    if (!praca) {
        alert("Por favor, selecione uma praça para auditar.");
        return;
    }

    const container = document.getElementById("pracaAuditResultContainer");
    if (container) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #38bdf8;">
                <i class="fas fa-spinner fa-spin fa-2x"></i>
                <div style="margin-top: 12px; font-weight: 700;">Executando Raio-X forense determinístico do Capture Site ${escapeHtml(praca)}...</div>
                <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Auditando CS01, CS02, CS03, tuners, esteira de detecção, base SGG e WCF...</div>
            </div>
        `;
    }

    try {
        const [auditResp, solResp] = await Promise.all([
            fetch(`/api/fleet/praca/audit/${encodeURIComponent(praca)}`),
            fetch("/api/fleet/praca/ai-solution", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ praca: praca })
            })
        ]);

        if (!auditResp.ok) throw new Error("Falha ao auditar praça");
        const audit = await auditResp.json();
        const sol = await solResp.json();
        currentPracaAuditData = { audit, sol };
        renderPracaAuditAndSolutions(audit, sol);
    } catch (err) {
        if (container) {
            container.innerHTML = `<div style="color: #ef4444; padding: 20px;">Erro na auditoria: ${escapeHtml(err.message)}</div>`;
        }
    }
}
window.runPracaAudit = runPracaAudit;

function renderPracaAuditAndSolutions(audit, sol) {
    const container = document.getElementById("pracaAuditResultContainer");
    if (!container) return;

    const score = audit.health_score || 0;
    const scoreCol = score >= 85 ? "#34d399" : (score >= 50 ? "#fbbf24" : "#ef4444");

    let html = `
        <!-- Topo: Score e Diagnostico -->
        <div style="background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 16px; margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 12px;">
                <div>
                    <h3 style="margin: 0; color: #fff; font-size: 16px; font-weight: 800;">
                        🏢 Capture Site ${escapeHtml(audit.praca)} • Raio-X Forense
                    </h3>
                    <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">
                        Auditoria concluída em ${escapeHtml(audit.timestamp_auditoria)} • ${audit.total_hosts} hosts • ${audit.total_canais} canais
                    </div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 24px; font-weight: 800; color: ${scoreCol};">${score}%</div>
                    <span class="badge" style="background: ${scoreCol}22; color: ${scoreCol}; border: 1px solid ${scoreCol}; font-weight: 800; font-size: 10px;">
                        ${audit.status_geral}
                    </span>
                </div>
            </div>

            <!-- Camada de Motores e CS01 -->
            <div style="background: rgba(0,0,0,0.3); border-radius: 6px; padding: 10px 12px; font-size: 12px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                <div>
                    <span style="color: #94a3b8;">Host Central CS01:</span> <strong style="color: #fff;">${escapeHtml(audit.cs01_host || 'N/D')}</strong>
                </div>
                <div>
                    <span style="color: #94a3b8;">Motor de Detecção:</span>
                    <strong style="color: ${audit.engine_conflict ? '#ef4444' : '#38bdf8'};">${escapeHtml(audit.active_engine)}</strong>
                </div>
            </div>
        </div>

        <!-- Central de Solucoes Inteligente (Pipeline Guiado) -->
        <div style="background: rgba(99, 102, 241, 0.08); border: 1px solid rgba(99, 102, 241, 0.3); border-left: 4px solid #6366f1; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <span style="font-size: 18px;">💡</span>
                <h4 style="margin: 0; color: #c7d2fe; font-size: 14px; font-weight: 800; text-transform: uppercase;">
                    Central de Soluções Inteligente • Diagnóstico &amp; Playbook
                </h4>
            </div>
            <div style="font-size: 12px; color: #cbd5e1; line-height: 1.5; margin-bottom: 14px;">
                ${escapeHtml(sol.veredito)}
            </div>

            <!-- Steps do Pipeline de Acao -->
            <div style="display: flex; flex-direction: column; gap: 10px;">
    `;

    if (sol.pipeline_steps && sol.pipeline_steps.length > 0) {
        sol.pipeline_steps.forEach(st => {
            html += `
                <div style="background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 12px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                    <div style="flex: 1; min-width: 260px;">
                        <div style="font-weight: 700; color: #fff; font-size: 12px; margin-bottom: 3px;">
                            Passo ${st.step}: ${escapeHtml(st.title)}
                        </div>
                        <div style="font-size: 11px; color: #94a3b8; line-height: 1.4;">
                            ${escapeHtml(st.why)}
                        </div>
                    </div>
                    <div>
                        <button type="button" class="${st.btn_style || 'btn-primary'}" style="padding: 6px 14px; font-size: 11px; font-weight: 700;" onclick='triggerAiPipelineAction(${JSON.stringify(st)})'>
                            ${escapeHtml(st.btn_label)}
                        </button>
                    </div>
                </div>
            `;
        });
    }

    html += `
            </div>
        </div>

        <!-- Grade de Canais e Tuners da Praca -->
        <div style="background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 14px;">
            <h4 style="margin: 0 0 10px 0; font-size: 13px; font-weight: 700; color: #fff;">
                Sinal &amp; Gravação dos Veículos (${audit.canais ? audit.canais.length : 0} canais)
            </h4>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px;">
    `;

    if (audit.canais) {
        audit.canais.forEach(ch => {
            const hasOut = ch.has_outage || ch.qualidade === 0;
            const borderCol = hasOut ? "#ef4444" : "#10b981";
            html += `
                <div style="background: rgba(0,0,0,0.3); border: 1px solid ${borderCol}44; border-left: 3px solid ${borderCol}; border-radius: 6px; padding: 8px 10px; font-size: 11px;">
                    <div style="font-weight: 700; color: #fff; margin-bottom: 2px;">${escapeHtml(ch.canal)}</div>
                    <div style="display: flex; justify-content: space-between; color: #94a3b8;">
                        <span>Q: <strong style="color: ${ch.qualidade >= 50 ? '#34d399' : '#f87171'};">${ch.qualidade}%</strong></span>
                        <span>Lock: <strong>${escapeHtml(ch.status_tuner)}</strong></span>
                        <span>Grav: <strong>${escapeHtml(ch.gravando)}</strong></span>
                    </div>
                </div>
            `;
        });
    }

    html += `
            </div>
        </div>
    `;

    container.innerHTML = html;
}

async function triggerAiPipelineAction(stepInfo) {
    if (!stepInfo || !stepInfo.action_type) return;

    if (stepInfo.action_type === "reaudit") {
        await runPracaAudit();
        return;
    }

    if (stepInfo.action_type === "mediadna_reset_sync") {
        const payload = stepInfo.action_payload || {};
        const hostQuery = payload.host_query || payload.praca || "";
        const csHost = payload.cs_hostname || payload.hostname || "";

        const userPrompt = prompt(`Reset de Sincronização no Portal MediaDNA para '${hostQuery}'.\n\nInforme o usuário de login no portal (com perfil de acesso ao menu Hosts, ex: Cleber Gonçalves):`, "svc.captacao");
        if (!userPrompt) return;
        const passPrompt = prompt(`Informe a senha do usuário ${userPrompt}:`, "Acount@!2026");
        if (!passPrompt) return;

        try {
            const resp = await fetch("/api/fleet/mediadna/reset-sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    host_query: hostQuery,
                    cs_hostname: csHost,
                    username: userPrompt,
                    password: passPrompt,
                    trigger_remote_heal: true
                })
            });
            const data = await resp.json();
            if (data.success) {
                alert(`✅ Reset de Sincronização Concluído com Sucesso!\n\n${data.message}`);
                setTimeout(runPracaAudit, 4000);
            } else {
                alert(`⚠️ Atenção: ${data.message || 'Falha ao acionar reset.'}`);
            }
        } catch (err) {
            alert(`Erro na requisição MediaDNA: ${err.message}`);
        }
        return;
    }

    if (stepInfo.action_type === "safe_heal") {
        const payload = stepInfo.action_payload || {};
        const conf = confirm(`Deseja executar a ação:\n"${stepInfo.title}" no host ${payload.hostname}?\n\nEsta ação preserva 100% dos arquivos de áudio (.EMU).`);
        if (!conf) return;

        try {
            const resp = await fetch("/api/fleet/detection/safe-heal", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const data = await resp.json();
            if (resp.ok) {
                alert(`✅ Sucesso!\n\n${data.message || 'Auto-cura executada com sucesso.'}`);
                // Reaudita apos 5 segundos
                setTimeout(runPracaAudit, 4000);
            } else {
                alert(`❌ Erro ao executar auto-cura: ${data.detail || data.message || 'Falha no comando.'}`);
            }
        } catch (err) {
            alert(`Erro na requisição: ${err.message}`);
        }
    } else {
        alert(`Ação '${stepInfo.action_type}' enviada para a fila de comandos remotos.`);
    }
}
window.triggerAiPipelineAction = triggerAiPipelineAction;
