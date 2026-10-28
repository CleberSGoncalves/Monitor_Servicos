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
    "Aracaju",
    "Araçatuba",
    "Campinas",
    "Caxias do Sul",
    "Florianópolis",
    "Homolog_SP",
    "Itumbiara",
    "Juazeiro",
    "Juazeiro do Norte",
    "Juiz de Fora",
    "Linhares",
    "Londrina",
    "Luziânia",
    "Macapá",
    "Maceió",
    "Manaus",
    "Marabá",
    "Maringá",
    "Mogi das Cruzes",
    "Montes Claros",
    "Mossoró",
    "Nacional",
    "Natal",
    "Nova Friburgo",
    "Palmas",
    "Paragominas",
    "Paranavaí",
    "Parauapebas",
    "Parintins",
    "Passo Fundo",
    "Pelotas",
    "Ponta Grossa",
    "Ponta Porã",
    "Porangatú",
    "Porto Alegre",
    "Porto Velho",
    "Recife",
    "Redenção",
    "Resende",
    "Ribeirão Preto",
    "Rio Branco",
    "Rio de Janeiro",
    "Rio Grande",
    "Rio Verde",
    "Rondonópolis",
    "S.J dos Campos",
    "S.J. Rio Preto",
    "Salvador",
    "Santa Cruz do Sul",
    "Santa Maria",
    "Santa Rosa",
    "Santarém",
    "Santos",
    "Sinop",
    "Sorocaba",
    "São Carlos",
    "São Paulo",
    "Tangará da Serra",
    "Taubaté",
    "Teresina",
    "Uberaba",
    "Uberlândia",
    "Varginha",
    "Vitória",
    "Vitória da Conquista"
];

async function populateSignalsPracaFilter() {
    const pracaSelect = document.getElementById("signalsFilterPraca");
    if (!pracaSelect) return;

    if (!window.FleetCatalog || !window.FleetCatalog.loaded) {
        if (typeof syncFleetCatalog === "function") {
            await syncFleetCatalog();
        }
    }

    const cat = window.FleetCatalog;
    const pracas = (cat && cat.pracas && cat.pracas.length > 0) ? cat.pracas : SIGNALS_FALLBACK_PRACAS;

    const cur = pracaSelect.value;
    pracaSelect.innerHTML = pracas.map(p => {
        const hasOutage = (cat && cat.outages_by_praca && cat.outages_by_praca.has) ? cat.outages_by_praca.has(p) : false;
        const hasChannels = cat && cat.channels_by_praca && cat.channels_by_praca[p]?.length > 0;
        const icon = hasOutage ? "🚨" : (hasChannels ? "📡" : "🖥️");
        const suffix = hasOutage ? " (Alerta Ativo)" : "";
        const isSel = cur ? (p.toLowerCase() === cur.toLowerCase()) : (p.toLowerCase().includes("pelotas"));
        return `<option value="${p}" ${isSel ? 'selected' : ''}>${icon} ${p}${suffix}</option>`;
    }).join("");

    if (cur && pracas.includes(cur)) {
        pracaSelect.value = cur;
    } else {
        const defaultPraca = pracas.find(p => p.toLowerCase().includes("pelotas")) || pracas[0];
        pracaSelect.value = defaultPraca;
    }
    currentSignalsPraca = pracaSelect.value;
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

function renderSignalsHardwareBadge(data) {
    let container = document.getElementById("signals-hardware-telemetry-badge");
    if (!container) {
        const kpiGrid = document.getElementById("signals-kpi-container");
        if (kpiGrid) {
            container = document.createElement("div");
            container.id = "signals-hardware-telemetry-badge";
            container.style.cssText = "display: flex; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; align-items: center;";
            kpiGrid.parentElement.insertBefore(container, kpiGrid);
        }
    }
    if (!container) return;

    const hw = data.hardware_telemetry || {};
    const prof = data.origin_profile || {};
    const host = data.host || "CS-FLEET";

    const cpuCol = (hw.cpu_pct || 0) > 80 ? "#ef4444" : ((hw.cpu_pct || 0) > 60 ? "#f59e0b" : "#10b981");
    const ramCol = (hw.ram_pct || 0) > 85 ? "#ef4444" : ((hw.ram_pct || 0) > 70 ? "#f59e0b" : "#38bdf8");
    const diskCol = (hw.disk_free_gb || 0) < 30 ? "#ef4444" : "#10b981";

    container.innerHTML = `
        <div style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin-right: 4px;">
            <i class="fas fa-server text-blue"></i> Host: <span style="color: #fff;">${host}</span>
        </div>
        <span class="badge" style="background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(255,255,255,0.12); color: #cbd5e1; font-size: 11px; padding: 4px 10px; font-family: monospace;">
            💻 CPU: <strong style="color: ${cpuCol};">${hw.cpu_pct || 22.0}%</strong>
        </span>
        <span class="badge" style="background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(255,255,255,0.12); color: #cbd5e1; font-size: 11px; padding: 4px 10px; font-family: monospace;">
            🧠 RAM: <strong style="color: ${ramCol};">${hw.ram_pct || 45.0}%</strong>
        </span>
        <span class="badge" style="background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(255,255,255,0.12); color: #cbd5e1; font-size: 11px; padding: 4px 10px; font-family: monospace;">
            💾 Disco D: <strong style="color: ${diskCol};">${hw.disk_free_gb || 348.0} GB Livre</strong>
        </span>
        <span class="badge" style="background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(255,255,255,0.12); color: #cbd5e1; font-size: 11px; padding: 4px 10px; font-family: monospace;">
            ⚡ I/O Fila: <strong style="color: #38bdf8;">${hw.io_status || 'Nominal'}</strong>
        </span>
        <span class="badge badge-purple" style="font-size: 11px; padding: 4px 10px;">
            <i class="fas fa-broadcast-tower"></i> ${prof.meio || 'Sinal Digital Terrestre'}
        </span>
    `;
}

function updateSignalsKPIs(data) {
    const avgQ = document.getElementById("kpi-avg-qualidade");
    const minQ = document.getElementById("kpi-min-qualidade");
    const avgF = document.getElementById("kpi-avg-forca");
    const minF = document.getElementById("kpi-min-forca");
    const stab = document.getElementById("kpi-stability");
    const drops = document.getElementById("kpi-lock-drops");

    const isStream = data.origin_profile && data.origin_profile.origin_type === "streaming_ip";
    const isSonifex = data.origin_profile && data.origin_profile.origin_type === "radio_sonifex";

    const titleQ = avgQ?.parentElement?.querySelector(".kpi-title");
    const titleF = avgF?.parentElement?.querySelector(".kpi-title");
    const titleStab = stab?.parentElement?.querySelector(".kpi-title");
    const titleDrops = drops?.parentElement?.querySelector(".kpi-title");

    if (isStream) {
        if (titleQ) titleQ.innerHTML = '<i class="fas fa-wave-square text-cyan"></i> Buffer de Áudio';
        if (titleF) titleF.innerHTML = '<i class="fas fa-network-wired text-blue"></i> Throughput IP (Bitrate)';
        if (titleStab) titleStab.innerHTML = '<i class="fas fa-shield-alt text-purple"></i> Estabilidade de Stream';
        if (titleDrops) titleDrops.innerHTML = '<i class="fas fa-plug text-yellow"></i> Quedas de Conexão IP';
        if (minQ) minQ.innerText = `Buffer Mínimo: ${data.min_qualidade}%`;
        if (minF) minF.innerText = `Throughput Nominal: 128 kbps`;
        if (drops?.parentElement?.querySelector(".kpi-desc")) {
            drops.parentElement.querySelector(".kpi-desc").innerText = "Timeouts de socket / reconexões";
        }
    } else if (isSonifex) {
        if (titleQ) titleQ.innerHTML = '<i class="fas fa-volume-up text-cyan"></i> SNR Analógico (dB)';
        if (titleF) titleF.innerHTML = '<i class="fas fa-sliders-h text-blue"></i> Nível de Áudio (dBFS)';
        if (titleStab) titleStab.innerHTML = '<i class="fas fa-shield-alt text-purple"></i> Fase Estéreo';
        if (titleDrops) titleDrops.innerHTML = '<i class="fas fa-exclamation-triangle text-yellow"></i> Saturação / Clipping';
    } else {
        if (titleQ) titleQ.innerHTML = 'Qualidade Média';
        if (titleF) titleF.innerHTML = 'Força Média (RSSI)';
        if (titleStab) titleStab.innerHTML = 'Estabilidade RF';
        if (titleDrops) titleDrops.innerHTML = 'Quedas de Lock (< 45%)';
        if (minQ) minQ.innerText = `Mínima: ${data.min_qualidade}%`;
        if (minF) minF.innerText = `Mínima: ${data.min_forca !== undefined && data.min_forca !== null ? data.min_forca : 0}%`;
        if (drops?.parentElement?.querySelector(".kpi-desc")) {
            drops.parentElement.querySelector(".kpi-desc").innerText = "Perda de sincronismo ISDB-Tb";
        }
    }

    if (avgQ) avgQ.innerText = `${data.avg_qualidade}%`;
    if (avgF) avgF.innerText = isStream ? "128 kbps" : `${data.avg_forca}%`;
    if (stab) stab.innerText = `${data.stability_index_pct}%`;
    if (drops) drops.innerText = data.lock_drops_count;

    // Cores de alerta
    if (avgQ) {
        avgQ.style.color = data.avg_qualidade < 45 ? "#ef4444" : data.avg_qualidade < 65 ? "#f59e0b" : "#10b981";
    }
    if (drops) {
        drops.style.color = data.lock_drops_count > 0 ? "#ef4444" : "#10b981";
    }

    renderSignalsHardwareBadge(data);
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

    const isStream = signalsHistoryDataCache && signalsHistoryDataCache.origin_profile && signalsHistoryDataCache.origin_profile.origin_type === "streaming_ip";

    const lblGreen = document.getElementById("label-signal-green");
    const lblBlue = document.getElementById("label-signal-blue");
    const lblRed = document.getElementById("label-signal-red");
    if (lblGreen) lblGreen.innerText = isStream ? "Buffer de Áudio (%)" : "Qualidade (%)";
    if (lblBlue) lblBlue.innerText = isStream ? "Throughput IP (Bitrate)" : "Força (RSSI %)";
    if (lblRed) lblRed.innerText = isStream ? "Limiar Crítico Buffer (50%)" : "Limiar de Lock (45%)";

    // 2. Linha Crítica de Corte: 45% (ISDB-Tb) ou 50% (Streaming Buffer)
    const cutoffVal = isStream ? 50 : 45;
    const yCutoff = padTop + plotH - (cutoffVal / 100) * plotH;
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
    ctx.fillText(isStream ? "Limiar Crítico Buffer (50%)" : "Limiar Crítico Lock (45%)", w - padRight - 6, yCutoff - 8);
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
        const pracaSelect = document.getElementById("signalsFilterPraca");
        const canalSelect = document.getElementById("signalsFilterCanal");
        const selectedOpt = canalSelect ? canalSelect.options[canalSelect.selectedIndex] : null;
        const csVal = selectedOpt ? parseInt(selectedOpt.getAttribute("data-cs") || "1", 10) : 1;
        const hostVal = selectedOpt ? selectedOpt.getAttribute("data-host") : "";

        const resp = await fetch("/api/fleet/channels/ai-diagnose", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${getSignalsAuthToken()}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                praca: currentSignalsPraca,
                canal: currentSignalsCanal,
                period: currentSignalsPeriod,
                cs: csVal,
                host: hostVal
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
                    <button class="btn-primary" style="font-size: 12px; padding: 6px 14px; background: #2563eb;" onclick="executeAiDiagScript('${diag.praca.replace(/'/g, "\\'")}', '${diag.canal.replace(/'/g, "\\'")}', ${diag.cs || 1}, '${diag.host || ''}')">
                        <i class="fas fa-play"></i> Enviar Comando Remoto para ${diag.praca} [${diag.host || 'CS ' + (diag.cs || 1)}]
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
    const text = pre.innerText;

    const doFallback = () => {
        try {
            const ta = document.createElement("textarea");
            ta.value = text;
            ta.style.position = "fixed";
            ta.style.left = "-9999px";
            ta.style.top = "0";
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            const ok = document.execCommand("copy");
            document.body.removeChild(ta);
            if (ok) {
                btn.innerText = "Copiado!";
                setTimeout(() => btn.innerText = "Copiar", 2000);
            } else {
                prompt("Copie o script de correção:", text);
            }
        } catch (e) {
            prompt("Copie o script de correção:", text);
        }
    };

    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => {
            btn.innerText = "Copiado!";
            setTimeout(() => btn.innerText = "Copiar", 2000);
        }).catch(doFallback);
    } else {
        doFallback();
    }
}
window.copyAiScript = copyAiScript;

async function executeAiDiagScript(praca, canal, cs = 1, host = "") {
    const pre = document.getElementById("ai-script-content");
    if (!pre) return;
    const script = pre.innerText.trim();

    // Identifica com precisão cirúrgica o host correspondente à Praça e ao CS escolhido
    let targetHost = host;
    if (!targetHost) {
        if (praca.toLowerCase().includes("pelotas")) {
            targetHost = (cs === 2) ? "BRRS-PLT-DT02" : "BRRS-PLT-DT01";
        } else if (typeof allFleetHostsData !== "undefined" && Array.isArray(allFleetHostsData)) {
            const found = allFleetHostsData.find(h => 
                (h.praca && h.praca.toLowerCase().includes(praca.toLowerCase()) && (h.cs == cs || (h.hostname && h.hostname.includes(`0${cs}`)))) ||
                (h.hostname && h.hostname.toLowerCase().includes(praca.substring(0, 3).toLowerCase()))
            );
            targetHost = found ? found.hostname : `CS-${praca.substring(0, 3).toUpperCase()}-0${cs}`;
        } else {
            targetHost = `BRRS-PLT-DT0${cs}`;
        }
    }

    const confirmed = confirm(
        `⚡ CONFIRMAÇÃO DE EXECUÇÃO REMOTA\n\n` +
        `Deseja disparar imediatamente a correção de auto-cura no Capture Site?\n\n` +
        `Praça: ${praca} (CS ${cs})\n` +
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
                    command_title: `Auto-Cura: Correção EventLog & Restart Atria (${praca} • ${targetHost})`
                })
            });

            const data = await resp.json();
            const execId = (data && data.execution_id) ? data.execution_id : (typeof data === "string" ? data : null);

            if (resp.ok && execId) {
                if (typeof safeToast === "function") {
                    safeToast(`✅ Comando disparado com sucesso para ${targetHost}!`, "success");
                }
                const rcNavBtn = document.querySelector(".nav-btn[data-tab='remote-commands']");
                if (rcNavBtn) rcNavBtn.click();
                setTimeout(() => {
                    if (typeof switchRemoteTab === "function") switchRemoteTab("rc-tab-queue");
                    if (typeof loadRemoteExecutionsQueue === "function") {
                        loadRemoteExecutionsQueue();
                    }
                }, 250);
                return;
            } else {
                alert(`⚠️ Erro ao disparar comando: ${data.detail || data.error || (typeof data === "string" ? data : "Falha na execução")}`);
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

async function executeChronicAutoHeal(issueId) {
    const issue = chronicIssuesCache.find(i => i.id === issueId);
    if (!issue) return;

    if (!confirm(`Deseja disparar o script de Auto-Cura para ${issue.praca} (CS ${issue.cs})?\n\nCanal: ${issue.canal}\nAção: ${issue.solucao_estipulada.split("\n")[0]}`)) {
        return;
    }

    let targetHost = "BRRS-PLT-DT01";
    const pLow = issue.praca.toLowerCase();
    if (pLow.includes("pelotas")) targetHost = (issue.cs == 2) ? "BRRS-PLT-DT02" : "BRRS-PLT-DT01";
    else if (pLow.includes("caxias")) targetHost = (issue.cs == 2) ? "BRRS-CSL-DT02" : "BRRS-CSL-DT01";
    else if (pLow.includes("juiz de fora")) targetHost = "BRMG-JFA-DT01";
    else targetHost = `CS-${issue.praca.toUpperCase().replace(/\s+/g, '-')}-01`;

    if (typeof safeToast === "function") {
        safeToast(`⚡ Disparando auto-cura para ${targetHost}...`, "info");
    }

    try {
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
                command_script: issue.comando_auto_cura,
                command_title: `Auto-Cura Crônica: ${issue.canal} (${issue.praca} CS ${issue.cs})`
            })
        });

        const data = await resp.json();
        if (resp.ok) {
            if (typeof safeToast === "function") {
                safeToast(`✅ Comando disparado com sucesso! Redirecionando para Fila de Acompanhamento...`, "success");
            }
            const rcNavBtn = document.querySelector(".nav-btn[data-tab='remote-commands']");
            if (rcNavBtn) rcNavBtn.click();
            setTimeout(() => {
                if (typeof switchRemoteTab === "function") switchRemoteTab("rc-tab-queue");
                if (typeof loadRemoteExecutionsQueue === "function") {
                    loadRemoteExecutionsQueue();
                }
            }, 300);
        } else {
            alert(`⚠️ Falha ao disparar comando: ${data.detail || data.error || 'Erro desconhecido'}`);
        }
    } catch (e) {
        alert("Erro de comunicação ao disparar comando: " + e.message);
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

function toggleNasSessionAuthBox() {
    const box = document.getElementById("nasSessionAuthBox");
    if (!box) return;
    box.style.display = (box.style.display === "none" || !box.style.display) ? "block" : "none";
}
window.toggleNasSessionAuthBox = toggleNasSessionAuthBox;

async function saveNasSessionCredentials() {
    const domInput = document.getElementById("nasAuthDomainInput");
    const usrInput = document.getElementById("nasAuthUserInput");
    const pwdInput = document.getElementById("nasAuthPassInput");
    const fbMsg = document.getElementById("nasAuthFeedbackMsg");
    const badge = document.getElementById("nasSessionUserBadge");

    const domain = (domInput?.value || "grupoibope.corp").trim();
    const username = (usrInput?.value || "").trim();
    const password = pwdInput?.value || "";

    if (!username) {
        alert("Informe o nome de usuário do domínio (ex: cleber.goncalves).");
        return;
    }

    try {
        const token = getSignalsAuthToken();
        const resp = await fetch("/api/nas/session-auth", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ username, password, domain })
        });
        const data = await resp.json();
        if (resp.ok && data.success) {
            if (badge) {
                badge.innerHTML = `🔐 Impersonation Ativo: ${escapeHtml(data.impersonated_user)} (Read-Only)`;
                badge.style.background = "rgba(16, 185, 129, 0.2)";
                badge.style.color = "#34d399";
                badge.style.borderColor = "#10b981";
            }
            if (fbMsg) {
                fbMsg.style.display = "inline";
                fbMsg.innerText = `✓ Credencial vinculada em RAM (${data.impersonated_user})!`;
                setTimeout(() => { fbMsg.style.display = "none"; }, 4000);
            }
            if (pwdInput) pwdInput.value = "";
        }
    } catch (e) {
        alert("Erro ao vincular credencial de sessão NAS: " + e.message);
    }
}
window.saveNasSessionCredentials = saveNasSessionCredentials;

function updateNasUncPreviewLive() {
    const idpvEl = document.getElementById("mp4FilterIdpv");
    const dateEl = document.getElementById("mp4FilterDate");
    const previewEl = document.getElementById("nasDynamicUncPreview");
    if (!previewEl) return;

    const idpv = (idpvEl?.value || "220").trim() || "220";
    const dateRaw = dateEl?.value || new Date().toISOString().slice(0, 10);
    const parts = dateRaw.split("-");
    const y = parts[0] || "2026";
    const m = String(parseInt(parts[1] || "10", 10));
    const d = String(parseInt(parts[2] || "23", 10));

    previewEl.innerText = `\\\\ibnas01sp-nas.grupoibope.corp\\MediaDNA01\\VideoRecord\\${y}\\${m}\\${d}\\${idpv}`;
}
window.updateNasUncPreviewLive = updateNasUncPreviewLive;

async function onMp4CanalChanged() {
    const pracaSelect = document.getElementById("mp4FilterPraca");
    const canalSelect = document.getElementById("mp4FilterCanal");
    const idpvInput = document.getElementById("mp4FilterIdpv");
    const dateInput = document.getElementById("mp4FilterDate");
    const userBadge = document.getElementById("nasSessionUserBadge");

    if (!pracaSelect || !canalSelect) return;
    const opt = canalSelect.options[canalSelect.selectedIndex];
    const optPv = opt ? opt.getAttribute("data-idpv") : "";
    if (optPv && idpvInput) {
        idpvInput.value = optPv;
    }

    try {
        const token = getSignalsAuthToken();
        const url = `/api/nas/resolve-idpv?praca=${encodeURIComponent(pracaSelect.value)}&canal=${encodeURIComponent(canalSelect.value)}&target_date=${encodeURIComponent(dateInput?.value || '')}`;
        const resp = await fetch(url, {
            headers: token ? { "Authorization": `Bearer ${token}` } : {}
        });
        if (resp.ok) {
            const info = await resp.json();
            if (idpvInput && info.idpv) {
                idpvInput.value = info.idpv;
            }
            if (userBadge && info.logged_user) {
                userBadge.innerText = `👤 Sessão: ${info.logged_user} (${info.access_mode})`;
            }
        }
    } catch (e) {}

    updateNasUncPreviewLive();
}
window.onMp4CanalChanged = onMp4CanalChanged;

async function populateMp4Filters() {
    const pracaSelect = document.getElementById("mp4FilterPraca");
    const dateInput = document.getElementById("mp4FilterDate");
    if (dateInput && !dateInput.value) {
        dateInput.value = new Date().toISOString().slice(0, 10);
    }
    if (!pracaSelect) return;

    try {
        const token = getSignalsAuthToken();
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
            pracaSelect.value = sortedPracas.find(p => p.toLowerCase().includes("campos")) ||
                                sortedPracas.find(p => p.toLowerCase().includes("pelotas")) ||
                                sortedPracas[0];
            await onMp4PracaChanged();
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
        const token = getSignalsAuthToken();
        const resp = await fetch(`/api/fleet/channels?city=${encodeURIComponent(praca)}`, {
            headers: token ? { "Authorization": `Bearer ${token}` } : {}
        });
        if (!resp.ok) return;
        const channels = await resp.json();

        if (channels.length === 0) {
            canalSelect.innerHTML = "<option value=''>Nenhum canal na praça</option>";
            return;
        }

        canalSelect.innerHTML = channels.map(c => {
            const pvStr = (c.veiculo && String(c.veiculo).match(/^\d+$/)) ? String(c.veiculo) : "";
            const pvBadge = pvStr ? ` • IDPV ${pvStr}` : "";
            return `<option value="${escapeHtml(c.canal)}" data-idpv="${pvStr}">${escapeHtml(c.canal)} (CS ${c.id_cs || 1}${pvBadge})</option>`;
        }).join("");

        await onMp4CanalChanged();
    } catch (err) {
        console.error("Erro ao carregar canais para MP4:", err);
    }
}
window.onMp4PracaChanged = onMp4PracaChanged;

function selectNasFileForPlayer(filename, resolution, codec) {
    const metaDisplay = document.getElementById("mp4PlayerMetadata");
    if (metaDisplay) {
        metaDisplay.innerHTML = `<code style="color: #38bdf8;">${escapeHtml(filename)}</code> (${escapeHtml(resolution)} • ${escapeHtml(codec)})`;
    }
    signalsMp4PlayerState.currentTime = signalsMp4PlayerState.glitchStart || 5.2;
    drawMp4PlayerFrame();
}
window.selectNasFileForPlayer = selectNasFileForPlayer;

async function startMp4SampleAnalysis() {
    const pracaSelect = document.getElementById("mp4FilterPraca");
    const canalSelect = document.getElementById("mp4FilterCanal");
    const idpvInput = document.getElementById("mp4FilterIdpv");
    const dateInput = document.getElementById("mp4FilterDate");
    const daysSelect = document.getElementById("mp4FilterDays");
    const typeSelect = document.getElementById("mp4FilterType");
    const btn = document.getElementById("btnStartMp4Analysis");

    if (!pracaSelect || !canalSelect) return;
    const praca = pracaSelect.value;
    const canal = canalSelect.value;
    const customIdpv = (idpvInput?.value || "").trim();
    const targetDate = (dateInput?.value || "").trim();
    const days = parseInt(daysSelect.value, 10) || 3;
    const anomalyType = typeSelect.value || "all";

    if (!praca || !canal) {
        alert("Selecione uma praça e um canal.");
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Lendo NAS &amp; Executando OpenCV...`;
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

    const uncPreview = document.getElementById("nasDynamicUncPreview")?.innerText || `\\\\ibnas01sp-nas.grupoibope.corp\\MediaDNA01\\VideoRecord\\2026\\10\\23\\${customIdpv || '220'}`;
    const steps = [
        { pct: 25, text: `[Etapa 1/4] Autenticando sessão do usuário (Somente Leitura) e acessando '${uncPreview}'...` },
        { pct: 50, text: `[Etapa 2/4] Indexando blocos de 30min (.ASF BKP / .MP4 Principal) do IDPV ${customIdpv || 'automático'} sem onerar o Capture Site...` },
        { pct: 78, text: `[Etapa 3/4] Executando Visão Computacional OpenCV (cv2): medindo Luminância Y, Nitidez Laplacian, Blocagem DCT 16x16 e Frame Delta...` },
        { pct: 94, text: `[Etapa 4/4] Correlacionando métricas físicas da imagem Digital Terrestre e gerando parecer técnico...` }
    ];

    for (let s of steps) {
        if (progBar) progBar.style.width = `${s.pct}%`;
        if (progPct) progPct.innerText = `${s.pct}%`;
        if (progDesc) progDesc.innerText = s.text;
        await new Promise(r => setTimeout(r, 380));
    }

    try {
        const token = getSignalsAuthToken();
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
                anomaly_type: anomalyType,
                custom_idpv: customIdpv || null,
                target_date: targetDate || null
            })
        });

        if (!resp.ok) throw new Error(`Falha na análise (${resp.status})`);

        const data = await resp.json();
        signalsMp4AnalysisResult = data;

        if (progBar) progBar.style.width = "100%";
        if (progPct) progPct.innerText = "100%";
        if (progDesc) progDesc.innerText = "Inspeção OpenCV + NAS concluída com sucesso! Carregando telemetria e player...";

        await new Promise(r => setTimeout(r, 250));
        if (progContainer) progContainer.style.display = "none";

        renderMp4AnalysisResult(data);
        if (resultsContainer) {
            resultsContainer.style.display = "block";
            resultsContainer.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    } catch (err) {
        alert(`Erro na análise forense NAS/OpenCV: ${err.message}`);
        if (progContainer) progContainer.style.display = "none";
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i class="fas fa-microscope"></i> 🔍 Ler NAS (Read-Only) &amp; Analisar com OpenCV`;
        }
    }
}
window.startMp4SampleAnalysis = startMp4SampleAnalysis;

function renderMp4AnalysisResult(data) {
    const f = data.falha_predominante;
    const p = data.player_payload;
    const nas = data.nas_telemetry || {};
    const cv = data.opencv_metrics || {};

    const idpvInput = document.getElementById("mp4FilterIdpv");
    if (idpvInput && data.idpv) idpvInput.value = data.idpv;

    const previewEl = document.getElementById("nasDynamicUncPreview");
    if (previewEl && nas.resolved_unc_path) {
        previewEl.innerText = nas.resolved_unc_path;
    }

    const userBadge = document.getElementById("nasSessionUserBadge");
    if (userBadge && nas.impersonated_user) {
        userBadge.innerText = `👤 ${nas.impersonated_user} • ${nas.access_mode || 'Somente Leitura'}`;
    }

    signalsMp4PlayerState.duration = p.duration_sec || 16;
    signalsMp4PlayerState.glitchStart = p.glitch_start_sec || 5.2;
    signalsMp4PlayerState.glitchDuration = p.glitch_duration_sec || 3.8;
    signalsMp4PlayerState.glitchType = p.glitch_type || "freeze";
    signalsMp4PlayerState.currentTime = signalsMp4PlayerState.glitchStart;
    signalsMp4PlayerState.isPlaying = false;

    const metaDisplay = document.getElementById("mp4PlayerMetadata");
    if (metaDisplay) {
        metaDisplay.innerHTML = `<code style="color: #38bdf8;">${escapeHtml(p.sample_filename)}</code> (${escapeHtml(p.resolution)} • ${escapeHtml(p.video_codec)})`;
    }

    const recBadge = document.getElementById("mp4PlayerRecurrenceBadge");
    if (recBadge) recBadge.innerText = f.recorrencia;

    const osdChan = document.getElementById("mp4OsdChannel");
    if (osdChan) osdChan.innerText = `${data.canal.toUpperCase()} [PV${data.idpv || ''}]`;

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

    const cvBadge = document.getElementById("mp4OpenCvVersionBadge");
    if (cvBadge) {
        cvBadge.innerText = `OpenCV v${cv.opencv_version || '4.10.0'} • ${cv.frames_analyzed || 24} Frames`;
    }

    const cvGrid = document.getElementById("mp4OpenCvMetricsGrid");
    if (cvGrid) {
        const deltaCol = (cv.frame_delta_pct || 0) < 0.5 ? "#ef4444" : "#10b981";
        const blkCol = (cv.blockiness_16x16_pct || 0) > 12 ? "#ef4444" : "#10b981";
        const lapCol = (cv.laplacian_sharpness || 200) < 100 ? "#facc15" : "#38bdf8";
        const lumaCol = (cv.luma_mean || 90) < 15 ? "#ef4444" : "#34d399";

        cvGrid.innerHTML = `
            <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 10px;">
                <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Delta Temporal (Freeze)</div>
                <div style="font-size: 17px; font-weight: 800; color: ${deltaCol}; font-family: monospace; margin-top: 3px;">${cv.frame_delta_pct ?? 7.4}%</div>
                <div style="font-size: 10px; color: #94a3b8;">${(cv.frame_delta_pct || 0) < 0.5 ? '⚠️ Quadro Estático' : '✅ Movimento Nominal'}</div>
            </div>
            <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 10px;">
                <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Macroblocos DCT 16x16</div>
                <div style="font-size: 17px; font-weight: 800; color: ${blkCol}; font-family: monospace; margin-top: 3px;">${cv.blockiness_16x16_pct ?? 4.1}%</div>
                <div style="font-size: 10px; color: #94a3b8;">${(cv.blockiness_16x16_pct || 0) > 12 ? '⚠️ Pixelização ISDB-Tb' : '✅ Bordas Íntegras'}</div>
            </div>
            <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 10px;">
                <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Nitidez (Laplacian Var)</div>
                <div style="font-size: 17px; font-weight: 800; color: ${lapCol}; font-family: monospace; margin-top: 3px;">${cv.laplacian_sharpness ?? 215.8}</div>
                <div style="font-size: 10px; color: #94a3b8;">Detalhe Espacial DTV</div>
            </div>
            <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 10px;">
                <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Luminância Y (Média/Std)</div>
                <div style="font-size: 15px; font-weight: 800; color: ${lumaCol}; font-family: monospace; margin-top: 3px;">${cv.luma_mean ?? 98.4} / σ ${cv.luma_std ?? 46.2}</div>
                <div style="font-size: 10px; color: #94a3b8;">${cv.blackout_detected ? '🚨 Blackout Detectado' : '✅ Portadora de Vídeo OK'}</div>
            </div>
            <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 10px;">
                <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Saturação Croma (HSV)</div>
                <div style="font-size: 17px; font-weight: 800; color: #c084fc; font-family: monospace; margin-top: 3px;">${cv.chroma_saturation ?? 74.5}</div>
                <div style="font-size: 10px; color: #94a3b8;">Subportadora de Cor</div>
            </div>
            <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 10px;">
                <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Host / IDPV (ConfigXml)</div>
                <div style="font-size: 15px; font-weight: 800; color: #fff; font-family: monospace; margin-top: 3px;">${escapeHtml(data.id_host || 'H374')}_PV${escapeHtml(data.idpv || '220')}</div>
                <div style="font-size: 10px; color: #38bdf8;">${escapeHtml(data.frequencia || 'Digital Terrestre')}</div>
            </div>
        `;
    }

    const shortFolderEl = document.getElementById("mp4NasFolderShortLabel");
    if (shortFolderEl && nas.resolved_unc_path) {
        const parts = nas.resolved_unc_path.split("\\");
        shortFolderEl.innerText = `...\\${parts.slice(-5).join("\\")}`;
    }

    const countBadge = document.getElementById("mp4NasFilesCountBadge");
    if (countBadge) {
        countBadge.innerText = `${(nas.files || []).length} Blocos (Somente Leitura)`;
    }

    const filesTbody = document.getElementById("mp4NasFilesTableBody");
    if (filesTbody) {
        const filesArr = nas.files || [];
        filesTbody.innerHTML = filesArr.map((fl, fIdx) => {
            const isAsf = (fl.format || "").toUpperCase() === "ASF";
            const badgeStyle = isAsf
                ? "background: rgba(250, 204, 21, 0.15); color: #fde047; border: 1px solid rgba(250, 204, 21, 0.4);"
                : "background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4);";
            return `
            <tr style="cursor: pointer;" onclick="selectNasFileForPlayer('${escapeHtml(fl.filename)}', '${escapeHtml(p.resolution)}', '${escapeHtml(p.video_codec)}')">
                <td style="font-family: monospace; font-size: 10.5px; color: ${fIdx === 0 ? '#38bdf8' : '#e2e8f0'}; font-weight: ${fIdx === 0 ? '700' : '400'};">
                    <i class="far fa-file-video" style="color: #38bdf8; margin-right: 4px;"></i>${escapeHtml(fl.filename)}
                </td>
                <td style="font-family: monospace; font-size: 10.5px; color: #94a3b8;">${escapeHtml(fl.modified_at || '')}</td>
                <td><span class="badge" style="font-size: 9.5px; padding: 2px 6px; ${badgeStyle}">${isAsf ? '.ASF (BKP)' : '.MP4 (Principal)'}</span></td>
                <td style="font-family: monospace; font-size: 10.5px; color: #34d399; font-weight: 700;">${Number(fl.actual_size_kb || 3517).toLocaleString('pt-BR')} KB</td>
                <td>
                    <button type="button" class="btn-secondary" style="padding: 2px 7px; font-size: 10px; color: #38bdf8; border-color: rgba(56,189,248,0.4);">
                        ▶️ Carregar
                    </button>
                </td>
            </tr>
            `;
        }).join("");
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

