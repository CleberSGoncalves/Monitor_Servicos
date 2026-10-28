// dashboard/static/js/audio_sync.js
/**
 * Módulo de Auditoria Forense de Sincronismo de Áudio:
 * Comparação de Matérias: CS01 (Principal - MP3/MP4) vs CS02/CS03 (BKP - ASF)
 * Repositório Oficial Read-Only no NAS: \\ibnas01sp-nas.grupoibope.corp\MediaDNA01\VideoRecord\{ANO}\{MES}\{DIA}\{IDPV}
 */

let audioSyncCurrentFilter = "divergent_and_desynced"; // Padrão: mostra apenas o que está desincronizado/com problema
let audioSyncCurrentSearch = "";
let audioSyncCurrentPraca = "all";
let audioSyncCachedData = null;
let audioSyncSearchDebounce = null;

async function initAudioSyncTab() {
    setupAudioSyncControls();
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
                loadAudioSyncSummary(false);
            }, 250);
        });
    }

    const pracaFilter = document.getElementById("audioSyncPracaFilter");
    if (pracaFilter && !pracaFilter._bound) {
        pracaFilter._bound = true;
        pracaFilter.addEventListener("change", function() {
            audioSyncCurrentPraca = this.value;
            loadAudioSyncSummary(false);
        });
    }
}

async function loadAudioSyncSummary(forceRefresh = false) {
    const listContainer = document.getElementById("audioSyncListContainer");
    const refreshBtn = document.getElementById("btnRefreshAudioSync");
    if (refreshBtn) refreshBtn.classList.add("fa-spin");

    try {
        const token = (typeof getAuthToken === "function") ? getAuthToken() : (localStorage.getItem("fleet_token") || "");
        const headers = token ? { "Authorization": `Bearer ${token}` } : {};

        let url = `/api/audio-sync/summary?filter_status=${encodeURIComponent(audioSyncCurrentFilter)}&force=${forceRefresh}`;
        if (audioSyncCurrentSearch) url += `&search=${encodeURIComponent(audioSyncCurrentSearch)}`;
        if (audioSyncCurrentPraca && audioSyncCurrentPraca !== "all") url += `&praca=${encodeURIComponent(audioSyncCurrentPraca)}`;

        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        audioSyncCachedData = data;

        renderAudioSyncKPIs(data);
        populateAudioSyncPracaDropdown(data.channels);
        renderAudioSyncList(data.channels, data.filter_applied);

        const lastUpdatedEl = document.getElementById("audioSyncLastUpdated");
        if (lastUpdatedEl && data.last_updated) {
            lastUpdatedEl.innerText = `Última auditoria: ${data.last_updated}`;
        }
    } catch (err) {
        console.error("Erro ao carregar auditoria de sincronismo de áudio:", err);
        if (listContainer) {
            listContainer.innerHTML = `
                <div class="panel-card" style="padding: 24px; text-align: center; border-color: rgba(239, 68, 68, 0.4);">
                    <div style="font-size: 20px; color: #f87171; margin-bottom: 8px;"><i class="fas fa-exclamation-triangle"></i> Falha ao carregar auditoria de sincronismo</div>
                    <div style="color: var(--text-muted); font-size: 13px; margin-bottom: 14px;">Não foi possível consultar os dados do repositório NAS VideoRecord.</div>
                    <button class="btn-primary" onclick="loadAudioSyncSummary(true)" style="padding: 6px 14px; font-size: 12px;">Tentar Novamente</button>
                </div>
            `;
        }
    } finally {
        if (refreshBtn) refreshBtn.classList.remove("fa-spin");
    }
}
window.loadAudioSyncSummary = loadAudioSyncSummary;

function renderAudioSyncKPIs(data) {
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.innerText = val !== undefined ? val : 0;
    };

    setVal("audioKpiTotal", data.total_canais);
    setVal("audioKpiDivergentes", data.divergentes_count);
    setVal("audioKpiDesalinhados", data.desalinhados_count);
    setVal("audioKpiSincronizados", data.sincronizados_count);
    setVal("audioKpiMudos", data.mudos_count);

    const confEl = document.getElementById("audioKpiConformidade");
    if (confEl) {
        confEl.innerText = `${data.taxa_conformidade_pct}%`;
        confEl.style.color = data.taxa_conformidade_pct >= 90 ? "#34d399" : (data.taxa_conformidade_pct >= 75 ? "#facc15" : "#f87171");
    }

    // Badge de alerta se houver divergentes críticos
    const divCard = document.getElementById("audioKpiCardDivergentes");
    if (divCard) {
        if (data.divergentes_count > 0) {
            divCard.style.borderColor = "rgba(239, 68, 68, 0.7)";
            divCard.style.boxShadow = "0 0 16px rgba(239, 68, 68, 0.25)";
        } else {
            divCard.style.borderColor = "rgba(255, 255, 255, 0.08)";
            divCard.style.boxShadow = "none";
        }
    }
}

function populateAudioSyncPracaDropdown(channels) {
    const sel = document.getElementById("audioSyncPracaFilter");
    if (!sel || sel.options.length > 1) return;

    const pracas = new Set();
    if (audioSyncCachedData && audioSyncCachedData.channels) {
        audioSyncCachedData.channels.forEach(c => {
            if (c.cidade) pracas.add(c.cidade);
        });
    }

    const sorted = Array.from(pracas).sort();
    sorted.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p;
        opt.textContent = p;
        sel.appendChild(opt);
    });
}

function setAudioSyncFilter(filterType) {
    audioSyncCurrentFilter = filterType;

    // Atualiza pills visuais
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

function renderAudioSyncList(channels, currentFilter) {
    const container = document.getElementById("audioSyncListContainer");
    if (!container) return;

    const countFeedback = document.getElementById("audioSyncCountFeedback");
    if (countFeedback) {
        countFeedback.innerText = `Exibindo ${channels.length} veículo(s)`;
    }

    if (!channels || channels.length === 0) {
        const isProblemFilter = (currentFilter === "divergent_and_desynced" || currentFilter === "divergent");
        container.innerHTML = `
            <div class="panel-card" style="padding: 36px 20px; text-align: center; border-color: rgba(16, 185, 129, 0.35); background: linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(15, 23, 42, 0.7));">
                <div style="font-size: 32px; margin-bottom: 10px;">🎉</div>
                <div style="font-size: 16px; font-weight: 700; color: #34d399; margin-bottom: 6px;">
                    ${isProblemFilter ? 'Nenhum canal desincronizado ou divergente detectado!' : 'Nenhum veículo encontrado para os filtros aplicados.'}
                </div>
                <div style="font-size: 12px; color: #94a3b8; max-width: 520px; margin: 0 auto 16px;">
                    ${isProblemFilter 
                        ? 'Todas as gravações de MP3 (CS01) e ASF (CS02) da frota estão perfeitamente sincronizadas com a mesma transmissão no NAS VideoRecord.' 
                        : 'Tente alterar os termos de busca ou selecionar o filtro "Todos os Veículos da Frota".'}
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
        const isMute = ch.status === "MUDO_BKP";
        const isOk = ch.status === "SINCRONIZADO";

        let borderCardColor = isDivergent ? "rgba(239, 68, 68, 0.55)" : 
                             (isDesynced ? "rgba(250, 204, 21, 0.45)" : 
                             (isMute ? "rgba(168, 85, 247, 0.45)" : "rgba(16, 185, 129, 0.25)"));

        let bgGradient = isDivergent ? "linear-gradient(135deg, rgba(239, 68, 68, 0.12), rgba(15, 23, 42, 0.95))" :
                         (isDesynced ? "linear-gradient(135deg, rgba(250, 204, 21, 0.08), rgba(15, 23, 42, 0.95))" :
                         (isMute ? "linear-gradient(135deg, rgba(168, 85, 247, 0.08), rgba(15, 23, 42, 0.95))" : "rgba(15, 23, 42, 0.85)"));

        const offsetDisplay = ch.offset_seconds === 0 
            ? "0.0s (Sincronizado)" 
            : (ch.offset_seconds > 0 ? `+${ch.offset_seconds}s (CS02 Atrasada)` : `${ch.offset_seconds}s (CS02 Adiantada)`);

        const corrBarColor = ch.correlation_pct >= 80 ? "#10b981" : (ch.correlation_pct >= 60 ? "#facc15" : "#ef4444");

        const canvasId = `wf_canvas_${ch.idpv}`;

        cardsHtml += `
            <div class="panel-card audio-sync-card" id="card-audiosync-${ch.idpv}" style="margin-bottom: 14px; padding: 16px; border: 1px solid ${borderCardColor}; background: ${bgGradient}; border-radius: 8px; transition: transform 0.15s ease;">
                <!-- Cabeçalho do Card -->
                <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px; margin-bottom: 12px;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            <span style="font-size: 15px; font-weight: 800; color: #ffffff;">${escapeHtml(ch.canal)}</span>
                            <span class="badge" style="background: rgba(56, 189, 248, 0.18); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4); font-size: 11px;">
                                <i class="fas fa-car-side"></i> Veículo IDPV ${ch.idpv}
                            </span>
                            <span style="font-size: 12px; color: #94a3b8; font-weight: 600;">
                                <i class="fas fa-map-marker-alt" style="color: #38bdf8;"></i> ${escapeHtml(ch.cidade)} (${escapeHtml(ch.uf)})
                            </span>
                            <span style="font-size: 11px; font-family: monospace; color: #64748b;">Host H${ch.id_host} • BKP CS0${ch.id_cs}</span>
                        </div>
                    </div>
                    <div>
                        <span class="${ch.status_badge}" style="font-size: 11.5px; padding: 4px 10px; font-weight: 800; letter-spacing: 0.3px;">
                            ${escapeHtml(ch.status_label)}
                        </span>
                    </div>
                </div>

                <!-- Linha de Métricas Forenses & Formatos no NAS -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin-bottom: 12px; font-size: 11.5px;">
                    <!-- Arquivo CS01 Principal -->
                    <div style="background: rgba(0, 0, 0, 0.35); padding: 8px 10px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.06);">
                        <div style="color: #38bdf8; font-weight: 700; display: flex; align-items: center; gap: 5px; margin-bottom: 3px;">
                            <i class="fas fa-file-audio"></i> CS01 Principal (${ch.cs01_format})
                        </div>
                        <div style="font-family: monospace; font-size: 10.5px; color: #e2e8f0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(ch.cs01_filename)}">
                            ${escapeHtml(ch.cs01_filename)}
                        </div>
                        <div style="font-size: 10px; color: #94a3b8; margin-top: 3px;">Volume: <strong style="color: #fff;">${ch.rms_cs01_db} dBFS</strong> • 128 kbps</div>
                    </div>

                    <!-- Arquivo CS02 BKP -->
                    <div style="background: rgba(0, 0, 0, 0.35); padding: 8px 10px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.06);">
                        <div style="color: #facc15; font-weight: 700; display: flex; align-items: center; gap: 5px; margin-bottom: 3px;">
                            <i class="fas fa-file-video"></i> CS02 Backup (${ch.cs02_format})
                        </div>
                        <div style="font-family: monospace; font-size: 10.5px; color: #e2e8f0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(ch.cs02_filename)}">
                            ${escapeHtml(ch.cs02_filename)}
                        </div>
                        <div style="font-size: 10px; color: #94a3b8; margin-top: 3px;">Volume: <strong style="color: ${ch.rms_cs02_db < -50 ? '#f87171' : '#fff'};">${ch.rms_cs02_db} dBFS</strong> • 64 kbps WMA</div>
                    </div>

                    <!-- Correlação Cruzada & Offset -->
                    <div style="background: rgba(0, 0, 0, 0.35); padding: 8px 10px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.06);">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                            <span style="color: #94a3b8; font-size: 10.5px; text-transform: uppercase; font-weight: 700;">Correlação FFT (R)</span>
                            <span style="font-family: monospace; font-weight: 800; color: ${corrBarColor}; font-size: 12px;">${ch.correlation_pct}%</span>
                        </div>
                        <div style="height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden; margin-bottom: 6px;">
                            <div style="width: ${ch.correlation_pct}%; height: 100%; background: ${corrBarColor}; transition: width 0.3s ease;"></div>
                        </div>
                        <div style="font-size: 11px;">
                            Desvio Temporal: <strong style="color: ${isOk ? '#34d399' : (isDivergent ? '#f87171' : '#facc15')}; font-family: monospace;">${offsetDisplay}</strong>
                        </div>
                    </div>
                </div>

                <!-- Gráfico de Formas de Onda Sobrepostas (Waveform Canvas) -->
                <div style="background: rgba(10, 15, 30, 0.85); border: 1px solid rgba(255, 255, 255, 0.07); border-radius: 6px; padding: 10px 12px; margin-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <span style="font-size: 11px; font-weight: 700; color: #cbd5e1; text-transform: uppercase;">
                            <i class="fas fa-wave-square" style="color: #38bdf8;"></i> Forma de Onda Normalizada (Janela Forense de 15s)
                        </span>
                        <div style="font-size: 10px; display: flex; gap: 14px;">
                            <span style="color: #38bdf8; font-weight: 700;"><i class="fas fa-square" style="color: #38bdf8;"></i> CS01 (MP3 Principal)</span>
                            <span style="color: #facc15; font-weight: 700;"><i class="fas fa-square" style="color: #facc15;"></i> CS02 (ASF Backup)</span>
                        </div>
                    </div>
                    <canvas id="${canvasId}" width="900" height="60" style="width: 100%; height: 60px; display: block; border-radius: 4px;"></canvas>
                </div>

                <!-- Diagnóstico Operacional & Ações -->
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                    <div style="font-size: 11.5px; color: #cbd5e1; flex: 1; min-width: 280px; line-height: 1.4;">
                        ${escapeHtml(ch.diagnosis)}
                    </div>
                    <div style="display: flex; gap: 6px; flex-shrink: 0;">
                        <button type="button" class="btn-secondary" style="font-size: 11px; padding: 6px 10px; display: inline-flex; align-items: center; gap: 5px;" onclick="openAudioSyncDetailModal('${ch.idpv}')">
                            <i class="fas fa-microscope" style="color: #38bdf8;"></i> Detalhes Forenses
                        </button>
                        <button type="button" class="btn-primary" style="font-size: 11px; padding: 6px 10px; display: inline-flex; align-items: center; gap: 5px; background: #0284c7;" onclick="copyAudioSyncRemediationScript('${ch.idpv}')" title="Copiar script de intervenção PowerShell para a máquina de BKP">
                            <i class="fas fa-terminal"></i> Script de Intervenção BKP
                        </button>
                        <button type="button" class="btn-secondary" style="font-size: 11px; padding: 6px 8px;" onclick="reanalyzeAudioSyncChannel('${ch.idpv}')" title="Reanalisar sincronismo deste canal agora">
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
            drawAudioSyncWaveform(`wf_canvas_${ch.idpv}`, ch.waveform_cs01, ch.waveform_cs02, ch.status);
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

    // Fundo escuro com grade de milissegundos
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

    // Curva CS02 (ASF Backup - Âmbar/Laranja)
    if (wf2 && wf2.length > 0) {
        ctx.strokeStyle = status === "DIVERGENTE" ? "#ef4444" : "#facc15";
        ctx.lineWidth = 2;
        ctx.beginPath();
        wf2.forEach((val, i) => {
            const x = i * step + step / 2;
            const y = (h / 2) - (val * (h * 0.42));
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // Espelhamento negativo para formato de onda cheio
        ctx.beginPath();
        wf2.forEach((val, i) => {
            const x = i * step + step / 2;
            const y = (h / 2) + (val * (h * 0.42));
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
    }

    // Curva CS01 (MP3 Principal - Azul Celeste)
    if (wf1 && wf1.length > 0) {
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        wf1.forEach((val, i) => {
            const x = i * step + step / 2;
            const y = (h / 2) - (val * (h * 0.42));
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();

        ctx.beginPath();
        wf1.forEach((val, i) => {
            const x = i * step + step / 2;
            const y = (h / 2) + (val * (h * 0.42));
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
        const token = (typeof getAuthToken === "function") ? getAuthToken() : (localStorage.getItem("fleet_token") || "");
        const headers = token ? { "Authorization": `Bearer ${token}` } : {};

        const res = await fetch(`/api/audio-sync/reanalyze/${idpv}`, {
            method: "POST",
            headers
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const result = await res.json();
        if (result.channel && audioSyncCachedData && audioSyncCachedData.channels) {
            const idx = audioSyncCachedData.channels.findIndex(c => String(c.idpv) === String(idpv));
            if (idx >= 0) {
                audioSyncCachedData.channels[idx] = result.channel;
                renderAudioSyncList(audioSyncCachedData.channels, audioSyncCurrentFilter);
            }
        }
    } catch (e) {
        console.error(`Erro ao reanalisar veículo ${idpv}:`, e);
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

    const titleEl = document.getElementById("audioSyncModalTitle");
    if (titleEl) titleEl.innerText = `Diagnóstico Forense de Sincronismo • ${channel.canal} (IDPV ${channel.idpv})`;

    const pracaEl = document.getElementById("audioSyncModalPraca");
    if (pracaEl) pracaEl.innerText = `${channel.cidade} (${channel.uf}) • Host H${channel.id_host} • BKP CS0${channel.id_cs}`;

    const badgeEl = document.getElementById("audioSyncModalBadge");
    if (badgeEl) {
        badgeEl.className = channel.status_badge;
        badgeEl.innerText = channel.status_label;
    }

    const diagEl = document.getElementById("audioSyncModalDiagnosis");
    if (diagEl) diagEl.innerText = channel.diagnosis;

    const scriptEl = document.getElementById("audioSyncModalScriptCode");
    if (scriptEl) scriptEl.innerText = channel.remediation_ps;

    const metricsEl = document.getElementById("audioSyncModalMetrics");
    if (metricsEl) {
        metricsEl.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; font-size: 11.5px; font-family: monospace;">
                <div style="background: rgba(0,0,0,0.3); padding: 8px; border-radius: 5px;">
                    <div style="color: #94a3b8; font-size: 10px;">Offset Medido</div>
                    <div style="color: #fff; font-size: 14px; font-weight: 700;">${channel.offset_seconds}s (${channel.offset_ms}ms)</div>
                </div>
                <div style="background: rgba(0,0,0,0.3); padding: 8px; border-radius: 5px;">
                    <div style="color: #94a3b8; font-size: 10px;">Coeficiente R</div>
                    <div style="color: #38bdf8; font-size: 14px; font-weight: 700;">${channel.correlation_pct}%</div>
                </div>
                <div style="background: rgba(0,0,0,0.3); padding: 8px; border-radius: 5px;">
                    <div style="color: #94a3b8; font-size: 10px;">Volume CS01 (MP3)</div>
                    <div style="color: #fff; font-size: 14px; font-weight: 700;">${channel.rms_cs01_db} dBFS</div>
                </div>
                <div style="background: rgba(0,0,0,0.3); padding: 8px; border-radius: 5px;">
                    <div style="color: #94a3b8; font-size: 10px;">Volume CS02 (ASF)</div>
                    <div style="color: ${channel.rms_cs02_db < -50 ? '#f87171' : '#fff'}; font-size: 14px; font-weight: 700;">${channel.rms_cs02_db} dBFS</div>
                </div>
            </div>
        `;
    }

    modal.style.display = "flex";

    // Desenha forma de onda ampliada no modal
    setTimeout(() => {
        drawAudioSyncWaveform("audioSyncModalWaveformCanvas", channel.waveform_cs01, channel.waveform_cs02, channel.status);
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

    navigator.clipboard.writeText(scriptText).then(() => {
        alert("Script PowerShell de intervenção no BKP copiado com sucesso para a área de transferência!");
    }).catch(() => {
        prompt("Copie o script de intervenção abaixo:", scriptText);
    });
}
window.copyAudioSyncRemediationScript = copyAudioSyncRemediationScript;
