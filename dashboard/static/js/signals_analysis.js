// dashboard/static/js/signals_analysis.js
// Central de Observabilidade e Análise de Sinal & RF para Capture Sites LATAM

function getSignalsAuthToken() {
    try {
        if (typeof getAuthToken === "function") {
            const t = getAuthToken();
            if (t) return t;
        }
    } catch (e) {}
    try {
        if (typeof authToken !== "undefined" && authToken) return authToken;
    } catch (e) {}
    return localStorage.getItem("fleet_token") || "";
}
let currentSignalsPeriod = "24h";
let currentSignalsPraca = "";
let currentSignalsCanal = "";
let signalsHistoryDataCache = null;
let chronicIssuesCache = [];

function switchSignalsSubtab(subtabId) {
    const historyBtn = document.getElementById("btn-signals-subtab-history");
    const chronicBtn = document.getElementById("btn-signals-subtab-chronic");
    const mp4Btn = document.getElementById("btn-signals-subtab-mp4");

    const historyContent = document.getElementById("signals-content-history");
    const chronicContent = document.getElementById("signals-content-chronic");
    const mp4Content = document.getElementById("signals-content-mp4");

    [historyBtn, chronicBtn, mp4Btn].forEach(b => b && b.classList.remove("active"));
    [historyContent, chronicContent, mp4Content].forEach(c => c && (c.style.display = "none"));

    if (subtabId === "history") {
        if (historyBtn) historyBtn.classList.add("active");
        if (historyContent) historyContent.style.display = "block";
        setTimeout(() => {
            if (signalsHistoryDataCache && signalsHistoryDataCache.history_points) {
                renderSignalsCanvasChart(signalsHistoryDataCache.history_points);
            }
        }, 50);
    } else if (subtabId === "chronic") {
        if (chronicBtn) chronicBtn.classList.add("active");
        if (chronicContent) chronicContent.style.display = "block";
        loadChronicIssuesList();
    } else if (subtabId === "mp4") {
        if (mp4Btn) mp4Btn.classList.add("active");
        if (mp4Content) mp4Content.style.display = "block";
        if (typeof populateMp4Filters === "function") populateMp4Filters();
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
        const token = getSignalsAuthToken();
        const resp = await fetch("/api/fleet/channels", {
            headers: token ? { "Authorization": `Bearer ${token}` } : {}
        });
        if (!resp.ok) {
            console.warn("[SignalsAnalysis] /api/fleet/channels retornou status", resp.status);
            pracaSelect.innerHTML = "<option value=''>Erro ao carregar praças (HTTP " + resp.status + ")</option>";
            return;
        }
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
            headers: { "Authorization": `Bearer ${getSignalsAuthToken()}` }
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
            headers: { "Authorization": `Bearer ${getSignalsAuthToken()}` }
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
                "Authorization": `Bearer ${getSignalsAuthToken()}`,
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
            headers: { "Authorization": `Bearer ${getSignalsAuthToken()}` }
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

// =========================================================================
// SUBTAB 3: ANÁLISE DE AMOSTRAS MP4 ATRIA & PLAYER DE FALHAS (EM SINAIS & RF)
// =========================================================================
let currentMp4AnalysisResult = null;
let mp4PlayerState = {
    isPlaying: false,
    currentTime: 0,
    duration: 16,
    speed: 1,
    animFrameId: null,
    glitchStart: 5.2,
    glitchDuration: 3.8,
    glitchType: "freeze"
};

async function populateMp4Filters() {
    const pracaSelect = document.getElementById("mp4FilterPraca");
    if (!pracaSelect) return;

    try {
        const token = (typeof getAiToken === "function") ? getAiToken() : (authToken || localStorage.getItem("fleet_token") || "");
        const resp = await fetch("/api/fleet/channels", {
            headers: token ? { "Authorization": `Bearer ${token}` } : {}
        });
        if (!resp.ok) return;
        const channels = await resp.json();

        const pracasMap = {};
        channels.forEach(c => {
            const p = c.cidade || "N/A";
            if (!pracasMap[p]) pracasMap[p] = [];
            pracasMap[p].push(c);
        });

        const sortedPracas = Object.keys(pracasMap).sort();
        pracaSelect.innerHTML = sortedPracas.map(p => `<option value="${p}">${p}</option>`).join("");

        if (sortedPracas.length > 0) {
            pracaSelect.value = sortedPracas.find(p => p.toLowerCase().includes("pelotas")) || sortedPracas[0];
            onMp4PracaChanged();
        }
    } catch (err) {
        console.error("Erro ao carregar filtros de MP4:", err);
    }
}
window.populateMp4Filters = populateMp4Filters;

async function onMp4PracaChanged() {
    const pracaSelect = document.getElementById("mp4FilterPraca");
    const canalSelect = document.getElementById("mp4FilterCanal");
    if (!pracaSelect || !canalSelect) return;

    const praca = pracaSelect.value;
    if (!praca) return;

    try {
        const token = (typeof getAiToken === "function") ? getAiToken() : (authToken || localStorage.getItem("fleet_token") || "");
        const resp = await fetch(`/api/fleet/channels?city=${encodeURIComponent(praca)}`, {
            headers: token ? { "Authorization": `Bearer ${token}` } : {}
        });
        if (!resp.ok) return;
        const channels = await resp.json();

        if (channels.length === 0) {
            canalSelect.innerHTML = "<option value=''>Nenhum canal na praça</option>";
            return;
        }

        canalSelect.innerHTML = channels.map(c => `<option value="${c.canal}">${c.canal} (CS ${c.id_cs || 1})</option>`).join("");
    } catch (err) {
        console.error("Erro ao carregar canais para MP4:", err);
    }
}
window.onMp4PracaChanged = onMp4PracaChanged;

async function startMp4SampleAnalysis() {
    const pracaSelect = document.getElementById("mp4FilterPraca");
    const canalSelect = document.getElementById("mp4FilterCanal");
    const daysSelect = document.getElementById("mp4FilterDays");
    const typeSelect = document.getElementById("mp4FilterType");
    const btn = document.getElementById("btnStartMp4Analysis");

    if (!pracaSelect || !canalSelect) return;
    const praca = pracaSelect.value;
    const canal = canalSelect.value;
    const days = parseInt(daysSelect.value, 10) || 3;
    const anomalyType = typeSelect.value || "all";

    if (!praca || !canal) {
        alert("Selecione uma praça e um canal gravado pelo ATRIA.");
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Executando Amostragem...`;
    }

    const progContainer = document.getElementById("mp4ProgressBarContainer");
    const progBar = document.getElementById("mp4ProgressBarFill");
    const progPct = document.getElementById("mp4ProgressPercent");
    const progDesc = document.getElementById("mp4ProgressDetailText");
    const resultsContainer = document.getElementById("mp4ResultsContainer");

    if (resultsContainer) resultsContainer.style.display = "none";
    if (progContainer) {
        progContainer.style.display = "block";
        progContainer.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    const steps = [
        { pct: 20, text: `[Etapa 1/4] Acessando diretório D:\\MediaDNA_V2\\Recordings\\${canal.replace(' ', '_')} e indexando amostras dos últimos ${days} dias...` },
        { pct: 45, text: `[Etapa 2/4] Extraindo keyframes, GOP e decodificando blocos de áudio AAC para inspeção espectral...` },
        { pct: 70, text: `[Etapa 3/4] Aplicando algoritmos de detecção de congelamento de quadro e descontinuidade de contêiner Moov Atom...` },
        { pct: 90, text: `[Etapa 4/4] Correlacionando padrões com o hardware da praça e formulando parecer técnico de IA...` }
    ];

    for (let s of steps) {
        if (progBar) progBar.style.width = `${s.pct}%`;
        if (progPct) progPct.innerText = `${s.pct}%`;
        if (progDesc) progDesc.innerText = s.text;
        await new Promise(r => setTimeout(r, 650));
    }

    try {
        const token = (typeof getAiToken === "function") ? getAiToken() : (authToken || localStorage.getItem("fleet_token") || "");
        const resp = await fetch("/api/ai/mp4/analyze", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                praca: praca,
                canal: canal,
                interval_days: days,
                anomaly_type: anomalyType
            })
        });

        if (!resp.ok) throw new Error(`Falha na análise (${resp.status})`);

        const data = await resp.json();
        currentMp4AnalysisResult = data;

        if (progBar) progBar.style.width = "100%";
        if (progPct) progPct.innerText = "100%";
        if (progDesc) progDesc.innerText = "Inspeção forense concluída com sucesso! Carregando player e diagnóstico...";

        await new Promise(r => setTimeout(r, 500));
        if (progContainer) progContainer.style.display = "none";

        renderMp4AnalysisResult(data);
        if (resultsContainer) {
            resultsContainer.style.display = "block";
            resultsContainer.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    } catch (err) {
        alert(`Erro na análise forense de MP4: ${err.message}`);
        if (progContainer) progContainer.style.display = "none";
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i class="fas fa-microscope"></i> 🔍 Extrair Amostras e Analisar com IA`;
        }
    }
}
window.startMp4SampleAnalysis = startMp4SampleAnalysis;

function renderMp4AnalysisResult(data) {
    const f = data.falha_predominante;
    const p = data.player_payload;

    mp4PlayerState.currentTime = 0;
    mp4PlayerState.duration = p.duration_sec || 16;
    mp4PlayerState.glitchStart = p.glitch_start_sec || 5.2;
    mp4PlayerState.glitchDuration = p.glitch_duration_sec || 3.8;
    mp4PlayerState.glitchType = p.glitch_type || "freeze";
    mp4PlayerState.isPlaying = false;

    const metaDisplay = document.getElementById("mp4PlayerMetadata");
    if (metaDisplay) metaDisplay.innerText = `${p.sample_filename} (${p.resolution} • ${p.video_codec})`;

    const recBadge = document.getElementById("mp4PlayerRecurrenceBadge");
    if (recBadge) recBadge.innerText = f.recorrencia;

    const osdChan = document.getElementById("mp4OsdChannel");
    if (osdChan) osdChan.innerText = data.canal.toUpperCase();

    const scrubber = document.getElementById("mp4Scrubber");
    if (scrubber) {
        scrubber.max = mp4PlayerState.duration;
        scrubber.value = 0;
    }

    const durText = document.getElementById("mp4TotalDuration");
    if (durText) durText.innerText = formatPlayerTime(mp4PlayerState.duration);

    const titleEl = document.getElementById("mp4DiagTitle");
    if (titleEl) titleEl.innerText = f.nome;

    const sympEl = document.getElementById("mp4DiagSymptom");
    if (sympEl) sympEl.innerText = f.sintoma;

    const rootEl = document.getElementById("mp4DiagRootCause");
    if (rootEl) rootEl.innerText = f.causa_raiz;

    const listEl = document.getElementById("mp4DiagSolutionsList");
    if (listEl) {
        listEl.innerHTML = f.solucoes_tecnicas.map(s => `<li style="margin-bottom: 6px;">${escapeHtml(s)}</li>`).join("");
    }

    drawMp4PlayerFrame();
}

function formatPlayerTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function drawMp4PlayerFrame() {
    const canvas = document.getElementById("mp4SimulationCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;

    const t = mp4PlayerState.currentTime;
    const isGlitch = t >= mp4PlayerState.glitchStart && t <= (mp4PlayerState.glitchStart + mp4PlayerState.glitchDuration);

    const banner = document.getElementById("mp4GlitchOverlayBanner");
    if (banner) {
        if (isGlitch) {
            banner.style.display = "block";
            if (mp4PlayerState.glitchType === "freeze") {
                banner.innerText = "⚠️ FALHA DETECTADA: CONGELAMENTO DE QUADRO / PTS STALL";
            } else if (mp4PlayerState.glitchType === "macroblock") {
                banner.innerText = "⚠️ FALHA DETECTADA: CORRUPÇÃO DE MACROBLOCOS (SLICE LOSS)";
            } else {
                banner.innerText = "⚠️ FALHA DETECTADA: SILÊNCIO SÚBITO DE ÁUDIO AAC (-inf dB)";
            }
        } else {
            banner.style.display = "none";
        }
    }

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, w, h);

    if (isGlitch && mp4PlayerState.glitchType === "freeze") {
        ctx.fillStyle = "#1e293b";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
        ctx.strokeRect(50, 50, w - 100, h - 100);

        ctx.fillStyle = "#ef4444";
        ctx.font = "bold 16px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("FRAME ESTÁTICO (REPETIÇÃO DE BUFFER H.264)", w / 2, h / 2 - 10);
        ctx.font = "12px monospace";
        ctx.fillStyle = "#94a3b8";
        ctx.fillText(`Delta de Pixels: 0.00% • GOP Bloqueado • Frame #${Math.floor(mp4PlayerState.glitchStart * 30)}`, w / 2, h / 2 + 15);
    } else if (isGlitch && mp4PlayerState.glitchType === "macroblock") {
        ctx.fillStyle = "#0a0f1d";
        ctx.fillRect(0, 0, w, h);
        for (let bx = 0; bx < w; bx += 40) {
            for (let by = 0; by < h; by += 40) {
                if (Math.sin(bx + t * 10) > 0.3) {
                    ctx.fillStyle = (bx + by) % 80 === 0 ? "rgba(16, 185, 129, 0.6)" : "rgba(100, 116, 139, 0.4)";
                    ctx.fillRect(bx, by, 38, 38);
                }
            }
        }
        ctx.fillStyle = "#f87171";
        ctx.font = "bold 14px monospace";
        ctx.textAlign = "center";
        ctx.fillText("CORRUPÇÃO DE FLUXO TS: PACKET CONTINUITY COUNTER ERROR", w / 2, h - 30);
    } else {
        const grad = ctx.createLinearGradient(0, 0, w, h);
        grad.addColorStop(0, "#1e3a8a");
        grad.addColorStop(1, "#0f172a");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        const xAnim = 100 + ((t * 80) % (w - 200));
        ctx.beginPath();
        ctx.arc(xAnim, h / 2, 45, 0, Math.PI * 2);
        ctx.fillStyle = "#38bdf8";
        ctx.fill();

        ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < w; i += 20) {
            const yLine = h / 2 + Math.sin((i + t * 100) * 0.03) * 30;
            if (i === 0) ctx.moveTo(i, yLine);
            else ctx.lineTo(i, yLine);
        }
        ctx.stroke();

        ctx.fillStyle = "#fff";
        ctx.font = "bold 18px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("TRANSMISSÃO ATRIA GRAVADA", w / 2, h / 2 - 10);
    }

    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(15, h - 35, 140, 22);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "9px monospace";
    ctx.textAlign = "left";
    ctx.fillText("VU L/R:", 22, h - 21);

    const isAudioDrop = isGlitch && mp4PlayerState.glitchType === "audio_drop";
    const vuWidth = isAudioDrop ? 0 : Math.max(8, 90 + Math.sin(t * 12) * 15);
    ctx.fillStyle = isAudioDrop ? "#ef4444" : "#10b981";
    ctx.fillRect(58, h - 29, vuWidth, 10);

    const timecodeEl = document.getElementById("mp4OsdTimecode");
    if (timecodeEl) {
        const m = Math.floor(t / 60);
        const s = Math.floor(t % 60);
        const f = Math.floor((t % 1) * 30);
        timecodeEl.innerText = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}:${String(f).padStart(2, "0")}`;
    }

    const currEl = document.getElementById("mp4CurrentTime");
    if (currEl) currEl.innerText = formatPlayerTime(t);

    const scrubber = document.getElementById("mp4Scrubber");
    if (scrubber && !scrubber.matches(":active")) scrubber.value = t;
}

function toggleMp4PlayPause() {
    mp4PlayerState.isPlaying = !mp4PlayerState.isPlaying;
    const btn = document.getElementById("btnMp4PlayPause");
    const icon = document.getElementById("mp4PlayIcon");

    if (mp4PlayerState.isPlaying) {
        if (icon) icon.className = "fas fa-pause";
        if (btn) btn.innerHTML = `<i class="fas fa-pause"></i> Pausar`;
        playMp4Loop();
    } else {
        if (icon) icon.className = "fas fa-play";
        if (btn) btn.innerHTML = `<i class="fas fa-play"></i> Reproduzir`;
        cancelAnimationFrame(mp4PlayerState.animFrameId);
    }
}
window.toggleMp4PlayPause = toggleMp4PlayPause;

let lastLoopTime = 0;
function playMp4Loop(timestamp) {
    if (!lastLoopTime) lastLoopTime = timestamp;
    const deltaSec = (timestamp - lastLoopTime) / 1000 || 0.033;
    lastLoopTime = timestamp;

    if (mp4PlayerState.isPlaying) {
        mp4PlayerState.currentTime += deltaSec * mp4PlayerState.speed;
        if (mp4PlayerState.currentTime >= mp4PlayerState.duration) {
            mp4PlayerState.currentTime = 0;
        }
        drawMp4PlayerFrame();
        mp4PlayerState.animFrameId = requestAnimationFrame(playMp4Loop);
    }
}

function restartMp4Player() {
    mp4PlayerState.currentTime = 0;
    drawMp4PlayerFrame();
}
window.restartMp4Player = restartMp4Player;

function stepMp4Frame() {
    mp4PlayerState.currentTime = Math.min(mp4PlayerState.duration, mp4PlayerState.currentTime + 1 / 30);
    drawMp4PlayerFrame();
}
window.stepMp4Frame = stepMp4Frame;

function onMp4ScrubberChange(val) {
    mp4PlayerState.currentTime = parseFloat(val);
    drawMp4PlayerFrame();
}
window.onMp4ScrubberChange = onMp4ScrubberChange;

function changeMp4Speed(val) {
    mp4PlayerState.speed = parseFloat(val) || 1;
}
window.changeMp4Speed = changeMp4Speed;

function executeMp4AutoHeal() {
    if (!currentMp4AnalysisResult) return;
    const f = currentMp4AnalysisResult.falha_predominante;
    const praca = currentMp4AnalysisResult.praca;

    if (!confirm(`Deseja executar a correção automática no Capture Site (${praca})?\n\nFalha: ${f.nome}\nComando: Atualização de Parâmetros de Codec ATRIA via PowerShell.`)) {
        return;
    }

    const rcNavBtn = document.querySelector(".nav-btn[data-tab='remote-commands']");
    if (rcNavBtn) {
        rcNavBtn.click();
        setTimeout(() => {
            const hostSelect = document.getElementById("remote-host-select");
            const scriptArea = document.getElementById("custom-command-input");
            if (hostSelect) {
                for (let i = 0; i < hostSelect.options.length; i++) {
                    if (hostSelect.options[i].text.toLowerCase().includes(praca.toLowerCase())) {
                        hostSelect.selectedIndex = i;
                        if (typeof addSelectedHost === "function") addSelectedHost();
                        break;
                    }
                }
            }
            if (scriptArea) {
                scriptArea.value = f.comando_auto_cura;
                scriptArea.scrollIntoView({ behavior: "smooth" });
                scriptArea.focus();
            }
        }, 300);
    }
}
window.executeMp4AutoHeal = executeMp4AutoHeal;

async function registerMp4ThresholdToConfigs() {
    if (!currentMp4AnalysisResult) return;
    const th = currentMp4AnalysisResult.falha_predominante.threshold_sugerido;
    if (!th) return;

    try {
        const token = (typeof getAiToken === "function") ? getAiToken() : (authToken || localStorage.getItem("fleet_token") || "");
        const resp = await fetch("/api/ai/mp4/register-threshold", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ threshold_data: th })
        });

        if (resp.ok) {
            alert(`✅ Limiar cadastrado com sucesso na aba Configurações!\n\nNome: ${th.name}\nValor Padrão: ${th.value} ${th.unit}\n\nVocê já pode ajustar e calibrar este parâmetro na aba Configurações.`);
            if (typeof goToConfigThreshold === "function") goToConfigThreshold(th.key);
        } else {
            const err = await resp.json();
            alert(`Erro ao cadastrar limiar: ${err.detail}`);
        }
    } catch (err) {
        alert(`Erro de conexão: ${err.message}`);
    }
}
window.registerMp4ThresholdToConfigs = registerMp4ThresholdToConfigs;

function escapeHtml(text) {
    if (!text) return "";
    return text.toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}


window.addEventListener("resize", () => {
    const historyContent = document.getElementById("signals-content-history");
    if (historyContent && historyContent.style.display !== "none" && signalsHistoryDataCache && signalsHistoryDataCache.history_points) {
        renderSignalsCanvasChart(signalsHistoryDataCache.history_points);
    }
});
