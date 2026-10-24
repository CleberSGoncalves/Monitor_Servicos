// dashboard/static/js/fiscalizacao.js
/**
 * Módulo de Frontend: Central de Fiscalização (FT Emissora x FT IBOPE).
 * ESTRITAMENTE EXCLUSIVO PARA SINAL DIGITAL TERRESTRE (ISDB-Tb).
 * Executa auditoria forense por range de horário no NAS VideoRecord com IA (Google Gemini Pro).
 */

let digitalChannelsCache = [];
let allFiscPracas = [];
let currentFiscAuditResult = null;

// Inicialização
document.addEventListener("DOMContentLoaded", () => {
    initFiscalizacao();
});

async function initFiscalizacao() {
    loadFiscalizacaoKpis();
    await loadDigitalChannelsList();
    initFiscalizacaoDateInputs();
}

// 1. Carrega Indicadores de SLA e KPIs
async function loadFiscalizacaoKpis() {
    try {
        const res = await fetch("/api/fiscalizacao/kpis", { credentials: "omit" });
        if (!res.ok) return;
        const data = await res.json();

        // Atualiza KPIs no DOM
        const elTotal = document.getElementById("fiscKpiTotal");
        const elEmissora = document.getElementById("fiscKpiEmissora");
        const elIbope = document.getElementById("fiscKpiIbope");
        const elSla = document.getElementById("fiscKpiSla");

        if (elTotal) elTotal.innerText = data.total_cases || 0;
        if (elEmissora) elEmissora.innerText = `${data.ft_emissora_pct || 0}% (${data.ft_emissora_count || 0})`;
        if (elIbope) elIbope.innerText = `${data.ft_ibope_pct || 0}% (${data.ft_ibope_count || 0})`;
        if (elSla) elSla.innerText = `${data.ibope_clean_sla_pct || 100}%`;

        // Renderiza feed de casos recentes
        renderFiscalizacaoRecentCases(data.casos_recentes || []);
    } catch (e) {
        console.error("Erro ao carregar KPIs de Fiscalização:", e);
    }
}

// 2. Carrega lista restrita de Canais Digital Terrestre
async function loadDigitalChannelsList() {
    try {
        const res = await fetch("/api/fiscalizacao/digital-channels", { credentials: "omit" });
        if (!res.ok) return;
        const data = await res.json();
        digitalChannelsCache = data.channels || [];

        // Extrai praças únicas
        allFiscPracas = Array.from(new Set(digitalChannelsCache.map(c => c.praca))).sort();

        // Popula dropdown de Praças
        const pracaSelect = document.getElementById("fiscFilterPraca");
        if (pracaSelect) {
            pracaSelect.innerHTML = `<option value="">Selecione a Praça (Digital Terrestre)...</option>`;
            allFiscPracas.forEach(p => {
                pracaSelect.innerHTML += `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`;
            });
            // Default: São Paulo se disponível
            if (allFiscPracas.includes("São Paulo")) {
                pracaSelect.value = "São Paulo";
                onFiscPracaChanged();
            } else if (allFiscPracas.length > 0) {
                pracaSelect.value = allFiscPracas[0];
                onFiscPracaChanged();
            }
        }
    } catch (e) {
        console.error("Erro ao carregar canais digitais terrestres:", e);
    }
}

// Inicializa datas e horários padrão
function initFiscalizacaoDateInputs() {
    const dateInput = document.getElementById("fiscFilterDate");
    const startInput = document.getElementById("fiscFilterStartTime");
    const endInput = document.getElementById("fiscFilterEndTime");

    if (dateInput && !dateInput.value) {
        const today = new Date().toISOString().split("T")[0];
        dateInput.value = today;
    }
    if (startInput && !startInput.value) {
        startInput.value = "14:15";
    }
    if (endInput && !endInput.value) {
        endInput.value = "14:45";
    }
}

// Ao mudar a praça no filtro de fiscalização
function onFiscPracaChanged() {
    const pracaSelect = document.getElementById("fiscFilterPraca");
    const canalSelect = document.getElementById("fiscFilterCanal");
    if (!pracaSelect || !canalSelect) return;

    // Oculta e limpa o card de resultado anterior para evitar inconsistência visual entre praças
    const resultCard = document.getElementById("fiscResultContainer");
    if (resultCard) {
        resultCard.style.display = "none";
        resultCard.innerHTML = "";
    }

    const praca = pracaSelect.value;
    const channelsInCity = digitalChannelsCache.filter(c => c.praca === praca);

    canalSelect.innerHTML = `<option value="">Selecione o Canal (ISDB-Tb)...</option>`;
    channelsInCity.forEach(c => {
        canalSelect.innerHTML += `<option value="${escapeHtml(c.canal)}" data-idpv="${escapeHtml(c.veiculo || '')}">${escapeHtml(c.canal)} (Freq: ${escapeHtml(c.frequencia || 'UHF')})</option>`;
    });

    if (channelsInCity.length > 0) {
        canalSelect.selectedIndex = 1;
        onFiscCanalChanged();
    } else {
        updateFiscUncPreview();
    }
}

// Ao mudar o canal
function onFiscCanalChanged() {
    const canalSelect = document.getElementById("fiscFilterCanal");
    const idpvInput = document.getElementById("fiscFilterIdpv");
    if (!canalSelect) return;

    // Oculta e limpa o card de resultado anterior se o operador trocar de canal
    const resultCard = document.getElementById("fiscResultContainer");
    if (resultCard) {
        resultCard.style.display = "none";
        resultCard.innerHTML = "";
    }

    const opt = canalSelect.options[canalSelect.selectedIndex];
    const idpv = opt ? opt.getAttribute("data-idpv") : "";
    if (idpvInput && idpv) {
        idpvInput.value = idpv;
    }
    updateFiscUncPreview();
}

// Ao mudar a queixa/sintoma relatado
function onFiscSymptomChanged() {
    const resultCard = document.getElementById("fiscResultContainer");
    if (resultCard) {
        resultCard.style.display = "none";
        resultCard.innerHTML = "";
    }
}
window.onFiscSymptomChanged = onFiscSymptomChanged;

// Atualiza preview do caminho UNC do NAS
function updateFiscUncPreview() {
    const idpvInput = document.getElementById("fiscFilterIdpv");
    const dateInput = document.getElementById("fiscFilterDate");
    const previewEl = document.getElementById("fiscNasUncPreview");

    const idpv = (idpvInput?.value || "255").trim();
    let dt = new Date();
    if (dateInput?.value) {
        try {
            dt = new Date(dateInput.value + "T12:00:00");
        } catch (e) {}
    }
    const unc = `\\\\ibnas01sp-nas.grupoibope.corp\\MediaDNA01\\VideoRecord\\${dt.getFullYear()}\\${dt.getMonth() + 1}\\${dt.getDate()}\\${idpv}`;
    if (previewEl) {
        previewEl.innerText = unc;
    }
}

// Alterna entre Subabas de Fiscalização (Auditoria vs Análise MP4 vs Realtime 30min)
function switchFiscalizacaoSubtab(subtabId) {
    const btnAudit = document.getElementById("btn-fisc-subtab-audit");
    const btnMp4 = document.getElementById("btn-fisc-subtab-mp4");
    const btnRealtime = document.getElementById("btn-fisc-subtab-realtime");

    const contentAudit = document.getElementById("fisc-content-audit");
    const contentMp4 = document.getElementById("fisc-content-mp4");
    const contentRealtime = document.getElementById("fisc-content-realtime");

    if (btnAudit) btnAudit.classList.remove("active");
    if (btnMp4) btnMp4.classList.remove("active");
    if (btnRealtime) btnRealtime.classList.remove("active");

    if (contentAudit) contentAudit.style.display = "none";
    if (contentMp4) contentMp4.style.display = "none";
    if (contentRealtime) contentRealtime.style.display = "none";

    if (subtabId === "mp4") {
        if (btnMp4) btnMp4.classList.add("active");
        if (contentMp4) contentMp4.style.display = "block";
        if (typeof onMp4PracaChanged === "function") {
            onMp4PracaChanged();
        }
    } else if (subtabId === "realtime") {
        if (btnRealtime) btnRealtime.classList.add("active");
        if (contentRealtime) contentRealtime.style.display = "block";
        loadRealtimeBlockAudit();
    } else {
        if (btnAudit) btnAudit.classList.add("active");
        if (contentAudit) contentAudit.style.display = "block";
    }
}
window.switchFiscalizacaoSubtab = switchFiscalizacaoSubtab;

// Executa a Fiscalização Forense por Range de Horário com IA & NAS
async function startFiscalizacaoAudit() {
    const pracaSelect = document.getElementById("fiscFilterPraca");
    const canalSelect = document.getElementById("fiscFilterCanal");
    const idpvInput = document.getElementById("fiscFilterIdpv");
    const dateInput = document.getElementById("fiscFilterDate");
    const startInput = document.getElementById("fiscFilterStartTime");
    const endInput = document.getElementById("fiscFilterEndTime");
    const symptomSelect = document.getElementById("fiscSymptom");
    const questionInput = document.getElementById("fiscCaseQuestion");
    const btn = document.getElementById("btnStartFiscalizacao");

    if (!pracaSelect || !canalSelect) return;
    const praca = pracaSelect.value;
    const canal = canalSelect.value;
    const opt = canalSelect.options[canalSelect.selectedIndex];
    const optIdpv = opt ? opt.getAttribute("data-idpv") : "";
    const customIdpv = (idpvInput?.value || optIdpv || "").trim();
    const targetDate = (dateInput?.value || "").trim();
    const startTime = (startInput?.value || "14:00").trim();
    const endTime = (endInput?.value || "15:00").trim();
    const caseQuestion = (questionInput?.value || "").trim();

    if (!praca || !canal) {
        alert("Selecione uma Praça e um Canal Digital Terrestre para fiscalizar.");
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Lendo NAS VideoRecord &amp; Fiscalizando com IA...`;
    }

    const progContainer = document.getElementById("fiscProgressBarContainer");
    const progBar = document.getElementById("fiscProgressBarFill");
    const progPct = document.getElementById("fiscProgressPercent");
    const progDesc = document.getElementById("fiscProgressDetailText");
    const resultCard = document.getElementById("fiscResultContainer");

    if (resultCard) resultCard.style.display = "none";
    if (progContainer) {
        progContainer.style.display = "block";
        progContainer.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    const uncPath = document.getElementById("fiscNasUncPreview")?.innerText || `\\\\ibnas01sp-nas.grupoibope.corp\\MediaDNA01\\VideoRecord\\...`;
    const stages = [
        { pct: 25, text: `[Etapa 1/4] Acessando repositório NAS VideoRecord em '${uncPath}' (Somente Leitura)...` },
        { pct: 50, text: `[Etapa 2/4] Indexando blocos de 30min gravados no intervalo das ${startTime} às ${endTime}...` },
        { pct: 75, text: `[Etapa 3/4] Cruzando telemetria de recepção da antena TBS e integridade de serviços IBOPE...` },
        { pct: 95, text: `[Etapa 4/4] Sintetizando veredito com motor de regras forenses e Google Gemini Pro...` }
    ];

    let stepIdx = 0;
    const intervalTimer = setInterval(() => {
        if (stepIdx < stages.length) {
            const stg = stages[stepIdx];
            if (progBar) progBar.style.width = `${stg.pct}%`;
            if (progPct) progPct.innerText = `${stg.pct}%`;
            if (progDesc) progDesc.innerText = stg.text;
            stepIdx++;
        }
    }, 450);

    try {
        const symptom = (symptomSelect?.value || "none").trim();
        const payload = {
            praca: praca,
            canal: canal,
            target_date: targetDate,
            start_time: startTime,
            end_time: endTime,
            symptom: symptom,
            case_question: caseQuestion,
            custom_idpv: customIdpv
        };

        const res = await fetch("/api/fiscalizacao/auditar-range", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        clearInterval(intervalTimer);
        if (progBar) progBar.style.width = "100%";
        if (progPct) progPct.innerText = "100%";

        const data = await res.json();
        currentFiscAuditResult = data;

        setTimeout(() => {
            if (progContainer) progContainer.style.display = "none";
            if (data.scope_error) {
                alert(data.message || "Canal não pertence ao escopo de Sinal Digital Terrestre.");
            } else {
                renderFiscalizacaoVeredito(data);
            }
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<i class="fas fa-balance-scale"></i> ⚖️ Inspecionar Repositório NAS (VideoRecord) &amp; Fiscalizar com IA`;
            }
        }, 500);

    } catch (e) {
        clearInterval(intervalTimer);
        console.error("Erro na fiscalização:", e);
        if (progContainer) progContainer.style.display = "none";
        alert("Erro de comunicação ao executar a fiscalização no NAS.");
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i class="fas fa-balance-scale"></i> ⚖️ Inspecionar Repositório NAS (VideoRecord) &amp; Fiscalizar com IA`;
        }
    }
}
window.startFiscalizacaoAudit = startFiscalizacaoAudit;

// Renderiza o Card de Veredito Forense Completo
function renderFiscalizacaoVeredito(data) {
    const container = document.getElementById("fiscResultContainer");
    if (!container) return;

    let vColor = "#10b981";
    let vBg = "rgba(16, 185, 129, 0.12)";
    let vBorder = "#10b981";
    let vIcon = "fa-check-circle";

    if (data.veredito.includes("NOMINAL")) {
        vColor = "#10b981";
        vBg = "rgba(16, 185, 129, 0.12)";
        vBorder = "#10b981";
        vIcon = "fa-check-circle";
    } else if (data.veredito.includes("NÃO CONFIRMADA") || data.veredito.includes("IMPROCEDENTE")) {
        vColor = "#38bdf8";
        vBg = "rgba(56, 189, 248, 0.12)";
        vBorder = "#38bdf8";
        vIcon = "fa-info-circle";
    } else if (data.veredito.includes("EMISSORA")) {
        vColor = "#f59e0b";
        vBg = "rgba(245, 158, 11, 0.12)";
        vBorder = "#f59e0b";
        vIcon = "fa-broadcast-tower";
    } else if (data.veredito.includes("IBOPE")) {
        vColor = "#ef4444";
        vBg = "rgba(239, 68, 68, 0.12)";
        vBorder = "#ef4444";
        vIcon = "fa-server";
    }

    const html = `
        <div class="panel-card" style="border-left: 6px solid ${vBorder}; background: linear-gradient(135deg, rgba(15, 23, 42, 0.95), ${vBg}); padding: 22px; margin-bottom: 24px;">
            <!-- Cabeçalho do Veredito -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 14px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 16px; margin-bottom: 16px;">
                <div>
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
                        <span class="badge" style="background: ${vColor}; color: #000; font-weight: 900; font-size: 13px; padding: 4px 12px; letter-spacing: 0.5px;">
                            <i class="fas ${vIcon}"></i> VEREDITO: ${escapeHtml(data.veredito)}
                        </span>
                        <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid #10b981; font-size: 11px; font-weight: 700;">
                            <i class="fas fa-shield-alt"></i> Confiança Forense: ${escapeHtml(data.confianca)}
                        </span>
                        <span class="badge" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid #38bdf8; font-size: 11px;">
                            <i class="fas fa-satellite-dish"></i> ${escapeHtml(data.scope)}
                        </span>
                        <span class="badge" style="background: rgba(255, 255, 255, 0.08); color: #cbd5e1; border: 1px solid rgba(255,255,255,0.15); font-size: 11px;">
                            <i class="fas fa-stethoscope"></i> Queixa: ${escapeHtml(data.symptom_label || 'Rotina')}
                        </span>
                    </div>
                    <div style="font-size: 18px; font-weight: 800; color: #fff; margin-top: 4px;">
                        ${escapeHtml(data.canal)} (${escapeHtml(data.praca)}) — Veículo IDPV ${escapeHtml(data.idpv)}
                    </div>
                    <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
                        Intervalo Auditado: <strong style="color: #cbd5e1;">${escapeHtml(data.data)} das ${escapeHtml(data.intervalo)}</strong> • Repositório NAS VideoRecord
                    </div>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="btn-primary" onclick="copyParecerSla()" style="background: #2563eb; font-size: 11px; padding: 6px 12px; font-weight: 700;">
                        <i class="fas fa-copy"></i> Copiar Parecer Formal
                    </button>
                </div>
            </div>

            <!-- Resumo Executivo da Causa Raiz -->
            <div style="background: rgba(0,0,0,0.3); border-radius: 8px; padding: 14px 18px; margin-bottom: 20px; border-left: 3px solid ${vColor};">
                <div style="font-size: 11px; text-transform: uppercase; color: var(--text-muted); font-weight: 700; margin-bottom: 4px;">
                    🎯 Resumo da Causa Raiz &amp; Responsabilidade de SLA:
                </div>
                <div style="font-size: 13px; color: #e2e8f0; line-height: 1.6; font-weight: 500;">
                    ${escapeHtml(data.causa_raiz)}
                </div>
            </div>

            <!-- Grid de Evidências Forenses (Timeline + Telemetria de Antena + Blocos no NAS) -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; margin-bottom: 20px;">
                <!-- Card 1: Timeline de Evidências -->
                <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 14px;">
                    <div style="font-size: 12px; font-weight: 700; color: #fff; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
                        <i class="fas fa-history" style="color: #38bdf8;"></i> Linha do Tempo Forense
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        ${(data.timeline_evidencias || []).map(ev => `
                            <div style="display: flex; gap: 10px; align-items: flex-start;">
                                <span class="badge" style="background: rgba(255,255,255,0.08); font-size: 10px; font-family: monospace; white-space: nowrap; margin-top: 2px;">
                                    ${escapeHtml(ev.status)}
                                </span>
                                <div>
                                    <div style="font-size: 11.5px; font-weight: 700; color: #cbd5e1;">${escapeHtml(ev.etapa)}</div>
                                    <div style="font-size: 11px; color: #94a3b8; line-height: 1.4;">${escapeHtml(ev.desc)}</div>
                                </div>
                            </div>
                        `).join("")}
                    </div>
                </div>

                <!-- Card 2: Telemetria de Antena e Arquivos no NAS -->
                <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 14px;">
                    <div style="font-size: 12px; font-weight: 700; color: #fff; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
                        <i class="fas fa-hdd" style="color: #10b981;"></i> Evidências de Antena &amp; Arquivos no NAS
                    </div>
                    <div style="font-size: 11px; color: #cbd5e1; margin-bottom: 8px; font-family: monospace; background: rgba(0,0,0,0.4); padding: 6px 10px; border-radius: 4px;">
                        📁 UNC: <strong style="color: #38bdf8;">${escapeHtml(data.unc_path)}</strong>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px;">
                        <div style="background: rgba(0,0,0,0.25); padding: 8px; border-radius: 4px;">
                            <span style="font-size: 10px; color: var(--text-muted); display: block;">Recepção RF TBS</span>
                            <strong style="color: #34d399; font-size: 13px;">Q: ${data.telemetria_rf?.qualidade_sinal || 0}% | F: ${data.telemetria_rf?.forca_sinal || 0}%</strong>
                        </div>
                        <div style="background: rgba(0,0,0,0.25); padding: 8px; border-radius: 4px;">
                            <span style="font-size: 10px; color: var(--text-muted); display: block;">Blocos Inspecionados</span>
                            <strong style="color: #38bdf8; font-size: 13px;">${data.arquivos_nas_count || 0} arquivos de 30m</strong>
                        </div>
                    </div>
                    <div style="max-height: 120px; overflow-y: auto; font-family: monospace; font-size: 10px; color: #94a3b8; background: rgba(0,0,0,0.3); padding: 6px; border-radius: 4px;">
                        ${(data.arquivos_nas || []).map(f => `
                            <div style="display: flex; justify-content: space-between; padding: 2px 0; border-bottom: 1px solid rgba(255,255,255,0.03);">
                                <span>📄 ${escapeHtml(f.name)}</span>
                                <span style="color: #34d399;">${escapeHtml(f.size_human || '3.5 MB')}</span>
                            </div>
                        `).join("")}
                    </div>
                </div>
            </div>

            <!-- Parecer Técnico Oficial Sintetizado com IA -->
            <div style="background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div style="font-size: 12px; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 6px;">
                        <i class="fas fa-file-contract" style="color: #f59e0b;"></i> Parecer Técnico-Jurídico de SLA (Kantar IBOPE Media)
                    </div>
                    <span class="badge badge-purple" style="font-size: 10px;">✨ Sintetizado por Google Gemini Pro</span>
                </div>
                <pre id="fiscParecerText" style="white-space: pre-wrap; font-family: inherit; font-size: 11.5px; color: #cbd5e1; line-height: 1.6; margin: 0; background: transparent; border: none; padding: 0;">${escapeHtml(data.parecer_sla_oficial)}</pre>
            </div>
        </div>
    `;

    container.innerHTML = html;
    container.style.display = "block";
    container.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Copia o Parecer para a Área de Transferência
function copyParecerSla() {
    const textEl = document.getElementById("fiscParecerText");
    if (!textEl) return;
    const txt = textEl.innerText;
    navigator.clipboard.writeText(txt).then(() => {
        alert("Parecer Técnico copiado com sucesso para a área de transferência!");
    }).catch(() => {
        alert("Não foi possível copiar automaticamente.");
    });
}
window.copyParecerSla = copyParecerSla;

// Renderiza a Tabela de Casos Recentes de Fiscalização
function renderFiscalizacaoRecentCases(cases) {
    const tbody = document.getElementById("fiscCasesTableBody");
    if (!tbody) return;

    if (!cases || cases.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 20px;">Nenhuma fiscalização registrada.</td></tr>`;
        return;
    }

    tbody.innerHTML = cases.map(c => {
        const isEmissora = c.veredito.includes("EMISSORA");
        const bClass = isEmissora ? "badge-yellow" : "badge-red";
        return `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
                <td style="font-family: monospace; font-size: 11px; color: #cbd5e1;">${escapeHtml(c.data)}</td>
                <td style="font-family: monospace; font-size: 11px; color: #94a3b8;">${escapeHtml(c.horario_inicio)} - ${escapeHtml(c.horario_fim)}</td>
                <td><strong style="color: #fff;">${escapeHtml(c.praca)}</strong></td>
                <td><span style="color: #38bdf8; font-weight: 600;">${escapeHtml(c.canal)}</span> <span style="font-size: 10px; color: var(--text-muted);">(IDPV ${escapeHtml(c.veiculo || '')})</span></td>
                <td style="font-size: 11px; color: #cbd5e1;">${escapeHtml(c.tipo_anomalia)}</td>
                <td><span class="badge ${bClass}" style="font-weight: 700; font-size: 10px;">${escapeHtml(c.veredito)}</span></td>
                <td style="font-size: 11px; color: ${isEmissora ? '#34d399' : '#f87171'}; font-weight: 600;">${escapeHtml(c.status_sla)}</td>
            </tr>
        `;
    }).join("");
}


// ==============================================================================
// SUBABA 3: AUDITORIA REALTIME DE BLOCOS DE 30MIN & CLUSTERS DE FALHAS DIGITAIS
// ==============================================================================

let cachedRealtimeAuditData = null;
let realtimePracasCache = [];

async function loadRealtimeBlockAudit() {
    const icon = document.getElementById("iconReloadRealtime");
    if (icon) icon.classList.add("fa-spin");

    try {
        const res = await fetch("/api/fiscalizacao/realtime-blocks", { credentials: "omit" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        cachedRealtimeAuditData = data;

        // 1. Atualiza KPIs Globais
        const total = data.total_canais_auditados || 131;
        const nominal = data.clusters?.nominal?.count || 0;
        const anomalies = total - nominal;
        const nominalPct = data.taxa_conformidade_bloco_pct || (total > 0 ? Math.round((nominal / total) * 100) : 100);
        const pracas = data.pracas_resumo || [];
        realtimePracasCache = pracas;

        let avgHealth = 100;
        if (pracas.length > 0) {
            const sumHealth = pracas.reduce((acc, p) => acc + (p.health_index || 100), 0);
            avgHealth = Math.round(sumHealth / pracas.length);
        }

        const slotStr = data.slots?.last_closed_slot || "Slot Recente";
        const execMs = data.tempo_processamento_ms != null ? data.tempo_processamento_ms : 6;

        const elTot = document.getElementById("rtKpiTotalChannels");
        const elNom = document.getElementById("rtKpiNominalBlocks");
        const elNomPct = document.getElementById("rtKpiNominalPct");
        const elAnom = document.getElementById("rtKpiAnomalyChannels");
        const elPracas = document.getElementById("rtKpiPracasCount");
        const elHealth = document.getElementById("rtKpiHealthAvg");
        const elSlot = document.getElementById("rtKpiSlotTime");

        if (elTot) elTot.textContent = `${total} Canais`;
        if (elNom) elNom.textContent = `${nominal}`;
        if (elNomPct) elNomPct.textContent = `${nominalPct}% dos canais em conformidade SZ3600432`;
        if (elAnom) elAnom.textContent = `${anomalies}`;
        if (elPracas) elPracas.textContent = `${pracas.length} Praças`;
        if (elHealth) elHealth.textContent = `Health Index Médio: ${avgHealth}%`;
        if (elSlot) elSlot.textContent = `Slot: ${slotStr} • Inspeção: ${execMs}ms (O(1))`;

        // 2. Renderiza os 6 Clusters de Falhas Digitais
        renderRealtimeClusters(data.clusters || {}, total);

        // 3. Renderiza a Matriz de Praças
        renderRealtimePracasGrid(pracas);

    } catch (err) {
        console.error("Erro ao carregar auditoria realtime de blocos:", err);
    } finally {
        if (icon) icon.classList.remove("fa-spin");
    }
}
window.loadRealtimeBlockAudit = loadRealtimeBlockAudit;

function renderRealtimeClusters(clusters, totalChannels) {
    const grid = document.getElementById("rtClustersGrid");
    if (!grid) return;

    const clusterDefs = [
        {
            key: "nominal",
            label: "Blocos Nominais Íntegros (SZ3600432)",
            color: "#10b981",
            bg: "rgba(16, 185, 129, 0.08)",
            border: "rgba(16, 185, 129, 0.3)",
            icon: "fas fa-check-circle",
            badge: "SLA NOMINAL",
            desc: "Gravados e validados no slot de 30min com tamanho nominal SZ3600432."
        },
        {
            key: "rf_outage",
            label: "Ausência de Portadora RF / Queda na Torre",
            color: "#ef4444",
            bg: "rgba(239, 68, 68, 0.08)",
            border: "rgba(239, 68, 68, 0.3)",
            icon: "fas fa-satellite-dish",
            badge: "PERDA DE SINAL",
            desc: "Demodulador ISDB-Tb zerado e ausência de arquivo gerado pelo Capture Site."
        },
        {
            key: "gop_freeze",
            label: "Congelamento Crônico (GOP / PTS Stall)",
            color: "#38bdf8",
            bg: "rgba(56, 189, 248, 0.08)",
            border: "rgba(56, 189, 248, 0.3)",
            icon: "fas fa-snowflake",
            badge: "PTS ESTÁTICO",
            desc: "Imagens estáticas e repetição de GOP no MUX da emissora por mais de 4 minutos."
        },
        {
            key: "audio_mute",
            label: "Áudio Mudo / Portadora Sem Som",
            color: "#f59e0b",
            bg: "rgba(245, 158, 11, 0.08)",
            border: "rgba(245, 158, 11, 0.3)",
            icon: "fas fa-volume-mute",
            badge: "PORTADORA MUDA",
            desc: "Vídeo transmitido normalmente mas trilha sonora sem portadora de áudio no encoder."
        },
        {
            key: "truncated",
            label: "Truncamento de Bloco SZ (< 80MB)",
            color: "#ec4899",
            bg: "rgba(236, 72, 153, 0.08)",
            border: "rgba(236, 72, 153, 0.3)",
            icon: "fas fa-cut",
            badge: "BLOCO TRUNCADO",
            desc: "Arquivo do bloco de 30min interrompido prematuramente com tamanho muito abaixo do padrão nominal."
        },
        {
            key: "delayed",
            label: "Atraso no Escoamento WAN / Arquivo Pendente",
            color: "#a855f7",
            bg: "rgba(168, 85, 247, 0.08)",
            border: "rgba(168, 85, 247, 0.3)",
            icon: "fas fa-clock",
            badge: "PENDENTE NO NAS",
            desc: "Canal gravando no host remoto da afiliada porém bloco atrasado para subir ao NAS corporativo."
        }
    ];

    grid.innerHTML = clusterDefs.map(cDef => {
        const cData = clusters[cDef.key] || { count: 0, channels: [] };
        const count = cData.count || 0;
        const pct = totalChannels > 0 ? Math.round((count / totalChannels) * 100) : 0;
        const channelsList = cData.channels || [];

        return `
        <div class="panel-card" style="background: ${cDef.bg}; border: 1px solid ${cDef.border}; border-top: 4px solid ${cDef.color}; padding: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <i class="${cDef.icon}" style="color: ${cDef.color}; font-size: 16px;"></i>
                    <strong style="font-size: 13px; color: #fff;">${escapeHtml(cDef.label)}</strong>
                </div>
                <span class="badge" style="background: ${cDef.color}; color: #000; font-weight: 800; font-size: 10px;">${count}</span>
            </div>
            
            <p style="font-size: 11px; color: #94a3b8; margin: 0 0 10px 0; line-height: 1.4;">
                ${cDef.desc}
            </p>

            <div style="margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; font-size: 10px; color: #cbd5e1; margin-bottom: 3px; font-family: monospace;">
                    <span>Incidência na Frota:</span>
                    <strong>${pct}% (${count}/${totalChannels})</strong>
                </div>
                <div style="height: 5px; width: 100%; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden;">
                    <div style="height: 100%; width: ${pct}%; background: ${cDef.color}; border-radius: 3px; transition: width 0.3s ease;"></div>
                </div>
            </div>

            <!-- Listagem de Canais Afetados -->
            ${channelsList.length > 0 ? `
                <div style="background: rgba(0,0,0,0.3); border-radius: 6px; padding: 8px; max-height: 110px; overflow-y: auto; border: 1px solid rgba(255,255,255,0.05);">
                    <div style="font-size: 10px; font-weight: 700; color: #cbd5e1; margin-bottom: 4px; text-transform: uppercase;">Canais afetados:</div>
                    ${channelsList.map(ch => `
                        <div style="font-size: 11px; color: #f1f5f9; display: flex; justify-content: space-between; padding: 2px 0; font-family: monospace; border-bottom: 1px dashed rgba(255,255,255,0.05);">
                            <span>📍 <strong>${escapeHtml(ch.praca)}</strong>: ${escapeHtml(ch.canal)}</span>
                            <span style="color: ${cDef.color}; font-size: 10px;">CS ${ch.cs || 1}</span>
                        </div>
                    `).join("")}
                </div>
            ` : `
                <div style="font-size: 11px; color: var(--accent-green); background: rgba(16, 185, 129, 0.05); padding: 6px 10px; border-radius: 4px;">
                    <i class="fas fa-check"></i> Nenhum canal afetado por este padrão no slot atual.
                </div>
            `}
        </div>`;
    }).join("");
}

function renderRealtimePracasGrid(pracas) {
    const grid = document.getElementById("rtPracasGrid");
    if (!grid) return;

    if (!pracas || pracas.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 30px;">Nenhuma praça mapeada.</div>`;
        return;
    }

    grid.innerHTML = pracas.map(p => {
        const health = p.health_pct != null ? Math.round(p.health_pct) : (p.health_index || 100);
        const isHealthy = health >= 90;
        const isWarning = health >= 60 && health < 90;
        const healthColor = isHealthy ? "#10b981" : (isWarning ? "#f59e0b" : "#ef4444");
        const healthBadgeClass = isHealthy ? "badge-green" : (isWarning ? "badge-yellow" : "badge-red");
        const nomCount = p.nominais != null ? p.nominais : (p.canais_nominais || 0);
        const anomCount = p.anomalias != null ? p.anomalias : (p.canais_anomalia || 0);
        const failList = p.canais_com_falha || p.anomalias || [];

        return `
        <div class="panel-card rt-praca-card" data-praca="${escapeHtml(p.praca).toLowerCase()}" style="border: 1px solid rgba(255,255,255,0.08); border-left: 4px solid ${healthColor};">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <div>
                    <h4 style="margin: 0; font-size: 15px; font-weight: 800; color: #fff;">
                        📍 ${escapeHtml(p.praca)}
                    </h4>
                    <span style="font-size: 11px; color: var(--text-muted);">${p.total_channels} Canais Mapeados</span>
                </div>
                <div style="text-align: right;">
                    <span class="badge ${healthBadgeClass}" style="font-size: 11px; font-weight: 800;">Health ${health}%</span>
                </div>
            </div>

            <!-- Barra de Saúde Visual -->
            <div style="height: 6px; width: 100%; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden; margin-bottom: 12px;">
                <div style="height: 100%; width: ${health}%; background: ${healthColor}; border-radius: 3px;"></div>
            </div>

            <!-- Resumo Numérico -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; font-size: 11px;">
                <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: 6px; padding: 6px 10px;">
                    <div style="color: var(--text-muted);">Nominais</div>
                    <strong style="color: #10b981; font-size: 13px;">${nomCount} MUX</strong>
                </div>
                <div style="background: ${anomCount > 0 ? 'rgba(239, 68, 68, 0.08)' : 'rgba(255,255,255,0.03)'}; border: 1px solid ${anomCount > 0 ? 'rgba(239, 68, 68, 0.25)' : 'rgba(255,255,255,0.08)'}; border-radius: 6px; padding: 6px 10px;">
                    <div style="color: var(--text-muted);">Com Falha</div>
                    <strong style="color: ${anomCount > 0 ? '#ef4444' : '#94a3b8'}; font-size: 13px;">${anomCount} MUX</strong>
                </div>
            </div>

            <!-- Lista de Canais com Falha se houver -->
            ${failList.length > 0 ? `
                <div style="background: rgba(0,0,0,0.3); border-radius: 6px; padding: 8px; margin-bottom: 12px; max-height: 95px; overflow-y: auto; border: 1px solid rgba(255,255,255,0.05);">
                    <div style="font-size: 10px; font-weight: 700; color: #ef4444; margin-bottom: 4px;">FALHAS DETECTADAS:</div>
                    ${failList.map(a => `
                        <div style="font-size: 11px; color: #fca5a5; display: flex; justify-content: space-between; padding: 2px 0; font-family: monospace;">
                            <span>• ${escapeHtml(a.canal)}</span>
                            <span style="font-size: 10px; color: #94a3b8;">${escapeHtml(a.detail || a.tipo || a.cluster)}</span>
                        </div>
                    `).join("")}
                </div>
            ` : ''}

            <!-- Botão de Diagnóstico de IA sob Demanda -->
            <button class="btn-primary" onclick="diagnosePracaClusterAi('${escapeHtml(p.praca)}')" style="width: 100%; font-size: 11px; padding: 8px; background: linear-gradient(135deg, #4f46e5, #0284c7); border: none; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 6px;">
                <i class="fas fa-brain"></i> 🤖 Diagnosticar Praça com IA (Gemini Pro)
            </button>
        </div>`;
    }).join("");
}

function filterRealtimePracas() {
    const input = document.getElementById("rtSearchPracaInput");
    if (!input) return;
    const term = input.value.toLowerCase().trim();
    const cards = document.querySelectorAll(".rt-praca-card");
    cards.forEach(c => {
        const pracaName = c.getAttribute("data-praca") || "";
        if (!term || pracaName.includes(term)) {
            c.style.display = "block";
        } else {
            c.style.display = "none";
        }
    });
}
window.filterRealtimePracas = filterRealtimePracas;

// Diagnóstico sob Demanda da Praça com IA
async function diagnosePracaClusterAi(praca) {
    const modal = document.getElementById("fiscPracaAiModal");
    const title = document.getElementById("fiscPracaAiModalTitle");
    const content = document.getElementById("fiscPracaAiContent");

    if (modal) modal.style.display = "flex";
    if (title) title.innerText = `Diagnóstico de IA: Praça ${praca}`;
    if (content) {
        content.innerHTML = `
        <div style="text-align: center; padding: 35px;">
            <i class="fas fa-circle-notch fa-spin" style="font-size: 32px; color: #38bdf8;"></i>
            <div style="margin-top: 14px; font-weight: 700; color: #fff; font-size: 15px;">
                Processando Parecer Técnico para ${escapeHtml(praca)}...
            </div>
            <div style="font-size: 12px; color: #94a3b8; margin-top: 6px; max-width: 500px; margin-left: auto; margin-right: auto; line-height: 1.5;">
                O Google Gemini Pro está cruzando a topologia digital terrestre, o histórico de cronicidade da praça e os blocos de 30 minutos recém-auditados.
            </div>
        </div>`;
    }

    try {
        const res = await fetch("/api/fiscalizacao/realtime-ai-praca-summary", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ praca: praca }),
            credentials: "omit"
        });

        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();

        const health = data.health_pct != null ? Math.round(data.health_pct) : 100;
        const anomCount = data.falhas_count != null ? data.falhas_count : 0;
        const slotStr = data.block_slot || "Slot de 30min";
        const recList = data.recomendacoes || [];

        let aiText = data.parecer_ia || data.ai_summary || "Diagnóstico concluído sem observações críticas.";
        aiText = aiText
            .replace(/### (.*?)\n/g, '<h4 style="color:#38bdf8; font-size:14px; margin-top:14px; margin-bottom:6px;">$1</h4>')
            .replace(/## (.*?)\n/g, '<h3 style="color:#f59e0b; font-size:15px; margin-top:16px; margin-bottom:8px;">$1</h3>')
            .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#fff;">$1</strong>')
            .replace(/\n\n/g, '<p style="margin-bottom:10px;"></p>')
            .replace(/\n/g, '<br>');

        if (content) {
            content.innerHTML = `
            <!-- Painel de Resumo da Praça -->
            <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 6px; padding: 12px 16px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                <div>
                    <div style="font-size: 11px; text-transform: uppercase; color: var(--text-muted); font-weight: 700;">Score da Praça</div>
                    <div style="font-size: 18px; font-weight: 800; color: ${health >= 90 ? '#10b981' : (health >= 60 ? '#f59e0b' : '#ef4444')};">
                        Health Index: ${health}%
                    </div>
                </div>
                <div style="display: flex; gap: 14px; font-size: 12px; font-family: monospace;">
                    <div>Falhas Detectadas: <strong style="color: ${anomCount > 0 ? '#ef4444' : '#10b981'};">${anomCount}</strong></div>
                    <div>Slot: <strong style="color: #38bdf8;">${escapeHtml(slotStr)}</strong></div>
                </div>
            </div>

            <!-- Parecer do Gemini Pro -->
            <div style="background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; padding: 16px; line-height: 1.6; font-size: 13px; color: #cbd5e1; margin-bottom: 14px;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; color: #a855f7; font-weight: 700; font-size: 13px;">
                    <i class="fas fa-brain"></i> Parecer Pericial de Engenharia (IA Gemini Pro):
                </div>
                <div>${aiText}</div>
            </div>

            <!-- Recomendações Práticas Acionáveis -->
            ${recList.length > 0 ? `
                <div style="background: rgba(16, 185, 129, 0.05); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: 6px; padding: 12px 16px;">
                    <div style="font-size: 12px; font-weight: 700; color: #10b981; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                        <i class="fas fa-tools"></i> Ações Operacionais Recomendadas:
                    </div>
                    <ul style="margin: 0; padding-left: 18px; font-size: 12px; color: #cbd5e1;">
                        ${recList.map(r => `<li style="margin-bottom: 4px;">${escapeHtml(r)}</li>`).join("")}
                    </ul>
                </div>
            ` : ''}
            `;
        }
    } catch (err) {
        console.error("Erro no diagnóstico de IA da praça:", err);
        if (content) {
            content.innerHTML = `
            <div style="padding: 20px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 6px; color: #fca5a5;">
                <strong>Erro ao consultar IA:</strong> ${escapeHtml(err.message || "Falha na comunicação com o backend.")}
            </div>`;
        }
    }
}
window.diagnosePracaClusterAi = diagnosePracaClusterAi;

function closeRealtimePracaAiModal() {
    const modal = document.getElementById("fiscPracaAiModal");
    if (modal) modal.style.display = "none";
}
window.closeRealtimePracaAiModal = closeRealtimePracaAiModal;
