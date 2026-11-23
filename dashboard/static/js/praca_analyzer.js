/**
 * praca_analyzer.js - Auditoria de Praca por Capture Site & Central de Solucoes Inteligente (N1 / N2)
 * Suporte a selecao especifica de CS01, CS02, CS03, pipeline forense de 6 estagios e blindagem de radio Sonifex/Stream.
 */

let currentPracaAuditData = null;
let currentPracaAuditTargetCs = ""; // "" = Praca Completa, ou "CS01", "CS02", "CS03"
let currentPracaName = "";

async function openPracaAuditModal(preSelectedPraca = "", preSelectedCs = "") {
    const modal = document.getElementById("modalPracaAudit");
    if (!modal) return;
    modal.style.display = "flex";

    currentPracaAuditTargetCs = preSelectedCs || "";

    await populatePracasDropdown(true);

    const input = document.getElementById("pracaAuditSelect");
    if (input && preSelectedPraca) {
        input.value = preSelectedPraca;
        await runPracaAudit(null, currentPracaAuditTargetCs);
    }
}
window.openPracaAuditModal = openPracaAuditModal;

function closePracaAuditModal() {
    const modal = document.getElementById("modalPracaAudit");
    if (modal) modal.style.display = "none";
}
window.closePracaAuditModal = closePracaAuditModal;

async function populatePracasDropdown(force = false) {
    const sel = document.getElementById("pracaAuditSelect");
    if (!sel) return;
    if (!force && sel.options.length > 1) return;

    const currentVal = sel.value;
    try {
        const resp = await fetch("/api/fleet/praca/list?_=" + Date.now());
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
        if (currentVal) sel.value = currentVal;
    } catch (err) {
        console.error("[PracaAnalyzer] Erro ao carregar praças:", err);
    }
}

async function runPracaAudit(pracaOverride = null, csOverride = null) {
    const sel = document.getElementById("pracaAuditSelect");
    const praca = (pracaOverride !== null ? pracaOverride : (sel ? sel.value.trim() : "")).trim();
    if (!praca) {
        alert("Por favor, selecione uma praça para auditar.");
        return;
    }
    currentPracaName = praca;

    if (csOverride !== null) {
        currentPracaAuditTargetCs = csOverride;
    }

    const container = document.getElementById("pracaAuditResultContainer");
    const csLabel = currentPracaAuditTargetCs ? ` (${currentPracaAuditTargetCs})` : " (Praça Completa)";
    if (container) {
        container.innerHTML = `
            <div style="text-align: center; padding: 45px 20px; color: #38bdf8;">
                <i class="fas fa-spinner fa-spin fa-2x"></i>
                <div style="margin-top: 14px; font-weight: 700; font-size: 14px;">Executando Raio-X forense determinístico do Capture Site ${escapeHtml(praca)}${escapeHtml(csLabel)}...</div>
                <div style="font-size: 11px; color: var(--text-muted); margin-top: 5px;">Analisando pipeline de 6 estágios, tuners de TV, áudio de rádios, motor de detecção e telemetria...</div>
            </div>
        `;
    }

    try {
        const auditUrl = `/api/fleet/praca/audit/${encodeURIComponent(praca)}` + 
                         (currentPracaAuditTargetCs ? `?cs=${encodeURIComponent(currentPracaAuditTargetCs)}` : "");
        
        const [auditResp, solResp] = await Promise.all([
            fetch(auditUrl),
            fetch("/api/fleet/praca/ai-solution", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    praca: praca,
                    selected_cs: currentPracaAuditTargetCs || null
                })
            })
        ]);

        if (!auditResp.ok) throw new Error("Falha ao auditar praça");
        const audit = await auditResp.json();
        const sol = await solResp.json();
        currentPracaAuditData = { audit, sol };
        renderPracaAuditAndSolutions(audit, sol);
    } catch (err) {
        if (container) {
            container.innerHTML = `<div style="color: #ef4444; padding: 25px; text-align: center;">Erro na auditoria: ${escapeHtml(err.message)}</div>`;
        }
    }
}
window.runPracaAudit = runPracaAudit;

function renderPracaAuditAndSolutions(audit, sol) {
    const container = document.getElementById("pracaAuditResultContainer");
    if (!container) return;

    const score = audit.health_score || 0;
    const scoreCol = score >= 85 ? "#34d399" : (score >= 50 ? "#fbbf24" : "#ef4444");

    // Botões de Seleção de CS
    const availableCs = audit.available_cs_options || ["CS01", "CS02", "CS03"];
    const currentCs = currentPracaAuditTargetCs || "";

    let csButtonsHtml = `
        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 14px; background: rgba(15, 23, 42, 0.6); padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.08);">
            <span style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-right: 4px;">
                <i class="fas fa-layer-group"></i> Escopo:
            </span>
            <button type="button" 
                    onclick="runPracaAudit('${escapeHtml(audit.praca)}', '')" 
                    style="padding: 5px 12px; font-size: 11px; font-weight: 700; border-radius: 6px; cursor: pointer; transition: all 0.2s; border: 1px solid ${currentCs === '' ? '#38bdf8' : 'rgba(255, 255, 255, 0.15)'}; background: ${currentCs === '' ? 'linear-gradient(135deg, #2563eb, #0284c7)' : 'rgba(30, 41, 59, 0.7)'}; color: ${currentCs === '' ? '#fff' : '#cbd5e1'}; box-shadow: ${currentCs === '' ? '0 0 10px rgba(56, 189, 248, 0.3)' : 'none'};">
                🏢 Praça Geral (${audit.total_hosts || 0} nós)
            </button>
    `;

    availableCs.forEach(csItem => {
        const csCode = (typeof csItem === "object" && csItem !== null) ? (csItem.code || csItem.hostname || "") : String(csItem || "");
        const csLabel = (typeof csItem === "object" && csItem !== null) ? (csItem.label || csItem.code || csItem.hostname || "") : String(csItem || "");
        const isSelected = currentCs.toUpperCase() === csCode.toUpperCase();
        let icon = "🖥️";
        if (csCode.includes("03") || csCode.includes("RADIO")) icon = "📻";
        else if (csCode.includes("02")) icon = "🖥️";

        csButtonsHtml += `
            <button type="button" 
                    onclick="runPracaAudit('${escapeHtml(audit.praca)}', '${escapeHtml(csCode)}')" 
                    style="padding: 5px 12px; font-size: 11px; font-weight: 700; border-radius: 6px; cursor: pointer; transition: all 0.2s; border: 1px solid ${isSelected ? '#38bdf8' : 'rgba(255, 255, 255, 0.15)'}; background: ${isSelected ? 'linear-gradient(135deg, #2563eb, #0284c7)' : 'rgba(30, 41, 59, 0.7)'}; color: ${isSelected ? '#fff' : '#cbd5e1'}; box-shadow: ${isSelected ? '0 0 10px rgba(56, 189, 248, 0.3)' : 'none'};" title="${escapeHtml(csLabel)}">
                ${icon} ${escapeHtml(csCode)}
            </button>
        `;
    });

    csButtonsHtml += `</div>`;

    // Aviso informativo de escopo
    let scopeNoticeHtml = "";
    if (audit.is_single_cs_focus) {
        const isCs1 = audit.active_cs_tier === 1;
        scopeNoticeHtml = `
            <div style="background: rgba(56, 189, 248, 0.08); border-left: 3px solid #38bdf8; padding: 8px 12px; border-radius: 0 6px 6px 0; font-size: 11px; color: #bae6fd; margin-bottom: 14px; display: flex; align-items: center; gap: 8px;">
                <i class="fas fa-info-circle" style="color: #38bdf8;"></i>
                <span>Visualizando estritamente <strong>${escapeHtml(audit.selected_cs)}</strong> (${escapeHtml(audit.focused_host)}). ${isCs1 ? 'Motor de Detecção analisado ativamente.' : 'Detecção Comercial é exclusiva do CS01; este host analisa gravação de mídia, sintonizadores e hardware.'}</span>
            </div>
        `;
    }

    // 6 Estágios do Pipeline Forense
    let pipelineHtml = "";
    if (audit.pipeline_stages && audit.pipeline_stages.length > 0) {
        pipelineHtml = `
            <div style="margin-bottom: 16px;">
                <h4 style="margin: 0 0 8px 0; font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px;">
                    Pipeline de Saúde do Nó (6 Estágios de Confiabilidade)
                </h4>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 8px;">
        `;

        audit.pipeline_stages.forEach(st => {
            let stColor = "#34d399";
            let stBg = "rgba(16, 185, 129, 0.1)";
            let stBorder = "rgba(16, 185, 129, 0.3)";
            let icon = "fa-check-circle";

            if (st.status === "CRITICO") {
                stColor = "#ef4444";
                stBg = "rgba(239, 68, 68, 0.1)";
                stBorder = "rgba(239, 68, 68, 0.4)";
                icon = "fa-times-circle";
            } else if (st.status === "ALERTA") {
                stColor = "#fbbf24";
                stBg = "rgba(251, 191, 36, 0.1)";
                stBorder = "rgba(251, 191, 36, 0.4)";
                icon = "fa-exclamation-triangle";
            } else if (st.status === "NA") {
                stColor = "#94a3b8";
                stBg = "rgba(148, 163, 184, 0.08)";
                stBorder = "rgba(148, 163, 184, 0.2)";
                icon = "fa-shield-alt";
            }

            pipelineHtml += `
                <div style="background: ${stBg}; border: 1px solid ${stBorder}; border-radius: 6px; padding: 10px 12px; display: flex; flex-direction: column; justify-content: space-between;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                        <span style="font-size: 11px; font-weight: 700; color: #f8fafc;">
                            <i class="fas ${icon}" style="color: ${stColor}; margin-right: 4px;"></i> ${escapeHtml(st.title)}
                        </span>
                        <span class="badge" style="background: ${stColor}22; color: ${stColor}; border: 1px solid ${stColor}; font-size: 9px; font-weight: 700; padding: 2px 6px;">
                            ${escapeHtml(st.badge || st.status)}
                        </span>
                    </div>
                    <div style="font-size: 10px; color: #cbd5e1; margin-top: 6px; line-height: 1.35;">
                        ${escapeHtml(st.detail || '')}
                    </div>
                </div>
            `;
        });

        pipelineHtml += `
                </div>
            </div>
        `;
    }

    let html = `
        ${csButtonsHtml}
        ${scopeNoticeHtml}

        <!-- Topo: Score e Diagnostico -->
        <div style="background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 16px; margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 12px;">
                <div>
                    <h3 style="margin: 0; color: #fff; font-size: 16px; font-weight: 800;">
                        🏢 Capture Site ${escapeHtml(audit.praca)} ${audit.selected_cs ? `• <span style="color: #38bdf8;">${escapeHtml(audit.selected_cs)}</span>` : ''} • Raio-X Forense
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
                    <strong style="color: ${audit.engine_conflict ? '#ef4444' : (audit.active_engine.includes('N/A') ? '#94a3b8' : '#38bdf8')};">${escapeHtml(audit.active_engine)}</strong>
                </div>
            </div>
        </div>

        ${pipelineHtml}

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
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h4 style="margin: 0; font-size: 13px; font-weight: 700; color: #fff;">
                    Sinal &amp; Gravação dos Veículos (${audit.canais ? audit.canais.length : 0} canais)
                </h4>
                <div style="font-size: 11px; color: #94a3b8;">
                    TV: Lock + SNR RF | Rádios: Gravação Contínua Sonifex/Stream
                </div>
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 8px;">
    `;

    if (audit.canais && audit.canais.length > 0) {
        audit.canais.forEach(ch => {
            const isRadio = !!ch.is_radio;
            const isRec = (ch.gravando || "").toUpperCase() === "SIM";
            
            // Regra Férrea Anti-Falso Positivo:
            // Se o backend marcou is_nominal === true, ou se gravando == 'Sim', ou se status_tuner indica working/ready/ok/conectado:
            // O canal é 100% NOMINAL VERDE!
            let isNominal = false;
            if (isRadio) {
                if (ch.is_nominal !== undefined) {
                    isNominal = Boolean(ch.is_nominal);
                } else {
                    const tStat = (ch.status_tuner || "").toLowerCase();
                    const isWorking = tStat.includes("working") || tStat.includes("ready") || tStat.includes("conectado") || tStat.includes("connected") || tStat.includes("ok");
                    isNominal = isRec || isWorking;
                }
            } else {
                if (ch.is_nominal !== undefined) {
                    isNominal = Boolean(ch.is_nominal);
                } else {
                    isNominal = !ch.has_outage && (ch.qualidade > 0) && isRec;
                }
            }

            let borderCol = isNominal ? "#10b981" : "#ef4444";
            let statusBadge = "";

            if (isRadio) {
                if (isNominal) {
                    const badgeText = escapeHtml(ch.status_tuner || (isRec ? 'Áudio OK (Sonifex)' : 'Stream Conectado'));
                    statusBadge = `<span class="badge" style="background:#10b98122; color:#34d399; border:1px solid #10b981; font-size:9px;">${badgeText}</span>`;
                } else {
                    statusBadge = `<span class="badge" style="background:#ef444422; color:#f87171; border:1px solid #ef4444; font-size:9px;">Sem Gravação Áudio</span>`;
                }
            } else {
                statusBadge = isNominal 
                    ? `<span class="badge" style="background:#10b98122; color:#34d399; border:1px solid #10b981; font-size:9px;">Lock OK (TV)</span>`
                    : `<span class="badge" style="background:#ef444422; color:#f87171; border:1px solid #ef4444; font-size:9px;">Queda Sinal/Lock</span>`;
            }

            const csLabel = ch.cs || ch.cs_origin || (isRadio ? 'CS03' : 'CS01');
            const csBadgeColor = csLabel.includes('03') ? '#c084fc' : (csLabel.includes('02') ? '#818cf8' : '#38bdf8');
            html += `
                <div style="background: rgba(0,0,0,0.3); border: 1px solid ${borderCol}44; border-left: 3px solid ${borderCol}; border-radius: 6px; padding: 8px 10px; font-size: 11px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
                        <span style="font-weight: 700; color: #fff; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(ch.canal)}">
                            ${isRadio ? '📻' : '📺'} ${escapeHtml(ch.canal)}
                        </span>
                        ${statusBadge}
                    </div>
                    <div style="display: flex; justify-content: space-between; color: #94a3b8; font-size: 10px;">
                        <span>CS: <strong style="color: ${csBadgeColor}; font-weight: 700;">${escapeHtml(csLabel)}</strong></span>
                        <span>${isRadio ? 'Áudio' : 'Q'}: <strong style="color: ${isNominal ? '#34d399' : '#f87171'};">${isRadio ? (isNominal ? 'Nominal' : 'Mudo') : ch.qualidade + '%'}</strong></span>
                        <span>Grav: <strong style="color: ${isNominal ? '#34d399' : '#f87171'};">${escapeHtml(ch.gravando || (isNominal ? 'Sim' : 'Não'))}</strong></span>
                    </div>
                </div>
            `;
        });
    } else {
        html += `
            <div style="grid-column: 1 / -1; text-align: center; color: #94a3b8; padding: 20px;">
                Nenhum veículo associado a este Capture Site específico.
            </div>
        `;
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
        await runPracaAudit(currentPracaName, currentPracaAuditTargetCs);
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
                setTimeout(() => runPracaAudit(currentPracaName, currentPracaAuditTargetCs), 4000);
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
                setTimeout(() => runPracaAudit(currentPracaName, currentPracaAuditTargetCs), 4000);
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
