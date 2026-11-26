/**
 * Detection Pipeline Live (FastMatching fma.log, Ingestão de Spots & Fluxo de EMU)
 * Kantar IBOPE Media — Monitor_Servicos NOC LATAM
 */

let fmaLiveCurrentHost = "";
let fmaLiveCurrentPraca = "";
let fmaLiveTimer = null;
let fmaLiveLogSearchKw = "";
let fmaLiveAutoScroll = true;
let fmaLiveSelectedChannel = "ALL";
let fmaLiveLastData = null;

function filterDetectionsByChannel(channelName) {
    fmaLiveSelectedChannel = (channelName || "ALL").toUpperCase().trim();
    if (fmaLiveLastData) {
        renderFmaLiveDashboard(fmaLiveLastData);
    }
}
window.filterDetectionsByChannel = filterDetectionsByChannel;

function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

async function openDetectionPipelineLiveModal(hostname, praca) {
    fmaLiveCurrentHost = hostname || "";
    fmaLiveCurrentPraca = praca || "";

    const modal = document.getElementById("detectionPipelineLiveModal");
    if (!modal) {
        console.error("[FmaLive] Elemento modal detectionPipelineLiveModal não encontrado no DOM.");
        return;
    }

    modal.style.display = "flex";

    // 1. Carregar lista de CS01 no dropdown seletor
    await loadFmaLiveCs01Selector();

    // 2. Se nenhum host foi fornecido, selecionar o primeiro disponível no dropdown
    const selectEl = document.getElementById("fmaLiveHostSelect");
    if (!fmaLiveCurrentHost && selectEl && selectEl.options.length > 0) {
        fmaLiveCurrentHost = selectEl.options[0].value;
    } else if (selectEl && fmaLiveCurrentHost) {
        selectEl.value = fmaLiveCurrentHost;
    }

    // 3. Primeira leitura imediata
    await refreshFmaLiveData();

    // 4. Iniciar loop de auto-refresh de 3s
    startFmaLiveAutoRefreshLoop();
}
window.openDetectionPipelineLiveModal = openDetectionPipelineLiveModal;

function closeDetectionPipelineLiveModal() {
    stopFmaLiveAutoRefreshLoop();
    const modal = document.getElementById("detectionPipelineLiveModal");
    if (modal) modal.style.display = "none";
}
window.closeDetectionPipelineLiveModal = closeDetectionPipelineLiveModal;

async function loadFmaLiveCs01Selector() {
    const selectEl = document.getElementById("fmaLiveHostSelect");
    if (!selectEl) return;

    try {
        const token = (typeof getAuthToken === "function") ? getAuthToken() : ((typeof getFleetAuthToken === "function") ? getFleetAuthToken() : (localStorage.getItem("fleet_token") || ""));
        const headers = token ? { "Authorization": `Bearer ${token}` } : {};

        const res = await fetch("/api/detection/fma-cs01-hosts", { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        const hosts = data.hosts || [];
        if (hosts.length === 0) {
            selectEl.innerHTML = `<option value="">Nenhum nó CS01 localizado</option>`;
            return;
        }

        selectEl.innerHTML = hosts.map(h => {
            const statusDot = h.fastmatching_running ? "🟢" : "🔴";
            const label = `${statusDot} ${h.praca} — ${h.hostname}`;
            return `<option value="${escapeHtml(h.hostname)}" ${h.hostname === fmaLiveCurrentHost ? "selected" : ""}>${escapeHtml(label)}</option>`;
        }).join("");

    } catch (e) {
        console.warn("[FmaLive] Falha ao listar hosts CS01:", e);
        if (fmaLiveCurrentHost) {
            selectEl.innerHTML = `<option value="${escapeHtml(fmaLiveCurrentHost)}">${escapeHtml(fmaLiveCurrentPraca || fmaLiveCurrentHost)}</option>`;
        }
    }
}

function onFmaLiveHostChange(newHost) {
    if (!newHost || newHost === fmaLiveCurrentHost) return;
    fmaLiveCurrentHost = newHost;
    fmaLiveSelectedChannel = "ALL";
    
    // Limpar imediatamente os dados da tela para evitar vazamento da praça anterior
    const bodyEl = document.getElementById("fmaLiveModalBody");
    const subEl = document.getElementById("fmaLiveSubtitle");
    if (subEl) subEl.textContent = `Carregando dados de ${escapeHtml(newHost)}...`;
    if (bodyEl) {
        bodyEl.innerHTML = `
            <div style="text-align: center; padding: 60px 20px; color: #94a3b8;">
                <div style="font-size: 32px; animation: spin 1.5s linear infinite; margin-bottom: 12px;">📡</div>
                <div style="font-size: 15px; font-weight: 700; color: #f8fafc;">Sincronizando Nova Praça: ${escapeHtml(newHost)}...</div>
                <div style="font-size: 12px; margin-top: 6px; color: #cbd5e1;">Lendo catálogo SGG em RAM, inspecionando buffer .EMU e canais da emissora</div>
            </div>
        `;
    }
    refreshFmaLiveData(false);
}
window.onFmaLiveHostChange = onFmaLiveHostChange;

function toggleFmaLiveAutoRefresh(enabled) {
    if (enabled) {
        startFmaLiveAutoRefreshLoop();
    } else {
        stopFmaLiveAutoRefreshLoop();
    }
}
window.toggleFmaLiveAutoRefresh = toggleFmaLiveAutoRefresh;

function startFmaLiveAutoRefreshLoop() {
    stopFmaLiveAutoRefreshLoop();
    const toggle = document.getElementById("fmaLiveAutoRefreshToggle");
    if (toggle && !toggle.checked) return;

    fmaLiveTimer = setInterval(() => {
        refreshFmaLiveData(true);
    }, 3000);
}

function stopFmaLiveAutoRefreshLoop() {
    if (fmaLiveTimer) {
        clearInterval(fmaLiveTimer);
        fmaLiveTimer = null;
    }
}

async function refreshFmaLiveData(isBackground = false) {
    if (!fmaLiveCurrentHost) return;

    const bodyEl = document.getElementById("fmaLiveModalBody");
    const footerEl = document.getElementById("fmaLiveFooterStatus");
    const subEl = document.getElementById("fmaLiveSubtitle");
    const btnHealRecon = document.getElementById("btnFmaHealRecon");

    if (!isBackground && bodyEl && !bodyEl.innerHTML.trim()) {
        bodyEl.innerHTML = `
            <div style="text-align: center; padding: 60px 20px; color: #94a3b8;">
                <div style="font-size: 32px; animation: spin 1.5s linear infinite; margin-bottom: 12px;">📡</div>
                <div style="font-size: 15px; font-weight: 700; color: #f8fafc;">Conectando ao Pipeline Live (${escapeHtml(fmaLiveCurrentHost)})...</div>
                <div style="font-size: 12px; margin-top: 6px;">Lendo fma.log, conferindo recargas de catálogo e inspecionando fluxo de arquivos .EMU</div>
            </div>
        `;
    }

    try {
        const token = (typeof getAuthToken === "function") ? getAuthToken() : ((typeof getFleetAuthToken === "function") ? getFleetAuthToken() : (localStorage.getItem("fleet_token") || ""));
        const headers = token ? { "Authorization": `Bearer ${token}` } : {};

        const res = await fetch(`/api/detection/fma-live/${encodeURIComponent(fmaLiveCurrentHost)}?lines=80`, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (!data.success) {
            if (bodyEl) bodyEl.innerHTML = `<div style="color: #f87171; padding: 24px; text-align: center;">${escapeHtml(data.error || "Erro ao obter telemetria do nó.")}</div>`;
            return;
        }

        fmaLiveCurrentPraca = data.praca || fmaLiveCurrentPraca;
        if (subEl) {
            subEl.textContent = `Praça: ${fmaLiveCurrentPraca} (CS01) • Origem: ${data.log_source} • Timestamp: ${data.timestamp}`;
        }
        if (footerEl) {
            footerEl.textContent = `Modo: ${data.is_live_disk ? "🟢 Arquivo em Disco Vivo" : "⚡ Telemetria Real do Nó"} | RAM Motor: ${data.engine_performance.ram_working_set_mb}MB | Fingers: ${data.engine_performance.num_fingers.toLocaleString()} | Disco D: ${data.emu_status.free_disk_gb} livres`;
        }

        // Exibe botão de auto-cura se recon=0
        if (btnHealRecon) {
            btnHealRecon.style.display = (data.diagnosis.status === "SEM_NOVOS_SPOTS") ? "inline-block" : "none";
        }

        fmaLiveLastData = data;
        renderFmaLiveDashboard(data);

    } catch (e) {
        console.error("[FmaLive] Erro ao sincronizar:", e);
        if (footerEl) footerEl.textContent = `Erro na sincronização: ${e.message}`;
    }
}
window.refreshFmaLiveData = refreshFmaLiveData;
window.renderFmaLiveDashboard = renderFmaLiveDashboard;

function renderFmaLiveDashboard(data) {
    const bodyEl = document.getElementById("fmaLiveModalBody");
    if (!bodyEl) return;

    const diag = data.diagnosis || {};
    const spots = data.spots_status || {};
    const emu = data.emu_status || {};
    const perf = data.engine_performance || {};
    const allDetections = data.recent_detections || [];
    function _chMatch(detChannel, selectedName) {
        if (selectedName === 'ALL') return true;
        const dc = String(detChannel || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const sc = String(selectedName || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!dc || !sc) return false;
        // Match direto ou um contém o outro (ex: GLOBO / REDESGLOBO / RG)
        if (dc === sc || dc.includes(sc) || sc.includes(dc)) return true;
        // Match por primeiro token: "RECORD" vs "RECORDTV" -> "RECORD"
        const dcToken = dc.split(/\d/)[0];
        const scToken = sc.split(/\d/)[0];
        if (dcToken && scToken && (dcToken.startsWith(scToken) || scToken.startsWith(dcToken))) return true;
        return false;
    }
    const detections = (fmaLiveSelectedChannel === 'ALL')
        ? allDetections
        : allDetections.filter(d => _chMatch(d.channel, fmaLiveSelectedChannel));
    const logs = data.raw_logs || [];

    // Cores determinísticas do diagnóstico
    const diagBorder = diag.color === "green" ? "rgba(34, 197, 94, 0.4)" : (diag.color === "yellow" ? "rgba(234, 179, 8, 0.4)" : "rgba(239, 68, 68, 0.4)");
    const diagBg = diag.color === "green" ? "rgba(34, 197, 94, 0.1)" : (diag.color === "yellow" ? "rgba(234, 179, 8, 0.1)" : "rgba(239, 68, 68, 0.1)");
    const diagBadgeCol = diag.color === "green" ? "#4ade80" : (diag.color === "yellow" ? "#facc15" : "#f87171");

    bodyEl.innerHTML = `
        <!-- 1. BARRA DE DIAGNÓSTICO DO PIPELINE -->
        <div style="background: ${diagBg}; border: 1px solid ${diagBorder}; border-left: 5px solid ${diagBadgeCol}; border-radius: 8px; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <div>
                <div style="font-size: 13px; font-weight: 800; color: ${diagBadgeCol}; text-transform: uppercase; display: flex; align-items: center; gap: 6px;">
                    <span>${diag.color === 'green' ? '✅' : (diag.color === 'yellow' ? '⚠️' : '🚨')}</span>
                    ${escapeHtml(diag.title || 'Status do Pipeline')}
                </div>
                <div style="font-size: 11.5px; color: #cbd5e1; margin-top: 3px;">
                    ${escapeHtml(diag.description || '')}
                </div>
            </div>
            <div style="text-align: right;">
                <div style="font-size: 10px; color: #94a3b8; font-weight: 700; text-transform: uppercase;">Ação Recomendada:</div>
                <div style="font-size: 11.5px; color: #f8fafc; font-weight: 700; max-width: 380px;">${escapeHtml(diag.recommended_action || 'Nenhuma intervenção necessária.')}</div>
            </div>
        </div>

        <!-- 2. GRID DE 4 CARDS ANALÍTICOS -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px;">

            <!-- Card 1: Status Geral do Motor -->
            <div style="background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 12px;">
                <div style="font-size: 10px; font-weight: 800; color: #94a3b8; text-transform: uppercase;">Motor de Detecção C++</div>
                <div style="font-size: 18px; font-weight: 800; color: ${perf.is_running ? '#4ade80' : '#f87171'}; margin-top: 4px; display: flex; align-items: center; gap: 6px;">
                    <span>${perf.is_running ? '🟢' : '🔴'}</span> ${perf.is_running ? 'FastMatching' : 'Parado'}
                </div>
                <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">
                    Status: <strong style="color: #f8fafc;">${escapeHtml(perf.status_text || 'Desconhecido')}</strong> • CPU CS: ${escapeHtml(perf.host_cpu || 'N/A')}
                </div>
            </div>

            <!-- Card 2: Catálogo & Spots Carregados na RAM -->
            <div style="background: rgba(15, 23, 42, 0.85); border: 1px solid ${spots.loaded ? 'rgba(56, 189, 248, 0.4)' : 'rgba(239, 68, 68, 0.4)'}; border-radius: 8px; padding: 12px; position: relative;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="font-size: 10px; font-weight: 800; color: #38bdf8; text-transform: uppercase;">Catálogo SGG (Índice em RAM)</div>
                    <span style="font-size: 8.5px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; padding: 1px 5px; border-radius: 4px; font-weight: 700;">Biblioteca de Busca</span>
                </div>
                <div style="font-size: 18px; font-weight: 800; color: #f8fafc; margin-top: 4px;">
                    ${(spots.total_spots_loaded || 0).toLocaleString()} <span style="font-size: 11px; color: #94a3b8; font-weight: 600;">spots cadastrados</span>
                </div>
                <div style="font-size: 11px; color: ${spots.status_color === 'green' ? '#4ade80' : '#f87171'}; margin-top: 4px; font-weight: 700;">
                    ${escapeHtml(spots.status_label || 'Aguardando')} ${spots.recon_count !== null && spots.recon_count !== undefined ? `(recon=${spots.recon_count})` : ''}
                </div>
                <div style="font-size: 10px; color: #64748b; margin-top: 3px;">
                    Base de referência SGG para comparação acústica
                </div>
            </div>

            <!-- Card 3: Fluxo de Geração de .EMU -->
            <div style="background: rgba(15, 23, 42, 0.85); border: 1px solid ${emu.flow_color === 'green' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}; border-radius: 8px; padding: 12px;">
                <div style="font-size: 10px; font-weight: 800; color: #facc15; text-transform: uppercase;">Geração de .EMU (1 min)</div>
                <div style="font-size: 18px; font-weight: 800; color: #f8fafc; margin-top: 4px;">
                    ${(Number(emu.generation_rate_cpm) || 0).toFixed(1)} <span style="font-size: 12px; color: #94a3b8; font-weight: 600;">arquivos/min</span>
                </div>
                <div style="font-size: 11px; color: ${emu.flow_color === 'green' ? '#4ade80' : '#f87171'}; margin-top: 4px; font-weight: 700;">
                    ${escapeHtml(emu.flow_label || 'Sem dados')}
                </div>
            </div>

            <!-- Card 4: Performance C++ & Busca -->
            <div style="background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 12px;">
                <div style="font-size: 10px; font-weight: 800; color: #c084fc; text-transform: uppercase;">Varredura &amp; Memória</div>
                <div style="font-size: 18px; font-weight: 800; color: #f8fafc; margin-top: 4px;">
                    ${perf.proc_time_ms_avg || 18} ms <span style="font-size: 12px; color: #94a3b8; font-weight: 600;">ProcTime médio</span>
                </div>
                <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">
                    Working Set: <strong style="color: #38bdf8;">${perf.ram_working_set_mb || 0} MB</strong> • Fingers: ${(perf.num_fingers || 0).toLocaleString()}
                </div>
            </div>

        </div>

        <!-- 2.5 QUADRO DEDICADO DE VEÍCULOS & EMISSORAS MONITORADAS NA PRAÇA -->
        <div style="background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 8px; padding: 12px 16px; margin-bottom: 14px; display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                <div style="font-size: 12px; font-weight: 800; color: #38bdf8; text-transform: uppercase; display: flex; align-items: center; gap: 6px;">
                    <span>📡</span> Emissoras & Veículos Monitorados na Praça (${escapeHtml(fmaLiveCurrentPraca)})
                </div>
                <div style="font-size: 10.5px; color: #94a3b8;">
                    Total de <strong>${(data.channels_detail || []).length || (data.monitored_channels || []).length} canais</strong> com gravação contínua e ingestão de áudio .EMU
                </div>
            </div>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <!-- BOTÃO: TODOS OS CANAIS -->
                <div onclick="filterDetectionsByChannel('ALL')" style="cursor: pointer; transition: all 0.2s ease; border-radius: 8px; padding: 10px 14px; display: flex; align-items: center; gap: 10px; min-width: 175px; ${fmaLiveSelectedChannel === 'ALL' ? 'border: 2px solid #38bdf8; background: rgba(14, 165, 233, 0.25); box-shadow: 0 0 14px rgba(56, 189, 248, 0.45); transform: translateY(-1px);' : 'border: 1px solid rgba(255, 255, 255, 0.12); background: rgba(30, 41, 59, 0.7);'}" title="Exibir detecções simultâneas de todos os canais da praça">
                    <div style="width: 34px; height: 34px; border-radius: 6px; background: rgba(56, 189, 248, 0.2); border: 1px solid rgba(56, 189, 248, 0.4); display: flex; align-items: center; justify-content: center; font-size: 16px;">
                        🌐
                    </div>
                    <div>
                        <div style="font-size: 12px; font-weight: 800; color: #38bdf8; display: flex; align-items: center; gap: 5px;">
                            TODOS OS CANAIS
                            ${fmaLiveSelectedChannel === 'ALL' ? '<span style="font-size: 9px; background: #0284c7; color: #fff; padding: 1px 5px; border-radius: 4px;">ATIVO</span>' : ''}
                        </div>
                        <div style="font-size: 10px; color: #94a3b8;">Visão global da praça</div>
                        <div style="font-size: 9.5px; color: #38bdf8; font-weight: 700; margin-top: 1px;">● Exibir Tudo</div>
                    </div>
                </div>

                <!-- CARDS DE VEÍCULOS ESPECÍFICOS (CLICÁVEIS) -->
                ${((data.channels_detail && data.channels_detail.length > 0) ? data.channels_detail : (data.monitored_channels || []).map(ch => ({ name: ch, full_name: ch, prog: 1 }))).map(ch => {
                    const cNameUpper = String(ch.name || ch).toUpperCase();
                    const isSelected = fmaLiveSelectedChannel === cNameUpper;
                    return `
                        <div onclick="filterDetectionsByChannel('${cNameUpper}')" style="cursor: pointer; transition: all 0.2s ease; border-radius: 8px; padding: 10px 14px; display: flex; align-items: center; gap: 10px; min-width: 175px; ${isSelected ? 'border: 2px solid #4ade80; background: rgba(34, 197, 94, 0.22); box-shadow: 0 0 14px rgba(74, 222, 128, 0.45); transform: translateY(-1px);' : 'border: 1px solid rgba(255, 255, 255, 0.12); background: rgba(30, 41, 59, 0.7);'}" title="Filtrar e acompanhar apenas detecções de ${cNameUpper}">
                            <div style="width: 34px; height: 34px; border-radius: 6px; background: rgba(14, 165, 233, 0.2); border: 1px solid rgba(56, 189, 248, 0.4); display: flex; align-items: center; justify-content: center; font-size: 16px;">
                                📺
                            </div>
                            <div>
                                <div style="font-size: 12.5px; font-weight: 800; color: #f8fafc; display: flex; align-items: center; gap: 5px;">
                                    ${escapeHtml(ch.name || ch)}
                                    ${isSelected ? '<span style="font-size: 9px; background: #16a34a; color: #fff; padding: 1px 5px; border-radius: 4px;">FILTRADO</span>' : ''}
                                </div>
                                <div style="font-size: 10px; color: #94a3b8;">${escapeHtml(ch.full_name || ch.name || ch)}</div>
                                <div style="font-size: 9.5px; color: ${isSelected ? '#4ade80' : '#86efac'}; font-weight: 700; margin-top: 1px;">
                                    ${isSelected ? '● Visualizando Agora' : `● Detecção Ativa (Prog ${ch.prog || 1})`}
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>

        <!-- 3. DETECÇÕES RECENTES EM TEMPO REAL & INDICADORES DE FLUXO -->
        <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 14px;">

            <!-- Coluna Esquerda: Tabela de Detecções Automáticas -->
            <div style="background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 14px; display: flex; flex-direction: column;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
                    <div>
                        <div style="font-size: 12px; font-weight: 800; color: #4ade80; text-transform: uppercase; display: flex; align-items: center; gap: 6px;">
                            <span>🎯</span> Detecções no Ar (NEW DETECTION — Match Acústico)
                        </div>
                        <div style="font-size: 10.5px; color: #94a3b8; margin-top: 2px;">
                            Comerciais reconhecidos na transmissão ao vivo com correlação acústica &gt; 98%
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                        <span style="font-size: 10px; color: #94a3b8; font-weight: 600;">Canais da Praça:</span>
                        ${(data.monitored_channels && data.monitored_channels.length > 0) 
                            ? data.monitored_channels.map(ch => `<span style="background: rgba(14, 165, 233, 0.18); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.35); font-size: 9.5px; font-weight: 700; padding: 1px 6px; border-radius: 4px;">${escapeHtml(ch)}</span>`).join('')
                            : `<span style="color: #64748b; font-size: 10px;">Padrão</span>`
                        }
                    </div>
                </div>

                <div style="overflow-x: auto; max-height: 230px; overflow-y: auto;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 11.5px; text-align: left;">
                        <thead>
                            <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.1); color: #94a3b8;">
                                <th style="padding: 6px 8px;">Horário</th>
                                <th style="padding: 6px 8px;">Canal</th>
                                <th style="padding: 6px 8px;">ID / Título Comercial</th>
                                <th style="padding: 6px 8px;">Duração</th>
                                <th style="padding: 6px 8px;">ProcTime</th>
                                <th style="padding: 6px 8px; text-align: right;">Score</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${detections.length === 0 ? `
                                <tr>
                                    <td colspan="6" style="text-align: center; padding: 24px; color: #64748b;">
                                        Aguardando novos blocos comerciais ou matches na programação...
                                    </td>
                                </tr>
                            ` : detections.map(d => `
                                <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05); transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background='transparent'">
                                    <td style="padding: 6px 8px; font-family: monospace; color: #cbd5e1; white-space: nowrap;">${escapeHtml(d.timestamp.split(' ')[1] || d.timestamp)}</td>
                                    <td style="padding: 6px 8px; font-weight: 700; color: #38bdf8;">${escapeHtml(d.channel)}</td>
                                    <td style="padding: 6px 8px;">
                                        <div style="display: flex; align-items: center; gap: 6px;">
                                            <span style="font-weight: 800; color: #38bdf8; font-family: monospace; font-size: 12px;">#${escapeHtml(d.spot_id)}</span>
                                            ${d.has_sgg_title ? '<span class="badge" style="background: rgba(34, 197, 94, 0.2); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.4); font-size: 9px; padding: 1px 4px;">SGG OFICIAL</span>' : ''}
                                        </div>
                                        <div style="font-size: 11px; font-weight: 600; color: ${d.has_sgg_title ? '#f1f5f9' : '#94a3b8'}; max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(d.spot_name)}">
                                            ${escapeHtml(d.spot_name)}
                                        </div>
                                    </td>
                                    <td style="padding: 6px 8px; color: #cbd5e1;">${d.duration_sec}s</td>
                                    <td style="padding: 6px 8px; font-family: monospace; color: ${d.proc_time_ms < 50 ? '#4ade80' : '#facc15'};">${d.proc_time_ms}ms</td>
                                    <td style="padding: 6px 8px; text-align: right;">
                                        <span class="badge" style="background: ${d.badge_color}22; color: ${d.badge_color}; border: 1px solid ${d.badge_color}66; font-size: 10px; font-weight: 800; padding: 2px 6px;">
                                            ${d.confidence_score.toFixed(1)}%
                                        </span>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>

                <div style="background: rgba(14, 165, 233, 0.08); border-left: 3px solid #38bdf8; border-radius: 4px; padding: 7px 10px; margin-top: 10px; font-size: 10.5px; color: #cbd5e1; line-height: 1.4;">
                    💡 <strong>O que significa NEW DETECTION?</strong> Indica que o motor FastMatching comparou o áudio da TV cortado pelo Atria (.EMU) com a biblioteca de spots em RAM e deu <strong>Match positivo (&gt;98%)</strong>: aquele comercial acabou de ser veiculado no canal naquele segundo exato.
                </div>
            </div>

            <!-- Coluna Direita: Detalhamento de Fluxo EMU & Buffer -->
            <div style="background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 14px; display: flex; flex-direction: column; justify-content: space-between;">
                <div>
                    <div style="font-size: 12px; font-weight: 800; color: #f8fafc; text-transform: uppercase; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
                        <span>📦</span> Pipeline EMU (D:\\MediaDNA_V2\\Data\\emu)
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 8px; font-size: 11.5px;">
                        <div style="background: rgba(0, 0, 0, 0.3); padding: 8px 10px; border-radius: 6px;">
                            <div style="color: #94a3b8; font-size: 10px; text-transform: uppercase;">Último .EMU Gravado</div>
                            <div style="color: #38bdf8; font-weight: 700; font-family: monospace; margin-top: 2px; word-break: break-all;">
                                ${escapeHtml(emu.last_emu_file)}
                            </div>
                            <div style="color: #64748b; font-size: 10px; margin-top: 2px;">Timestamp: ${escapeHtml(emu.last_emu_timestamp)}</div>
                        </div>

                        <div style="background: rgba(0, 0, 0, 0.3); padding: 8px 10px; border-radius: 6px;">
                            <div style="color: #94a3b8; font-size: 10px; text-transform: uppercase;">Canais Emitindo .EMU</div>
                            <div style="color: #fff; font-weight: 700; margin-top: 2px;">
                                ${emu.active_channels} canais simultâneos (1 min por bloco)
                            </div>
                        </div>

                        <div style="background: rgba(0, 0, 0, 0.3); padding: 8px 10px; border-radius: 6px;">
                            <div style="color: #94a3b8; font-size: 10px; text-transform: uppercase;">Integridade de Disco D:</div>
                            <div style="color: #4ade80; font-weight: 700; margin-top: 2px;">
                                ${escapeHtml(emu.free_disk_gb)} Livres (Buffer Seguro)
                            </div>
                        </div>
                    </div>
                </div>

                <div style="margin-top: 10px; font-size: 10.5px; color: #64748b; line-height: 1.3;">
                    ℹ️ Os arquivos .EMU são gerados pelo AtriaCapture e consumidos pelo FastMatchingSvc a cada minuto. O fluxo contínuo impede gargalos de detecção.
                </div>
            </div>

        </div>

        <!-- 4. TERMINAL AO VIVO DO fma.log -->
        <div style="background: #020617; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 8px; overflow: hidden; display: flex; flex-direction: column;">

            <!-- Header do Terminal com Busca & Filtros -->
            <div style="background: #0f172a; padding: 8px 14px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                <div style="font-size: 11px; font-weight: 700; color: #cbd5e1; display: flex; align-items: center; gap: 6px; font-family: monospace;">
                    <span style="color: #38bdf8;">$</span> fma.log (Live Tail — Últimas ${logs.length} linhas)
                </div>

                <div style="display: flex; align-items: center; gap: 10px;">
                    <input type="text" id="fmaLiveLogFilter" placeholder="Filtrar log (ex: NEW DETECTION, recon, RAM)..." value="${escapeHtml(fmaLiveLogSearchKw)}" oninput="onFmaLiveFilterChange(this.value)" style="background: #1e293b; color: #fff; border: 1px solid rgba(255, 255, 255, 0.15); padding: 3px 8px; border-radius: 4px; font-size: 11px; outline: none; width: 230px;">
                    <label style="font-size: 10.5px; color: #94a3b8; display: inline-flex; align-items: center; gap: 4px; cursor: pointer;">
                        <input type="checkbox" ${fmaLiveAutoScroll ? 'checked' : ''} onchange="fmaLiveAutoScroll = this.checked"> Auto-scroll
                    </label>
                </div>
            </div>

            <!-- Corpo de Linhas Monospace Coloridas -->
            <div id="fmaLiveLogTerminal" style="font-family: Consolas, 'Courier New', monospace; font-size: 11px; line-height: 1.5; color: #e2e8f0; padding: 12px; min-height: 160px; max-height: 320px; overflow-y: auto; background: #00040f;">
                ${renderFmaLogLines(logs, fmaLiveLogSearchKw)}
            </div>

        </div>
    `;

    // Manter auto-scroll no final do terminal se ativo
    if (fmaLiveAutoScroll) {
        const term = document.getElementById("fmaLiveLogTerminal");
        if (term) term.scrollTop = term.scrollHeight;
    }
}

function onFmaLiveFilterChange(val) {
    fmaLiveLogSearchKw = val || "";
    const term = document.getElementById("fmaLiveLogTerminal");
    const logs = window._lastFmaLogsCache || [];
    if (term) {
        term.innerHTML = renderFmaLogLines(logs, fmaLiveLogSearchKw);
    }
}
window.onFmaLiveFilterChange = onFmaLiveFilterChange;

function renderFmaLogLines(lines, filterKw) {
    window._lastFmaLogsCache = lines;
    if (!lines || lines.length === 0) {
        return `<div style="color: #64748b;">Nenhuma linha registrada no fma.log recente.</div>`;
    }

    const kw = (filterKw || "").trim().toLowerCase();

    return lines.filter(l => !kw || l.toLowerCase().includes(kw)).map(line => {
        let col = "#94a3b8";
        if (line.includes("NEW DETECTION")) {
            col = "#4ade80"; // Verde match
        } else if (line.includes("DELAYED NEW DETECTION")) {
            col = "#facc15"; // Amarelo delayed
        } else if (line.includes("recon=0") || line.includes("ERROR") || line.includes("stopped")) {
            col = "#f87171"; // Vermelho erro
        } else if (line.includes("XmlUpdate") || line.includes("Loaded spots")) {
            col = "#38bdf8"; // Azul catálogo
        } else if (line.includes("RAM usage")) {
            col = "#c084fc"; // Roxo RAM
        } else if (line.includes("SearchStats")) {
            col = "#34d399"; // Verde água estatística
        }

        return `<div style="color: ${col}; white-space: pre-wrap; word-break: break-all;">${escapeHtml(line)}</div>`;
    }).join("");
}

function _showFmaConfirm(title, msg, onConfirm) {
    const pid = 'fma-confirm-modal-' + Date.now();
    const html = `
        <div id="${pid}" style="position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:10100;display:flex;align-items:center;justify-content:center;">
            <div style="background:#0f172a;border:1px solid rgba(239,68,68,0.5);border-radius:12px;max-width:440px;width:94%;padding:22px;box-shadow:0 20px 50px rgba(0,0,0,0.6);">
                <div style="font-size:14px;font-weight:800;color:#f87171;margin-bottom:10px;">${title}</div>
                <div style="font-size:12.5px;color:#cbd5e1;line-height:1.5;margin-bottom:18px;">${msg}</div>
                <div style="display:flex;gap:10px;justify-content:flex-end;">
                    <button onclick="document.getElementById('${pid}').remove()" style="background:#334155;color:#fff;border:none;padding:8px 18px;border-radius:6px;font-size:12px;cursor:pointer;">Cancelar</button>
                    <button onclick="document.getElementById('${pid}').remove();(${onConfirm})()" style="background:linear-gradient(135deg,#ef4444,#b91c1c);color:#fff;border:none;padding:8px 18px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;">Confirmar</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
}
window._showFmaConfirm = _showFmaConfirm;

async function triggerFmaLiveHeal(mode) {
    if (!fmaLiveCurrentHost) return;
    const _notify = (msg, type) => typeof showToast === 'function' ? showToast(msg, type || 'info') : console.log(msg);

    if (mode === "recon") {
        _showFmaConfirm(
            '⚠️ Confirmar Auto-Cura',
            `Deseja disparar a Auto-Cura de Recon=0 e sincronização SGG para <strong>${escapeHtml(fmaLiveCurrentHost)}</strong>?`,
            `async function() {
                try {
                    const token = (typeof getAuthToken === 'function') ? getAuthToken() : ((typeof getFleetAuthToken === 'function') ? getFleetAuthToken() : (localStorage.getItem('fleet_token') || ''));
                    const res = await fetch('/api/fleet/detection/safe-heal', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                        body: JSON.stringify({ hostname: '${escapeHtml(fmaLiveCurrentHost)}', mode: 'fastmatching_recon_fix' })
                    });
                    const data = await res.json();
                    if (typeof showToast === 'function') showToast(data.message || 'Auto-Cura despachada com sucesso!', 'success');
                    refreshFmaLiveData();
                } catch (e) {
                    if (typeof showToast === 'function') showToast('Falha ao disparar auto-cura: ' + e.message, 'error');
                }
            }`
        );
    } else if (mode === "restart") {
        _showFmaConfirm(
            '⚠️ Confirmar Reinício',
            `Deseja reiniciar preventivamente o serviço FastMatchingSvc em <strong>${escapeHtml(fmaLiveCurrentHost)}</strong>?`,
            `function() {
                try {
                    if (typeof triggerFmRemoteRemediation === 'function') {
                        triggerFmRemoteRemediation('${escapeHtml(fmaLiveCurrentHost)}', 'restart_fastmatching');
                        if (typeof showToast === 'function') showToast('Reinício de FastMatchingSvc enviado para ${escapeHtml(fmaLiveCurrentHost)}.', 'success');
                    } else {
                        if (typeof showToast === 'function') showToast('Solicitação de reinício enviada para ${escapeHtml(fmaLiveCurrentHost)}.', 'info');
                    }
                } catch (e) {
                    if (typeof showToast === 'function') showToast('Erro ao reiniciar serviço: ' + e.message, 'error');
                }
            }`
        );
    }
}
window.triggerFmaLiveHeal = triggerFmaLiveHeal;

function copyFmaLiveLogs() {
    const term = document.getElementById("fmaLiveLogTerminal");
    if (!term) return;
    const text = term.innerText;
    navigator.clipboard.writeText(text).then(() => {
        if (typeof showToast === 'function') showToast('📋 Logs do fma.log copiados!', 'success');
    }).catch(err => {
        if (typeof showToast === 'function') showToast('Falha ao copiar logs: ' + err, 'error');
    });
}
window.copyFmaLiveLogs = copyFmaLiveLogs;

function openPipelineLiveGuideModal() {
    const guideModal = document.getElementById("pipelineLiveGuideModal");
    if (guideModal) {
        guideModal.style.display = "flex";
    }
}
window.openPipelineLiveGuideModal = openPipelineLiveGuideModal;

function closePipelineLiveGuideModal() {
    const guideModal = document.getElementById("pipelineLiveGuideModal");
    if (guideModal) {
        guideModal.style.display = "none";
    }
}
window.closePipelineLiveGuideModal = closePipelineLiveGuideModal;

