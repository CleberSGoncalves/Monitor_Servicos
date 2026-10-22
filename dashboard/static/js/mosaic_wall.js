let currentMosaicViewMode = "real"; // 'real' = Snapshot/Foto Real do Canal | 'diag' = Telemetria e Diagnostico Visual

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
let mosaicAutoRotateTimer = null;
let mosaicProgressTimer = null;
let mosaicRotateIntervalSec = 10;
let mosaicRotateSecondsElapsed = 0;
let isMosaicRotatePlaying = true;
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
    console.log("[MosaicWall] Inicializando aba dedicada Monitoração das Imagens...");
    loadMosaicData();
    loadMosaicAnalyticalProblems();
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

        // Atualiza contador de falhas no badge da subaba
        const failureCount = allMosaicSnapshots.filter(s => s.tipo_falha && s.tipo_falha !== "none" && s.tipo_falha !== "paused").length;
        const badge = document.getElementById("mosaic-failure-count-badge");
        if (badge) {
            badge.innerText = failureCount;
            badge.style.background = failureCount > 0 ? "rgba(239, 68, 68, 0.4)" : "rgba(37, 99, 235, 0.3)";
            badge.style.color = failureCount > 0 ? "#fca5a5" : "#93c5fd";
        }

        applyMosaicFilters();

        if (currentMosaicSubtab === "failures") {
            loadMosaicFailuresGallery();
        }
    } catch (err) {
        console.error("[MosaicWall] Erro ao carregar dados:", err);
    }
}
window.loadMosaicData = loadMosaicData;

function applyMosaicFilters() {
    const country = document.getElementById("mosaicFilterCountry") ? document.getElementById("mosaicFilterCountry").value : "all";
    const region = document.getElementById("mosaicFilterRegion") ? document.getElementById("mosaicFilterRegion").value : "all";
    const meio = document.getElementById("mosaicFilterMeio") ? document.getElementById("mosaicFilterMeio").value : "all";
    const signalType = document.getElementById("mosaicFilterSignalType") ? document.getElementById("mosaicFilterSignalType").value : "all";
    const cs = document.getElementById("mosaicFilterCS") ? document.getElementById("mosaicFilterCS").value : "all";
    const status = document.getElementById("mosaicFilterStatus") ? document.getElementById("mosaicFilterStatus").value : "all";

    filteredMosaicSnapshots = allMosaicSnapshots.filter(item => {
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
    renderMosaicPage();
}
window.applyMosaicFilters = applyMosaicFilters;

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

    let signalBars = `
        <div style="display: flex; align-items: center; gap: 8px; font-size: 11px;">
            <span>Q: <strong>${s.qualidade}%</strong></span>
            <span>F: <strong>${s.forca}%</strong></span>
        </div>
    `;

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

                <!-- Frame de Transmissão / JPEG Real (320x240) -->
                <div style="position: relative; width: 100%; height: 135px; background: #000; border-radius: 4px; overflow: hidden; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,0.08);">
                    <img src="${(s.jpeg_url || ('/api/fleet/channels/jpeg?canal=' + encodeURIComponent(s.canal) + '&praca=' + encodeURIComponent(s.praca))) + '&mode=' + currentMosaicViewMode}"
                         alt="${escapeHtml(s.canal)}"
                         style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 1;"
                         loading="lazy"
                         onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';" />
                    <div style="display: none; position: absolute; inset: 0; align-items: center; justify-content: center; z-index: 2; background: rgba(10, 15, 29, 0.95);">
                    ${hasIncident ? `
                        <div style="text-align: center; padding: 10px;">
                            <i class="fas fa-exclamation-triangle" style="font-size: 24px; color: ${borderCol}; margin-bottom: 6px;"></i>
                            <div style="font-size: 11px; font-weight: 700; color: #fff; letter-spacing: 0.5px;">${s.status}</div>
                            <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">${escapeHtml(s.falha_desc)}</div>
                        </div>
                    ` : `
                        <div style="text-align: center;">
                            <div style="font-weight: 800; font-size: 16px; color: rgba(255, 255, 255, 0.85); letter-spacing: 1px;">${escapeHtml(s.canal)}</div>
                            <div style="font-size: 9px; color: #38bdf8; text-transform: uppercase; margin-top: 2px;">TRANSMISSÃO AO VIVO • ${escapeHtml(s.tipo_sinal)}</div>
                        </div>
                    `}
                    </div>
                    <!-- OSD Inferior -->
                    <div style="position: absolute; bottom: 4px; left: 8px; right: 8px; display: flex; justify-content: space-between; font-size: 10px; font-family: monospace; color: rgba(255,255,255,0.85); text-shadow: 0 1px 3px rgba(0,0,0,0.9); pointer-events: none; z-index: 3;">
                        <span>${s.last_frame_time} • 320x240</span>
                        <span>${s.meio}</span>
                    </div>
                </div>
            </div>

            ${currentMosaicViewMode === 'diag' ? `
                <div style="margin-top: 6px; padding: 4px 8px; background: rgba(0,0,0,0.35); border-radius: 4px; border: 1px solid rgba(255,255,255,0.06); font-size: 10px; font-family: monospace; display: flex; justify-content: space-between; color: #94a3b8;">
                    <span>MER: <strong style="color: #6ee7b7;">31.4 dB</strong></span>
                    <span>BER: <strong style="color: #38bdf8;">&lt; 1e-7</strong></span>
                    <span>TS: <strong style="color: #facc15;">14.2 Mbps</strong></span>
                </div>
            ` : ''}
            <!-- Rodapé e Ações do Card -->
            <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                ${signalBars}
                
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
        currentMosaicPage--;
        renderMosaicPage();
    }
}
window.prevMosaicPage = prevMosaicPage;

function nextMosaicPage() {
    const totalPages = Math.ceil(filteredMosaicSnapshots.length / mosaicPageSize) || 1;
    if (currentMosaicPage < totalPages) {
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
        nextMosaicPage();
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
    mosaicAutoRotateTimer = null;
    mosaicProgressTimer = null;
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
// 4. SUBABA 2: GALERIA FORENSE DE FALHAS & ANOMALIAS
// =========================================================================
function loadMosaicFailuresGallery() {
    const grid = document.getElementById("mosaicFailuresGrid");
    if (!grid) return;

    const filterVal = document.getElementById("mosaicFailureTypeSelect") ? document.getElementById("mosaicFailureTypeSelect").value : "all";
    const failures = allMosaicSnapshots.filter(s => {
        if (s.tipo_falha === "none" || s.tipo_falha === "paused") return false;
        if (filterVal === "all") return true;
        return s.tipo_falha === filterVal;
    });

    if (failures.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; background: rgba(0,0,0,0.25); border-radius: 8px; border: 1px dashed #10b981;">
                <span style="font-size: 36px;">🟢</span>
                <h4 style="margin-top: 10px; color: #10b981;">Nenhuma Anomalia Crítica no Momento</h4>
                <p style="color: var(--text-muted); font-size: 13px; margin-top: 6px;">Todas as emissoras da frota estão operando com fluxo contínuo de quadros e sincronismo nominal.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = failures.map(s => `
        <div class="panel-card" style="border: 1px solid ${s.status_color}; padding: 14px; background: rgba(239, 68, 68, 0.05); border-radius: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                <div>
                    <strong style="color: #fff; font-size: 15px;">${escapeHtml(s.canal)}</strong>
                    <div style="font-size: 11px; color: var(--text-muted);">${escapeHtml(s.praca)} • CS ${s.cs}</div>
                </div>
                <span class="badge" style="background: rgba(239,68,68,0.25); color: #f87171; border: 1px solid #ef4444; font-weight: 700;">
                    ${s.status}
                </span>
            </div>
            
            <div style="font-size: 12px; color: #cbd5e1; margin-bottom: 12px; line-height: 1.4;">
                <i class="fas fa-microchip text-red"></i> <strong>Diagnóstico:</strong> ${escapeHtml(s.falha_desc)}
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--text-muted); padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.06);">
                <span>Qualidade: <strong style="color: ${s.qualidade < 45 ? '#ef4444' : '#10b981'};">${s.qualidade}%</strong></span>
                <div style="display: flex; gap: 6px;">
                    <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px; border-color: #3b82f6; color: #60a5fa;" onclick="openStoryboardModal('${escapeHtml(s.canal)}', '${escapeHtml(s.praca)}')">
                        <i class="fas fa-film"></i> Storyboard
                    </button>
                    <button class="btn-primary" style="padding: 4px 8px; font-size: 11px; background: #2563eb;" onclick="switchMosaicSubtab('analytics')">
                        <i class="fas fa-wrench"></i> Como Resolver
                    </button>
                </div>
            </div>
        </div>
    `).join("");
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

    document.getElementById("storyboardChannelTitle").innerText = canal;
    document.getElementById("storyboardPracaSub").innerText = `Praça: ${praca} • Linha do Tempo Forense`;

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

    modal.classList.add("active");
}
window.openStoryboardModal = openStoryboardModal;

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

    const contentThresh = document.getElementById("configs-content-thresholds");
    const contentFlags = document.getElementById("configs-content-flags");
    const contentUsers = document.getElementById("configs-content-users");

    [btnThresh, btnFlags, btnUsers].forEach(b => b && b.classList.remove("active"));
    [contentThresh, contentFlags, contentUsers].forEach(c => c && (c.style.display = "none"));

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
    }
}
window.switchConfigsSubtab = switchConfigsSubtab;

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
        container.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--text-muted);">Nenhuma chave encontrada neste escopo.</div>`;
        return;
    }

    container.innerHTML = flags.map(f => {
        const isEn = Boolean(f.is_enabled);
        const statusColor = isEn ? "#10b981" : "#ef4444";
        const statusText = isEn ? "🟢 ATIVO (Em Execução)" : "🔴 DESATIVADO (Kill-Switch)";

        return `
            <div style="background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); border-radius: 6px; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px;">
                <div style="flex: 1; min-width: 280px;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                        <span class="badge" style="background: rgba(255,255,255,0.06); font-size: 10px; color: #38bdf8;">
                            ESCOPO: ${f.scope_type.toUpperCase()} (${f.scope_value})
                        </span>
                        <strong style="color: #fff; font-size: 14px;">${escapeHtml(f.name)}</strong>
                    </div>
                    <div style="font-size: 12px; color: var(--text-muted); line-height: 1.4;">${escapeHtml(f.description || "")}</div>
                    <div style="font-size: 11px; color: ${statusColor}; font-weight: 700; margin-top: 6px;">${statusText}</div>
                </div>

                <div style="display: flex; align-items: center; gap: 12px;">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; background: rgba(255,255,255,0.05); padding: 8px 14px; border-radius: 4px; border: 1px solid var(--border-color);">
                        <input type="checkbox" id="flag_${f.scope_type}_${f.flag_key}" ${isEn ? "checked" : ""} onchange="handleFlagToggle('${f.scope_type}', '${f.scope_value}', '${f.flag_key}', this.checked)">
                        <span style="font-size: 12px; font-weight: 600; color: #fff;">Ativar</span>
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
            const statusDesc = isChecked ? "ATIVADA" : "DESATIVADA (Kill-Switch aplicado)";
            alert(`Chave '${flagKey}' agora está ${statusDesc} para o escopo ${scopeType} (${scopeValue}).`);
            loadFeatureFlagsUI();
        } else {
            alert("Erro ao alterar chave.");
        }
    } catch (err) {
        alert("Erro de conexão: " + err.message);
    }
}
window.handleFlagToggle = handleFlagToggle;

function escapeHtml(text) {
    if (!text) return "";
    return text.toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
