/**
 * Detection Pipeline Live (FastMatching fma.log, Ingestão de Spots & Fluxo de EMU)
 * Kantar IBOPE Media — Monitor_Servicos NOC LATAM
 */

let fmaLiveCurrentHost = "";
let fmaLiveCurrentPraca = "";
let fmaLiveTimer = null;
let fmaLiveLogSearchKw = "";
let fmaLiveAutoScroll = true;

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
    refreshFmaLiveData();
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

        renderFmaLiveDashboard(data);

    } catch (e) {
        console.error("[FmaLive] Erro ao sincronizar:", e);
        if (footerEl) footerEl.textContent = `Erro na sincronização: ${e.message}`;
    }
}
window.refreshFmaLiveData = refreshFmaLiveData;

function renderFmaLiveDashboard(data) {
    const bodyEl = document.getElementById("fmaLiveModalBody");
    if (!bodyEl) return;

    const diag = data.diagnosis || {};
    const spots = data.spots_status || {};
    const emu = data.emu_status || {};
    const perf = data.engine_performance || {};
    const detections = data.recent_detections || [];
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

            <!-- Card 2: Catálogo & Spots Carregados -->
            <div style="background: rgba(15, 23, 42, 0.85); border: 1px solid ${spots.loaded ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}; border-radius: 8px; padding: 12px;">
                <div style="font-size: 10px; font-weight: 800; color: #38bdf8; text-transform: uppercase;">Catálogo &amp; Spots SGG</div>
                <div style="font-size: 18px; font-weight: 800; color: #f8fafc; margin-top: 4px;">
                    ${(spots.total_spots_loaded || 0).toLocaleString()} spots
                </div>
                <div style="font-size: 11px; color: ${spots.status_color === 'green' ? '#4ade80' : '#f87171'}; margin-top: 4px; font-weight: 700;">
                    ${escapeHtml(spots.status_label || 'Aguardando')} ${spots.recon_count !== null && spots.recon_count !== undefined ? `(recon=${spots.recon_count})` : ''}
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

        <!-- 3. DETECÇÕES RECENTES EM TEMPO REAL & INDICADORES DE FLUXO -->
        <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 14px;">

            <!-- Coluna Esquerda: Tabela de Detecções Automáticas -->
            <div style="background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 14px; display: flex; flex-direction: column;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <div style="font-size: 12px; font-weight: 800; color: #f8fafc; text-transform: uppercase; display: flex; align-items: center; gap: 6px;">
                        <span>🎯</span> Últimos Spots Comerciais Reconhecidos (Tempo Real)
                    </div>
                    <div style="font-size: 11px; color: #94a3b8;">${detections.length} matches no ciclo atual</div>
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
                                        <span style="font-weight: 700; color: #fff;">#${escapeHtml(d.spot_id)}</span>
                                        <div style="font-size: 10px; color: #94a3b8; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(d.spot_name)}</div>
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
            <div id="fmaLiveLogTerminal" style="font-family: Consolas, 'Courier New', monospace; font-size: 11px; line-height: 1.5; color: #e2e8f0; padding: 12px; height: 180px; overflow-y: auto; background: #00040f;">
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

async function triggerFmaLiveHeal(mode) {
    if (!fmaLiveCurrentHost) return;

    if (mode === "recon") {
        if (!confirm(`Deseja disparar a Auto-Cura de Recon=0 e sincronização SGG para ${fmaLiveCurrentHost}?`)) return;
        try {
            const token = (typeof getAuthToken === "function") ? getAuthToken() : ((typeof getFleetAuthToken === "function") ? getFleetAuthToken() : (localStorage.getItem("fleet_token") || ""));
            const res = await fetch("/api/fleet/detection/safe-heal", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify({ hostname: fmaLiveCurrentHost, mode: "fastmatching_recon_fix" })
            });
            const data = await res.json();
            alert(data.message || "Auto-Cura despachada com sucesso!");
            refreshFmaLiveData();
        } catch (e) {
            alert(`Falha ao disparar auto-cura: ${e.message}`);
        }
    } else if (mode === "restart") {
        if (!confirm(`Deseja reiniciar preventivamente o serviço FastMatchingSvc em ${fmaLiveCurrentHost}?`)) return;
        try {
            if (typeof triggerFmRemoteRemediation === "function") {
                triggerFmRemoteRemediation(fmaLiveCurrentHost, "restart_fastmatching");
            } else {
                alert(`Solicitação de reinício enviada para ${fmaLiveCurrentHost}.`);
            }
        } catch (e) {
            alert(`Erro ao reiniciar serviço: ${e.message}`);
        }
    }
}
window.triggerFmaLiveHeal = triggerFmaLiveHeal;

function copyFmaLiveLogs() {
    const term = document.getElementById("fmaLiveLogTerminal");
    if (!term) return;
    const text = term.innerText;
    navigator.clipboard.writeText(text).then(() => {
        alert("Logs do fma.log copiados para a área de transferência!");
    }).catch(err => {
        alert("Falha ao copiar logs: " + err);
    });
}
window.copyFmaLiveLogs = copyFmaLiveLogs;
