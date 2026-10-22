// dashboard/static/js/signals_analysis.js
// Central de Observabilidade e Análise de Sinal & RF para Capture Sites LATAM

let currentSignalsPeriod = "24h";
let currentSignalsPraca = "";
let currentSignalsCanal = "";
let signalsHistoryDataCache = null;
let chronicIssuesCache = [];

function switchSignalsSubtab(subtabId) {
    const historyBtn = document.getElementById("btn-signals-subtab-history");
    const chronicBtn = document.getElementById("btn-signals-subtab-chronic");
    const historyContent = document.getElementById("signals-content-history");
    const chronicContent = document.getElementById("signals-content-chronic");

    if (subtabId === "history") {
        if (historyBtn) historyBtn.classList.add("active");
        if (chronicBtn) chronicBtn.classList.remove("active");
        if (historyContent) historyContent.style.display = "block";
        if (chronicContent) chronicContent.style.display = "none";
    } else {
        if (historyBtn) historyBtn.classList.remove("active");
        if (chronicBtn) chronicBtn.classList.add("active");
        if (historyContent) historyContent.style.display = "none";
        if (chronicContent) chronicContent.style.display = "block";
        loadChronicIssuesList();
    }
}
window.switchSignalsSubtab = switchSignalsSubtab;

function setSignalsPeriod(period) {
    currentSignalsPeriod = period;
    document.querySelectorAll("#signalsPeriodBtnGroup .period-btn").forEach(btn => {
        if (btn.getAttribute("data-period") === period) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });
    loadSignalsHistoryData();
}
window.setSignalsPeriod = setSignalsPeriod;

async function initSignalsAnalysisTab() {
    console.log("[SignalsAnalysis] Inicializando aba de análise de sinal e RF...");
    await populateSignalsPracaFilter();
    loadChronicIssuesList();
}
window.initSignalsAnalysisTab = initSignalsAnalysisTab;

async function populateSignalsPracaFilter() {
    const pracaSelect = document.getElementById("signalsFilterPraca");
    if (!pracaSelect) return;

    try {
        const resp = await fetch("/api/fleet/channels", {
            headers: { "Authorization": `Bearer ${authToken}` }
        });
        if (!resp.ok) return;
        const channels = await resp.json();

        // Extrai cidades únicas
        const pracasMap = {};
        channels.forEach(c => {
            const praca = c.cidade || "N/A";
            if (!pracasMap[praca]) {
                pracasMap[praca] = [];
            }
            pracasMap[praca].push(c);
        });

        const sortedPracas = Object.keys(pracasMap).sort();
        if (sortedPracas.length === 0) {
            pracaSelect.innerHTML = "<option value=''>Nenhuma praça encontrada</option>";
            return;
        }

        pracaSelect.innerHTML = sortedPracas.map(p => {
            const hasOutage = pracasMap[p].some(c => c.has_outage);
            const label = hasOutage ? `🚨 ${p} (Alerta Ativo)` : `📡 ${p}`;
            return `<option value="${p}">${label}</option>`;
        }).join("");

        // Seleciona preferencialmente Pelotas ou uma praça com incidente, senão a primeira
        let defaultPraca = sortedPracas.find(p => p.toLowerCase().includes("pelotas"));
        if (!defaultPraca) {
            defaultPraca = sortedPracas.find(p => pracasMap[p].some(c => c.has_outage)) || sortedPracas[0];
        }

        pracaSelect.value = defaultPraca;
        currentSignalsPraca = defaultPraca;
        onSignalsPracaChanged();
    } catch (err) {
        console.error("[SignalsAnalysis] Erro ao carregar praças:", err);
    }
}

async function onSignalsPracaChanged() {
    const pracaSelect = document.getElementById("signalsFilterPraca");
    const canalSelect = document.getElementById("signalsFilterCanal");
    if (!pracaSelect || !canalSelect) return;

    currentSignalsPraca = pracaSelect.value;
    if (!currentSignalsPraca) return;

    try {
        const resp = await fetch(`/api/fleet/channels?city=${encodeURIComponent(currentSignalsPraca)}`, {
            headers: { "Authorization": `Bearer ${authToken}` }
        });
        if (!resp.ok) return;
        const channels = await resp.json();

        if (channels.length === 0) {
            canalSelect.innerHTML = "<option value=''>Nenhum canal sintonizado</option>";
            return;
        }

        canalSelect.innerHTML = channels.map(c => {
            const outageIcon = c.has_outage ? "⚠️ " : "";
            const q = c.qualidade_sinal !== null ? `${c.qualidade_sinal}%` : "N/A";
            return `<option value="${c.canal}">${outageIcon}${c.canal} (Q: ${q} | CS ${c.id_cs || 1})</option>`;
        }).join("");

        currentSignalsCanal = channels[0].canal;
        canalSelect.value = currentSignalsCanal;
        loadSignalsHistoryData();
    } catch (err) {
        console.error("[SignalsAnalysis] Erro ao carregar canais da praça:", err);
    }
}
window.onSignalsPracaChanged = onSignalsPracaChanged;

async function loadSignalsHistoryData() {
    const pracaSelect = document.getElementById("signalsFilterPraca");
    const canalSelect = document.getElementById("signalsFilterCanal");
    if (!pracaSelect || !canalSelect) return;

    currentSignalsPraca = pracaSelect.value;
    currentSignalsCanal = canalSelect.value;

    if (!currentSignalsPraca || !currentSignalsCanal) return;

    const diagPanel = document.getElementById("signals-ai-diagnostic-panel");
    if (diagPanel) diagPanel.style.display = "none";

    try {
        const url = `/api/fleet/channels/history?praca=${encodeURIComponent(currentSignalsPraca)}&canal=${encodeURIComponent(currentSignalsCanal)}&period=${currentSignalsPeriod}`;
        const resp = await fetch(url, {
            headers: { "Authorization": `Bearer ${authToken}` }
        });
        if (!resp.ok) {
            console.error("[SignalsAnalysis] Falha ao obter telemetria:", resp.status);
            return;
        }

        const data = await resp.json();
        signalsHistoryDataCache = data;

        updateSignalsKPIs(data);
        renderSignalsCanvasChart(data.history_points || []);
    } catch (err) {
        console.error("[SignalsAnalysis] Erro ao buscar histórico de sinal:", err);
    }
}
window.loadSignalsHistoryData = loadSignalsHistoryData;

function updateSignalsKPIs(data) {
    const avgQ = document.getElementById("kpi-avg-qualidade");
    const minQ = document.getElementById("kpi-min-qualidade");
    const avgF = document.getElementById("kpi-avg-forca");
    const minF = document.getElementById("kpi-min-forca");
    const stab = document.getElementById("kpi-stability");
    const drops = document.getElementById("kpi-lock-drops");

    if (avgQ) avgQ.innerText = `${data.avg_qualidade}%`;
    if (minQ) minQ.innerText = `Mínima: ${data.min_qualidade}%`;
    if (avgF) avgF.innerText = `${data.avg_forca}%`;
    if (minF) minF.innerText = `Mínima: ${data.min_forca}%`;
    if (stab) stab.innerText = `${data.stability_index_pct}%`;
    if (drops) drops.innerText = data.lock_drops_count;

    // Cores de alerta
    if (avgQ) {
        avgQ.style.color = data.avg_qualidade < 45 ? "#ef4444" : data.avg_qualidade < 65 ? "#f59e0b" : "#10b981";
    }
    if (drops) {
        drops.style.color = data.lock_drops_count > 0 ? "#ef4444" : "#10b981";
    }
}

function renderSignalsCanvasChart(points) {
    const canvas = document.getElementById("signalsHistoryCanvas");
    const emptyMsg = document.getElementById("signalsChartEmpty");
    if (!canvas) return;

    if (!points || points.length === 0) {
        if (emptyMsg) emptyMsg.style.display = "flex";
        return;
    }
    if (emptyMsg) emptyMsg.style.display = "none";

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || 1100;
    const h = rect.height || 320;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, h);

    const padLeft = 45;
    const padRight = 30;
    const padTop = 25;
    const padBottom = 35;

    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;

    // 1. Grade horizontal e eixos (0%, 20%, 40%, 60%, 80%, 100%)
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#64748b";
    ctx.font = "11px Inter, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";

    for (let p = 0; p <= 100; p += 20) {
        const y = padTop + plotH - (p / 100) * plotH;
        ctx.beginPath();
        ctx.moveTo(padLeft, y);
        ctx.lineTo(w - padRight, y);
        ctx.stroke();
        ctx.fillText(`${p}%`, padLeft - 8, y);
    }

    // 2. Linha Crítica de Corte: 45% (Limiar de Lock Digital ISDB-Tb / QAM)
    const yCutoff = padTop + plotH - (45 / 100) * plotH;
    ctx.save();
    ctx.strokeStyle = "#ef4444";
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padLeft, yCutoff);
    ctx.lineTo(w - padRight, yCutoff);
    ctx.stroke();

    // Rótulo da linha de corte
    ctx.fillStyle = "#f87171";
    ctx.textAlign = "right";
    ctx.font = "10px Inter, sans-serif";
    ctx.fillText("Limiar Crítico Lock (45%)", w - padRight - 6, yCutoff - 8);
    ctx.restore();

    const n = points.length;
    const getX = (i) => padLeft + (i / (n - 1)) * plotW;
    const getY = (val) => padTop + plotH - (Math.min(100, Math.max(0, val)) / 100) * plotH;

    // 3. Área e Linha de Força (RSSI) - Azul Claro #38bdf8
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
        const x = getX(i);
        const y = getY(points[i].forca);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2;
    ctx.stroke();

    // 4. Área e Linha de Qualidade de Sinal - Verde Esmeralda #10b981
    const gradQ = ctx.createLinearGradient(0, padTop, 0, padTop + plotH);
    gradQ.addColorStop(0, "rgba(16, 185, 129, 0.25)");
    gradQ.addColorStop(1, "rgba(16, 185, 129, 0.0)");

    ctx.beginPath();
    ctx.moveTo(getX(0), padTop + plotH);
    for (let i = 0; i < n; i++) {
        ctx.lineTo(getX(i), getY(points[i].qualidade));
    }
    ctx.lineTo(getX(n - 1), padTop + plotH);
    ctx.closePath();
    ctx.fillStyle = gradQ;
    ctx.fill();

    ctx.beginPath();
    for (let i = 0; i < n; i++) {
        const x = getX(i);
        const y = getY(points[i].qualidade);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // 5. Pontos destacados se houver queda de sincronismo (< 45%)
    for (let i = 0; i < n; i++) {
        if (points[i].qualidade < 45 || points[i].is_outage) {
            const x = getX(i);
            const y = getY(points[i].qualidade);
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fillStyle = "#ef4444";
            ctx.fill();
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
    }

    // 6. Rótulos temporais no rodapé (X-Axis)
    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    const labelCount = Math.min(8, n);
    const step = Math.floor(n / labelCount) || 1;
    for (let i = 0; i < n; i += step) {
        const x = getX(i);
        const d = new Date(points[i].timestamp);
        let label = "";
        if (currentSignalsPeriod === "24h") {
            label = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        } else {
            label = `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, "0")}h`;
        }
        ctx.fillText(label, x, padTop + plotH + 8);
    }
}

async function triggerAiSignalDiagnosis() {
    const btn = document.getElementById("btnTriggerAiSignal");
    const diagPanel = document.getElementById("signals-ai-diagnostic-panel");
    if (!btn || !diagPanel) return;

    if (!currentSignalsPraca || !currentSignalsCanal) {
        alert("Selecione uma praça e um canal para executar o diagnóstico da IA.");
        return;
    }

    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Analisando RF & Hardware...`;

    try {
        const resp = await fetch("/api/fleet/channels/ai-diagnose", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${authToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                praca: currentSignalsPraca,
                canal: currentSignalsCanal,
                period: currentSignalsPeriod
            })
        });

        if (!resp.ok) {
            throw new Error(`Falha no diagnóstico (${resp.status})`);
        }

        const diag = await resp.json();
        renderAiDiagnosisResult(diag);
        diagPanel.style.display = "block";
        diagPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
        console.error("[SignalsAnalysis] Erro ao diagnosticar:", err);
        alert(`Erro ao executar o diagnóstico de RF: ${err.message}`);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}
window.triggerAiSignalDiagnosis = triggerAiSignalDiagnosis;

function renderAiDiagnosisResult(diag) {
    const diagPanel = document.getElementById("signals-ai-diagnostic-panel");
    if (!diagPanel) return;

    let badgeColor = "#10b981";
    let badgeBg = "rgba(16, 185, 129, 0.15)";
    let borderCol = "#10b981";
    if (diag.status_diagnostico === "CRÍTICO") {
        badgeColor = "#ef4444";
        badgeBg = "rgba(239, 68, 68, 0.15)";
        borderCol = "#ef4444";
    } else if (diag.status_diagnostico === "ALERTA") {
        badgeColor = "#f59e0b";
        badgeBg = "rgba(245, 158, 11, 0.15)";
        borderCol = "#f59e0b";
    }

    let actionsHtml = "";
    if (diag.acoes_recomendadas && diag.acoes_recomendadas.length > 0) {
        actionsHtml = diag.acoes_recomendadas.map(a => `
            <li style="margin-bottom: 8px; color: #e2e8f0; line-height: 1.5;">${a}</li>
        `).join("");
    }

    let scriptHtml = "";
    if (diag.script_auto_healing) {
        scriptHtml = `
            <div style="margin-top: 16px; background: #000; border: 1px solid #1e293b; border-radius: 6px; padding: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="font-size: 11px; text-transform: uppercase; color: #38bdf8; font-weight: 700;">⚡ Script de Correção Imediata (PowerShell):</span>
                    <button class="btn-secondary" style="padding: 2px 8px; font-size: 11px;" onclick="copyAiScript(this)">Copiar</button>
                </div>
                <pre style="margin: 0; color: #34d399; font-family: monospace; font-size: 11px; white-space: pre-wrap;" id="ai-script-content">${diag.script_auto_healing}</pre>
                <div style="margin-top: 10px; display: flex; justify-content: flex-end;">
                    <button class="btn-primary" style="font-size: 12px; padding: 6px 14px; background: #2563eb;" onclick="executeAiDiagScript('${diag.praca.replace(/'/g, "\\'")}', '${diag.canal.replace(/'/g, "\\'")}')">
                        <i class="fas fa-play"></i> Enviar Comando Remoto para ${diag.praca}
                    </button>
                </div>
            </div>
        `;
    }

    diagPanel.innerHTML = `
        <div class="panel-card" style="border: 1px solid ${borderCol}; box-shadow: 0 4px 20px rgba(0,0,0,0.4);">
            <div class="panel-header" style="margin-bottom: 14px; border-bottom: 1px solid var(--border-color); padding-bottom: 12px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 22px;">🧠</span>
                    <div>
                        <div class="panel-title" style="margin-bottom: 2px;">Diagnóstico Técnico de RF & Mídia via Inteligência Artificial</div>
                        <div style="font-size: 12px; color: var(--text-muted);">${diag.praca} • ${diag.canal} • Janela: ${diag.periodo_analisado}</div>
                    </div>
                </div>
                <span class="badge" style="background: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${borderCol}; font-weight: 700; padding: 6px 14px; font-size: 12px;">
                    STATUS: ${diag.status_diagnostico}
                </span>
            </div>

            <!-- Badges de Hardware e Especificações Físicas -->
            <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px;">
                <span class="badge" style="background: rgba(255,255,255,0.06); color: #94a3b8;"><i class="fas fa-broadcast-tower"></i> Frequência: <strong style="color: #fff;">${diag.frequencia_uhf || "N/A"}</strong></span>
                <span class="badge" style="background: rgba(255,255,255,0.06); color: #94a3b8;"><i class="fas fa-microchip"></i> Hardware: <strong style="color: #fff;">${diag.tuner_modelo || "N/A"}</strong></span>
                <span class="badge" style="background: rgba(255,255,255,0.06); color: #94a3b8;"><i class="fas fa-signal"></i> SNR/MER: <strong style="color: #fff;">${diag.snr_mer_estimado || "N/A"}</strong></span>
                <span class="badge" style="background: rgba(255,255,255,0.06); color: #94a3b8;"><i class="fas fa-bug"></i> Taxa BER: <strong style="color: #fff;">${diag.taxa_ber_estimada || "N/A"}</strong></span>
            </div>

            <!-- Causa Raiz Fundamentada -->
            <div style="background: rgba(0,0,0,0.25); border: 1px solid var(--border-color); border-radius: 6px; padding: 14px; margin-bottom: 16px;">
                <div style="font-size: 12px; font-weight: 700; color: #f87171; text-transform: uppercase; margin-bottom: 6px;">
                    <i class="fas fa-search-location"></i> Causa Raiz Fundamentada (Engenharia de RF):
                </div>
                <div style="color: #fff; font-size: 13px; line-height: 1.6;">${diag.causa_raiz}</div>
            </div>

            <!-- Recomendações e Ações -->
            <div style="background: rgba(0,0,0,0.25); border: 1px solid var(--border-color); border-radius: 6px; padding: 14px;">
                <div style="font-size: 12px; font-weight: 700; color: #38bdf8; text-transform: uppercase; margin-bottom: 8px;">
                    <i class="fas fa-clipboard-check"></i> Procedimentos Técnicos de Solução Recomendados:
                </div>
                <ul style="margin: 0; padding-left: 20px; font-size: 13px;">
                    ${actionsHtml}
                </ul>
                ${scriptHtml}
            </div>
        </div>
    `;
}

function copyAiScript(btn) {
    const pre = document.getElementById("ai-script-content");
    if (!pre) return;
    navigator.clipboard.writeText(pre.innerText).then(() => {
        btn.innerText = "Copiado!";
        setTimeout(() => btn.innerText = "Copiar", 2000);
    });
}
window.copyAiScript = copyAiScript;

function executeAiDiagScript(praca, canal) {
    const pre = document.getElementById("ai-script-content");
    if (!pre) return;
    const script = pre.innerText;

    // Redireciona para o Remote Command com o host e script pré-carregados
    const rcNavBtn = document.querySelector(".nav-btn[data-tab='remote-commands']");
    if (rcNavBtn) {
        rcNavBtn.click();
        setTimeout(() => {
            const hostSelect = document.getElementById("remote-host-select");
            const scriptArea = document.getElementById("custom-command-input");
            if (hostSelect) {
                // Tenta encontrar o host com a praça
                for (let i = 0; i < hostSelect.options.length; i++) {
                    if (hostSelect.options[i].text.toLowerCase().includes(praca.toLowerCase())) {
                        hostSelect.selectedIndex = i;
                        if (typeof addSelectedHost === "function") addSelectedHost();
                        break;
                    }
                }
            }
            if (scriptArea) {
                scriptArea.value = script;
                scriptArea.scrollIntoView({ behavior: "smooth" });
                scriptArea.focus();
            }
        }, 300);
    }
}
window.executeAiDiagScript = executeAiDiagScript;

async function loadChronicIssuesList() {
    const grid = document.getElementById("chronic-issues-grid");
    if (!grid) return;

    try {
        const resp = await fetch("/api/fleet/channels/chronic-issues", {
            headers: { "Authorization": `Bearer ${authToken}` }
        });
        if (!resp.ok) return;

        const issues = await resp.json();
        chronicIssuesCache = issues;

        grid.innerHTML = issues.map(issue => `
            <div class="panel-card" style="border: 1px solid var(--border-color); display: flex; flex-direction: column; justify-content: space-between;">
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                        <div>
                            <div style="font-weight: 700; color: #fff; font-size: 15px;">${issue.praca} • CS ${issue.cs}</div>
                            <div style="font-size: 12px; color: #38bdf8; font-weight: 600;">${issue.canal}</div>
                        </div>
                        <span class="badge" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid #ef4444; font-size: 11px;">
                            ${issue.status_atual}
                        </span>
                    </div>

                    <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px;">
                        <span class="badge" style="background: rgba(255,255,255,0.05); font-size: 11px; color: var(--text-muted);">${issue.frequencia}</span>
                        <span class="badge" style="background: rgba(255,255,255,0.05); font-size: 11px; color: var(--text-muted);">${issue.tuner}</span>
                    </div>

                    <div style="background: rgba(0,0,0,0.25); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; margin-bottom: 10px;">
                        <div style="font-size: 11px; font-weight: 700; color: #f87171; text-transform: uppercase; margin-bottom: 4px;">Causa Raiz Comprovada:</div>
                        <div style="font-size: 12px; color: #e2e8f0; line-height: 1.5;">${issue.diagnostico_ia}</div>
                    </div>

                    <div style="background: rgba(0,0,0,0.25); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; margin-bottom: 14px;">
                        <div style="font-size: 11px; font-weight: 700; color: #10b981; text-transform: uppercase; margin-bottom: 4px;">Solução de Engenharia Estipulada:</div>
                        <div style="font-size: 12px; color: #cbd5e1; line-height: 1.5; white-space: pre-line;">${issue.solucao_estipulada}</div>
                    </div>
                </div>

                <div>
                    <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
                        <i class="far fa-clock"></i> Recorrência: <span>${issue.tempo_recorrencia}</span>
                    </div>
                    <button class="btn-primary" style="width: 100%; font-size: 12px; padding: 8px; background: linear-gradient(135deg, #2563eb, #1d4ed8);" onclick="executeChronicAutoHeal('${issue.id}')">
                        <i class="fas fa-bolt"></i> ⚡ Executar Auto-Cura na Praça
                    </button>
                </div>
            </div>
        `).join("");
    } catch (err) {
        console.error("[SignalsAnalysis] Erro ao listar problemas crônicos:", err);
    }
}
window.loadChronicIssuesList = loadChronicIssuesList;

function executeChronicAutoHeal(issueId) {
    const issue = chronicIssuesCache.find(i => i.id === issueId);
    if (!issue) return;

    if (!confirm(`Deseja executar o script de Auto-Cura para ${issue.praca} (CS ${issue.cs})?\n\nCanal: ${issue.canal}\nAção: ${issue.solucao_estipulada.split("\n")[0]}`)) {
        return;
    }

    // Encaminha para Remote Command com os parâmetros
    const rcNavBtn = document.querySelector(".nav-btn[data-tab='remote-commands']");
    if (rcNavBtn) {
        rcNavBtn.click();
        setTimeout(() => {
            const hostSelect = document.getElementById("remote-host-select");
            const scriptArea = document.getElementById("custom-command-input");
            if (hostSelect) {
                for (let i = 0; i < hostSelect.options.length; i++) {
                    if (hostSelect.options[i].text.toLowerCase().includes(issue.praca.toLowerCase())) {
                        hostSelect.selectedIndex = i;
                        if (typeof addSelectedHost === "function") addSelectedHost();
                        break;
                    }
                }
            }
            if (scriptArea) {
                scriptArea.value = issue.comando_auto_cura;
                scriptArea.scrollIntoView({ behavior: "smooth" });
                scriptArea.focus();
            }
        }, 300);
    }
}
window.executeChronicAutoHeal = executeChronicAutoHeal;
