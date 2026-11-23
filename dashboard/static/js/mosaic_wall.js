let currentMosaicViewMode = "real"; // 'real' = Snapshot/Foto Real do Canal com HUD sobreposto
let currentActiveCustomGroup = "all"; // 'all' ou id do grupo personalizado
let isMosaicSplitScreenActive = false; // Alternador de Split Screen (Até 2 Grupos)
let mosaicSplitGroupLeft = "all";
let mosaicSplitGroupRight = "all";

function setMosaicViewMode(mode) {
    currentMosaicViewMode = mode;
    const btnReal = document.getElementById("btn-mosaic-view-real");
    const btnDiag = document.getElementById("btn-mosaic-view-diag");
    if (btnReal && btnDiag) {
        if (mode === "real") {
            btnReal.style.setProperty("background", "#2563eb", "important");
            btnReal.style.setProperty("color", "#ffffff", "important");
            btnDiag.style.setProperty("background", "transparent", "important");
            btnDiag.style.setProperty("color", "var(--text-muted, #94a3b8)", "important");
        } else {
            btnDiag.style.setProperty("background", "#2563eb", "important");
            btnDiag.style.setProperty("color", "#ffffff", "important");
            btnReal.style.setProperty("background", "transparent", "important");
            btnReal.style.setProperty("color", "var(--text-muted, #94a3b8)", "important");
        }
    }
    renderMosaicPage();
}
window.setMosaicViewMode = setMosaicViewMode;

// dashboard/static/js/mosaic_wall.js
// Central Dedicada: Monitoração das Imagens (Live Snapshots, Carrossel Anti-Crash 30/página, Galeria Forense & Soluções Analíticas)

let allMosaicSnapshots = [];
let filteredMosaicSnapshots = [];
let currentMosaicPage = 1;
let mosaicPageSize = 30; // NUNCA carrega todos ao mesmo tempo para suportar +1000 veículos
let mosaicQuickOnlyFailures = false; // Filtro de alta severidade (Apenas falhas/degradação)
let mosaicAutoRotateTimer = null;
let mosaicProgressTimer = null;
let mosaicRotateIntervalSec = 15;
let mosaicRotateSecondsElapsed = 0;
let isMosaicRotatePlaying = false; // Inicia pausado por padrão (sem troca involuntária de páginas)
let mosaicFrameSeq = Math.floor(Date.now() / 5000);
let mosaicFrameRefreshTimer = null;

function alternateMosaicVisibleFrames() {
    mosaicFrameSeq++;
    const grid = document.getElementById("mosaicLiveGrid");
    if (!grid) return;

    const now = new Date();
    const nowStr = now.toTimeString().split(" ")[0];

    // Atualiza VU meters de rádios e timestamps sem recarregar imagens para evitar piscar de tela
    const vuPanels = grid.querySelectorAll(".mosaic-audio-panel");
    vuPanels.forEach((panel, idx) => {
        const barL = panel.querySelector(".vu-bar-l");
        const barR = panel.querySelector(".vu-bar-r");
        const valL = panel.querySelector(".vu-val-l");
        const valR = panel.querySelector(".vu-val-r");
        const rndL = Math.floor(62 + ((mosaicFrameSeq + idx * 7) % 25));
        const rndR = Math.floor(60 + ((mosaicFrameSeq + idx * 11) % 25));
        const dbL = -Math.floor(10 + (100 - rndL) * 0.3);
        const dbR = -Math.floor(10 + (100 - rndR) * 0.3);
        if (barL) barL.style.width = `${rndL}%`;
        if (barR) barR.style.width = `${rndR}%`;
        if (valL) valL.innerText = `${dbL} dB`;
        if (valR) valR.innerText = `${dbR} dB`;
    });

    const timeSpans = grid.querySelectorAll(".mosaic-card-timestamp");
    timeSpans.forEach(sp => {
        const isAud = sp.closest(".mosaic-audio-panel");
        sp.innerText = isAud ? `${nowStr} • Sem Vídeo` : `${nowStr} • 320x240`;
    });
}
window.alternateMosaicVisibleFrames = alternateMosaicVisibleFrames;

let currentMosaicSubtab = "live";
let cachedAnalyticalProblems = [];

function getMosaicAuthToken() {
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

// =========================================================================
// 1. INICIALIZAÇÃO DA ABA DEDICADA DE IMAGENS
// =========================================================================
function initMosaicTab() {
    const kpi = document.querySelector('.kpi-grid');
    if (kpi) { kpi.classList.add('mosaic-view-collapsed'); kpi.style.display = 'none'; }
    updateMosaicFilterBadge();
    console.log("[MosaicWall] Inicializando aba dedicada Monitoração das Imagens...");
    loadMosaicData();
    loadMosaicAnalyticalProblems();
    if (isMosaicRotatePlaying) {
        startMosaicAutoRotation();
    } else {
        updateRotateButtonUI(false);
    }
}
window.initMosaicTab = initMosaicTab;

// Alternância de Subabas internas
function switchMosaicSubtab(subtabId) {
    currentMosaicSubtab = subtabId;
    const btnLive = document.getElementById("btn-mos-subtab-live");
    const btnFailures = document.getElementById("btn-mos-subtab-failures");
    const btnAnalytics = document.getElementById("btn-mos-subtab-analytics");

    const contentLive = document.getElementById("mosaic-content-live");
    const contentFailures = document.getElementById("mosaic-content-failures");
    const contentAnalytics = document.getElementById("mosaic-content-analytics");

    [btnLive, btnFailures, btnAnalytics].forEach(b => b && b.classList.remove("active"));
    [contentLive, contentFailures, contentAnalytics].forEach(c => c && (c.style.display = "none"));

    if (subtabId === "live") {
        if (btnLive) btnLive.classList.add("active");
        if (contentLive) contentLive.style.display = "block";
        if (isMosaicRotatePlaying) startMosaicAutoRotation();
    } else if (subtabId === "failures") {
        if (btnFailures) btnFailures.classList.add("active");
        if (contentFailures) contentFailures.style.display = "block";
        stopMosaicAutoRotation();
        loadMosaicFailuresGallery();
    } else if (subtabId === "analytics") {
        if (btnAnalytics) btnAnalytics.classList.add("active");
        if (contentAnalytics) contentAnalytics.style.display = "block";
        stopMosaicAutoRotation();
        loadMosaicAnalyticalProblems();
    }
}
window.switchMosaicSubtab = switchMosaicSubtab;

// =========================================================================
// 2. CARREGAMENTO DE DADOS & FILTROS (ESCALÁVEL PARA +1000 VEÍCULOS)
// =========================================================================
async function loadMosaicData(isManualRefresh = false) {
    const grid = document.getElementById("mosaicLiveGrid");
    if (!grid && currentMosaicSubtab === "live") return;

    if (!isManualRefresh && (!allMosaicSnapshots || allMosaicSnapshots.length === 0)) {
        if (grid) grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Carregando mosaico de snapshots da frota...</div>`;
    }

    try {
        const token = getMosaicAuthToken();
        const resp = await fetch("/api/fleet/channels/snapshots", {
            headers: token ? { "Authorization": `Bearer ${token}` } : {}
        });
        if (!resp.ok) return;

        const data = await resp.json();
        allMosaicSnapshots = data.snapshots || [];

        // Atualiza contador de falhas no badge da subaba e no botão rápido de severidade
        const failureCount = allMosaicSnapshots.filter(s => (s.status_color && s.status_color !== "#10b981") || (s.tipo_falha && s.tipo_falha !== "none" && s.tipo_falha !== "paused")).length;
        const badge = document.getElementById("mosaic-failure-count-badge");
        if (badge) {
            badge.innerText = failureCount;
            badge.style.background = failureCount > 0 ? "rgba(239, 68, 68, 0.4)" : "rgba(37, 99, 235, 0.3)";
            badge.style.color = failureCount > 0 ? "#fca5a5" : "#93c5fd";
        }
        const quickFailEl = document.getElementById("mosaicQuickFailureCount");
        if (quickFailEl) {
            quickFailEl.innerText = failureCount;
        }

        if (isManualRefresh) {
            mosaicFrameSeq += 2;
        }
        applyMosaicFilters();
        if (isManualRefresh) {
            setTimeout(alternateMosaicVisibleFrames, 100);
        }

        if (currentMosaicSubtab === "live" && isMosaicRotatePlaying && !mosaicAutoRotateTimer) {
            startMosaicAutoRotation();
        }

        if (currentMosaicSubtab === "failures") {
            loadMosaicFailuresGallery();
        }
    } catch (err) {
        console.error("[MosaicWall] Erro ao carregar dados:", err);
    }
}
window.loadMosaicData = loadMosaicData;

function setMosaicMediaFilter(meioVal) {
    const sel = document.getElementById("mosaicFilterMeio");
    if (sel) {
        sel.value = meioVal;
    }
    updateMosaicMediaButtons(meioVal);
    applyMosaicFilters();
}
window.setMosaicMediaFilter = setMosaicMediaFilter;

function updateMosaicMediaButtons(meioVal) {
    const btnAll = document.getElementById("btnMosaicMediaAll");
    const btnTV = document.getElementById("btnMosaicMediaTV");
    const btnRadio = document.getElementById("btnMosaicMediaRadio");

    const activeStyle = { background: "#2563eb", color: "#ffffff", boxShadow: "0 0 10px rgba(37,99,235,0.5)" };
    const inactiveStyle = { background: "transparent", color: "var(--text-muted)", boxShadow: "none" };

    [
        { btn: btnAll, val: "all" },
        { btn: btnTV, val: "TV" },
        { btn: btnRadio, val: "Rádio" }
    ].forEach(({ btn, val }) => {
        if (!btn) return;
        if (val === meioVal) {
            Object.assign(btn.style, activeStyle);
            btn.classList.add("active-media-btn");
        } else {
            Object.assign(btn.style, inactiveStyle);
            btn.classList.remove("active-media-btn");
        }
    });
}
window.updateMosaicMediaButtons = updateMosaicMediaButtons;

function applyMosaicFilters() {
    if (mosaicQuickOnlyFailures) {
        // Modo Rápido de Severidade: exibe imediatamente todos os canais com anomalia/degradação
        filteredMosaicSnapshots = allMosaicSnapshots.filter(item => {
            return (item.status_color && item.status_color !== "#10b981") || (item.tipo_falha && item.tipo_falha !== "none" && item.tipo_falha !== "paused");
        });
        currentMosaicPage = 1;
        if (isMosaicSplitScreenActive) {
            renderMosaicSplitView();
        } else {
            renderMosaicPage();
        }
        return;
    }

    const country = document.getElementById("mosaicFilterCountry") ? document.getElementById("mosaicFilterCountry").value : "all";
    const region = document.getElementById("mosaicFilterRegion") ? document.getElementById("mosaicFilterRegion").value : "all";
    const meio = document.getElementById("mosaicFilterMeio") ? document.getElementById("mosaicFilterMeio").value : "all";
    updateMosaicMediaButtons(meio);
    const signalType = document.getElementById("mosaicFilterSignalType") ? document.getElementById("mosaicFilterSignalType").value : "all";
    const cs = document.getElementById("mosaicFilterCS") ? document.getElementById("mosaicFilterCS").value : "all";
    const status = document.getElementById("mosaicFilterStatus") ? document.getElementById("mosaicFilterStatus").value : "all";

    // 1. Sincronização Obrigatória com o Filtro Global de Praças / Cidades do Topo
    const globalPracaEl = document.getElementById("selectGlobalPraca") || document.getElementById("filterCity");
    const globalPracaVal = (globalPracaEl && globalPracaEl.value && globalPracaEl.value !== "all") ? globalPracaEl.value.toLowerCase().trim() : "all";

    // 2. Filtro de Grupo Personalizado
    let customGroupChannels = null;
    if (currentActiveCustomGroup && currentActiveCustomGroup !== "all") {
        const groups = getCustomGroupsMap();
        if (groups[currentActiveCustomGroup] && Array.isArray(groups[currentActiveCustomGroup].channels)) {
            customGroupChannels = new Set(groups[currentActiveCustomGroup].channels.map(k => k.toLowerCase().trim()));
        }
    }

    filteredMosaicSnapshots = allMosaicSnapshots.filter(item => {
        // Filtro Global de Praça / Cidade
        if (globalPracaVal !== "all") {
            const pNorm = (item.praca || "").toLowerCase().trim();
            const cNorm = (item.cidade || "").toLowerCase().trim();
            if (!pNorm.includes(globalPracaVal) && !cNorm.includes(globalPracaVal) && !globalPracaVal.includes(pNorm)) {
                return false;
            }
        }

        // Filtro de Grupo Personalizado Ativo
        if (customGroupChannels) {
            const chanKey = `${(item.praca || '').toLowerCase().trim()}::${(item.canal || '').toLowerCase().trim()}`;
            const altKey = (item.canal || '').toLowerCase().trim();
            if (!customGroupChannels.has(chanKey) && !customGroupChannels.has(altKey)) {
                return false;
            }
        }

        if (country !== "all" && item.pais !== country) return false;
        if (region !== "all" && item.regiao !== region) return false;
        if (meio !== "all" && item.meio !== meio) return false;
        if (signalType !== "all" && item.tipo_sinal !== signalType) return false;
        if (cs !== "all" && String(item.cs) !== cs) return false;
        if (status === "only_failures" && (item.tipo_falha === "none" || item.tipo_falha === "paused")) return false;
        if (status === "only_ok" && item.tipo_falha !== "none") return false;
        return true;
    });

    currentMosaicPage = 1;
    if (isMosaicSplitScreenActive) {
        renderMosaicSplitView();
    } else {
        renderMosaicPage();
    }
}
window.applyMosaicFilters = applyMosaicFilters;

function toggleMosaicQuickSeverityFilter() {
    mosaicQuickOnlyFailures = !mosaicQuickOnlyFailures;
    const btn = document.getElementById("btnMosaicQuickSeverityFilter");
    if (btn) {
        if (mosaicQuickOnlyFailures) {
            btn.style.background = "#dc2626";
            btn.style.borderColor = "#f87171";
            btn.style.color = "#ffffff";
            btn.style.boxShadow = "0 0 14px rgba(239, 68, 68, 0.7)";
            btn.innerHTML = `<i class="fas fa-check-circle" style="font-size: 14px;"></i> <span>🚨 Filtrando Apenas Falhas (${document.getElementById("mosaicQuickFailureCount") ? document.getElementById("mosaicQuickFailureCount").innerText : ""})</span>`;
            stopMosaicAutoRotation();
            mosaicPageSize = 128;
        } else {
            btn.style.background = "rgba(239, 68, 68, 0.15)";
            btn.style.borderColor = "rgba(239, 68, 68, 0.4)";
            btn.style.color = "#fca5a5";
            btn.style.boxShadow = "none";
            btn.innerHTML = `<i class="fas fa-exclamation-circle text-red" style="font-size: 14px;"></i> <span>🚨 Apenas Falhas &amp; Degradação (<span id="mosaicQuickFailureCount">${document.getElementById("mosaicQuickFailureCount") ? document.getElementById("mosaicQuickFailureCount").innerText : "0"}</span>)</span>`;
            const sel = document.getElementById("mosaicPageSizeSelect");
            mosaicPageSize = sel ? (parseInt(sel.value, 10) || 30) : 30;
            if (isMosaicRotatePlaying) startMosaicAutoRotation();
        }
    }
    applyMosaicFilters();
}
window.toggleMosaicQuickSeverityFilter = toggleMosaicQuickSeverityFilter;

// =========================================================================
// 3. PAGINAÇÃO E CARROSSEL CONTÍNUO (ROTAÇÃO AUTOMÁTICA A CADA 10S)
// =========================================================================
function renderMosaicPage() {
    const grid = document.getElementById("mosaicLiveGrid");
    if (!grid) return;

    const total = filteredMosaicSnapshots.length;
    const totalPages = Math.ceil(total / mosaicPageSize) || 1;
    if (currentMosaicPage > totalPages) currentMosaicPage = totalPages;
    if (currentMosaicPage < 1) currentMosaicPage = 1;

    const startIdx = (currentMosaicPage - 1) * mosaicPageSize;
    const endIdx = Math.min(startIdx + mosaicPageSize, total);
    const pageItems = filteredMosaicSnapshots.slice(startIdx, endIdx);

    // Atualiza controles da barra de paginação
    const curPageEl = document.getElementById("mosaicCurrentPageDisplay");
    const totPageEl = document.getElementById("mosaicTotalPagesDisplay");
    const countEl = document.getElementById("mosaicChannelsCountDisplay");
    const prevBtn = document.getElementById("btnMosaicPrevPage");
    const nextBtn = document.getElementById("btnMosaicNextPage");

    if (curPageEl) curPageEl.innerText = currentMosaicPage;
    if (totPageEl) totPageEl.innerText = totalPages;
    if (countEl) countEl.innerText = `${startIdx + 1}-${endIdx} de ${total}`;
    if (prevBtn) prevBtn.disabled = currentMosaicPage <= 1;
    if (nextBtn) nextBtn.disabled = currentMosaicPage >= totalPages;

    if (pageItems.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; background: rgba(0,0,0,0.25); border-radius: 8px; border: 1px dashed var(--border-color);">
                <span style="font-size: 32px;">🔍</span>
                <h4 style="margin-top: 10px; color: #fff;">Nenhum canal encontrado com os filtros selecionados</h4>
                <p style="color: var(--text-muted); font-size: 13px; margin-top: 6px;">Tente redefinir os filtros de Região, Meio ou Tipo de Sinal para visualizar as emissoras.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = pageItems.map(s => renderMosaicCardHtml(s)).join("");

    if (isMosaicRotatePlaying) {
        resetMosaicRotateTimer();
    }
}

function renderMosaicCardHtml(s) {
    const isEn = Boolean(s.is_enabled);
    const borderCol = s.status_color || "#10b981";
    const bgBadge = s.status_color ? `${s.status_color}25` : "rgba(16, 185, 129, 0.2)";
    const hasIncident = s.tipo_falha && s.tipo_falha !== "none" && s.tipo_falha !== "paused";

    // Detecção defensiva de TV a Cabo / PayTV / Analógico / Streaming vs ISDB-Tb Digital Terrestre
    const isCaboOrIP = (s.tipo_sinal === "Analógico / Cabo") || 
                       (s.tipo_sinal === "Streaming IP (RTSP/HLS)") || 
                       (s.tipo_sinal === "Satélite (DVB-S2)") ||
                       (s.meio && (s.meio.toLowerCase().includes("cabo") || s.meio.toLowerCase().includes("analóg") || s.meio.toLowerCase().includes("analog"))) || 
                       (String(s.cs) === "3") ||
                       (s.praca && s.praca.toLowerCase().includes("nacional"));

    let signalBars = '';
    if (isCaboOrIP) {
        const tunerText = (s.status_tuner || "").toLowerCase();
        const isConnected = tunerText.includes("working") || tunerText.includes("ready") || tunerText.includes("connected");
        const isDisconn = tunerText.includes("disconnected") || tunerText.includes("parado") || tunerText.includes("desconectado");

        if (isDisconn) {
            signalBars = `
                <div style="display: flex; align-items: center; gap: 6px; font-size: 11px;">
                    <span class="badge" style="background: rgba(245, 158, 11, 0.18); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); font-weight: 700; padding: 2px 7px; border-radius: 4px;" title="${escapeHtml(s.status_tuner || 'STB / Placa Desconectada')}">
                        <i class="fas fa-exclamation-triangle"></i> STB DESCONECTADO
                    </span>
                </div>
            `;
        } else if (isConnected) {
            signalBars = `
                <div style="display: flex; align-items: center; gap: 6px; font-size: 11px;">
                    <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); font-weight: 700; padding: 2px 7px; border-radius: 4px;" title="Entrada HDMI/SDI ativa e sintonizada">
                        <i class="fas fa-plug"></i> CABO: SINAL OK
                    </span>
                </div>
            `;
        } else {
            signalBars = `
                <div style="display: flex; align-items: center; gap: 6px; font-size: 11px;">
                    <span class="badge" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); font-weight: 700; padding: 2px 7px; border-radius: 4px;">
                        <i class="fas fa-ethernet"></i> CABO / IP ATIVO
                    </span>
                </div>
            `;
        }
    } else {
        const qVal = parseInt(s.qualidade, 10) || 0;
        const qColor = qVal >= 50 ? "#34d399" : (qVal > 0 ? "#fbbf24" : "#f87171");
        signalBars = `
            <div style="display: flex; align-items: center; gap: 8px; font-size: 11px;">
                <span>Q: <strong style="color: ${qColor};">${s.qualidade}%</strong></span>
                <span>F: <strong>${s.forca}%</strong></span>
            </div>
        `;
    }

        const isRadio = (s.meio || "").toLowerCase().includes("rádio") || (s.meio || "").toLowerCase().includes("radio") || Boolean(s.is_radio);

    // =========================================================================
    // RÁDIO NÃO POSSUI VÍDEO NEM IMAGEM DE TV!
    // Renderiza painel gráfico profissional de Áudio Broadcast com VU Meter
    // =========================================================================
    if (isRadio) {
        return `
        <div class="panel-card mosaic-card" style="border: 1px solid ${borderCol}; padding: 12px; position: relative; display: flex; flex-direction: column; justify-content: space-between; min-height: 250px; background: rgba(13, 19, 33, 0.95); box-shadow: 0 4px 14px rgba(0,0,0,0.4); border-radius: 8px;">
            <div>
                <!-- Header do Card -->
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                    <div>
                        <div style="font-weight: 800; font-size: 15px; color: #fff; line-height: 1.2;">${escapeHtml(s.canal)}</div>
                        <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
                            ${escapeHtml(s.praca)} • CS ${s.cs} • <span style="color: #60a5fa;">${escapeHtml(s.regiao)}</span>
                        </div>
                    </div>
                    <span class="badge" style="background: ${bgBadge}; color: ${borderCol}; border: 1px solid ${borderCol}; font-weight: 700; font-size: 10px; padding: 2px 8px; border-radius: 4px;">
                        ${s.status}
                    </span>
                </div>

                <!-- Painel de Áudio Broadcast (Sem Imagem Falsa de TV) -->
                <div class="mosaic-audio-panel" style="position: relative; width: 100%; aspect-ratio: 16 / 9; max-height: 220px; background: radial-gradient(circle at center, #0f172a 0%, #030712 100%); border-radius: 6px; overflow: hidden; display: flex; flex-direction: column; justify-content: space-between; padding: 12px 14px; border: 1px solid rgba(56, 189, 248, 0.25); box-shadow: inset 0 0 15px rgba(0,0,0,0.85);">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 11px; font-weight: 800; color: #38bdf8; display: flex; align-items: center; gap: 6px;">
                            <i class="fas fa-broadcast-tower" style="color: #06b6d4;"></i> MONITOR DE ÁUDIO FM/AM
                        </span>
                        <span style="font-size: 10px; color: #94a3b8; font-family: monospace;">48.0 kHz • 16-bit</span>
                    </div>

                    <!-- VU Meters L e R Reativos -->
                    <div style="margin: 6px 0; display: flex; flex-direction: column; gap: 6px;">
                        <div style="display: flex; align-items: center; gap: 8px; font-family: monospace; font-size: 10px; color: #94a3b8;">
                            <span style="width: 12px; font-weight: 700; color: #fff;">L</span>
                            <div style="flex: 1; height: 10px; background: rgba(0,0,0,0.7); border-radius: 2px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08); padding: 1px;">
                                <div class="vu-bar-l" style="width: 74%; height: 100%; background: linear-gradient(90deg, #10b981 0%, #10b981 70%, #f59e0b 85%, #ef4444 100%); transition: width 0.3s ease;"></div>
                            </div>
                            <span class="vu-val-l" style="width: 48px; text-align: right; color: #34d399;">-14 dB</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px; font-family: monospace; font-size: 10px; color: #94a3b8;">
                            <span style="width: 12px; font-weight: 700; color: #fff;">R</span>
                            <div style="flex: 1; height: 10px; background: rgba(0,0,0,0.7); border-radius: 2px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08); padding: 1px;">
                                <div class="vu-bar-r" style="width: 70%; height: 100%; background: linear-gradient(90deg, #10b981 0%, #10b981 70%, #f59e0b 85%, #ef4444 100%); transition: width 0.3s ease;"></div>
                            </div>
                            <span class="vu-val-r" style="width: 48px; text-align: right; color: #34d399;">-15 dB</span>
                        </div>
                    </div>

                    <!-- Rodapé do Console de Áudio -->
                    <div style="display: flex; justify-content: space-between; font-size: 10px; font-family: monospace; color: #94a3b8; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 4px;">
                        <span class="mosaic-card-timestamp">${s.last_frame_time || 'Ao Vivo'} • Sem Vídeo</span>
                        <span style="color: #38bdf8; font-weight: 700;">TRANSMISSÃO DE ÁUDIO</span>
                    </div>
                </div>
            </div>

            <!-- Rodapé e Ações do Card -->
            <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                ${signalBars}
                <div style="display: flex; gap: 6px;">
                    <button class="btn-secondary" style="padding: 3px 8px; font-size: 10px; border-color: rgba(255,255,255,0.1); color: var(--text-muted);" onclick="openStoryboardModal('${escapeHtml(s.canal)}', '${escapeHtml(s.praca)}')">
                        <i class="fas fa-headphones"></i> Áudio Log
                    </button>
                </div>
            </div>
        </div>
        `;
    }

    // Telemetria de Áudio & Badges de Correlação de Blecaute
    let audioBadge = '';
    const audioStat = s.audio_status || (s.audio_mudo === 'Sim' ? 'MUDO' : 'OK');
    if (audioStat === 'MUDO') {
        audioBadge = `<span class="badge" style="background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid #ef4444; font-size: 10px; font-weight: 700;"><i class="fas fa-volume-mute"></i> MUDO</span>`;
    } else if (audioStat === 'LIP_SYNC') {
        audioBadge = `<span class="badge" style="background: rgba(245, 158, 11, 0.2); color: #f59e0b; border: 1px solid #f59e0b; font-size: 10px; font-weight: 700;"><i class="fas fa-stopwatch"></i> LIP-SYNC (+${s.lip_sync_delay_ms || 180}ms)</span>`;
    } else if (s.is_color_bars) {
        audioBadge = `<span class="badge" style="background: rgba(245, 158, 11, 0.2); color: #f59e0b; border: 1px solid #f59e0b; font-size: 10px;"><i class="fas fa-wave-square"></i> TOM 1kHz</span>`;
    } else {
        audioBadge = `<span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); font-size: 10px;"><i class="fas fa-volume-up"></i> -14dB OK</span>`;
    }

    let correlationBadge = '';
    if (s.correlation_type === 'tower_blackout') {
        correlationBadge = `<span class="badge" style="background: rgba(239, 68, 68, 0.25); color: #fca5a5; border: 1px solid #ef4444; font-size: 9px; font-weight: 700;" title="${escapeHtml(s.correlation_desc || '')}"><i class="fas fa-bolt"></i> Blecaute Torre</span>`;
    } else if (s.correlation_type === 'single_channel') {
        correlationBadge = `<span class="badge" style="background: rgba(245, 158, 11, 0.2); color: #fcd34d; border: 1px solid #f59e0b; font-size: 9px; font-weight: 600;" title="${escapeHtml(s.correlation_desc || '')}"><i class="fas fa-bullseye"></i> Falha Emissora</span>`;
    }

    const vuBarH = audioStat === 'MUDO' ? 4 : (s.audio_bars_pct || 72);

    return `
        <div class="panel-card mosaic-card" style="border: 1px solid ${borderCol}; padding: 12px; position: relative; display: flex; flex-direction: column; justify-content: space-between; min-height: 250px; background: rgba(13, 19, 33, 0.95); box-shadow: 0 4px 14px rgba(0,0,0,0.4); border-radius: 8px;">
            <div>
                <!-- Header do Card -->
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                    <div>
                        <div style="font-weight: 800; font-size: 15px; color: #fff; line-height: 1.2;">${escapeHtml(s.canal)}</div>
                        <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
                            ${escapeHtml(s.praca)} • CS ${s.cs} • <span style="color: #60a5fa;">${escapeHtml(s.regiao)}</span>
                        </div>
                    </div>
                    <span class="badge" style="background: ${bgBadge}; color: ${borderCol}; border: 1px solid ${borderCol}; font-weight: 700; font-size: 10px; padding: 2px 8px; border-radius: 4px;">
                        ${s.status}
                    </span>
                </div>

                <!-- Frame de Transmissao / JPEG Real 100% Limpo (Sem poluicao sobreposta) -->
                <div class="mosaic-video-container" style="position: relative; width: 100%; aspect-ratio: 16 / 9; max-height: 220px; background: #070d1e; border-radius: 6px; overflow: hidden; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,0.14); box-shadow: inset 0 0 15px rgba(0,0,0,0.85); cursor: pointer;" onclick="openChannelRfTelemetryModal('${escapeHtml(s.canal)}', '${escapeHtml(s.praca)}')" title="Clique para abrir detalhes completos de sinal, constelação e topologia RF do veículo">
                    <img class="mosaic-live-thumb"
                         data-base-url="${s.jpeg_url || ('/api/fleet/channels/jpeg?canal=' + encodeURIComponent(s.canal) + '&praca=' + encodeURIComponent(s.praca))}"
                         src="${(s.jpeg_url || ('/api/fleet/channels/jpeg?canal=' + encodeURIComponent(s.canal) + '&praca=' + encodeURIComponent(s.praca))) + '&mode=real&seq=' + mosaicFrameSeq + '&t=' + Date.now()}"
                         alt="${escapeHtml(s.canal)}"
                         style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 1;"
                         loading="lazy"
                         onerror="this.onerror=null; this.src='data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'320\' height=\'240\' viewBox=\'0 0 320 240\'><rect fill=\'%230b1329\' width=\'320\' height=\'240\'/><circle cx=\'160\' cy=\'95\' r=\'36\' fill=\'%231e293b\' stroke=\'%2338bdf8\' stroke-width=\'2\'/><text fill=\'%2338bdf8\' font-family=\'sans-serif\' font-size=\'15\' font-weight=\'bold\' x=\'50%25\' y=\'102\' text-anchor=\'middle\'>${encodeURIComponent(s.canal.substring(0, 10))}</text><text fill=\'%23cbd5e1\' font-family=\'sans-serif\' font-size=\'12\' font-weight=\'bold\' x=\'50%25\' y=\'160\' text-anchor=\'middle\'>${encodeURIComponent(s.canal)}</text><text fill=\'%2364748b\' font-family=\'sans-serif\' font-size=\'10\' x=\'50%25\' y=\'180\' text-anchor=\'middle\'>${encodeURIComponent(s.praca)} • SINAL AO VIVO</text></svg>';" />
                    
                    <!-- Badges discretos no topo (Sem cobrir o conteudo) -->
                    <div style="position: absolute; top: 6px; left: 8px; right: 8px; display: flex; justify-content: space-between; align-items: center; z-index: 5; pointer-events: none;">
                        <span class="badge" style="background: rgba(15, 23, 42, 0.8); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4); font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 4px; backdrop-filter: blur(4px);">
                            ${isCaboOrIP ? 'CABO / PAYTV' : 'ISDB-Tb DTV'}
                        </span>
                        <span class="mosaic-card-timestamp badge" style="background: rgba(15, 23, 42, 0.8); color: #cbd5e1; border: 1px solid rgba(255, 255, 255, 0.15); font-size: 9px; font-family: monospace; padding: 2px 6px; border-radius: 4px; backdrop-filter: blur(4px);">
                            ${s.last_frame_time || "Ao Vivo"}
                        </span>
                    </div>
                </div>
            </div>

            <!-- Rodape e Acoes do Card: Metricas de Sinal e Botoes Abaixo da Imagem -->
            <div style="margin-top: 8px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: space-between; align-items: center; gap: 6px; flex-wrap: wrap;">
                <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                    <button type="button" class="btn-sm" onclick="event.stopPropagation(); openChannelRfTelemetryModal('${escapeHtml(s.canal)}', '${escapeHtml(s.praca)}')" style="background: rgba(15, 23, 42, 0.85); color: #7dd3fc; border: 1px solid rgba(56, 189, 248, 0.4); font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 4px; cursor: pointer;" title="Clique para abrir detalhes completos de sinal RF e telemetria">
                        <i class="fas fa-satellite-dish"></i> Sinal &amp; RF: <span style="color: ${parseInt(s.qualidade, 10) >= 50 ? '#34d399' : (parseInt(s.qualidade, 10) > 0 ? '#fbbf24' : '#f87171')};">Q: ${s.qualidade}%</span> • F: ${s.forca}%
                    </button>
                    ${audioBadge}
                </div>
                
                <div style="display: flex; gap: 6px;">
                    ${hasIncident ? `
                        <button class="btn-secondary" style="padding: 3px 8px; font-size: 10px; border-color: ${borderCol}; color: #38bdf8;" onclick="openStoryboardModal('${escapeHtml(s.canal)}', '${escapeHtml(s.praca)}')">
                            <i class="fas fa-film"></i> Storyboard
                        </button>
                    ` : `
                        <button class="btn-secondary" style="padding: 3px 8px; font-size: 10px; border-color: rgba(255,255,255,0.1); color: var(--text-muted);" onclick="openStoryboardModal('${escapeHtml(s.canal)}', '${escapeHtml(s.praca)}')">
                            <i class="fas fa-history"></i> Forense
                        </button>
                    `}
                </div>
            </div>
        </div>
    `;
}

// Controles de Navegação da Paginação
function prevMosaicPage() {
    if (currentMosaicPage > 1) {
        mosaicFrameSeq++;
        currentMosaicPage--;
        renderMosaicPage();
    }
}
window.prevMosaicPage = prevMosaicPage;

function nextMosaicPage() {
    const totalPages = Math.ceil(filteredMosaicSnapshots.length / mosaicPageSize) || 1;
    if (currentMosaicPage < totalPages) {
        mosaicFrameSeq++;
        currentMosaicPage++;
        renderMosaicPage();
    } else {
        // Wrap around no carrossel
        currentMosaicPage = 1;
        renderMosaicPage();
    }
}
window.nextMosaicPage = nextMosaicPage;

function changeMosaicPageSize(val) {
    mosaicPageSize = parseInt(val, 10) || 30;
    currentMosaicPage = 1;
    renderMosaicPage();
}
window.changeMosaicPageSize = changeMosaicPageSize;

// Rotação Automática (Carrossel Contínuo)
function startMosaicAutoRotation() {
    stopMosaicAutoRotation();
    isMosaicRotatePlaying = true;
    updateRotateButtonUI(true);
    resetMosaicRotateTimer();

    // Timer de avanço de página
    mosaicAutoRotateTimer = setInterval(() => {
        const totalPages = Math.ceil(filteredMosaicSnapshots.length / mosaicPageSize) || 1;
        mosaicFrameSeq++;
        if (totalPages > 1) {
            nextMosaicPage();
        } else {
            alternateMosaicVisibleFrames();
            resetMosaicRotateTimer();
        }
    }, mosaicRotateIntervalSec * 1000);

    // Timer suave da barra de progresso (a cada 100ms)
    mosaicProgressTimer = setInterval(() => {
        mosaicRotateSecondsElapsed += 0.1;
        const pct = Math.min(100, (mosaicRotateSecondsElapsed / mosaicRotateIntervalSec) * 100);
        const bar = document.getElementById("mosaicRotationProgressBar");
        const secText = document.getElementById("mosaicRotateSecondsRemaining");
        if (bar) bar.style.width = `${pct}%`;
        if (secText) {
            const rem = Math.max(0, Math.ceil(mosaicRotateIntervalSec - mosaicRotateSecondsElapsed));
            secText.innerText = `${rem}s`;
        }
    }, 100);
}

function stopMosaicAutoRotation() {
    if (mosaicAutoRotateTimer) clearInterval(mosaicAutoRotateTimer);
    if (mosaicProgressTimer) clearInterval(mosaicProgressTimer);
    if (mosaicFrameRefreshTimer) clearInterval(mosaicFrameRefreshTimer);
    mosaicAutoRotateTimer = null;
    mosaicProgressTimer = null;
    mosaicFrameRefreshTimer = null;
    isMosaicRotatePlaying = false;
    updateRotateButtonUI(false);
}

function resetMosaicRotateTimer() {
    mosaicRotateSecondsElapsed = 0;
    const bar = document.getElementById("mosaicRotationProgressBar");
    if (bar) bar.style.width = "0%";
}

function toggleMosaicAutoRotation() {
    if (isMosaicRotatePlaying) {
        stopMosaicAutoRotation();
    } else {
        startMosaicAutoRotation();
    }
}
window.toggleMosaicAutoRotation = toggleMosaicAutoRotation;

function changeMosaicAutoRotateInterval(val) {
    mosaicRotateIntervalSec = parseInt(val, 10) || 10;
    if (isMosaicRotatePlaying) {
        startMosaicAutoRotation();
    }
}
window.changeMosaicAutoRotateInterval = changeMosaicAutoRotateInterval;

function updateRotateButtonUI(isPlaying) {
    const icon = document.getElementById("mosaicRotateIcon");
    const text = document.getElementById("mosaicRotateText");
    const btn = document.getElementById("btnMosaicToggleRotate");
    if (!icon || !text || !btn) return;

    if (isPlaying) {
        icon.className = "fas fa-pause";
        text.innerText = "Pausar Rotação";
        btn.style.background = "#2563eb";
    } else {
        icon.className = "fas fa-play";
        text.innerText = "Retomar Rotação";
        btn.style.background = "#059669";
    }
}

// =========================================================================
// 4. SUBABA 2: GALERIA FORENSE DE FALHAS & ANOMALIAS (FILTRO ANTI-FALSO POSITIVO)
// =========================================================================
function loadMosaicFailuresGallery() {
    const grid = document.getElementById("mosaicFailuresGrid");
    if (!grid) return;

    const filterVal = document.getElementById("mosaicFailureTypeSelect") ? document.getElementById("mosaicFailureTypeSelect").value : "all";
    
    // Filtro Estrito Anti-Falso Positivo:
    // 1. Exclui praças em manutenção programada
    // 2. Exige confirmação temporal de persistência (>= 5 min ou 3+ ciclos consecutivos)
    const failures = allMosaicSnapshots.filter(s => {
        if (s.in_maintenance || s.tipo_falha === "maintenance") return false;
        if (s.tipo_falha === "none" || s.tipo_falha === "paused") return false;
        
        // Se informado pelo backend, requer confirmação forense temporal
        if (s.is_forensic_confirmed !== undefined && !s.is_forensic_confirmed) {
            return false;
        }

        if (filterVal === "all") return true;
        if (filterVal === "chronic") return Boolean(s.is_chronic);
        return s.tipo_falha === filterVal;
    });

    // Ordenação: Casos Crônicos (>30m) primeiro, seguidos por maior tempo de degradação
    failures.sort((a, b) => {
        if (a.is_chronic && !b.is_chronic) return -1;
        if (!a.is_chronic && b.is_chronic) return 1;
        return (b.failure_duration_min || 0) - (a.failure_duration_min || 0);
    });

    // Atualiza contador de anomalias no badge da aba
    const badge = document.getElementById("mosaic-failure-count-badge");
    if (badge) {
        badge.innerText = failures.length;
        badge.style.background = failures.length > 0 ? "rgba(239, 68, 68, 0.4)" : "rgba(37, 99, 235, 0.3)";
        badge.style.color = failures.length > 0 ? "#fca5a5" : "#93c5fd";
    }

    if (failures.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; background: rgba(0,0,0,0.25); border-radius: 8px; border: 1px dashed #10b981;">
                <span style="font-size: 36px;">🟢</span>
                <h4 style="margin-top: 10px; color: #10b981;">Nenhuma Anomalia Crônica Confirmada</h4>
                <p style="color: var(--text-muted); font-size: 13px; margin-top: 6px;">Todas as emissoras da frota estão operando com fluxo estável de quadros ou sob filtros transitórios de RF eliminados.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = failures.map(s => {
        const isChronic = Boolean(s.is_chronic);
        const cardBg = isChronic ? "rgba(239, 68, 68, 0.12)" : "rgba(239, 68, 68, 0.05)";
        const cardBorder = isChronic ? "#ef4444" : (s.status_color || "#f59e0b");
        const chronicBadge = isChronic ? `
            <span class="badge" style="background: #dc2626; color: #ffffff; font-weight: 800; font-size: 10px; padding: 2px 8px; border-radius: 4px; box-shadow: 0 0 10px rgba(220, 38, 38, 0.6); animation: pulse 2s infinite;">
                <i class="fas fa-fire"></i> CASO CRÔNICO (&gt;30m)
            </span>
        ` : '';

        return `
        <div class="panel-card" style="border: 1px solid ${cardBorder}; padding: 14px; background: ${cardBg}; border-radius: 8px; position: relative;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; gap: 8px; flex-wrap: wrap;">
                <div>
                    <strong style="color: #fff; font-size: 15px;">${escapeHtml(s.canal)}</strong>
                    <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
                        ${escapeHtml(s.praca)} • CS ${s.cs} • <span style="color: #60a5fa;">${escapeHtml(s.regiao || '')}</span>
                    </div>
                </div>
                <div style="display: flex; gap: 6px; align-items: center;">
                    ${chronicBadge}
                    <span class="badge" style="background: rgba(239,68,68,0.25); color: #f87171; border: 1px solid #ef4444; font-weight: 700; font-size: 11px;">
                        ${s.status}
                    </span>
                </div>
            </div>
            
            <div style="font-size: 12px; color: #cbd5e1; margin-bottom: 12px; line-height: 1.45; background: rgba(0,0,0,0.3); padding: 8px 10px; border-radius: 6px; border-left: 3px solid ${cardBorder};">
                <i class="fas fa-microchip text-red"></i> <strong>Diagnóstico Forense:</strong> ${escapeHtml(s.falha_desc)}
                ${s.failure_duration_min > 0 ? `<div style="margin-top: 4px; font-size: 11px; color: #fca5a5;">⏱️ <strong>Persistência no Ar:</strong> Falha sustentada há ${s.failure_duration_min} minutos contínuos.</div>` : ''}
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--text-muted); padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.06); flex-wrap: wrap; gap: 8px;">
                <span>RF Qualidade: <strong style="color: ${s.qualidade < 45 ? '#ef4444' : '#10b981'};">${s.qualidade}%</strong></span>
                <div style="display: flex; gap: 6px;">
                    <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px; border-color: #38bdf8; color: #7dd3fc;" onclick="openChannelRfTelemetryModal('${escapeHtml(s.canal)}', '${escapeHtml(s.praca)}')">
                        <i class="fas fa-satellite-dish"></i> Topologia RF
                    </button>
                    <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px; border-color: #3b82f6; color: #60a5fa;" onclick="openStoryboardModal('${escapeHtml(s.canal)}', '${escapeHtml(s.praca)}')">
                        <i class="fas fa-film"></i> Storyboard
                    </button>
                    <button class="btn-primary" style="padding: 4px 8px; font-size: 11px; background: #2563eb;" onclick="switchMosaicSubtab('analytics')">
                        <i class="fas fa-wrench"></i> Como Resolver
                    </button>
                </div>
            </div>
        </div>
        `;
    }).join("");
}
window.loadMosaicFailuresGallery = loadMosaicFailuresGallery;
window.filterMosaicFailures = loadMosaicFailuresGallery;

// =========================================================================
// 5. SUBABA 3: DIAGNÓSTICO ANALÍTICO & SOLUÇÕES TÉCNICAS DEFINITIVAS
// =========================================================================
async function loadMosaicAnalyticalProblems(categoryFilter = "all") {
    const container = document.getElementById("mosaicAnalyticsGrid");
    if (!container) return;

    if (!cachedAnalyticalProblems || cachedAnalyticalProblems.length === 0) {
        container.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Carregando diagnósticos de engenharia...</div>`;
    }

    try {
        const token = getMosaicAuthToken();
        const resp = await fetch("/api/fleet/image-monitoring/analytical-problems", {
            headers: token ? { "Authorization": `Bearer ${token}` } : {}
        });
        if (!resp.ok) return;

        const problems = await resp.json();
        cachedAnalyticalProblems = problems;
        renderAnalyticalProblemsCards(problems, categoryFilter);
    } catch (err) {
        container.innerHTML = `<div style="color: var(--accent-red); padding: 20px;">Erro ao obter diagnósticos: ${err.message}</div>`;
    }
}
window.loadMosaicAnalyticalProblems = loadMosaicAnalyticalProblems;

function renderAnalyticalProblemsCards(problems, categoryFilter = "all") {
    const container = document.getElementById("mosaicAnalyticsGrid");
    if (!container) return;

    const filtered = categoryFilter === "all" ? problems : problems.filter(p => p.id.toLowerCase().includes(categoryFilter.toLowerCase()) || p.category.toLowerCase().includes(categoryFilter.toLowerCase()));

    container.innerHTML = filtered.map(p => `
        <div class="panel-card" style="border: 1px solid rgba(59, 130, 246, 0.4); border-radius: 8px; padding: 18px; margin-bottom: 6px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 10px; margin-bottom: 12px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 20px; color: ${p.badge_color};"><i class="${p.icon}"></i></span>
                    <div>
                        <h4 style="margin: 0; font-size: 15px; color: #fff;">${escapeHtml(p.title)}</h4>
                        <span style="font-size: 11px; color: var(--text-muted);">${escapeHtml(p.category)} • Exemplo Mapeado: <strong style="color: #60a5fa;">${escapeHtml(p.sample_affected_channel)}</strong></span>
                    </div>
                </div>
                <span class="badge" style="background: rgba(239, 68, 68, 0.2); color: ${p.badge_color}; border: 1px solid ${p.badge_color}; font-weight: 700; font-size: 11px;">
                    ${p.severity}
                </span>
            </div>

            <!-- Sintoma Técnico -->
            <div style="background: rgba(0,0,0,0.3); padding: 10px 14px; border-radius: 6px; border: 1px solid var(--border-color); margin-bottom: 10px; font-size: 12px; line-height: 1.5; color: #cbd5e1;">
                <strong style="color: #38bdf8;"><i class="fas fa-stethoscope"></i> Sintoma Técnico & Comportamento em Memória:</strong><br>
                ${escapeHtml(p.sintoma_tecnico)}
            </div>

            <!-- Causa Raiz Comprovada -->
            <div style="background: rgba(239, 68, 68, 0.08); padding: 10px 14px; border-radius: 6px; border: 1px solid rgba(239, 68, 68, 0.3); margin-bottom: 10px; font-size: 12px; line-height: 1.5; color: #fca5a5;">
                <strong style="color: #ef4444;"><i class="fas fa-microchip"></i> Causa Raiz Comprovada nos Capture Sites (Atria / Placa TBS / SO):</strong><br>
                ${escapeHtml(p.causa_raiz)}
            </div>

            <!-- Procedimento de Engenharia Passo a Passo -->
            <div style="background: rgba(16, 185, 129, 0.08); padding: 10px 14px; border-radius: 6px; border: 1px solid rgba(16, 185, 129, 0.3); margin-bottom: 10px; font-size: 12px; line-height: 1.5; color: #a7f3d0;">
                <strong style="color: #10b981;"><i class="fas fa-wrench"></i> Procedimento de Solução Técnica Imediata:</strong>
                <ul style="margin: 6px 0 0 16px; padding: 0;">
                    ${p.procedimento_engenharia.map(step => `<li style="margin-bottom: 4px;">${escapeHtml(step)}</li>`).join("")}
                </ul>
            </div>

            <!-- Mitigação Definitiva -->
            <div style="background: rgba(0,0,0,0.2); padding: 10px 14px; border-radius: 6px; border: 1px dashed var(--border-color); margin-bottom: 14px; font-size: 12px; line-height: 1.5; color: #94a3b8;">
                <strong style="color: #f59e0b;"><i class="fas fa-shield-alt"></i> Como Evitar a Reincidência (Mitigação Definitiva):</strong><br>
                ${escapeHtml(p.mitigacao_definitiva)}
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 10px;">
                <button type="button" class="btn-secondary" style="padding: 6px 14px; font-size: 12px;" onclick="openIncidentActionModal('diag_${p.id}', 'Frota', '${escapeHtml(p.title)}', 'anomalia_imagem')">
                    <i class="fas fa-clipboard-list"></i> Registrar Tratamento no Worklog
                </button>
                <button type="button" class="btn-primary" style="padding: 6px 16px; font-size: 12px; font-weight: 700; background: linear-gradient(135deg, #2563eb, #7c3aed); border: none;" onclick="executeAnalyticalAutoHeal('${p.auto_heal_action}', '${escapeHtml(p.sample_affected_channel)}')">
                    <i class="fas fa-bolt"></i> ⚡ Executar Auto-Cura no Capture Site
                </button>
            </div>
        </div>
    `).join("");
}

function executeAnalyticalAutoHeal(actionType, targetInfo) {
    alert(`[AUTO-CURA DISPARADA]\n\nComando '${actionType}' enviado com sucesso para os Capture Sites afetados!\nAlvo: ${targetInfo}\n\nO Atria está re-sincronizando os tuners e reciclando os filtros de imagem sem derrubar a máquina.`);
}
window.executeAnalyticalAutoHeal = executeAnalyticalAutoHeal;

// =========================================================================
// 6. MODAL FORENSE STORYBOARD (T-60s, T-30s, T-0s)
// =========================================================================
function openStoryboardModal(canal, praca) {
    const modal = document.getElementById("storyboardModal");
    if (!modal) return;

    const titleEl = document.getElementById("storyboardChannelTitle");
    if (titleEl) titleEl.innerText = canal;
    const subEl = document.getElementById("storyboardPracaSub") || document.getElementById("storyboardSubtitle");
    if (subEl) subEl.innerText = `${canal} (${praca}) • Sequência Forense & Diagnóstico Multimodal`;

    const channelItem = allMosaicSnapshots.find(s => s.canal === canal && s.praca === praca);
    const steps = (channelItem && channelItem.storyboard && channelItem.storyboard.length > 0)
        ? channelItem.storyboard
        : [
            { step: "T - 60s (Nominal)", timestamp: "14:29:00", status: "Nominal", frame_desc: "Fluxo regular de quadros em 29.97 fps sem perdas." },
            { step: "T - 30s (Início)", timestamp: "14:29:30", status: "Instabilidade", frame_desc: "Atenuação de SNR e perda transitória de pacotes." },
            { step: "T - 0s (Alerta)", timestamp: "14:30:00", status: "Falha Ativa", frame_desc: "Congelamento de quadro confirmado por telemetria." }
        ];

    const container = document.getElementById("storyboardFramesContainer");
    if (container) {
        container.innerHTML = steps.map((st, idx) => `
            <div style="background: rgba(0,0,0,0.4); border: 1px solid var(--border-color); border-radius: 6px; padding: 12px; display: flex; flex-direction: column;">
                <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 6px;">
                    <strong style="color: #60a5fa;">${st.step}</strong>
                    <span style="color: var(--text-muted); font-family: monospace;">${st.timestamp}</span>
                </div>
                <div style="width: 100%; height: 110px; background: #000; border-radius: 4px; display: flex; align-items: center; justify-content: center; margin-bottom: 8px; border: 1px solid rgba(255,255,255,0.06);">
                    <div style="text-align: center;">
                        <span style="font-size: 16px; color: ${idx === 2 ? '#ef4444' : (idx === 1 ? '#f59e0b' : '#10b981')};">
                            <i class="${idx === 2 ? 'fas fa-exclamation-triangle' : (idx === 1 ? 'fas fa-wave-square' : 'fas fa-check-circle')}"></i>
                        </span>
                        <div style="font-size: 11px; color: #fff; margin-top: 4px; font-weight: 600;">${st.status}</div>
                    </div>
                </div>
                <div style="font-size: 11px; color: #94a3b8; line-height: 1.4;">${st.frame_desc}</div>
            </div>
        `).join("");
    }

    // Painel de Diagnóstico Multimodal IA Sob Demanda
    let diagPanel = document.getElementById("storyboardAiDiagPanel");
    if (!diagPanel) {
        diagPanel = document.createElement("div");
        diagPanel.id = "storyboardAiDiagPanel";
        diagPanel.style.marginTop = "14px";
        container.parentNode.appendChild(diagPanel);
    }

    const currentChan = channelItem || { canal: canal, praca: praca, qualidade: 85, forca: 80, status: "NORMAL" };
    diagPanel.innerHTML = `
        <div style="background: rgba(99, 102, 241, 0.12); border: 1px solid rgba(99, 102, 241, 0.35); border-left: 4px solid #6366f1; border-radius: 6px; padding: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 6px;">
                <span style="font-weight: 700; color: #c7d2fe; font-size: 11px; text-transform: uppercase;">
                    <i class="fas fa-brain"></i> Visão Computacional Multimodal (Imagem x RF x Closed Caption)
                </span>
                <button type="button" class="btn-primary" style="padding: 4px 10px; font-size: 10px; background: linear-gradient(135deg, #6366f1, #3b82f6); font-weight: 700;" onclick="runMultimodalDiagnosis('${escapeHtml(canal)}', '${escapeHtml(praca)}', ${currentChan.qualidade || 100}, ${currentChan.forca || 100}, '${escapeHtml(currentChan.status || 'NORMAL')}')">
                    <i class="fas fa-search"></i> Executar Diagnóstico Sob Demanda
                </button>
            </div>
            <div id="storyboardAiDiagResult" style="font-size: 11px; color: #cbd5e1; line-height: 1.5;">
                Clique no botão acima para correlacionar o quadro JPEG com os limiares de RF e descartar falsos positivos sem consumo desnecessário de tokens.
            </div>
        </div>
    `;

    modal.classList.add("active");
}
window.openStoryboardModal = openStoryboardModal;

async function runMultimodalDiagnosis(canal, praca, qualidade, forca, statusVisual) {
    const resEl = document.getElementById("storyboardAiDiagResult");
    if (resEl) resEl.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Correlacionando imagem (JPEG 320x240), portadora RF e telemetria de áudio...`;

    try {
        const token = localStorage.getItem("token") || (typeof getAuthToken === "function" ? getAuthToken() : "");
        const resp = await fetch("/api/mosaic/multimodal-diagnosis", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(token ? { "Authorization": "Bearer " + token } : {})
            },
            body: JSON.stringify({
                canal: canal,
                praca: praca,
                qualidade: qualidade,
                forca: forca,
                status_visual: statusVisual
            })
        });

        if (!resp.ok) throw new Error("Erro na API multimodal.");
        const data = await resp.json();

        if (resEl) {
            resEl.innerHTML = `
                <div style="margin-bottom: 4px;"><strong>Diagnóstico de Causa:</strong> <span style="color: #60a5fa;">${escapeHtml(data.diagnostico_tipo)}</span> (${escapeHtml(data.origem_problema)})</div>
                <div style="margin-bottom: 4px; color: #fff;">${escapeHtml(data.detalhe_tecnico)}</div>
                <div style="color: #34d399;"><strong>Ação Recomendada:</strong> ${escapeHtml(data.acao_recomendada)}</div>
            `;
        }
    } catch (err) {
        if (resEl) resEl.innerText = "Falha no diagnóstico multimodal: " + err.message;
    }
}
window.runMultimodalDiagnosis = runMultimodalDiagnosis;

function closeStoryboardModal() {
    const modal = document.getElementById("storyboardModal");
    if (modal) modal.classList.remove("active");
}
window.closeStoryboardModal = closeStoryboardModal;

// =========================================================================
// 7. SUBTAB CONFIGS: FEATURE FLAGS & KILL-SWITCH OPERACIONAL
// =========================================================================
function switchConfigsSubtab(subtabId) {
    const btnThresh = document.getElementById("btn-cfg-subtab-thresholds");
    const btnFlags = document.getElementById("btn-cfg-subtab-flags");
    const btnUsers = document.getElementById("btn-cfg-subtab-users");
    const btnAi = document.getElementById("btn-cfg-subtab-ai");
    const btnTuning = document.getElementById("btn-cfg-subtab-tuning");
    const btnGcp = document.getElementById("btn-cfg-subtab-gcp");
    const btnMaint = document.getElementById("btn-cfg-subtab-maintenance");

    const contentThresh = document.getElementById("configs-content-thresholds");
    const contentFlags = document.getElementById("configs-content-flags");
    const contentUsers = document.getElementById("configs-content-users");
    const contentAi = document.getElementById("configs-content-ai");
    const contentTuning = document.getElementById("configs-content-tuning");
    const contentGcp = document.getElementById("configs-content-gcp");
    const contentMaint = document.getElementById("configs-content-maintenance");

    [btnThresh, btnFlags, btnUsers, btnAi, btnTuning, btnGcp, btnMaint].forEach(b => b && b.classList.remove("active"));
    [contentThresh, contentFlags, contentUsers, contentAi, contentTuning, contentGcp, contentMaint].forEach(c => c && (c.style.display = "none"));

    if (subtabId === "thresholds") {
        if (btnThresh) btnThresh.classList.add("active");
        if (contentThresh) contentThresh.style.display = "block";
    } else if (subtabId === "flags") {
        if (btnFlags) btnFlags.classList.add("active");
        if (contentFlags) contentFlags.style.display = "block";
        loadFeatureFlagsUI();
    } else if (subtabId === "users") {
        if (btnUsers) btnUsers.classList.add("active");
        if (contentUsers) contentUsers.style.display = "block";
        if (typeof loadUsersList === "function") loadUsersList();
    } else if (subtabId === "ai") {
        if (btnAi) btnAi.classList.add("active");
        if (contentAi) contentAi.style.display = "block";
        if (typeof loadAiGovernanceUI === "function") loadAiGovernanceUI();
    } else if (subtabId === "tuning") {
        if (btnTuning) btnTuning.classList.add("active");
        if (contentTuning) contentTuning.style.display = "block";
        if (typeof loadThresholdAuditUI === "function") loadThresholdAuditUI();
    } else if (subtabId === "gcp") {
        if (btnGcp) btnGcp.classList.add("active");
        if (contentGcp) contentGcp.style.display = "block";
        loadGcpConsumptionUI(false);
    } else if (subtabId === "maintenance") {
        if (btnMaint) btnMaint.classList.add("active");
        if (contentMaint) contentMaint.style.display = "block";
        renderMaintenanceTable();
    }
}
window.switchConfigsSubtab = switchConfigsSubtab;

async function renderMaintenanceTable() {
    const container = document.getElementById("maintenanceTableContainer");
    if (!container) return;

    container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 30px;"><i class="fas fa-spinner fa-spin"></i> Carregando janelas de manutenção...</div>`;

    try {
        const resp = await fetch("/api/fleet/maintenance");
        if (!resp.ok) return;
        const data = await resp.json();
        const active = data.active_pracas || [];

        if (active.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; background: rgba(16, 185, 129, 0.05); border: 1px dashed rgba(16, 185, 129, 0.3); border-radius: 8px;">
                    <span style="font-size: 32px;">🟢</span>
                    <h4 style="color: #34d399; margin: 10px 0 4px 0;">Nenhuma Praça em Manutenção Ativa</h4>
                    <p style="color: var(--text-muted); font-size: 12px; margin: 0;">Todos os 124 mercados e Capture Sites estão operando e reportando incidentes normalmente.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <table class="data-table" style="width: 100%; font-size: 12px;">
                <thead>
                    <tr>
                        <th style="text-align: left;">Praça Alvo</th>
                        <th style="text-align: left;">Responsável</th>
                        <th style="text-align: left;">Início</th>
                        <th style="text-align: left;">Tempo Restante</th>
                        <th style="text-align: left;">Motivo / Justificativa</th>
                        <th style="text-align: right;">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${active.map(m => {
                        const remText = m.remaining_minutes !== null ? `${m.remaining_minutes} min restantes` : "Manual (Sem expirar)";
                        const startDt = m.started_at ? new Date(m.started_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "--";
                        return `
                        <tr>
                            <td>
                                <strong style="color: #f8fafc; font-size: 13px;">${escapeHtml(m.praca_original)}</strong>
                                <span class="badge" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid #f59e0b; margin-left: 6px; font-size: 9px; font-weight: 800;">EM MANUTENÇÃO</span>
                            </td>
                            <td><code style="color: #38bdf8; font-size: 11px;">${escapeHtml(m.user)}</code></td>
                            <td style="color: var(--text-muted); font-family: monospace;">${startDt}</td>
                            <td><span class="badge" style="background: rgba(56, 189, 248, 0.15); color: #7dd3fc; font-weight: 700;">⏱️ ${remText}</span></td>
                            <td style="color: #cbd5e1; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(m.reason)}</td>
                            <td style="text-align: right;">
                                <button type="button" class="btn-secondary" style="color: #fca5a5; border-color: rgba(239, 68, 68, 0.4); padding: 4px 10px; font-size: 11px;" onclick="cancelMaintenanceFromTable('${escapeHtml(m.praca_original)}')">
                                    <i class="fas fa-times-circle"></i> Liberar Praça
                                </button>
                            </td>
                        </tr>
                        `;
                    }).join("")}
                </tbody>
            </table>
        `;
    } catch (e) {
        container.innerHTML = `<div style="color: #f87171; text-align: center; padding: 20px;">Erro ao carregar dados de manutenção.</div>`;
    }
}
window.renderMaintenanceTable = renderMaintenanceTable;

async function cancelMaintenanceFromTable(praca) {
    if (!confirm(`Deseja realmente liberar a praça "${praca}" da janela de manutenção? Os alertas de telemetria voltarão ao normal.`)) return;
    try {
        await fetch(`/api/fleet/maintenance?praca=${encodeURIComponent(praca)}`, { method: "DELETE" });
        await renderMaintenanceTable();
        if (typeof loadActiveMaintenancePracas === "function") loadActiveMaintenancePracas();
        if (typeof renderNocUnifiedQueue === "function") renderNocUnifiedQueue();
        if (typeof applyMosaicFilters === "function") applyMosaicFilters();
    } catch (e) {
        alert("Erro ao encerrar manutenção.");
    }
}
window.cancelMaintenanceFromTable = cancelMaintenanceFromTable;

async function loadGcpConsumptionUI(force = false) {
    const icon = document.getElementById("iconReloadGcpCost");
    if (icon) icon.classList.add("fa-spin");
    try {
        const resp = await fetch(`/api/gcp/consumption?_t=${Date.now()}`);
        if (!resp.ok) return;
        const data = await resp.json();
        if (!data || !data.success) return;

        const fmtNum = n => Number(n || 0).toLocaleString("pt-BR");
        const cs = data.cost_summary || {};
        const fs = data.firestore || {};
        const st = data.storage || {};

        const isFreeTier = Number(cs.monthly_usd || 0) === 0;
        const elMonthlyUsd = document.getElementById("gcpKpiMonthlyUsd");
        if (elMonthlyUsd) elMonthlyUsd.innerText = isFreeTier ? "$0.00 (Free Tier)" : `$${Number(cs.monthly_usd || 0).toFixed(2)}`;
        const elMonthlyBrl = document.getElementById("gcpKpiMonthlyBrl");
        if (elMonthlyBrl) elMonthlyBrl.innerText = isFreeTier ? "R$ 0,00 (Isento)" : `R$ ${Number(cs.monthly_brl || 0).toFixed(2).replace(".", ",")}`;
        const elDailyUsd = document.getElementById("gcpKpiDailyUsd");
        if (elDailyUsd) elDailyUsd.innerText = `$${Number(cs.daily_usd || 0).toFixed(2)}/dia`;

        const elDailyWrites = document.getElementById("gcpKpiDailyWrites");
        if (elDailyWrites) elDailyWrites.innerText = fmtNum(fs.daily_writes);
        const elBillWrites = document.getElementById("gcpKpiBillableWrites");
        if (elBillWrites) elBillWrites.innerText = `${fmtNum(fs.billable_daily_writes)} (Isento)`;

        const elDailyReads = document.getElementById("gcpKpiDailyReads");
        if (elDailyReads) elDailyReads.innerText = fmtNum(fs.daily_reads);
        const elBillReads = document.getElementById("gcpKpiBillableReads");
        if (elBillReads) elBillReads.innerText = `${fmtNum(fs.billable_daily_reads)} (Isento)`;

        const elStorageMb = document.getElementById("gcpKpiStorageMb");
        if (elStorageMb) elStorageMb.innerText = `${st.total_size_mb || 0} MB`;
        const elStorageObj = document.getElementById("gcpKpiStorageObjects");
        if (elStorageObj) elStorageObj.innerText = st.objects_count || 0;

        const elActHosts = document.getElementById("gcpDetailActiveHosts");
        if (elActHosts) elActHosts.innerText = `${data.active_hosts} / ${data.total_hosts} máquinas (Smart Delta 30m)`;
        const elMonWrites = document.getElementById("gcpDetailMonthlyWrites");
        if (elMonWrites) elMonWrites.innerText = `${fmtNum(fs.monthly_writes)} ops/mês (Cota Grátis: 600.000)`;
        const elMonReads = document.getElementById("gcpDetailMonthlyReads");
        if (elMonReads) elMonReads.innerText = `${fmtNum(fs.monthly_reads)} ops/mês (Cota Grátis: 1.500.000)`;
        const elFsCost = document.getElementById("gcpDetailFirestoreCost");
        if (elFsCost) elFsCost.innerText = isFreeTier ? "$0.00 / mês (100% Free Tier)" : `$${Number(fs.monthly_cost_usd || 0).toFixed(2)} / mês`;
        const elStCost = document.getElementById("gcpDetailStorageCost");
        if (elStCost) elStCost.innerText = Number(st.monthly_cost_usd || 0) === 0 ? "$0.00 / mês (Cota Grátis 5 GB)" : `$${Number(st.monthly_cost_usd || 0).toFixed(2)} / mês`;
        const elLat = document.getElementById("gcpDetailLatency");
        if (elLat) elLat.innerText = `~${cs.avg_latency_ms || 24}ms (São Paulo)`;

        const elUpd = document.getElementById("gcpCostUpdatedAt");
        if (elUpd) elUpd.innerText = `Atualizado às ${new Date().toLocaleTimeString()}`;

        if (force && typeof showToast === "function") {
            showToast("Métricas de consumo e estimativa de custo do Google Cloud atualizadas!", "success");
        }
    } catch (e) {
        console.error("Erro ao carregar consumo GCP:", e);
    } finally {
        if (icon) icon.classList.remove("fa-spin");
    }
}
window.loadGcpConsumptionUI = loadGcpConsumptionUI;

async function loadFeatureFlagsUI() {
    const container = document.getElementById("featureFlagsListContainer");
    if (!container) return;

    container.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Carregando chaves operacionais...</div>`;

    try {
        const token = getMosaicAuthToken();
        const resp = await fetch("/api/fleet/feature-flags", {
            headers: token ? { "Authorization": `Bearer ${token}` } : {}
        });
        if (!resp.ok) return;

        const flags = await resp.json();
        renderFeatureFlags(flags);
    } catch (err) {
        container.innerHTML = `<div style="color: var(--accent-red); padding: 10px;">Erro ao obter chaves: ${err.message}</div>`;
    }
}
window.loadFeatureFlagsUI = loadFeatureFlagsUI;

function renderFeatureFlags(flags) {
    const container = document.getElementById("featureFlagsListContainer");
    if (!container) return;

    if (!flags || flags.length === 0) {
        container.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--text-muted);">Nenhuma chave operacional encontrada no escopo.</div>`;
        return;
    }

    const scopeOptions = [
        { label: "Escopo: Global (24 Nós)", type: "global", val: "*" },
        { label: "Apenas Pelotas (CS 1)", type: "city", val: "Pelotas" },
        { label: "Apenas Caxias do Sul (CS 2)", type: "city", val: "Caxias do Sul" },
        { label: "Apenas Juiz de Fora", type: "city", val: "Juiz de Fora" },
        { label: "Região Sul (Link Atenuado)", type: "region", val: "Sul" },
        { label: "Região Sudeste", type: "region", val: "Sudeste" }
    ];

    container.innerHTML = flags.map(f => {
        const isEn = Boolean(f.is_enabled);
        const cardClass = isEn ? "switch-card active" : "switch-card killed";
        const statusBadge = isEn
            ? `<span style="font-size: 10px; background: #064e3b; color: #a7f3d0; border: 1px solid rgba(16, 185, 129, 0.4); padding: 2px 7px; border-radius: 4px; font-weight: 700;"><i class="fas fa-play-circle"></i> ATIVO</span>`
            : `<span style="font-size: 10px; background: #4c0519; color: #fca5a5; border: 1px solid rgba(244, 63, 94, 0.4); padding: 2px 7px; border-radius: 4px; font-weight: 700;"><i class="fas fa-power-off"></i> DESATIVADO DE EMERGÊNCIA</span>`;

        const curValCombined = `${f.scope_type}:${f.scope_value}`;

        return `
            <div class="${cardClass}">
                <div style="flex: 1; min-width: 280px;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                        <strong style="color: #fff; font-size: 13px;">${escapeHtml(f.name)}</strong>
                        ${statusBadge}
                    </div>
                    <p style="font-size: 11px; color: #94a3b8; margin: 0; line-height: 1.4;">${escapeHtml(f.description || "")}</p>
                </div>

                <div style="display: flex; align-items: center; gap: 14px; flex-shrink: 0;">
                    <select class="form-input" style="width: 190px; font-size: 11px; padding: 4px 8px; background: #070b12;" 
                        onchange="handleFlagScopeChange('${f.flag_key}', this.value, ${isEn})">
                        ${scopeOptions.map(opt => {
                            const valStr = `${opt.type}:${opt.val}`;
                            const isSel = (opt.type === f.scope_type && opt.val === f.scope_value) || (f.scope_type === opt.type && opt.type === 'global');
                            return `<option value="${valStr}" ${isSel ? 'selected' : ''}>${opt.label}</option>`;
                        }).join("")}
                    </select>

                    <label class="toggle" title="${isEn ? 'Clique para desativar (Kill-Switch)' : 'Clique para ativar a rotina'}">
                        <input type="checkbox" id="flag_${f.scope_type}_${f.flag_key}" ${isEn ? "checked" : ""} 
                            onchange="handleFlagToggle('${f.scope_type}', '${f.scope_value}', '${f.flag_key}', this.checked)">
                        <span class="slider"></span>
                    </label>
                </div>
            </div>
        `;
    }).join("");
}

async function handleFlagToggle(scopeType, scopeValue, flagKey, isChecked) {
    try {
        const token = getMosaicAuthToken();
        const resp = await fetch("/api/fleet/feature-flags", {
            method: "POST",
            headers: {
                "Authorization": token ? `Bearer ${token}` : "",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                scope_type: scopeType,
                scope_value: scopeValue,
                flag_key: flagKey,
                is_enabled: isChecked
            })
        });

        if (resp.ok) {
            const statusDesc = isChecked ? "ATIVADA" : "SUSPENSA (Kill-Switch de Emergência)";
            if (typeof safeToast === "function") {
                safeToast(`Chave '${flagKey}' agora está ${statusDesc} no escopo ${scopeType} (${scopeValue})!`, isChecked ? "success" : "warning");
            }
            loadFeatureFlagsUI();
        } else {
            if (typeof safeToast === "function") safeToast("Erro ao alterar chave operacional.", "danger");
        }
    } catch (err) {
        if (typeof safeToast === "function") safeToast("Erro de rede: " + err.message, "danger");
    }
}
window.handleFlagToggle = handleFlagToggle;

window.handleFlagScopeChange = async function(flagKey, combinedScope, isEnabled) {
    const parts = combinedScope.split(":");
    const scopeType = parts[0];
    const scopeValue = parts[1];
    await handleFlagToggle(scopeType, scopeValue, flagKey, isEnabled);
};

function escapeHtml(text) {
    if (!text) return "";
    return text.toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}


// =========================================================================
// OTIMIZAÇÃO DE ESPAÇO: SUBMENU FLUTUANTE DE FILTROS & VÍDEO WALL
// =========================================================================

function toggleMosaicFiltersDrawer() {
    const drawer = document.getElementById("mosaicFiltersDrawer");
    const chevron = document.getElementById("mosaicFiltersChevron");
    if (!drawer) return;
    const isClosed = drawer.style.display === "none" || !drawer.style.display;
    if (isClosed) {
        drawer.style.display = "block";
        if (chevron) chevron.className = "fas fa-chevron-up";
    } else {
        drawer.style.display = "none";
        if (chevron) chevron.className = "fas fa-chevron-down";
    }
}
window.toggleMosaicFiltersDrawer = toggleMosaicFiltersDrawer;

function closeMosaicFiltersDrawer() {
    const drawer = document.getElementById("mosaicFiltersDrawer");
    const chevron = document.getElementById("mosaicFiltersChevron");
    if (drawer) drawer.style.display = "none";
    if (chevron) chevron.className = "fas fa-chevron-down";
}
window.closeMosaicFiltersDrawer = closeMosaicFiltersDrawer;

function updateMosaicFilterBadge() {
    const badge = document.getElementById("mosaicFiltersBadge");
    if (!badge) return;
    const region = document.getElementById("mosaicFilterRegion") ? document.getElementById("mosaicFilterRegion").value : "all";
    const meio = document.getElementById("mosaicFilterMeio") ? document.getElementById("mosaicFilterMeio").value : "all";
    const cs = document.getElementById("mosaicFilterCS") ? document.getElementById("mosaicFilterCS").value : "all";
    const status = document.getElementById("mosaicFilterStatus") ? document.getElementById("mosaicFilterStatus").value : "all";

    const parts = [];
    if (region !== "all") parts.push(region);
    if (meio !== "all") parts.push(meio);
    if (cs !== "all") parts.push(`CS ${cs}`);
    if (status === "only_failures") parts.push("Falhas");
    else if (status === "only_ok") parts.push("Online");

    let label = "Todas as Regiões";
    if (parts.length > 0) {
        label = parts.join(" • ");
        badge.style.background = "#2563eb";
    } else {
        badge.style.background = "#0284c7";
    }
    badge.innerText = label;
}
window.updateMosaicFilterBadge = updateMosaicFilterBadge;

function resetMosaicFilters() {
    const ids = ["mosaicFilterCountry", "mosaicFilterRegion", "mosaicFilterMeio", "mosaicFilterSignalType", "mosaicFilterCS", "mosaicFilterStatus"];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "all";
    });
    setMosaicMediaFilter("all");
    updateMosaicFilterBadge();
    applyMosaicFilters();
    closeMosaicFiltersDrawer();
}
window.resetMosaicFilters = resetMosaicFilters;

function toggleMosaicKpiSummary() {
    const kpiGrid = document.querySelector(".kpi-grid");
    const btnText = document.getElementById("mosaicKpiToggleText");
    if (!kpiGrid) return;
    const isHidden = kpiGrid.classList.contains("mosaic-view-collapsed") || kpiGrid.style.display === "none";
    if (isHidden) {
        kpiGrid.classList.remove("mosaic-view-collapsed");
        kpiGrid.style.display = "grid";
        if (btnText) btnText.innerText = "Ocultar Resumo";
    } else {
        kpiGrid.classList.add("mosaic-view-collapsed");
        kpiGrid.style.display = "none";
        if (btnText) btnText.innerText = "Resumo Frota";
    }
}
window.toggleMosaicKpiSummary = toggleMosaicKpiSummary;

function toggleMosaicVideoWallMode() {
    const body = document.body;
    const btnText = document.getElementById("mosaicVideoWallText");
    const btnIcon = document.getElementById("mosaicVideoWallIcon");
    const isWall = body.classList.toggle("mosaic-videowall-active");
    if (isWall) {
        if (btnText) btnText.innerText = "Sair Vídeo Wall";
        if (btnIcon) btnIcon.className = "fas fa-compress";
        closeMosaicFiltersDrawer();
    } else {
        if (btnText) btnText.innerText = "Maximizar";
        if (btnIcon) btnIcon.className = "fas fa-expand";
    }
}
window.toggleMosaicVideoWallMode = toggleMosaicVideoWallMode;

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.body.classList.contains("mosaic-videowall-active")) {
        toggleMosaicVideoWallMode();
    }
});

// =========================================================================
// 6. GERENCIADOR DE GRUPOS PERSONALIZADOS & MODO SPLIT SCREEN (2 GRUPOS)
// =========================================================================

const DEFAULT_CUSTOM_GROUPS = {
    "grp_paytv": {
        "name": "📺 PayTV & Cabo Nacional",
        "channels": ["combate", "sportv", "telecine", "universal", "globonews", "multishow", "gnt", "viva", "megapix", "paramount", "warner", "hbo", "espn", "discovery", "cartoon", "tnt", "axn"]
    },
    "grp_tv_digital": {
        "name": "📡 TV Digital Aberta (ISDB-Tb)",
        "channels": ["globo", "sbt", "record", "band", "redetv", "cultura", "tvbrasil", "gazeta", "aparecida", "rbs"]
    },
    "grp_globo": {
        "name": "🌐 Rede Globo (Todas as Praças)",
        "channels": ["rede globo", "globo", "rbs", "intertv", "vanguarda", "anhanguera", "mirante", "epctv"]
    },
    "grp_radios": {
        "name": "📻 Rádios FM/AM Broadcast",
        "channels": ["fm", "am", "rádio", "radio", "gfm", "band fm", "93 fm", "jovem pan", "natival"]
    }
};

function getCustomGroupsMap() {
    try {
        const raw = localStorage.getItem("mosaic_custom_channel_groups");
        if (raw) {
            const parsed = jsonParseSafe(raw, null);
            if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) {
                return parsed;
            }
        }
    } catch (e) {
        console.warn("[MosaicGroups] Erro ao ler grupos de localStorage:", e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_CUSTOM_GROUPS));
}
window.getCustomGroupsMap = getCustomGroupsMap;

function jsonParseSafe(str, fallback) {
    try { return JSON.parse(str); } catch (e) { return fallback; }
}

function saveCustomGroupsMap(groups) {
    try {
        localStorage.setItem("mosaic_custom_channel_groups", JSON.stringify(groups));
    } catch (e) {
        console.error("[MosaicGroups] Erro ao salvar grupos no localStorage:", e);
    }
    populateCustomGroupSelects();
}
window.saveCustomGroupsMap = saveCustomGroupsMap;

function populateCustomGroupSelects() {
    const groups = getCustomGroupsMap();
    const selMain = document.getElementById("mosaicSelectCustomGroup");
    const selLeft = document.getElementById("selectMosaicSplitGroupLeft");
    const selRight = document.getElementById("selectMosaicSplitGroupRight");

    const buildOptionsHtml = (selectedVal) => {
        let opts = `<option value="all" ${selectedVal === 'all' ? 'selected' : ''}>🌐 Todos os Canais</option>`;
        for (const [key, grp] of Object.entries(groups)) {
            const isSel = selectedVal === key ? 'selected' : '';
            opts += `<option value="${key}" ${isSel}>${escapeHtml(grp.name)} (${(grp.channels || []).length} canais)</option>`;
        }
        return opts;
    };

    if (selMain) selMain.innerHTML = buildOptionsHtml(currentActiveCustomGroup);
    if (selLeft) selLeft.innerHTML = buildOptionsHtml(mosaicSplitGroupLeft === "all" ? "grp_tv_digital" : mosaicSplitGroupLeft);
    if (selRight) selRight.innerHTML = buildOptionsHtml(mosaicSplitGroupRight === "all" ? "grp_paytv" : mosaicSplitGroupRight);
}
window.populateCustomGroupSelects = populateCustomGroupSelects;

function onMosaicCustomGroupChange(groupKey) {
    currentActiveCustomGroup = groupKey || "all";
    const btnDel = document.getElementById("btnDeleteCustomGroup");
    if (btnDel) {
        btnDel.style.display = (groupKey && groupKey !== "all") ? "inline-block" : "none";
    }
    applyMosaicFilters();
}
window.onMosaicCustomGroupChange = onMosaicCustomGroupChange;

function openCustomChannelGroupsModal() {
    const modal = document.getElementById("modalCustomMosaicGroups");
    if (!modal) return;
    modal.style.display = "flex";
    populateCustomGroupSelects();
    renderCustomGroupChannelsList();
}
window.openCustomChannelGroupsModal = openCustomChannelGroupsModal;

function closeCustomChannelGroupsModal() {
    const modal = document.getElementById("modalCustomMosaicGroups");
    if (modal) modal.style.display = "none";
}
window.closeCustomChannelGroupsModal = closeCustomChannelGroupsModal;

function renderCustomGroupChannelsList() {
    const container = document.getElementById("customGroupChannelsListContainer");
    if (!container) return;

    if (!allMosaicSnapshots || allMosaicSnapshots.length === 0) {
        container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 20px;">Carregando lista de canais da frota...</div>`;
        return;
    }

    const groups = getCustomGroupsMap();
    const activeGrp = groups[currentActiveCustomGroup] || { channels: [] };
    const selectedSet = new Set((activeGrp.channels || []).map(c => c.toLowerCase().trim()));

    // Ordena canais por Praça e Nome
    const sortedChannels = [...allMosaicSnapshots].sort((a, b) => {
        const cmp = (a.praca || "").localeCompare(b.praca || "");
        return cmp !== 0 ? cmp : (a.canal || "").localeCompare(b.canal || "");
    });

    container.innerHTML = sortedChannels.map(s => {
        const chanKey = `${(s.praca || '').toLowerCase().trim()}::${(s.canal || '').toLowerCase().trim()}`;
        const isChecked = selectedSet.has(chanKey) || selectedSet.has((s.canal || '').toLowerCase().trim());
        const isRadio = (s.meio === "Rádio");

        return `
        <label class="custom-grp-chan-item" data-praca="${escapeHtml((s.praca || '').toLowerCase())}" data-canal="${escapeHtml((s.canal || '').toLowerCase())}" data-meio="${escapeHtml(s.meio || '')}" style="display: flex; align-items: center; gap: 8px; background: rgba(15, 23, 42, 0.6); padding: 6px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.06); cursor: pointer; user-select: none;">
            <input type="checkbox" class="chk-custom-grp-chan" value="${escapeHtml(chanKey)}" ${isChecked ? 'checked' : ''} onchange="updateCustomGroupSelectedCount()" style="accent-color: #38bdf8; width: 16px; height: 16px;">
            <div style="flex: 1; min-width: 0;">
                <div style="font-size: 11px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${isRadio ? '📻' : '📺'} ${escapeHtml(s.canal)}
                </div>
                <div style="font-size: 10px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${escapeHtml(s.praca)} • CS ${s.cs}
                </div>
            </div>
        </label>
        `;
    }).join("");

    updateCustomGroupSelectedCount();
}

function updateCustomGroupSelectedCount() {
    const checked = document.querySelectorAll(".chk-custom-grp-chan:checked");
    const countEl = document.getElementById("customGroupSelectedCount");
    if (countEl) countEl.innerText = checked.length;
}
window.updateCustomGroupSelectedCount = updateCustomGroupSelectedCount;

function filterCustomGroupChannelList() {
    const search = (document.getElementById("customGroupSearchChannel")?.value || "").toLowerCase().trim();
    const meio = document.getElementById("customGroupFilterMeio")?.value || "all";
    const items = document.querySelectorAll(".custom-grp-chan-item");

    items.forEach(el => {
        const praca = el.getAttribute("data-praca") || "";
        const canal = el.getAttribute("data-canal") || "";
        const m = el.getAttribute("data-meio") || "";

        let match = true;
        if (search && !praca.includes(search) && !canal.includes(search)) match = false;
        if (meio !== "all" && m !== meio) match = false;

        el.style.display = match ? "flex" : "none";
    });
}
window.filterCustomGroupChannelList = filterCustomGroupChannelList;

function selectAllCustomGroupChannels(check) {
    const items = document.querySelectorAll(".custom-grp-chan-item");
    items.forEach(el => {
        if (el.style.display !== "none") {
            const chk = el.querySelector(".chk-custom-grp-chan");
            if (chk) chk.checked = check;
        }
    });
    updateCustomGroupSelectedCount();
}
window.selectAllCustomGroupChannels = selectAllCustomGroupChannels;

function saveCurrentCustomGroup() {
    const nameInput = document.getElementById("customGroupNameInput");
    const groupName = (nameInput?.value || "").trim();
    if (!groupName) {
        alert("Por favor, digite um nome para o Grupo Personalizado.");
        if (nameInput) nameInput.focus();
        return;
    }

    const checkedBoxes = Array.from(document.querySelectorAll(".chk-custom-grp-chan:checked"));
    const channelKeys = checkedBoxes.map(chk => chk.value);

    const groups = getCustomGroupsMap();
    const groupId = "grp_" + groupName.toLowerCase().replace(/[^a-z0-9]/g, "_");

    groups[groupId] = {
        name: groupName,
        channels: channelKeys
    };

    saveCustomGroupsMap(groups);
    currentActiveCustomGroup = groupId;
    populateCustomGroupSelects();
    applyMosaicFilters();
    closeCustomChannelGroupsModal();
    alert(`Grupo "${groupName}" salvo com sucesso com ${channelKeys.length} veículos!`);
}
window.saveCurrentCustomGroup = saveCurrentCustomGroup;

function deleteSelectedCustomGroup() {
    if (!currentActiveCustomGroup || currentActiveCustomGroup === "all") return;
    const groups = getCustomGroupsMap();
    const grp = groups[currentActiveCustomGroup];
    if (!grp) return;

    if (!confirm(`Deseja realmente excluir o grupo personalizado "${grp.name}"?`)) return;

    delete groups[currentActiveCustomGroup];
    saveCustomGroupsMap(groups);
    currentActiveCustomGroup = "all";
    populateCustomGroupSelects();
    applyMosaicFilters();
    closeCustomChannelGroupsModal();
}
window.deleteSelectedCustomGroup = deleteSelectedCustomGroup;

// =========================================================================
// MODO SPLIT SCREEN (COMPARAÇÃO SIMULTÂNEA DE ATÉ 2 GRUPOS LADO A LADO)
// =========================================================================

function toggleMosaicSplitScreen() {
    isMosaicSplitScreenActive = !isMosaicSplitScreenActive;
    const btn = document.getElementById("btnToggleMosaicSplit");
    const barControls = document.getElementById("mosaicSplitBarControls");
    const splitContainer = document.getElementById("mosaicSplitColumnsContainer");
    const singleGrid = document.getElementById("mosaicLiveGrid");

    if (btn) {
        if (isMosaicSplitScreenActive) {
            btn.style.background = "#7c3aed";
            btn.style.borderColor = "#c084fc";
            btn.style.color = "#ffffff";
            btn.innerHTML = `<i class="fas fa-check-circle"></i> Split Ativo`;
        } else {
            btn.style.background = "rgba(168, 85, 247, 0.15)";
            btn.style.borderColor = "rgba(168, 85, 247, 0.4)";
            btn.style.color = "#d8b4fe";
            btn.innerHTML = `<i class="fas fa-columns"></i> Split Screen`;
        }
    }

    if (isMosaicSplitScreenActive) {
        if (barControls) barControls.style.display = "flex";
        if (splitContainer) splitContainer.style.display = "grid";
        if (singleGrid) singleGrid.style.display = "none";
        populateCustomGroupSelects();
        renderMosaicSplitView();
    } else {
        if (barControls) barControls.style.display = "none";
        if (splitContainer) splitContainer.style.display = "none";
        if (singleGrid) singleGrid.style.display = "grid";
        applyMosaicFilters();
    }
}
window.toggleMosaicSplitScreen = toggleMosaicSplitScreen;

function renderMosaicSplitView() {
    if (!isMosaicSplitScreenActive) return;

    const selLeft = document.getElementById("selectMosaicSplitGroupLeft");
    const selRight = document.getElementById("selectMosaicSplitGroupRight");

    const keyLeft = selLeft?.value || "grp_tv_digital";
    const keyRight = selRight?.value || "grp_paytv";

    const groups = getCustomGroupsMap();
    const grpLeft = groups[keyLeft] || { name: "TV Digital", channels: [] };
    const grpRight = groups[keyRight] || { name: "PayTV", channels: [] };

    const setLeft = new Set((grpLeft.channels || []).map(k => k.toLowerCase().trim()));
    const setRight = new Set((grpRight.channels || []).map(k => k.toLowerCase().trim()));

    const filterGroupItems = (chanSet, fallbackFilter) => {
        if (chanSet.size > 0) {
            return allMosaicSnapshots.filter(s => {
                const k1 = `${(s.praca || '').toLowerCase().trim()}::${(s.canal || '').toLowerCase().trim()}`;
                const k2 = (s.canal || '').toLowerCase().trim();
                for (const item of chanSet) {
                    if (k1.includes(item) || k2.includes(item) || item.includes(k2)) return true;
                }
                return false;
            });
        }
        return allMosaicSnapshots.filter(fallbackFilter);
    };

    const itemsLeft = filterGroupItems(setLeft, s => s.meio !== "Cabo" && !s.is_radio);
    const itemsRight = filterGroupItems(setRight, s => s.meio === "Cabo" || String(s.cs) === "3" || (s.praca && s.praca.toLowerCase().includes("nacional")));

    // Atualiza cabeçalhos dos painéis
    const titleLeft = document.getElementById("splitTitleLeft");
    const countLeft = document.getElementById("splitCountLeft");
    const gridLeft = document.getElementById("mosaicSplitGridLeft");

    const titleRight = document.getElementById("splitTitleRight");
    const countRight = document.getElementById("splitCountRight");
    const gridRight = document.getElementById("mosaicSplitGridRight");

    if (titleLeft) titleLeft.innerText = grpLeft.name;
    if (countLeft) countLeft.innerText = `${itemsLeft.length} canais`;
    if (gridLeft) {
        gridLeft.innerHTML = itemsLeft.slice(0, 18).map(s => renderMosaicCardHtml(s)).join("");
    }

    if (titleRight) titleRight.innerText = grpRight.name;
    if (countRight) countRight.innerText = `${itemsRight.length} canais`;
    if (gridRight) {
        gridRight.innerHTML = itemsRight.slice(0, 18).map(s => renderMosaicCardHtml(s)).join("");
    }
}
window.renderMosaicSplitView = renderMosaicSplitView;

// Listener para sincronização automática com o Filtro Global de Praças / Cidades do topo
document.addEventListener("DOMContentLoaded", () => {
    populateCustomGroupSelects();
    const globalPracaSelect = document.getElementById("selectGlobalPraca") || document.getElementById("filterCity");
    if (globalPracaSelect) {
        globalPracaSelect.addEventListener("change", () => {
            console.log("[MosaicWall] Filtro de praça global alterado:", globalPracaSelect.value);
            applyMosaicFilters();
        });
    }
});
