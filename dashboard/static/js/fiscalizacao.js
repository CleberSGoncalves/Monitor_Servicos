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

    const opt = canalSelect.options[canalSelect.selectedIndex];
    const idpv = opt ? opt.getAttribute("data-idpv") : "";
    if (idpvInput && idpv) {
        idpvInput.value = idpv;
    }
    updateFiscUncPreview();
}

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

// Alterna entre Subabas de Fiscalização (Auditoria vs Análise MP4)
function switchFiscalizacaoSubtab(subtabId) {
    const btnAudit = document.getElementById("btn-fisc-subtab-audit");
    const btnMp4 = document.getElementById("btn-fisc-subtab-mp4");
    const contentAudit = document.getElementById("fisc-content-audit");
    const contentMp4 = document.getElementById("fisc-content-mp4");

    if (btnAudit) btnAudit.classList.remove("active");
    if (btnMp4) btnMp4.classList.remove("active");

    if (contentAudit) contentAudit.style.display = "none";
    if (contentMp4) contentMp4.style.display = "none";

    if (subtabId === "mp4") {
        if (btnMp4) btnMp4.classList.add("active");
        if (contentMp4) contentMp4.style.display = "block";
        // Sincroniza dropdowns se existirem no módulo de MP4
        if (typeof onMp4PracaChanged === "function") {
            onMp4PracaChanged();
        }
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
    const questionInput = document.getElementById("fiscCaseQuestion");
    const btn = document.getElementById("btnStartFiscalizacao");

    if (!pracaSelect || !canalSelect) return;
    const praca = pracaSelect.value;
    const canal = canalSelect.value;
    const customIdpv = (idpvInput?.value || "").trim();
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
        const payload = {
            praca: praca,
            canal: canal,
            target_date: targetDate,
            start_time: startTime,
            end_time: endTime,
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

    const isEmissora = data.veredito.includes("EMISSORA");
    const vColor = isEmissora ? "#f59e0b" : "#ef4444";
    const vBg = isEmissora ? "rgba(245, 158, 11, 0.12)" : "rgba(239, 68, 68, 0.12)";
    const vBorder = isEmissora ? "#f59e0b" : "#ef4444";
    const vIcon = isEmissora ? "fa-broadcast-tower" : "fa-server";

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
