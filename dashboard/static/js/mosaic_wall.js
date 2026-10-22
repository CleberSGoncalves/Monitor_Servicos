// dashboard/static/js/mosaic_wall.js
// Central de Mosaico Visual de Snapshots em Tempo Real, Storyboard e Kill-Switch Operacional

let mosaicTimer = null;
let currentMosaicInterval = 10;
let cachedMosaicSnapshots = [];
let cachedFeatureFlags = [];

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
// SUBTAB CHANNELS: TABELA VS MOSAICO VISUAL
// =========================================================================
function switchChannelsSubtab(subtabId) {
    const tableBtn = document.getElementById("btn-chan-subtab-table");
    const mosaicBtn = document.getElementById("btn-chan-subtab-mosaic");
    const tableContent = document.getElementById("channels-content-table");
    const mosaicContent = document.getElementById("channels-content-mosaic");

    if (subtabId === "table") {
        if (tableBtn) tableBtn.classList.add("active");
        if (mosaicBtn) mosaicBtn.classList.remove("active");
        if (tableContent) tableContent.style.display = "block";
        if (mosaicContent) mosaicContent.style.display = "none";
        stopMosaicTimer();
    } else if (subtabId === "mosaic") {
        if (tableBtn) tableBtn.classList.remove("active");
        if (mosaicBtn) mosaicBtn.classList.add("active");
        if (tableContent) tableContent.style.display = "none";
        if (mosaicContent) mosaicContent.style.display = "block";
        loadChannelsMosaic();
        startMosaicTimer();
    }
}
window.switchChannelsSubtab = switchChannelsSubtab;

function startMosaicTimer() {
    stopMosaicTimer();
    if (currentMosaicInterval <= 0) return;
    mosaicTimer = setInterval(() => {
        const mosaicContent = document.getElementById("channels-content-mosaic");
        if (mosaicContent && mosaicContent.style.display !== "none") {
            loadChannelsMosaic(true);
        }
    }, currentMosaicInterval * 1000);
}

function stopMosaicTimer() {
    if (mosaicTimer) clearInterval(mosaicTimer);
    mosaicTimer = null;
}

function changeMosaicInterval(val) {
    currentMosaicInterval = parseInt(val, 10);
    const status = document.getElementById("mosaicTimerStatus");
    if (status) {
        if (currentMosaicInterval === 0) {
            status.innerHTML = "⏸️ Pausado";
            status.style.background = "rgba(100, 116, 139, 0.2)";
            status.style.color = "#94a3b8";
            status.style.borderColor = "#64748b";
        } else {
            status.innerHTML = `⏱️ ${currentMosaicInterval}s ativo`;
            status.style.background = "rgba(37, 99, 235, 0.2)";
            status.style.color = "#60a5fa";
            status.style.borderColor = "#2563eb";
        }
    }
    startMosaicTimer();
}
window.changeMosaicInterval = changeMosaicInterval;

async function loadChannelsMosaic(isSilent = false) {
    const grid = document.getElementById("channelsMosaicGrid");
    if (!grid) return;

    if (!isSilent) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Carregando mosaico de snapshots em tempo real...</div>`;
    }

    try {
        const token = getMosaicAuthToken();
        const cityFilter = document.getElementById("filterCity") ? document.getElementById("filterCity").value : "";
        const countryFilter = document.getElementById("filterCountry") ? document.getElementById("filterCountry").value : "";

        let url = "/api/fleet/channels/snapshots?";
        if (cityFilter && cityFilter !== "all") url += `city=${encodeURIComponent(cityFilter)}&`;
        if (countryFilter && countryFilter !== "all") url += `country=${encodeURIComponent(countryFilter)}&`;

        const resp = await fetch(url, {
            headers: token ? { "Authorization": `Bearer ${token}` } : {}
        });
        if (!resp.ok) return;

        const data = await resp.json();
        cachedMosaicSnapshots = data.snapshots || [];
        renderChannelsMosaic(cachedMosaicSnapshots);
    } catch (err) {
        if (!isSilent) {
            grid.innerHTML = `<div style="grid-column: 1/-1; color: var(--accent-red); padding: 20px;">Falha ao carregar mosaico de snapshots: ${err.message}</div>`;
        }
    }
}
window.loadChannelsMosaic = loadChannelsMosaic;

function renderChannelsMosaic(snapshots) {
    const grid = document.getElementById("channelsMosaicGrid");
    if (!grid) return;

    if (!snapshots || snapshots.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">Nenhum canal ativo para os filtros selecionados.</div>`;
        return;
    }

    grid.innerHTML = snapshots.map(s => {
        let frameVisual = "";
        let borderCol = "var(--border-color)";

        if (s.status === "CONGELADO") {
            borderCol = "#ef4444";
            frameVisual = `
                <div style="position: absolute; inset: 0; background: rgba(239, 68, 68, 0.15); display: flex; align-items: center; justify-content: center; flex-direction: column;">
                    <span style="font-size: 26px; margin-bottom: 4px;">⚠️</span>
                    <strong style="color: #f87171; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Quadro Estático</strong>
                    <span style="font-size: 10px; color: #fca5a5; font-family: monospace;">Delta: 0.00% • GOP Stall</span>
                </div>
            `;
        } else if (s.status === "DEGRADADO (RF)") {
            borderCol = "#f59e0b";
            frameVisual = `
                <div style="position: absolute; inset: 0; background: rgba(245, 158, 11, 0.12); display: flex; align-items: center; justify-content: center; flex-direction: column;">
                    <span style="font-size: 24px; margin-bottom: 4px;">📶</span>
                    <strong style="color: #fbbf24; font-size: 11px; text-transform: uppercase;">Oscilação de Sinal RF</strong>
                    <span style="font-size: 10px; color: #fde68a;">Qualidade ${s.qualidade}% (&lt; 45%)</span>
                </div>
            `;
        } else if (s.status === "PAUSADO") {
            borderCol = "#64748b";
            frameVisual = `
                <div style="position: absolute; inset: 0; background: rgba(100, 116, 139, 0.2); display: flex; align-items: center; justify-content: center; flex-direction: column;">
                    <span style="font-size: 22px; margin-bottom: 4px;">⏸️</span>
                    <strong style="color: #94a3b8; font-size: 11px;">Captura Pausada (Kill-Switch)</strong>
                </div>
            `;
        } else {
            // Nominal
            frameVisual = `
                <div style="position: absolute; inset: 0; background: linear-gradient(135deg, rgba(30, 58, 138, 0.3), rgba(15, 23, 42, 0.8)); display: flex; align-items: center; justify-content: center; flex-direction: column;">
                    <div style="font-weight: 800; font-size: 18px; color: rgba(255, 255, 255, 0.85); letter-spacing: 1px;">${escapeHtml(s.canal)}</div>
                    <div style="font-size: 10px; color: #38bdf8; margin-top: 4px; font-family: monospace;">TRANSMISSÃO AO VIVO • ATRIA DTV</div>
                </div>
            `;
        }

        let storyboardBtn = "";
        if (s.storyboard && s.storyboard.length > 0) {
            storyboardBtn = `
                <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px; width: 100%; margin-top: 8px; border-color: ${borderCol}; color: #38bdf8;" onclick="openStoryboardModal('${escapeHtml(s.canal)}', '${escapeHtml(s.praca)}')">
                    <i class="fas fa-film"></i> 🔍 Ver Sequência do Incidente (3 Quadros)
                </button>
            `;
        }

        return `
            <div class="panel-card" style="border: 1px solid ${borderCol}; padding: 12px; margin-bottom: 0; display: flex; flex-direction: column; justify-content: space-between;">
                <div>
                    <!-- Top Info -->
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <div>
                            <div style="font-weight: 700; color: #fff; font-size: 13px;">${escapeHtml(s.canal)}</div>
                            <div style="font-size: 11px; color: var(--text-muted);">${escapeHtml(s.praca)} • CS ${s.cs}</div>
                        </div>
                        <span class="badge" style="background: rgba(0,0,0,0.4); color: ${s.status_color}; border: 1px solid ${s.status_color}; font-size: 10px; font-weight: 700;">
                            ${s.status}
                        </span>
                    </div>

                    <!-- Snapshot Screen Preview -->
                    <div style="position: relative; width: 100%; height: 160px; background: #000; border-radius: 4px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08);">
                        ${frameVisual}
                        <!-- OSD Info -->
                        <div style="position: absolute; bottom: 6px; left: 8px; font-family: monospace; font-size: 9px; color: rgba(255,255,255,0.7); background: rgba(0,0,0,0.6); padding: 2px 6px; border-radius: 3px;">
                            ${s.last_frame_time} • ${s.resolution}
                        </div>
                        <div style="position: absolute; bottom: 6px; right: 8px; font-family: monospace; font-size: 9px; color: #34d399; background: rgba(0,0,0,0.6); padding: 2px 6px; border-radius: 3px;">
                            Q: ${s.qualidade}% | F: ${s.forca}%
                        </div>
                    </div>
                </div>

                <div>
                    ${storyboardBtn}
                </div>
            </div>
        `;
    }).join("");
}

// =========================================================================
// STORYBOARD FORENSE (SEQUÊNCIA DE 3 JPEGs DO INCIDENTE)
// =========================================================================
function openStoryboardModal(canalName, pracaName) {
    const s = cachedMosaicSnapshots.find(item => item.canal.toLowerCase() === canalName.toLowerCase() && item.praca.toLowerCase() === pracaName.toLowerCase());
    if (!s || !s.storyboard) return;

    const modal = document.getElementById("storyboardModal");
    const subTitle = document.getElementById("storyboardSubtitle");
    const container = document.getElementById("storyboardFramesContainer");

    if (subTitle) subTitle.innerText = `${s.canal} • ${s.praca} (CS ${s.cs}) • Diagnóstico Forense de Evidência Visual`;

    if (container) {
        container.innerHTML = s.storyboard.map((frame, idx) => {
            let isLast = idx === 2;
            let bgStyle = isLast 
                ? "background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444;" 
                : (idx === 1 ? "background: rgba(245, 158, 11, 0.15); border: 1px solid #f59e0b;" : "background: rgba(16, 185, 129, 0.15); border: 1px solid #10b981;");
            let badgeText = isLast ? "FALHA CONFIRMADA" : (idx === 1 ? "ANOMALIA DETECTADA" : "NOMINAL");

            return `
                <div style="background: rgba(0,0,0,0.4); border-radius: 6px; border: 1px solid var(--border-color); overflow: hidden;">
                    <div style="position: relative; width: 100%; height: 140px; display: flex; align-items: center; justify-content: center; flex-direction: column; ${bgStyle}">
                        <div style="font-weight: 800; font-size: 15px; color: #fff;">${escapeHtml(s.canal)}</div>
                        <span class="badge" style="margin-top: 6px; font-size: 10px;">${badgeText}</span>
                    </div>
                    <div style="padding: 10px;">
                        <div style="font-weight: 700; font-size: 12px; color: #38bdf8;">${frame.step}</div>
                        <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">Horário: <strong>${frame.timestamp}</strong></div>
                        <div style="font-size: 11px; color: #cbd5e1; margin-top: 6px; line-height: 1.4;">${frame.frame_desc}</div>
                    </div>
                </div>
            `;
        }).join("");
    }

    if (modal) modal.classList.add("active");
}
window.openStoryboardModal = openStoryboardModal;

function closeStoryboardModal() {
    const modal = document.getElementById("storyboardModal");
    if (modal) modal.classList.remove("active");
}
window.closeStoryboardModal = closeStoryboardModal;


// =========================================================================
// SUBTAB CONFIGS: FEATURE FLAGS & KILL-SWITCH OPERACIONAL
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
        cachedFeatureFlags = flags;
        renderFeatureFlags(flags);
    } catch (err) {
        container.innerHTML = `<div style="color: var(--accent-red); padding: 10px;">Erro ao obter chaves: ${err.message}</div>`;
    }
}
window.loadFeatureFlagsUI = loadFeatureFlagsUI;

function filterFeatureFlagsDisplay(scopeFilter) {
    if (!cachedFeatureFlags) return;
    if (scopeFilter === "all") {
        renderFeatureFlags(cachedFeatureFlags);
    } else {
        const filtered = cachedFeatureFlags.filter(f => f.scope_type === scopeFilter);
        renderFeatureFlags(filtered);
    }
}
window.filterFeatureFlagsDisplay = filterFeatureFlagsDisplay;

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
                        <span style="font-size: 12px; font-weight: 600; color: #fff;">${isEn ? "Ativo" : "Desativado"}</span>
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
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
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
            alert(`🛡️ Chave de monitoramento '${flagKey}' foi ${statusDesc} no escopo ${scopeType} (${scopeValue})!\n\nAs praças e o dashboard respeitarão este parâmetro imediatamente.`);
            loadFeatureFlagsUI();
        } else {
            alert("Erro ao atualizar chave.");
            loadFeatureFlagsUI();
        }
    } catch (err) {
        alert(`Erro de conexão: ${err.message}`);
        loadFeatureFlagsUI();
    }
}
window.handleFlagToggle = handleFlagToggle;

function escapeHtml(text) {
    if (!text) return "";
    return text.toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
