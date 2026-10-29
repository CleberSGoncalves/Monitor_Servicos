// dashboard/static/js/audio_sync.js
/**
 * Módulo de Auditoria Forense de Conteúdo e Sincronismo de Áudio:
 * Comparação de Matérias: CS01 (Principal - MP3/MP4) vs CS02/CS03 (BKP - ASF)
 *Pareamento Estrito pelo Mesmo Horário de Gravação (YYYYMMDDHHMM) e Envelope de Modulação Invariante a Volume.
 * Repositório Oficial Read-Only no NAS: \\ibnas01sp-nas.grupoibope.corp\MediaDNA01\VideoRecord\{ANO}\{MES}\{DIA}\{IDPV}
 */

// Helper seguro para escape de strings no DOM (previne ReferenceError e XSS)
function escapeHtml(text) {
    if (text === null || text === undefined) return "";
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
window.escapeHtml = window.escapeHtml || escapeHtml;

// Extrai o bloco de horário formatado a partir do metadado ou do próprio nome do arquivo NAS
function extractMatchedTimeWindow(ch) {
    if (ch && ch.matched_time_window) {
        return ch.matched_time_window;
    }
    const fname = (ch && (ch.cs01_filename || ch.cs02_filename)) ? String(ch.cs01_filename || ch.cs02_filename) : "";
    const m = fname.match(/^H\d+_PV\d+_(\d{12,17})_\d+_(\d{6,9})_/i);
    if (m) {
        const s = m[1];
        const e = m[2];
        return `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)} • ${s.slice(8, 10)}:${s.slice(10, 12)} às ${e.slice(0, 2)}:${e.slice(2, 4)}`;
    }
    return "Mesma Janela de 30 min";
}

let audioSyncCurrentFilter = "divergent_and_desynced"; // Padrão: mostra apenas o que está com divergência de conteúdo ou atraso temporal
let audioSyncCurrentSearch = "";
let audioSyncCurrentPraca = "all";
let audioSyncCachedData = null;
let audioSyncSearchDebounce = null;

// Limpa caches antigos que continham pareamento sem filtro de horário ou métricas de volume
try {
    localStorage.removeItem("fleet_audio_sync_cache_v1");
    localStorage.removeItem("fleet_audio_sync_cache_v2");
    const localSaved = localStorage.getItem("fleet_audio_sync_cache_v3");
    if (localSaved) {
        audioSyncCachedData = JSON.parse(localSaved);
    }
} catch (e) {
    console.warn("[AudioSync] Falha ao ler cache local:", e);
}

// Pré-carregamento assíncrono proativo do cache estático em segundo plano
(async function preloadAudioSyncStaticCache() {
    if (!audioSyncCachedData || !audioSyncCachedData.total_canais) {
        try {
            const staticRes = await fetch(`/static/data/audio_sync_cache.json?v=${Date.now()}`);
            if (staticRes.ok) {
                const sData = await staticRes.json();
                if (sData && sData.channels && sData.channels.length > 0) {
                    audioSyncCachedData = sData;
                    audioSyncCachedData.status = "success";
                    localStorage.setItem("fleet_audio_sync_cache_v3", JSON.stringify(sData));
                    console.log(`[AudioSync] Cache estático pré-carregado com sucesso: ${sData.channels.length} canais.`);
                }
            }
        } catch (_) {}
    }
})();

async function initAudioSyncTab() {
    setupAudioSyncControls();

    // 1. Se já tivermos dados em cache v3, renderiza de imediato (0ms de latência)
    if (audioSyncCachedData && audioSyncCachedData.channels && audioSyncCachedData.channels.length > 0) {
        try {
            renderAudioSyncKPIs(audioSyncCachedData);
            populateAudioSyncPracaDropdown(audioSyncCachedData.channels || []);
            applyAudioSyncClientFilterAndRender();
        } catch (e) {
            console.warn("[AudioSync] Erro ao pré-renderizar cache local:", e);
        }
    }

    // 2. Sincroniza dados frescos com o backend de forma resiliente
    await loadAudioSyncSummary(false);
}
window.initAudioSyncTab = initAudioSyncTab;

function setupAudioSyncControls() {
    const searchInput = document.getElementById("audioSyncSearchInput");
    if (searchInput && !searchInput._bound) {
        searchInput._bound = true;
        searchInput.addEventListener("input", function() {
            clearTimeout(audioSyncSearchDebounce);
            audioSyncSearchDebounce = setTimeout(() => {
                audioSyncCurrentSearch = this.value.trim();
                applyAudioSyncClientFilterAndRender();
            }, 180);
        });
    }

    const pracaFilter = document.getElementById("audioSyncPracaFilter");
    if (pracaFilter && !pracaFilter._bound) {
        pracaFilter._bound = true;
        pracaFilter.addEventListener("change", function() {
            audioSyncCurrentPraca = this.value;
            applyAudioSyncClientFilterAndRender();
        });
    }
}

function getAudioSyncAuthHeaders() {
    let token = "";
    if (typeof getAuthToken === "function") {
        try { token = getAuthToken(); } catch (_) {}
    }
    if (!token) {
        token = localStorage.getItem("fleet_token") || localStorage.getItem("token") || "";
    }
    const headers = { "Accept": "application/json" };
    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
}

async function loadAudioSyncSummary(forceRefresh = false) {
    const listContainer = document.getElementById("audioSyncListContainer");
    const refreshBtn = document.getElementById("btnRefreshAudioSync");
    if (refreshBtn) refreshBtn.classList.add("fa-spin");

    let data = null;
    let isOfflineFallback = false;

    try {
        // Tenta endpoint principal (carrega frota completa para filtragem cliente instantânea)
        let url = `/api/audio-sync/summary?filter_status=all&force=${forceRefresh}`;
        if (audioSyncCurrentSearch) url += `&search=${encodeURIComponent(audioSyncCurrentSearch)}`;
        if (audioSyncCurrentPraca && audioSyncCurrentPraca !== "all") url += `&praca=${encodeURIComponent(audioSyncCurrentPraca)}`;

        try {
            const res = await fetch(url, {
                headers: getAudioSyncAuthHeaders(),
                credentials: "same-origin"
            });
            if (res.ok) {
                const jsonRes = await res.json();
                if (jsonRes && jsonRes.status === "success" && Array.isArray(jsonRes.channels) && jsonRes.channels.length > 0) {
                    data = jsonRes;
                }
            }
        } catch (fetchErr) {
            console.warn("[AudioSync] Falha na rota dinâmica da API, acionando fallback:", fetchErr);
        }

        // Se a rota dinâmica não retornou dados válidos, recorre ao cache estático do servidor
        if (!data || !Array.isArray(data.channels) || data.channels.length === 0) {
            console.warn("[AudioSync] Buscando cache estático /static/data/audio_sync_cache.json...");
            try {
                const staticRes = await fetch(`/static/data/audio_sync_cache.json?v=${Date.now()}`);
                if (staticRes.ok) {
                    const staticJson = await staticRes.json();
                    if (staticJson && Array.isArray(staticJson.channels) && staticJson.channels.length > 0) {
                        data = staticJson;
                        data.status = "success";
                        isOfflineFallback = true;
                    }
                }
            } catch (staticErr) {
                console.warn("[AudioSync] Falha ao carregar cache estático:", staticErr);
            }
        }

        // Se ainda não obteve dados, tenta o cache em localStorage
        if (!data || !Array.isArray(data.channels) || data.channels.length === 0) {
            if (audioSyncCachedData && Array.isArray(audioSyncCachedData.channels) && audioSyncCachedData.channels.length > 0) {
                data = audioSyncCachedData;
                isOfflineFallback = true;
            }
        }

        // Validação final dos dados
        if (!data || !Array.isArray(data.channels) || data.channels.length === 0) {
            throw new Error("Não foi possível carregar os dados de sincronismo de nenhuma fonte disponível.");
        }

        audioSyncCachedData = data;

        // Salva cópia resiliente em localStorage
        try {
            localStorage.setItem("fleet_audio_sync_cache_v3", JSON.stringify(data));
        } catch (_) {}

        // Atualização da UI
        renderAudioSyncKPIs(data);
        populateAudioSyncPracaDropdown(data.channels);
        applyAudioSyncClientFilterAndRender();

        const lastUpdatedEl = document.getElementById("audioSyncLastUpdated");
        if (lastUpdatedEl) {
            if (isOfflineFallback) {
                lastUpdatedEl.innerHTML = `<span style="color: #facc15;"><i class="fas fa-database"></i> Cache Persistente (${data.last_updated || 'Offline'})</span>`;
            } else {
                lastUpdatedEl.innerHTML = `<i class="fas fa-check-circle" style="color: #34d399;"></i> Atualizado: ${data.last_updated || 'Agora'}`;
            }
        }
    } catch (err) {
        console.error("[AudioSync] Erro ao carregar auditoria:", err);

        // Se tivermos cache prévio, renderiza ele e exibe aviso discreto
        if (audioSyncCachedData && Array.isArray(audioSyncCachedData.channels) && audioSyncCachedData.channels.length > 0) {
            renderAudioSyncKPIs(audioSyncCachedData);
            populateAudioSyncPracaDropdown(audioSyncCachedData.channels);
            applyAudioSyncClientFilterAndRender();

            const lastUpdatedEl = document.getElementById("audioSyncLastUpdated");
            if (lastUpdatedEl) {
                lastUpdatedEl.innerHTML = `<span style="color: #facc15;"><i class="fas fa-exclamation-triangle"></i> Modo Offline (${audioSyncCachedData.last_updated || 'Cache'})</span>`;
            }
        } else if (listContainer) {
            listContainer.innerHTML = `
                <div class="panel-card" style="padding: 28px 20px; text-align: center; border-color: rgba(239, 68, 68, 0.4); background: rgba(239, 68, 68, 0.05); border-radius: 8px;">
                    <div style="font-size: 22px; color: #f87171; margin-bottom: 8px;">
                        <i class="fas fa-exclamation-triangle"></i> Falha ao carregar auditoria de sincronismo
                    </div>
                    <div style="color: #cbd5e1; font-size: 13px; margin-bottom: 8px;">
                        Não foi possível consultar os dados do repositório NAS VideoRecord.
                    </div>
                    <div style="font-family: monospace; font-size: 11px; color: #fca5a5; background: rgba(0,0,0,0.4); display: inline-block; padding: 6px 12px; border-radius: 4px; margin-bottom: 16px; max-width: 90%;">
                        ${escapeHtml(err.message || "Erro de conexão com o servidor")}
                    </div>
                    <div>
                        <button class="btn-primary" onclick="loadAudioSyncSummary(true)" style="padding: 7px 18px; font-size: 12px; background: #0284c7;">
                            <i class="fas fa-redo"></i> Tentar Novamente
                        </button>
                    </div>
                </div>
            `;
        }
    } finally {
        if (refreshBtn) refreshBtn.classList.remove("fa-spin");
    }
}
window.loadAudioSyncSummary = loadAudioSyncSummary;

function renderAudioSyncKPIs(data) {
    if (!data) return;

    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.innerText = (val !== undefined && val !== null) ? val : 0;
    };

    setVal("audioKpiTotal", data.total_canais ?? (data.channels ? data.channels.length : 0));
    setVal("audioKpiDivergentes", data.divergentes_count ?? 0);
    setVal("audioKpiDesalinhados", data.desalinhados_count ?? 0);
    setVal("audioKpiSincronizados", data.sincronizados_count ?? 0);

    const confPct = Number(data.taxa_conformidade_pct ?? 0);
    const confEl = document.getElementById("audioKpiConformidade");
    if (confEl) {
        confEl.innerText = `${confPct.toFixed(1)}%`;
        confEl.style.color = confPct >= 90 ? "#34d399" : (confPct >= 75 ? "#facc15" : "#f87171");
    }

    // Alerta visual no card de divergentes se houver emissora trocada no BKP
    const divCard = document.getElementById("audioKpiCardDivergentes");
    if (divCard) {
        if (Number(data.divergentes_count) > 0) {
            divCard.style.borderColor = "rgba(239, 68, 68, 0.75)";
            divCard.style.boxShadow = "0 0 16px rgba(239, 68, 68, 0.3)";
        } else {
            divCard.style.borderColor = "rgba(239, 68, 68, 0.35)";
            divCard.style.boxShadow = "none";
        }
    }
}

function populateAudioSyncPracaDropdown(channels) {
    const sel = document.getElementById("audioSyncPracaFilter");
    if (!sel || !sel.options || sel.options.length > 1) return;

    const pracas = new Set();
    const sourceList = (audioSyncCachedData && audioSyncCachedData.channels) ? audioSyncCachedData.channels : (channels || []);
    sourceList.forEach(c => {
        if (c && c.cidade) pracas.add(String(c.cidade).trim());
    });

    const sorted = Array.from(pracas).sort((a, b) => a.localeCompare(b, "pt-BR"));
    sorted.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p;
        opt.textContent = p;
        sel.appendChild(opt);
    });
}

function setAudioSyncFilter(filterType) {
    audioSyncCurrentFilter = filterType;

    // Atualiza classes e visual dos botões de filtro
    document.querySelectorAll(".audio-sync-filter-btn").forEach(btn => {
        if (btn.getAttribute("data-filter") === filterType) {
            btn.classList.add("active");
            btn.style.background = "#0284c7";
            btn.style.borderColor = "#38bdf8";
            btn.style.color = "#ffffff";
        } else {
            btn.classList.remove("active");
            btn.style.background = "rgba(15, 23, 42, 0.6)";
            btn.style.borderColor = "rgba(255, 255, 255, 0.1)";
            btn.style.color = "#94a3b8";
        }
    });

    loadAudioSyncSummary(false);
}
window.setAudioSyncFilter = setAudioSyncFilter;

function applyAudioSyncClientFilterAndRender() {
    if (!audioSyncCachedData || !audioSyncCachedData.channels) {
        loadAudioSyncSummary(false);
        return;
    }

    let channels = [...audioSyncCachedData.channels];

    // 1. Filtro por Praça
    if (audioSyncCurrentPraca && audioSyncCurrentPraca !== "all") {
        const pLow = audioSyncCurrentPraca.toLowerCase().trim();
        channels = channels.filter(c => (c.cidade || "").toLowerCase().includes(pLow));
    }

    // 2. Filtro de Busca Textual
    if (audioSyncCurrentSearch) {
        const sLow = audioSyncCurrentSearch.toLowerCase().trim();
        channels = channels.filter(c => 
            String(c.canal || "").toLowerCase().includes(sLow) ||
            String(c.cidade || "").toLowerCase().includes(sLow) ||
            String(c.idpv || "").includes(sLow) ||
            String(c.uf || "").toLowerCase().includes(sLow) ||
            String(c.id_host || "").includes(sLow)
        );
    }

    // 3. Filtro de Status
    if (audioSyncCurrentFilter === "divergent_and_desynced") {
        channels = channels.filter(c => ["DIVERGENTE", "DESALINHADO"].includes(c.status));
    } else if (audioSyncCurrentFilter === "divergent") {
        channels = channels.filter(c => c.status === "DIVERGENTE");
    } else if (audioSyncCurrentFilter === "desynced") {
        channels = channels.filter(c => c.status === "DESALINHADO");
    } else if (audioSyncCurrentFilter === "ok") {
        channels = channels.filter(c => c.status === "SINCRONIZADO");
    }
    // "all" exibe todos

    renderAudioSyncList(channels, audioSyncCurrentFilter);
}

function renderAudioSyncList(channels, currentFilter) {
    const container = document.getElementById("audioSyncListContainer");
    if (!container) return;

    const countFeedback = document.getElementById("audioSyncCountFeedback");
    if (countFeedback) {
        countFeedback.innerText = `Exibindo ${channels ? channels.length : 0} veículo(s)`;
    }

    if (!channels || channels.length === 0) {
        const isProblemFilter = (currentFilter === "divergent_and_desynced" || currentFilter === "divergent" || currentFilter === "desynced");
        container.innerHTML = `
            <div class="panel-card" style="padding: 36px 20px; text-align: center; border-color: rgba(16, 185, 129, 0.35); background: linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(15, 23, 42, 0.7)); border-radius: 8px;">
                <div style="font-size: 32px; margin-bottom: 10px;">🎉</div>
                <div style="font-size: 16px; font-weight: 700; color: #34d399; margin-bottom: 6px;">
                    ${isProblemFilter ? 'Nenhum canal com divergência de conteúdo ou atraso neste filtro!' : 'Nenhum veículo encontrado para os filtros aplicados.'}
                </div>
                <div style="font-size: 12px; color: #94a3b8; max-width: 560px; margin: 0 auto 16px;">
                    ${isProblemFilter 
                        ? 'Todas as gravações pareadas no mesmo bloco de horário entre CS01 (MP3/MP4 Principal) e CS02 (ASF Backup) estão com o mesmo conteúdo de áudio e sincronizadas no NAS.' 
                        : 'Tente alterar os termos de busca ou selecionar o filtro "Todos os Veículos".'}
                </div>
                ${isProblemFilter ? `
                <button type="button" class="btn-secondary" style="font-size: 12px; padding: 6px 14px;" onclick="setAudioSyncFilter('all')">
                    <i class="fas fa-list"></i> Ver Todos os Veículos da Frota (Inclusive Sincronizados)
                </button>` : ''}
            </div>
        `;
        return;
    }

    let cardsHtml = "";
    channels.forEach(ch => {
        const isDivergent = ch.status === "DIVERGENTE";
        const isDesynced = ch.status === "DESALINHADO";
        const isOk = ch.status === "SINCRONIZADO";

        let borderCardColor = isDivergent ? "rgba(239, 68, 68, 0.55)" : 
                             (isDesynced ? "rgba(250, 204, 21, 0.45)" : "rgba(16, 185, 129, 0.25)");

        let bgGradient = isDivergent ? "linear-gradient(135deg, rgba(239, 68, 68, 0.12), rgba(15, 23, 42, 0.95))" :
                         (isDesynced ? "linear-gradient(135deg, rgba(250, 204, 21, 0.08), rgba(15, 23, 42, 0.95))" : "rgba(15, 23, 42, 0.85)");

        const offsetVal = Number(ch.offset_seconds || 0);
        const offsetDisplay = offsetVal === 0 
            ? "0.0s (Alinhado)" 
            : (offsetVal > 0 ? `+${offsetVal.toFixed(1)}s (CS02 Atrasada)` : `${offsetVal.toFixed(1)}s (CS02 Adiantada)`);

        const corrPct = Math.round(Number(ch.correlation_pct || 0));
        const corrBarColor = corrPct >= 80 ? "#10b981" : (corrPct >= 60 ? "#facc15" : "#ef4444");

        const timeWindow = extractMatchedTimeWindow(ch);
        const cs01SizeInfo = ch.cs01_size_mb ? `${ch.cs01_size_mb} MB` : "Mesmo Horário";
        const cs02SizeInfo = ch.cs02_size_mb ? `${ch.cs02_size_mb} MB` : "Mesmo Horário";

        const canvasId = `wf_canvas_${ch.idpv}`;

        cardsHtml += `
            <div class="panel-card audio-sync-card" id="card-audiosync-${ch.idpv}" style="margin-bottom: 14px; padding: 16px; border: 1px solid ${borderCardColor}; background: ${bgGradient}; border-radius: 8px; transition: transform 0.15s ease;">
                <!-- Cabeçalho do Card -->
                <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px; margin-bottom: 12px;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            <span style="font-size: 15px; font-weight: 800; color: #ffffff;">${escapeHtml(ch.canal || 'Canal Desconhecido')}</span>
                            <span class="badge" style="background: rgba(56, 189, 248, 0.18); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4); font-size: 11px;">
                                <i class="fas fa-car-side"></i> Veículo IDPV ${escapeHtml(ch.idpv)}
                            </span>
                            <span style="font-size: 12px; color: #94a3b8; font-weight: 600;">
                                <i class="fas fa-map-marker-alt" style="color: #38bdf8;"></i> ${escapeHtml(ch.cidade || 'N/A')} (${escapeHtml(ch.uf || '')})
                            </span>
                            <span style="font-size: 11px; font-family: monospace; color: #64748b;">Host H${ch.id_host || '?'} • BKP CS0${ch.id_cs || '2'}</span>
                            <span class="badge" style="background: rgba(16, 185, 129, 0.12); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.3); font-size: 10.5px;">
                                <i class="far fa-clock"></i> Bloco Pareado: ${escapeHtml(timeWindow)}
                            </span>
                        </div>
                    </div>
                    <div>
                        <span class="${escapeHtml(ch.status_badge || 'badge badge-green')}" style="font-size: 11.5px; padding: 4px 10px; font-weight: 800; letter-spacing: 0.3px;">
                            ${escapeHtml(ch.status_label || ch.status)}
                        </span>
                    </div>
                </div>

                <!-- Linha de Arquivos Pareados no Mesmo Horário & Similaridade de Conteúdo -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; margin-bottom: 12px; font-size: 11.5px;">
                    <!-- Arquivo CS01 Principal -->
                    <div style="background: rgba(0, 0, 0, 0.35); padding: 8px 10px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.06);">
                        <div style="color: #38bdf8; font-weight: 700; display: flex; align-items: center; justify-content: space-between; gap: 5px; margin-bottom: 3px;">
                            <span><i class="fas fa-file-audio"></i> CS01 Principal (${escapeHtml(ch.cs01_format || 'MP3')})</span>
                            <span style="font-size: 10px; color: #38bdf8; font-family: monospace;">${escapeHtml(cs01SizeInfo)}</span>
                        </div>
                        <div style="font-family: monospace; font-size: 10.5px; color: #e2e8f0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(ch.cs01_filename || '')}">
                            ${escapeHtml(ch.cs01_filename || 'Gravação principal')}
                        </div>
                        <div style="font-size: 10px; color: #94a3b8; margin-top: 3px;">
                            🕒 Janela: <strong style="color: #e2e8f0;">${escapeHtml(timeWindow)}</strong>
                        </div>
                    </div>

                    <!-- Arquivo CS02 BKP -->
                    <div style="background: rgba(0, 0, 0, 0.35); padding: 8px 10px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.06);">
                        <div style="color: #facc15; font-weight: 700; display: flex; align-items: center; justify-content: space-between; gap: 5px; margin-bottom: 3px;">
                            <span><i class="fas fa-file-video"></i> CS0${escapeHtml(ch.id_cs || '2')} Backup (${escapeHtml(ch.cs02_format || 'ASF')})</span>
                            <span style="font-size: 10px; color: #facc15; font-family: monospace;">${escapeHtml(cs02SizeInfo)}</span>
                        </div>
                        <div style="font-family: monospace; font-size: 10.5px; color: #e2e8f0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(ch.cs02_filename || '')}">
                            ${escapeHtml(ch.cs02_filename || 'Gravação de backup')}
                        </div>
                        <div style="font-size: 10px; color: #94a3b8; margin-top: 3px;">
                            🕒 Janela: <strong style="color: #e2e8f0;">${escapeHtml(timeWindow)}</strong> <span style="color: #34d399;">(Mesmo Horário)</span>
                        </div>
                    </div>

                    <!-- Similaridade de Conteúdo (Invariante a Volume) & Offset -->
                    <div style="background: rgba(0, 0, 0, 0.35); padding: 8px 10px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.06);">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                            <span style="color: #94a3b8; font-size: 10.5px; text-transform: uppercase; font-weight: 700;">Similaridade de Conteúdo</span>
                            <span style="font-family: monospace; font-weight: 800; color: ${corrBarColor}; font-size: 12px;">${corrPct}%</span>
                        </div>
                        <div style="height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden; margin-bottom: 6px;">
                            <div style="width: ${corrPct}%; height: 100%; background: ${corrBarColor}; transition: width 0.3s ease;"></div>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 10.5px; gap: 6px;">
                            <span>Desvio: <strong style="color: ${isOk ? '#34d399' : (isDivergent ? '#f87171' : '#facc15')}; font-family: monospace;">${offsetDisplay}</strong></span>
                            <span style="color: #64748b; font-size: 9.5px;" title="A comparação iguala automaticamente a escala dos dois sinais e ignora diferenças de volume/ganho">Volume Ignorado</span>
                        </div>
                    </div>
                </div>

                <!-- Gráfico de Envelopes de Conteúdo Sobrepostos (Waveform Canvas) -->
                <div style="background: rgba(10, 15, 30, 0.85); border: 1px solid rgba(255, 255, 255, 0.07); border-radius: 6px; padding: 10px 12px; margin-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; flex-wrap: wrap; gap: 6px;">
                        <span style="font-size: 11px; font-weight: 700; color: #cbd5e1; text-transform: uppercase;">
                            <i class="fas fa-wave-square" style="color: #38bdf8;"></i> Modulação de Conteúdo de Áudio no Mesmo Horário (Escala Equalizada • Volume Ignorado)
                        </span>
                        <div style="font-size: 10px; display: flex; gap: 14px;">
                            <span style="color: #38bdf8; font-weight: 700;"><i class="fas fa-square" style="color: #38bdf8;"></i> CS01 (${escapeHtml(ch.cs01_format || 'MP3')} Principal)</span>
                            <span style="color: #facc15; font-weight: 700;"><i class="fas fa-square" style="color: #facc15;"></i> CS0${escapeHtml(ch.id_cs || '2')} (${escapeHtml(ch.cs02_format || 'ASF')} Backup)</span>
                        </div>
                    </div>
                    <canvas id="${canvasId}" width="900" height="60" style="width: 100%; height: 60px; display: block; border-radius: 4px;"></canvas>
                </div>

                <!-- Diagnóstico Operacional & Ações -->
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                    <div style="font-size: 11.5px; color: #cbd5e1; flex: 1; min-width: 280px; line-height: 1.4;">
                        ${escapeHtml(ch.diagnosis || 'Diagnóstico nominal.')}
                    </div>
                    <div style="display: flex; gap: 6px; flex-shrink: 0;">
                        <button type="button" class="btn-secondary" style="font-size: 11px; padding: 6px 10px; display: inline-flex; align-items: center; gap: 5px;" onclick="openAudioSyncDetailModal('${ch.idpv}')">
                            <i class="fas fa-microscope" style="color: #38bdf8;"></i> Detalhes Forenses
                        </button>
                        <button type="button" class="btn-primary" style="font-size: 11px; padding: 6px 10px; display: inline-flex; align-items: center; gap: 5px; background: #0284c7;" onclick="copyAudioSyncRemediationScript('${ch.idpv}')" title="Copiar script de intervenção PowerShell para a máquina de BKP">
                            <i class="fas fa-terminal"></i> Script de Intervenção BKP
                        </button>
                        <button type="button" class="btn-secondary" style="font-size: 11px; padding: 6px 8px;" onclick="reanalyzeAudioSyncChannel('${ch.idpv}')" title="Reanalisar conteúdo e sincronismo deste canal agora">
                            <i class="fas fa-sync-alt" id="icon-reanalyze-${ch.idpv}"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = cardsHtml;

    // Renderiza as formas de onda em cada canvas após inserção no DOM
    setTimeout(() => {
        channels.forEach(ch => {
            try {
                drawAudioSyncWaveform(`wf_canvas_${ch.idpv}`, ch.waveform_cs01, ch.waveform_cs02, ch.status);
            } catch (err) {
                console.warn(`[AudioSync] Erro ao desenhar forma de onda para IDPV ${ch.idpv}:`, err);
            }
        });
    }, 40);
}

function drawAudioSyncWaveform(canvasId, wf1, wf2, status) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Fundo escuro com grade temporal
    ctx.fillStyle = "#070d18";
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += 60) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    const n = Math.max((wf1 || []).length, (wf2 || []).length, 1);
    const step = w / n;

    // Curva CS02 (ASF Backup - Âmbar/Laranja ou Vermelho se divergente)
    if (wf2 && wf2.length > 0) {
        ctx.strokeStyle = status === "DIVERGENTE" ? "#ef4444" : "#facc15";
        ctx.lineWidth = 2;
        ctx.beginPath();
        wf2.forEach((val, i) => {
            const x = i * step + step / 2;
            const y = (h / 2) - (Number(val || 0) * (h * 0.42));
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // Espelhamento negativo para formato de onda cheio
        ctx.beginPath();
        wf2.forEach((val, i) => {
            const x = i * step + step / 2;
            const y = (h / 2) + (Number(val || 0) * (h * 0.42));
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
    }

    // Curva CS01 (MP3/MP4 Principal - Azul Celeste)
    if (wf1 && wf1.length > 0) {
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        wf1.forEach((val, i) => {
            const x = i * step + step / 2;
            const y = (h / 2) - (Number(val || 0) * (h * 0.42));
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();

        ctx.beginPath();
        wf1.forEach((val, i) => {
            const x = i * step + step / 2;
            const y = (h / 2) + (Number(val || 0) * (h * 0.42));
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
    }
}

async function reanalyzeAudioSyncChannel(idpv) {
    const icon = document.getElementById(`icon-reanalyze-${idpv}`);
    if (icon) icon.classList.add("fa-spin");

    try {
        const res = await fetch(`/api/audio-sync/reanalyze/${idpv}`, {
            method: "POST",
            headers: getAudioSyncAuthHeaders(),
            credentials: "same-origin"
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const result = await res.json();
        if (result.channel && audioSyncCachedData && audioSyncCachedData.channels) {
            const idx = audioSyncCachedData.channels.findIndex(c => String(c.idpv) === String(idpv));
            if (idx >= 0) {
                audioSyncCachedData.channels[idx] = result.channel;
                try {
                    localStorage.setItem("fleet_audio_sync_cache_v3", JSON.stringify(audioSyncCachedData));
                } catch (_) {}
                applyAudioSyncClientFilterAndRender();
            }
        }
    } catch (e) {
        console.error(`[AudioSync] Erro ao reanalisar veículo ${idpv}:`, e);
        alert(`Não foi possível reanalisar o veículo IDPV ${idpv}: ${e.message}`);
    } finally {
        if (icon) icon.classList.remove("fa-spin");
    }
}
window.reanalyzeAudioSyncChannel = reanalyzeAudioSyncChannel;

function openAudioSyncDetailModal(idpv) {
    const channel = audioSyncCachedData?.channels?.find(c => String(c.idpv) === String(idpv));
    if (!channel) return;

    const modal = document.getElementById("audioSyncDetailModal");
    if (!modal) return;

    const timeWindow = extractMatchedTimeWindow(channel);

    const titleEl = document.getElementById("audioSyncModalTitle");
    if (titleEl) titleEl.innerText = `Auditoria de Conteúdo & Sincronismo • ${channel.canal || 'Canal'} (IDPV ${channel.idpv})`;

    const pracaEl = document.getElementById("audioSyncModalPraca");
    if (pracaEl) pracaEl.innerText = `${channel.cidade || 'N/A'} (${channel.uf || ''}) • Host H${channel.id_host || '?'} • BKP CS0${channel.id_cs || '2'} • Bloco: ${timeWindow}`;

    const badgeEl = document.getElementById("audioSyncModalBadge");
    if (badgeEl) {
        badgeEl.className = channel.status_badge || "badge badge-blue";
        badgeEl.innerText = channel.status_label || channel.status;
    }

    const diagEl = document.getElementById("audioSyncModalDiagnosis");
    if (diagEl) diagEl.innerText = channel.diagnosis || "Sem diagnóstico disponível";

    const scriptEl = document.getElementById("audioSyncModalScriptCode");
    if (scriptEl) scriptEl.innerText = channel.remediation_ps || "# Sem script de intervenção necessário";

    const metricsEl = document.getElementById("audioSyncModalMetrics");
    if (metricsEl) {
        metricsEl.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; font-size: 11.5px; font-family: monospace;">
                <div style="background: rgba(0,0,0,0.3); padding: 8px; border-radius: 5px;">
                    <div style="color: #94a3b8; font-size: 10px;">Bloco Horário Pareado</div>
                    <div style="color: #34d399; font-size: 12px; font-weight: 700;">${escapeHtml(timeWindow)}</div>
                </div>
                <div style="background: rgba(0,0,0,0.3); padding: 8px; border-radius: 5px;">
                    <div style="color: #94a3b8; font-size: 10px;">Similaridade de Conteúdo</div>
                    <div style="color: #38bdf8; font-size: 14px; font-weight: 700;">${Math.round(channel.correlation_pct || 0)}%</div>
                </div>
                <div style="background: rgba(0,0,0,0.3); padding: 8px; border-radius: 5px;">
                    <div style="color: #94a3b8; font-size: 10px;">Desvio Temporal (Delay)</div>
                    <div style="color: #fff; font-size: 14px; font-weight: 700;">${channel.offset_seconds || 0}s (${channel.offset_ms || 0}ms)</div>
                </div>
                <div style="background: rgba(0,0,0,0.3); padding: 8px; border-radius: 5px;">
                    <div style="color: #94a3b8; font-size: 10px;">Diferença de Volume</div>
                    <div style="color: #cbd5e1; font-size: 12px; font-weight: 700;">Ignorada (Z-Score)</div>
                </div>
            </div>
        `;
    }

    modal.style.display = "flex";

    // Desenha forma de onda ampliada no modal
    setTimeout(() => {
        try {
            drawAudioSyncWaveform("audioSyncModalWaveformCanvas", channel.waveform_cs01, channel.waveform_cs02, channel.status);
        } catch (_) {}
    }, 40);
}
window.openAudioSyncDetailModal = openAudioSyncDetailModal;

function closeAudioSyncDetailModal() {
    const modal = document.getElementById("audioSyncDetailModal");
    if (modal) modal.style.display = "none";
}
window.closeAudioSyncDetailModal = closeAudioSyncDetailModal;

function copyAudioSyncRemediationScript(idpv) {
    let scriptText = "";
    if (idpv) {
        const channel = audioSyncCachedData?.channels?.find(c => String(c.idpv) === String(idpv));
        scriptText = channel ? channel.remediation_ps : "";
    } else {
        const scriptEl = document.getElementById("audioSyncModalScriptCode");
        scriptText = scriptEl ? scriptEl.innerText : "";
    }

    if (!scriptText) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(scriptText).then(() => {
            alert("Script PowerShell de intervenção no BKP copiado para a área de transferência!");
        }).catch(() => fallbackCopyText(scriptText));
    } else {
        fallbackCopyText(scriptText);
    }
}
window.copyAudioSyncRemediationScript = copyAudioSyncRemediationScript;

function fallbackCopyText(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
        document.execCommand("copy");
        alert("Script PowerShell copiado para a área de transferência!");
    } catch (_) {}
    document.body.removeChild(ta);
}
