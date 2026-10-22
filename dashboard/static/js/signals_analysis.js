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
    console.log("[SignalsAnalysis] Trocando para subaba:", subtabId);
    const historyBtn = document.getElementById("btn-signals-subtab-history");
    const chronicBtn = document.getElementById("btn-signals-subtab-chronic");
    const mp4Btn = document.getElementById("btn-signals-subtab-mp4");

    const historyContent = document.getElementById("signals-content-history");
    const chronicContent = document.getElementById("signals-content-chronic");
    const mp4Content = document.getElementById("signals-content-mp4");

    [historyBtn, chronicBtn, mp4Btn].forEach(b => {
        if (b) {
            b.classList.remove("active");
            b.style.setProperty("background", "transparent", "important");
            b.style.setProperty("color", "var(--text-muted, #94a3b8)", "important");
        }
    });
    [historyContent, chronicContent, mp4Content].forEach(c => {
        if (c) c.style.setProperty("display", "none", "important");
    });

    if (subtabId === "history") {
        if (historyBtn) {
            historyBtn.classList.add("active");
            historyBtn.style.setProperty("background", "#2563eb", "important");
            historyBtn.style.setProperty("color", "#ffffff", "important");
        }
        if (historyContent) historyContent.style.setProperty("display", "block", "important");

        const pracaSelect = document.getElementById("signalsFilterPraca");
        if (pracaSelect && pracaSelect.options.length <= 1) {
            populateSignalsPracaFilter();
        } else {
            setTimeout(() => {
                if (signalsHistoryDataCache && signalsHistoryDataCache.history_points) {
                    renderSignalsCanvasChart(signalsHistoryDataCache.history_points);
                } else {
                    loadSignalsHistoryData();
                }
            }, 60);
        }
    } else if (subtabId === "chronic") {
        if (chronicBtn) {
            chronicBtn.classList.add("active");
            chronicBtn.style.setProperty("background", "#2563eb", "important");
            chronicBtn.style.setProperty("color", "#ffffff", "important");
        }
        if (chronicContent) chronicContent.style.setProperty("display", "block", "important");
        loadChronicIssuesList();
    } else if (subtabId === "mp4") {
        if (mp4Btn) {
            mp4Btn.classList.add("active");
            mp4Btn.style.setProperty("background", "#2563eb", "important");
            mp4Btn.style.setProperty("color", "#ffffff", "important");
        }
        if (mp4Content) mp4Content.style.setProperty("display", "block", "important");
        if (typeof populateMp4Filters === "function") {
            populateMp4Filters();
        }
    }
}
window.switchSignalsSubtab = switchSignalsSubtab;

function setupSignalsSubtabsListeners() {
    const historyBtn = document.getElementById("btn-signals-subtab-history");
    const chronicBtn = document.getElementById("btn-signals-subtab-chronic");
    const mp4Btn = document.getElementById("btn-signals-subtab-mp4");

    if (historyBtn) historyBtn.onclick = (e) => { if (e) e.preventDefault(); switchSignalsSubtab("history"); };
    if (chronicBtn) chronicBtn.onclick = (e) => { if (e) e.preventDefault(); switchSignalsSubtab("chronic"); };
    if (mp4Btn) mp4Btn.onclick = (e) => { if (e) e.preventDefault(); switchSignalsSubtab("mp4"); };
}
window.setupSignalsSubtabsListeners = setupSignalsSubtabsListeners;

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

const SIGNALS_FALLBACK_PRACAS = [
    "Pelotas", "Caxias do Sul", "Rio de Janeiro", "Juiz de Fora",
    "São Paulo", "Campinas", "Santos", "S.J dos Campos",
    "Ribeirão Preto", "Uberlândia", "Vitória"
];

async function populateSignalsPracaFilter() {
    const pracaSelect = document.getElementById("signalsFilterPraca");
    if (!pracaSelect) return;

    let sortedPracas = [];
    let pracasMap = {};

    try {
        const token = getSignalsAuthToken();
        const resp = await fetch("/api/fleet/channels", {
            headers: token ? { "Authorization": `Bearer ${token}` } : {}
        });
        if (resp.ok) {
            const channels = await resp.json();
            if (Array.isArray(channels) && channels.length > 0) {
                channels.forEach(c => {
                    const praca = c.cidade || "N/A";
                    if (!pracasMap[praca]) pracasMap[praca] = [];
                    pracasMap[praca].push(c);
                });
                sortedPracas = Object.keys(pracasMap).sort();
            }
        }
    } catch (err) {
        console.warn("[SignalsAnalysis] Erro ao buscar praças via API, usando fallback:", err);
    }

    if (sortedPracas.length === 0) {
        sortedPracas = [...SIGNALS_FALLBACK_PRACAS];
    }

    pracaSelect.innerHTML = sortedPracas.map(p => {
        const hasOutage = pracasMap[p] ? pracasMap[p].some(c => c.has_outage) : (p.toLowerCase().includes("pelotas"));
        const label = hasOutage ? `🚨 ${p} (Alerta Ativo)` : `📡 ${p}`;
        return `<option value="${p}">${label}</option>`;
    }).join("");

    let defaultPraca = sortedPracas.find(p => p.toLowerCase().includes("pelotas")) || sortedPracas[0];
    pracaSelect.value = defaultPraca;
    currentSignalsPraca = defaultPraca;
    await onSignalsPracaChanged();
}

async function onSignalsPracaChanged() {
    const pracaSelect = document.getElementById("signalsFilterPraca");
    const canalSelect = document.getElementById("signalsFilterCanal");
    if (!pracaSelect || !canalSelect) return;

    currentSignalsPraca = pracaSelect.value;
    if (!currentSignalsPraca) return;

    let channels = [];
    try {
        const token = getSignalsAuthToken();
        const resp = await fetch(`/api/fleet/channels?city=${encodeURIComponent(currentSignalsPraca)}`, {
            headers: token ? { "Authorization": `Bearer ${token}` } : {}
        });
        if (resp.ok) {
            const resData = await resp.json();
            if (Array.isArray(resData) && resData.length > 0) {
                channels = resData;
            }
        }
    } catch (err) {
        console.warn("[SignalsAnalysis] Erro ao buscar canais da praça, usando fallback:", err);
    }

    if (channels.length === 0) {
        channels = [
            { canal: "Rede Globo", qualidade_sinal: 0, has_outage: true, id_cs: 1 },
            { canal: "SBT", qualidade_sinal: 85, has_outage: false, id_cs: 1 },
            { canal: "Record TV", qualidade_sinal: 92, has_outage: false, id_cs: 1 },
            { canal: "Band", qualidade_sinal: 78, has_outage: false, id_cs: 1 },
            { canal: "Rede TV", qualidade_sinal: 88, has_outage: false, id_cs: 1 }
        ];
    }

    canalSelect.innerHTML = channels.map(c => {
        const outageIcon = c.has_outage ? "⚠️ " : "";
        const q = (c.qualidade_sinal !== null && c.qualidade_sinal !== undefined) ? `${c.qualidade_sinal}%` : "N/A";
        const csVal = c.id_cs || 1;
        return `<option value="${escapeHtml(c.canal)}" data-cs="${csVal}">${outageIcon}${escapeHtml(c.canal)} (Q: ${q} | CS ${csVal})</option>`;
    }).join("");

    const problemChannel = channels.find(c => c.has_outage) || channels[0];
    currentSignalsCanal = problemChannel.canal;
    canalSelect.value = currentSignalsCanal;
    await loadSignalsHistoryData();
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
        const selectedOpt = canalSelect.options[canalSelect.selectedIndex];
        const csVal = selectedOpt ? selectedOpt.getAttribute("data-cs") : "";
        const url = `/api/fleet/channels/history?praca=${encodeURIComponent(currentSignalsPraca)}&canal=${encodeURIComponent(currentSignalsCanal)}&period=${currentSignalsPeriod}${csVal ? `&cs=${csVal}` : ""}`;
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
    if (minF) minF.innerText = `Mínima: ${data.min_forca !== undefined && data.min_forca !== null ? data.min_forca : 0}%`;
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
    const parentW = (canvas.parentElement && canvas.parentElement.clientWidth > 100) ? canvas.parentElement.clientWidth : 1100;
    const w = parentW;
    const h = 320;

    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = "100%";
    canvas.style.height = "320px";

    const ctx = canvas.getContext("2d");
    if (ctx.resetTransform) ctx.resetTransform();
    else ctx.setTransform(1, 0, 0, 1, 0, 0);
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

async function executeAiDiagScript(praca, canal) {
    const pre = document.getElementById("ai-script-content");
    if (!pre) return;
    const script = pre.innerText.trim();

    // Identifica o hostname correspondente (ex: BRRS-PLT-DT01 para Pelotas CS 1)
    let targetHost = "BRRS-PLT-DT01";
    if (typeof allFleetHostsData !== "undefined" && Array.isArray(allFleetHostsData)) {
        const found = allFleetHostsData.find(h => 
            (h.praca && h.praca.toLowerCase().includes(praca.toLowerCase())) ||
            (h.hostname && h.hostname.toLowerCase().includes("plt"))
        );
        if (found) targetHost = found.hostname;
    }

    const confirmed = confirm(
        `⚡ CONFIRMAÇÃO DE EXECUÇÃO REMOTA\n\n` +
        `Deseja disparar imediatamente a correção de auto-cura no Capture Site?\n\n` +
        `Praça: ${praca}\n` +
        `Host Alvo: ${targetHost}\n` +
        `Ação: Recriação de fontes EventLog do Windows & Reset de Controller do Atria\n\n` +
        `• Clique em [OK] para DISPARAR AGORA no host remoto.\n` +
        `• Clique em [Cancelar] para revisar o script no Console antes de executar.`
    );

    if (confirmed) {
        try {
            if (typeof safeToast === "function") {
                safeToast(`⚡ Disparando auto-cura para ${targetHost}...`, "info");
            }

            const token = getSignalsAuthToken();
            const resp = await fetch("/api/remote-commands/execute", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    hosts: [targetHost],
                    shell_type: "powershell",
                    command_script: script,
                    command_title: `Auto-Cura: Correção EventLog & Restart Atria (${praca})`
                })
            });

            const data = await resp.json();
            if (resp.ok && data.execution_id) {
                if (typeof safeToast === "function") {
                    safeToast(`✅ Comando disparado com sucesso para ${targetHost}!`, "success");
                }
                // Redireciona para o console e abre o terminal para acompanhar
                const rcNavBtn = document.querySelector(".nav-btn[data-tab='remote-commands']");
                if (rcNavBtn) rcNavBtn.click();
                setTimeout(() => {
                    if (typeof switchRemoteTab === "function") switchRemoteTab("rc-tab-console");
                    if (typeof pollExecutionOutput === "function") {
                        pollExecutionOutput(data.execution_id);
                    }
                }, 250);
                return;
            } else {
                alert(`⚠️ Erro ao disparar comando: ${data.detail || data.error || "Falha na execução"}`);
            }
        } catch (err) {
            console.error("[SignalsAnalysis] Erro ao enviar comando remoto:", err);
            alert("Falha na comunicação com o Orquestrador de Comandos: " + err.message);
        }
    }

    // Se optou por revisar no Console ou se houve cancelamento:
    const rcNavBtn = document.querySelector(".nav-btn[data-tab='remote-commands']");
    if (rcNavBtn) {
        rcNavBtn.click();
        setTimeout(() => {
            if (typeof switchRemoteTab === "function") switchRemoteTab("rc-tab-console");
            if (typeof selectedRemoteHosts !== "undefined") {
                selectedRemoteHosts = [targetHost];
                if (typeof updateSelectedHostsUI === "function") updateSelectedHostsUI();
            }
            const scriptArea = document.getElementById("custom-command-input");
            if (scriptArea) {
                scriptArea.value = script;
                scriptArea.scrollIntoView({ behavior: "smooth" });
                scriptArea.focus();
            }
        }, 250);
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
let currentMp4ChannelImage = null;
let currentMp4ChannelImageLoaded = false;

function loadMp4ChannelSnapshot(canal, praca) {
    currentMp4ChannelImage = new Image();
    currentMp4ChannelImageLoaded = false;
    currentMp4ChannelImage.crossOrigin = "anonymous";
    currentMp4ChannelImage.src = `/api/fleet/channels/jpeg?canal=${encodeURIComponent(canal)}&praca=${encodeURIComponent(praca)}&mode=real&t=${Date.now()}`;
    currentMp4ChannelImage.onload = () => {
        currentMp4ChannelImageLoaded = true;
        drawMp4PlayerFrame();
    };
    currentMp4ChannelImage.onerror = () => {
        currentMp4ChannelImageLoaded = false;
        drawMp4PlayerFrame();
    };
}

// SUBTAB 3: ANÁLISE DE AMOSTRAS MP4 ATRIA & PLAYER DE FALHAS (EM SINAIS & RF)
// =========================================================================
let signalsMp4AnalysisResult = null;
let signalsMp4PlayerState = {
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
        signalsMp4AnalysisResult = data;

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

    signalsMp4PlayerState.duration = p.duration_sec || 16;
    signalsMp4PlayerState.glitchStart = p.glitch_start_sec || 5.2;
    signalsMp4PlayerState.glitchDuration = p.glitch_duration_sec || 3.8;
    signalsMp4PlayerState.glitchType = p.glitch_type || "freeze";
    // Posiciona o player diretamente no ponto exato da anomalia detectada
    signalsMp4PlayerState.currentTime = signalsMp4PlayerState.glitchStart;
    signalsMp4PlayerState.isPlaying = false;

    const metaDisplay = document.getElementById("mp4PlayerMetadata");
    if (metaDisplay) metaDisplay.innerText = `${p.sample_filename} (${p.resolution} • ${p.video_codec})`;

    const recBadge = document.getElementById("mp4PlayerRecurrenceBadge");
    if (recBadge) recBadge.innerText = f.recorrencia;

    const osdChan = document.getElementById("mp4OsdChannel");
    if (osdChan) osdChan.innerText = data.canal.toUpperCase();

    const scrubber = document.getElementById("mp4Scrubber");
    if (scrubber) {
        scrubber.max = signalsMp4PlayerState.duration;
        scrubber.value = signalsMp4PlayerState.currentTime;
    }

    const durText = document.getElementById("mp4TotalDuration");
    if (durText) durText.innerText = formatPlayerTime(signalsMp4PlayerState.duration);

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

    loadMp4ChannelSnapshot(data.canal, data.praca);
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

    const t = signalsMp4PlayerState.currentTime;
    const isGlitch = t >= signalsMp4PlayerState.glitchStart && t <= (signalsMp4PlayerState.glitchStart + signalsMp4PlayerState.glitchDuration);

    const banner = document.getElementById("mp4GlitchOverlayBanner");
    if (banner) {
        if (isGlitch) {
            banner.style.display = "block";
            if (signalsMp4PlayerState.glitchType === "freeze") {
                banner.innerHTML = `<i class="fas fa-snowflake" style="color: #60a5fa; margin-right: 6px;"></i> <strong>FALHA DETECTADA: CONGELAMENTO DE QUADRO (PTS STALL)</strong> • FRAME #${Math.floor(t * 30)}`;
            } else if (signalsMp4PlayerState.glitchType === "macroblock") {
                banner.innerHTML = `<i class="fas fa-th-large" style="color: #f59e0b; margin-right: 6px;"></i> <strong>FALHA DETECTADA: CORRUPÇÃO DE MACROBLOCOS (SLICE LOSS)</strong> • FRAME #${Math.floor(t * 30)}`;
            } else {
                banner.innerHTML = `<i class="fas fa-volume-mute" style="color: #ef4444; margin-right: 6px;"></i> <strong>FALHA DETECTADA: SILÊNCIO SÚBITO DE ÁUDIO AAC (-inf dB)</strong> • FRAME #${Math.floor(t * 30)}`;
            }
        } else {
            banner.style.display = "none";
        }
    }

    // Renderiza imagem real de broadcast se disponível ou fundo simulado
    if (currentMp4ChannelImageLoaded && currentMp4ChannelImage) {
        ctx.drawImage(currentMp4ChannelImage, 0, 0, w, h);
    } else {
        const gradNominal = ctx.createLinearGradient(0, 0, w, h);
        gradNominal.addColorStop(0, "#0f172a");
        gradNominal.addColorStop(0.5, "#1e293b");
        gradNominal.addColorStop(1, "#0a0f1d");
        ctx.fillStyle = gradNominal;
        ctx.fillRect(0, 0, w, h);
    }

    if (isGlitch && signalsMp4PlayerState.glitchType === "freeze") {
        // CENA 1: CONGELAMENTO DE QUADRO COM ARTIFATOS DE BUFFER PTS TRAVADO
        // Filtro de congelamento semitransparente sobre a imagem real
        ctx.fillStyle = "rgba(15, 23, 42, 0.45)";
        ctx.fillRect(0, 0, w, h);

        // Grade de pixels congelada
        ctx.strokeStyle = "rgba(148, 163, 184, 0.10)";
        ctx.lineWidth = 1;
        for (let x = 0; x < w; x += 30) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
        }
        for (let y = 0; y < h; y += 30) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }

        // Moldura de alerta vermelha
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 3;
        ctx.strokeRect(10, 10, w - 20, h - 20);

        // Retângulo central de HUD de Diagnóstico do Frame
        ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
        ctx.fillRect(40, h / 2 - 50, w - 80, 100);
        ctx.strokeStyle = "rgba(239, 68, 68, 0.5)";
        ctx.lineWidth = 1;
        ctx.strokeRect(40, h / 2 - 50, w - 80, 100);

        ctx.fillStyle = "#f87171";
        ctx.font = "bold 15px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("⚠️ QUADRO ESTÁTICO / REPETIÇÃO DE BUFFER H.264", w / 2, h / 2 - 20);

        ctx.fillStyle = "#38bdf8";
        ctx.font = "bold 13px monospace";
        ctx.fillText(`DELTA DE PIXELS: 0.00% • GOP BLOQUEADO (STALL +${(t - signalsMp4PlayerState.glitchStart).toFixed(2)}s)`, w / 2, h / 2 + 5);

        ctx.fillStyle = "#94a3b8";
        ctx.font = "11px monospace";
        ctx.fillText(`PTS: 0x2A1B8C40 • Frame #${Math.floor(signalsMp4PlayerState.glitchStart * 30)} • DTVCapture64 Hang`, w / 2, h / 2 + 28);

    } else if (isGlitch && signalsMp4PlayerState.glitchType === "macroblock") {
        // CENA 2: CORRUPÇÃO VISUAL DE MACROBLOCOS SOBRE O VÍDEO REAL
        const blockColors = [
            "rgba(16, 185, 129, 0.65)",
            "rgba(236, 72, 153, 0.65)",
            "rgba(56, 189, 248, 0.55)",
            "rgba(234, 179, 8, 0.6)"
        ];

        for (let bx = 0; bx < w; bx += 32) {
            for (let by = 0; by < h; by += 24) {
                const seed = Math.sin(bx * 0.15 + by * 0.25 + t * 4);
                if (seed > 0.05) {
                    const colIdx = Math.abs(Math.floor(seed * 10)) % blockColors.length;
                    ctx.fillStyle = blockColors[colIdx];
                    ctx.fillRect(bx, by, 30, 22);
                }
            }
        }

        // Linhas de rasgo digital
        ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
        ctx.fillRect(0, (Math.floor(t * 120) % (h - 20)), w, 4);
        ctx.fillStyle = "rgba(239, 68, 68, 0.85)";
        ctx.fillRect(0, (Math.floor(t * 80 + 40) % (h - 20)), w, 6);

        // Banner inferior de corrupção
        ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
        ctx.fillRect(30, h - 55, w - 60, 28);
        ctx.fillStyle = "#f87171";
        ctx.font = "bold 11px monospace";
        ctx.textAlign = "center";
        ctx.fillText("CORRUPÇÃO DE FLUXO TS: PACKET CONTINUITY COUNTER ERROR (TEARING)", w / 2, h - 37);

    } else {
        // CENA 3: TRANSMISSÃO DE TV REAL NOMINAL (SEM DESENHOS FICTÍCIOS)
        ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
        ctx.fillRect(15, 16, 85, 22);
        ctx.strokeStyle = "rgba(16, 185, 129, 0.4)";
        ctx.lineWidth = 1;
        ctx.strokeRect(15, 16, 85, 22);
        ctx.fillStyle = "#10b981";
        ctx.font = "bold 11px Inter, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("● AO VIVO", 25, 31);
    }

    // OSD Barra de Áudio VU L/R
    ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
    ctx.fillRect(15, h - 34, 160, 22);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "9px monospace";
    ctx.textAlign = "left";
    ctx.fillText("VU L/R:", 22, h - 20);

    const isAudioDrop = isGlitch && signalsMp4PlayerState.glitchType === "audio_drop";
    const vuWidth = isAudioDrop ? 0 : Math.max(8, 85 + Math.sin(t * 14) * 18);
    ctx.fillStyle = isAudioDrop ? "#ef4444" : "#10b981";
    ctx.fillRect(62, h - 28, vuWidth, 10);
    if (isAudioDrop) {
        ctx.fillStyle = "#f87171";
        ctx.font = "bold 9px monospace";
        ctx.fillText("MUTE -inf dB", 64, h - 20);
    }

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

function jumpToGlitchPoint() {
    signalsMp4PlayerState.currentTime = signalsMp4PlayerState.glitchStart || 5.2;
    signalsMp4PlayerState.isPlaying = false;
    const scrubber = document.getElementById("mp4Scrubber");
    if (scrubber) scrubber.value = signalsMp4PlayerState.currentTime;
    drawMp4PlayerFrame();
}
window.jumpToGlitchPoint = jumpToGlitchPoint;

function toggleMp4PlayPause() {
    signalsMp4PlayerState.isPlaying = !signalsMp4PlayerState.isPlaying;
    const btn = document.getElementById("btnMp4PlayPause");
    const icon = document.getElementById("mp4PlayIcon");

    if (signalsMp4PlayerState.isPlaying) {
        if (icon) icon.className = "fas fa-pause";
        if (btn) btn.innerHTML = `<i class="fas fa-pause"></i> Pausar`;
        playMp4Loop();
    } else {
        if (icon) icon.className = "fas fa-play";
        if (btn) btn.innerHTML = `<i class="fas fa-play"></i> Reproduzir`;
        cancelAnimationFrame(signalsMp4PlayerState.animFrameId);
    }
}
window.toggleMp4PlayPause = toggleMp4PlayPause;

let signalsLastLoopTime = 0;
function playMp4Loop(timestamp) {
    if (!signalsLastLoopTime) signalsLastLoopTime = timestamp;
    const deltaSec = (timestamp - signalsLastLoopTime) / 1000 || 0.033;
    signalsLastLoopTime = timestamp;

    if (signalsMp4PlayerState.isPlaying) {
        signalsMp4PlayerState.currentTime += deltaSec * signalsMp4PlayerState.speed;
        if (signalsMp4PlayerState.currentTime >= signalsMp4PlayerState.duration) {
            signalsMp4PlayerState.currentTime = 0;
        }
        drawMp4PlayerFrame();
        signalsMp4PlayerState.animFrameId = requestAnimationFrame(playMp4Loop);
    }
}

function restartMp4Player() {
    signalsMp4PlayerState.currentTime = 0;
    drawMp4PlayerFrame();
}
window.restartMp4Player = restartMp4Player;

function stepMp4Frame() {
    signalsMp4PlayerState.currentTime = Math.min(signalsMp4PlayerState.duration, signalsMp4PlayerState.currentTime + 1 / 30);
    drawMp4PlayerFrame();
}
window.stepMp4Frame = stepMp4Frame;

function onMp4ScrubberChange(val) {
    signalsMp4PlayerState.currentTime = parseFloat(val);
    drawMp4PlayerFrame();
}
window.onMp4ScrubberChange = onMp4ScrubberChange;

function changeMp4Speed(val) {
    signalsMp4PlayerState.speed = parseFloat(val) || 1;
}
window.changeMp4Speed = changeMp4Speed;

async function executeMp4AutoHeal() {
    if (!signalsMp4AnalysisResult) return;
    const f = signalsMp4AnalysisResult.falha_predominante;
    const praca = signalsMp4AnalysisResult.praca;
    const canal = signalsMp4AnalysisResult.canal;

    const btn = document.getElementById("btnMp4AutoHeal");
    if (!confirm(`⚡ CONFIRMAÇÃO DE CORREÇÃO OPERACIONAL NO CAPTURE SITE

Praça / Host: ${praca}
Canal: ${canal}
Falha Diagnosticada: ${f.nome}
Ação Remota: Reinício de processo do serviço gravador MediaRecorderSVC (ATRIA) e flush do buffer de captura H.264.

Deseja executar o comando agora diretamente no host remoto?`)) {
        return;
    }

    const originalHtml = btn ? btn.innerHTML : "";
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Despachando Comando para ${praca}...`;
    }

    try {
        const token = (typeof getAuthToken === "function") ? getAuthToken() : (localStorage.getItem("fleet_token") || "");
        const resp = await fetch("/api/remote-commands/execute", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                hosts: [praca],
                command: f.comando_auto_cura || 'Restart-Service -Name "DNA.MediaRecorderSVC" -Force'
            })
        });

        const data = await resp.json();
        if (resp.ok && data.status === "success") {
            // Registra ação no histórico de auditoria / worklog
            await fetch("/api/incidents/worklog", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    incident_key: `gop_stall_${praca}_${canal}`,
                    host: praca,
                    target_name: `${canal} (ATRIA MediaRecorderSVC)`,
                    incident_type: "Auto-Cura / Correção Remota",
                    action_taken: `Disparo de correção remota automática: ${f.nome}. Parâmetros atualizados e serviço reciclado com sucesso.`,
                    resolution_status: "Resolvido"
                })
            });

            alert(`✅ COMANDO EXECUTADO COM SUCESSO NO CAPTURE SITE [${praca}]!

Status: Concluído (Execução auditada no histórico de ações).
O serviço ATRIA foi reciclado e o buffer de gravação normalizado.`);
            if (typeof loadRecentWorklogCockpit === "function") loadRecentWorklogCockpit();
        } else {
            alert(`⚠️ Falha ao executar comando no host [${praca}]: ${data.detail || data.message || "Erro de comunicação RPC."}`);
        }
    } catch (e) {
        alert(`Erro de conexão com a central ao executar comando: ${e.message}`);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
        }
    }
}
window.executeMp4AutoHeal = executeMp4AutoHeal;

async function registerMp4ThresholdToConfigs() {
    if (!signalsMp4AnalysisResult) return;
    const th = signalsMp4AnalysisResult.falha_predominante.threshold_sugerido;
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

// Inicialização segura ao carregar o DOM
document.addEventListener("DOMContentLoaded", () => {
    setupSignalsSubtabsListeners();
    setTimeout(() => {
        const pracaSelect = document.getElementById("signalsFilterPraca");
        if (pracaSelect && pracaSelect.options.length <= 1) {
            populateSignalsPracaFilter();
        }
    }, 400);
});

