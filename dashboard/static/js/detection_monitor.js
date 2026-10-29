/**
 * Módulo Frontend: Monitoramento do Pipeline de Detecção Automática (Exclusivo CS01)
 * Kantar IBOPE Media — Monitor_Servicos NOC LATAM
 */

let detectionCurrentThreshold = 45;
let detectionFilterStatus = "all";
let detectionFilterEngine = "all";
let detectionSearchQuery = "";
let detectionCachedSites = [];
let detectionCachedSummary = null;
let detectionIsLoading = false;

async function initDetectionMonitorTab() {
    const container = document.getElementById("tab-deteccao");
    if (!container) return;
    await loadDetectionFleetData();
}

async function loadDetectionFleetData() {
    detectionIsLoading = true;
    updateDetectionLoadingState(true);

    try {
        const thresholdSelect = document.getElementById("detectionThresholdSelect");
        if (thresholdSelect) {
            detectionCurrentThreshold = parseInt(thresholdSelect.value, 10) || 45;
        }

        const token = (typeof getAuthToken === "function") ? getAuthToken() : (localStorage.getItem("fleet_token") || "");
        const headers = token ? { "Authorization": `Bearer ${token}` } : {};

        const url = `/api/fleet/detection/sites?threshold=${detectionCurrentThreshold}`;
        const resp = await fetch(url, { headers });

        if (!resp.ok) {
            throw new Error(`HTTP ${resp.status}: Falha ao obter dados de detecção automática.`);
        }

        const data = await resp.json();
        detectionCachedSummary = data.summary || {};
        detectionCachedSites = data.sites || [];

        renderDetectionSummary(detectionCachedSummary);
        renderDetectionTable();
    } catch (err) {
        console.error("[DetectionMonitor] Erro:", err);
        const tbody = document.getElementById("detectionTableBody");
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 40px; color: #f87171;">
                        <div style="font-size: 24px; margin-bottom: 8px;">⚠️</div>
                        <div style="font-weight: 600; font-size: 14px;">Falha ao carregar auditoria de detecção dos CS01</div>
                        <div style="font-size: 12px; color: #94a3b8; margin-top: 4px;">${err.message || err}</div>
                        <button onclick="loadDetectionFleetData()" class="btn-refresh" style="margin-top: 14px; padding: 6px 14px; background: #3b82f6; color: #fff; border: none; border-radius: 6px; cursor: pointer;">
                            Tentar Novamente
                        </button>
                    </td>
                </tr>
            `;
        }
    } finally {
        detectionIsLoading = false;
        updateDetectionLoadingState(false);
    }
}

function updateDetectionLoadingState(loading) {
    const refreshBtn = document.getElementById("btnRefreshDetection");
    if (refreshBtn) {
        if (loading) {
            refreshBtn.innerHTML = `<span>⏳</span> Auditando Frota CS01...`;
            refreshBtn.disabled = true;
            refreshBtn.style.opacity = "0.7";
        } else {
            refreshBtn.innerHTML = `<span>🔄</span> Atualizar Auditoria`;
            refreshBtn.disabled = false;
            refreshBtn.style.opacity = "1";
        }
    }
}

function renderDetectionSummary(summary) {
    if (!summary) return;

    const elTotal = document.getElementById("kpiDetTotalCS01");
    const elNominal = document.getElementById("kpiDetNominal");
    const elFallback = document.getElementById("kpiDetFallback");
    const elStalled = document.getElementById("kpiDetStalled");
    const elInoperant = document.getElementById("kpiDetInoperant");
    const elCompliance = document.getElementById("kpiDetCompliance");
    const elAuditTime = document.getElementById("detectionAuditTimestamp");

    if (elTotal) elTotal.textContent = summary.total_cs01 ?? 0;
    if (elNominal) elNominal.textContent = summary.nominal_fastmatching ?? 0;
    if (elFallback) elFallback.textContent = summary.fallback_detection_svc ?? 0;
    if (elStalled) elStalled.textContent = summary.stalled_tracking ?? 0;
    if (elInoperant) elInoperant.textContent = summary.inoperant_p0 ?? 0;
    if (elCompliance) elCompliance.textContent = `${summary.compliance_rate ?? 100}%`;
    if (elAuditTime) elAuditTime.textContent = summary.last_audit_time ?? "";
}

function filterDetectionSites() {
    const qInput = document.getElementById("detectionSearchInput");
    const stSelect = document.getElementById("detectionFilterStatus");
    const engSelect = document.getElementById("detectionFilterEngine");

    detectionSearchQuery = (qInput?.value || "").trim().toLowerCase();
    detectionFilterStatus = stSelect?.value || "all";
    detectionFilterEngine = engSelect?.value || "all";

    renderDetectionTable();
}

function renderDetectionTable() {
    const tbody = document.getElementById("detectionTableBody");
    const countDisplay = document.getElementById("detectionFilteredCount");
    if (!tbody) return;

    let filtered = detectionCachedSites.filter(site => {
        // Busca textual (Praça ou Hostname)
        if (detectionSearchQuery) {
            const p = (site.praca || "").toLowerCase();
            const h = (site.hostname || "").toLowerCase();
            if (!p.includes(detectionSearchQuery) && !h.includes(detectionSearchQuery)) {
                return false;
            }
        }

        // Filtro por Status de Saúde
        if (detectionFilterStatus !== "all") {
            if (detectionFilterStatus === "problems") {
                if (site.health_status === "NOMINAL") return false;
            } else if (detectionFilterStatus === "stalled") {
                if (!site.is_stalled) return false;
            } else if (detectionFilterStatus === "fallback") {
                if (site.engine_tier !== "FALLBACK") return false;
            } else if (detectionFilterStatus === "critical") {
                if (site.health_status !== "CRITICAL") return false;
            } else if (detectionFilterStatus === "comm_lost") {
                if (site.health_status !== "COMM_LOST") return false;
            } else if (detectionFilterStatus === "conflict") {
                if (site.engine_tier !== "CONFLICT") return false;
            } else if (detectionFilterStatus === "nominal") {
                if (site.health_status !== "NOMINAL") return false;
            }
        }

        // Filtro por Motor
        if (detectionFilterEngine !== "all") {
            if (detectionFilterEngine === "primary" && site.engine_tier !== "PRIMARY") return false;
            if (detectionFilterEngine === "fallback" && site.engine_tier !== "FALLBACK") return false;
            if (detectionFilterEngine === "conflict" && site.engine_tier !== "CONFLICT") return false;
            if (detectionFilterEngine === "none" && site.engine_tier !== "NONE") return false;
        }

        return true;
    });

    if (countDisplay) {
        countDisplay.textContent = `Exibindo ${filtered.length} de ${detectionCachedSites.length} Capture Sites CS01`;
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 40px; color: #94a3b8;">
                    <div style="font-size: 24px; margin-bottom: 6px;">🔍</div>
                    <div style="font-weight: 500; font-size: 14px;">Nenhum Capture Site CS01 corresponde aos filtros selecionados.</div>
                    <div style="font-size: 12px; margin-top: 4px;">Ajuste os filtros de status, motor ou termo de busca.</div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = filtered.map(site => {
        const p = site.pipeline_services;
        const fm = p.fast_matching;
        const det = p.detection_svc;
        const cfg = p.config_monitor;
        const trk = p.tracking_svc;
        const comm = site.agent_comm || {};

        // Badge do Motor Ativo
        let engineBadgeHtml = "";
        if (site.engine_tier === "PRIMARY") {
            engineBadgeHtml = `
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 8px #22c55e;"></span>
                    <span style="font-weight: 600; color: #4ade80; font-size: 12px;">FastMatching</span>
                    <span style="font-size: 10px; background: rgba(34, 197, 94, 0.15); color: #86efac; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(34, 197, 94, 0.3);">Primário</span>
                </div>
            `;
        } else if (site.engine_tier === "CONFLICT") {
            engineBadgeHtml = `
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #f97316; box-shadow: 0 0 8px #f97316;"></span>
                    <span style="font-weight: 700; color: #fb923c; font-size: 12px;">CONFLITO CONCORRENTE</span>
                    <span style="font-size: 10px; background: rgba(249, 115, 22, 0.15); color: #fdba74; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(249, 115, 22, 0.4);">Ambos Ativos</span>
                </div>
            `;
        } else if (site.engine_tier === "FALLBACK") {
            engineBadgeHtml = `
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #eab308; box-shadow: 0 0 8px #eab308;"></span>
                    <span style="font-weight: 600; color: #facc15; font-size: 12px;">DetectionSVC</span>
                    <span style="font-size: 10px; background: rgba(234, 179, 8, 0.15); color: #fef08a; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(234, 179, 8, 0.3);">Fallback</span>
                </div>
            `;
        } else {
            engineBadgeHtml = `
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #ef4444; box-shadow: 0 0 8px #ef4444;"></span>
                    <span style="font-weight: 600; color: #f87171; font-size: 12px;">INOPERANTE</span>
                    <span style="font-size: 10px; background: rgba(239, 68, 68, 0.15); color: #fca5a5; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(239, 68, 68, 0.3);">Crítico P0</span>
                </div>
            `;
        }

        // Helper para renderizar pill de serviço individual
        const renderSvcPill = (name, running, statusText) => {
            const isRun = !!running;
            const bg = isRun ? "rgba(34, 197, 94, 0.12)" : "rgba(239, 68, 68, 0.15)";
            const border = isRun ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.35)";
            const color = isRun ? "#86efac" : "#fca5a5";
            const dot = isRun ? "#22c55e" : "#ef4444";
            return `
                <span title="${name}: ${statusText}" style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px; border-radius: 4px; background: ${bg}; border: 1px solid ${border}; color: ${color}; font-size: 10px; font-weight: 500;">
                    <span style="width: 5px; height: 5px; border-radius: 50%; background: ${dot};"></span>
                    ${name.replace(".exe", "").replace("DNA.", "")}
                </span>
            `;
        };

        // Renderização da barra e tempo de tracking (D:\mediadna_V2\data\tracking)
        const age = site.tracking_age_minutes;
        let ageColor = "#22c55e";
        let barWidth = Math.min(100, Math.max(8, (age / detectionCurrentThreshold) * 100));
        let ageLabel = `Há ${age} min`;

        if (comm.is_stale) {
            ageColor = "#f59e0b";
            barWidth = 100;
            ageLabel = `Sem dados recentes`;
        } else if (site.engine_tier === "NONE") {
            ageColor = "#ef4444";
            barWidth = 100;
            ageLabel = `Parado (>180m)`;
        } else if (age >= detectionCurrentThreshold) {
            ageColor = "#ef4444";
            barWidth = 100;
            ageLabel = `🚨 Há ${age} min (> Limiar)`;
        } else if (age >= 25) {
            ageColor = "#eab308";
        }

        // Badge de Comunicação do Agente
        let commBadgeHtml = "";
        if (comm.status === "ONLINE") {
            commBadgeHtml = `<span title="DNA.MonitorServiceSVC online há ${comm.label}" style="font-size: 9px; color: #86efac; background: rgba(34, 197, 94, 0.12); border: 1px solid rgba(34, 197, 94, 0.25); padding: 1px 5px; border-radius: 4px;">📶 Agente v${comm.agent_version}</span>`;
        } else if (comm.status === "DELAY") {
            commBadgeHtml = `<span title="Atraso de telemetria no SharePoint (${comm.label})" style="font-size: 9px; color: #fde047; background: rgba(234, 179, 8, 0.15); border: 1px solid rgba(234, 179, 8, 0.3); padding: 1px 5px; border-radius: 4px;">⚠️ Agente Delay</span>`;
        } else {
            commBadgeHtml = `<span title="Agente sem conexão com SharePoint (${comm.label})" style="font-size: 9px; color: #fca5a5; background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.4); padding: 1px 5px; border-radius: 4px; font-weight: 700;">🚨 Agente Offline</span>`;
        }

        // Badge de Saúde Geral
        let statusBadge = "";
        if (site.health_status === "NOMINAL") {
            statusBadge = `<span style="background: rgba(34, 197, 94, 0.15); color: #86efac; border: 1px solid rgba(34, 197, 94, 0.3); padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 600;">Nominal</span>`;
        } else if (site.health_status === "WARNING") {
            statusBadge = `<span style="background: rgba(234, 179, 8, 0.15); color: #fde047; border: 1px solid rgba(234, 179, 8, 0.3); padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 600;">Atenção (Fallback)</span>`;
        } else if (site.health_status === "COMM_LOST") {
            statusBadge = `<span style="background: rgba(245, 158, 11, 0.2); color: #fcd34d; border: 1px solid rgba(245, 158, 11, 0.45); padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 600;">Comunicação Perdida</span>`;
        } else if (site.health_status === "STALLED") {
            statusBadge = `<span style="background: rgba(239, 68, 68, 0.2); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.4); padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; animation: pulse 2s infinite;">Estagnado (P1)</span>`;
        } else {
            statusBadge = `<span style="background: rgba(220, 38, 38, 0.3); color: #fecaca; border: 1px solid rgba(220, 38, 38, 0.6); padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 700;">Inoperante (P0)</span>`;
        }

        return `
            <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05); transition: background 0.15s ease;">
                <!-- 1. Praça & Hostname -->
                <td style="padding: 12px 14px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div>
                            <div style="font-weight: 600; font-size: 13px; color: #f8fafc;">${site.praca}</div>
                            <div style="font-family: monospace; font-size: 11px; color: #94a3b8; display: flex; align-items: center; gap: 6px; margin-top: 2px;">
                                <span>${site.hostname}</span>
                                <span style="background: #1e3a8a; color: #93c5fd; padding: 1px 5px; border-radius: 4px; font-size: 9px; font-weight: 700;">CS01</span>
                                ${commBadgeHtml}
                            </div>
                        </div>
                    </div>
                </td>

                <!-- 2. Motor Ativo de Detecção -->
                <td style="padding: 12px 14px;">
                    ${engineBadgeHtml}
                    <div style="font-size: 10px; color: #64748b; margin-top: 4px;">CPU: ${site.cpu_uso} | RAM: ${site.ram_uso}</div>
                </td>

                <!-- 3. Pipeline de Serviços (4 Serviços-Chave) -->
                <td style="padding: 12px 14px;">
                    <div style="display: flex; flex-wrap: wrap; gap: 4px; max-width: 260px;">
                        ${renderSvcPill("FastMatching", fm.running, fm.status)}
                        ${renderSvcPill("DetectionSVC", det.running, det.status)}
                        ${renderSvcPill("ConfigMonitor", cfg.running, cfg.status)}
                        ${renderSvcPill("TrackingSVC", trk.running, trk.status)}
                    </div>
                </td>

                <!-- 4. Idade do Tracking (D:\mediadna_V2\data\tracking) -->
                <td style="padding: 12px 14px;">
                    <div style="display: flex; align-items: center; justify-content: space-between; font-size: 11px; font-weight: 600; margin-bottom: 4px;">
                        <span style="color: ${ageColor};">${ageLabel}</span>
                        <span style="font-size: 10px; color: #64748b;">${site.throughput_xml_hour} XML/h</span>
                    </div>
                    <div style="width: 100%; height: 5px; background: rgba(255, 255, 255, 0.08); border-radius: 3px; overflow: hidden;">
                        <div style="width: ${barWidth}%; height: 100%; background: ${ageColor}; border-radius: 3px; transition: width 0.3s ease;"></div>
                    </div>
                    <div style="font-size: 9px; color: #64748b; margin-top: 3px; font-family: monospace;">D:\\mediadna_V2\\data\\tracking</div>
                </td>

                <!-- 5. Entrada SGG & Catálogo & Buffer EMU -->
                <td style="padding: 12px 14px; font-size: 11px;">
                    <div style="color: #cbd5e1; font-weight: 500;">D:\\...\\data\\sgg (.MDNA)</div>
                    <div style="font-size: 10px; color: #94a3b8; margin-top: 2px;">
                        Buffer EMU: <span style="color: #38bdf8;">Blocos 1 min</span>
                    </div>
                    <div style="font-size: 10px; color: ${cfg.running ? '#86efac' : '#fca5a5'}; margin-top: 1px;">
                        ${cfg.running ? '✅ Spots Ativos' : '⚠️ Sync Parado'}
                    </div>
                </td>

                <!-- 6. Status Geral -->
                <td style="padding: 12px 14px;">
                    ${statusBadge}
                </td>

                <!-- 7. Ações -->
                <td style="padding: 12px 14px; text-align: right;">
                    <div style="display: inline-flex; gap: 6px;">
                        <button onclick="openDetectionAIDiagnosticModal('${site.hostname}')" style="background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff; border: none; padding: 5px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 4px; box-shadow: 0 2px 6px rgba(99, 102, 241, 0.3);">
                            <span>🧠</span> Laudo IA
                        </button>
                        <button onclick="openDetectionQuickActionsModal('${site.hostname}', '${site.active_engine}', '${site.health_status}')" style="background: #1e293b; color: #e2e8f0; border: 1px solid rgba(255, 255, 255, 0.15); padding: 5px 9px; border-radius: 6px; font-size: 11px; cursor: pointer;">
                            <span>⚡</span> Ações
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

async function openDetectionAIDiagnosticModal(hostname) {
    const modal = document.getElementById("detectionAIDiagnoseModal");
    const titleEl = document.getElementById("detAIModalTitle");
    const contentEl = document.getElementById("detAIModalContent");

    if (!modal || !contentEl) return;

    if (titleEl) titleEl.textContent = `Diagnóstico Heurístico de Detecção — ${hostname}`;
    contentEl.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #94a3b8;">
            <div style="font-size: 28px; margin-bottom: 12px; animation: spin 1.5s linear infinite;">🧠</div>
            <div style="font-size: 14px; font-weight: 600; color: #e2e8f0;">O Motor Heurístico Gemini Pro está auditando a esteira de detecção do CS01...</div>
            <div style="font-size: 12px; margin-top: 6px;">Analisando correlação entre blocos de 1 min (.EMU), spots (.MDNA), D:\\mediadna_V2\\data\\tracking e heartbeat do agente.</div>
        </div>
    `;
    modal.style.display = "flex";

    try {
        const token = (typeof getAuthToken === "function") ? getAuthToken() : (localStorage.getItem("fleet_token") || "");
        const headers = token ? { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };

        const resp = await fetch("/api/fleet/detection/ai-diagnose", {
            method: "POST",
            headers,
            body: JSON.stringify({ hostname })
        });

        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();

        if (!data.success) {
            contentEl.innerHTML = `<div style="color: #f87171; padding: 20px;">${data.error || "Erro ao gerar diagnóstico."}</div>`;
            return;
        }

        const diag = data.diagnosis;
        const site = data.site;

        contentEl.innerHTML = `
            <div style="margin-bottom: 16px; padding: 12px; border-radius: 8px; background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(255, 255, 255, 0.08);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div>
                        <span style="font-size: 15px; font-weight: 700; color: #f8fafc;">${site.praca}</span>
                        <span style="font-family: monospace; font-size: 12px; color: #94a3b8; margin-left: 8px;">${site.hostname} (CS01)</span>
                    </div>
                    <span style="font-size: 11px; color: #94a3b8;">${diag.timestamp}</span>
                </div>
                <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; font-size: 11px; margin-top: 10px;">
                    <div style="background: rgba(15, 23, 42, 0.8); padding: 8px; border-radius: 6px;">
                        <div style="color: #64748b; font-size: 10px;">Motor Primário</div>
                        <div style="font-weight: 600; color: #f8fafc; margin-top: 2px;">${diag.engine_analysis.primary}</div>
                    </div>
                    <div style="background: rgba(15, 23, 42, 0.8); padding: 8px; border-radius: 6px;">
                        <div style="color: #64748b; font-size: 10px;">Motor Fallback</div>
                        <div style="font-weight: 600; color: #f8fafc; margin-top: 2px;">${diag.engine_analysis.fallback}</div>
                    </div>
                    <div style="background: rgba(15, 23, 42, 0.8); padding: 8px; border-radius: 6px;">
                        <div style="color: #64748b; font-size: 10px;">Ingestão SGG</div>
                        <div style="font-weight: 600; color: #f8fafc; margin-top: 2px;">${diag.engine_analysis.intake}</div>
                    </div>
                    <div style="background: rgba(15, 23, 42, 0.8); padding: 8px; border-radius: 6px;">
                        <div style="color: #64748b; font-size: 10px;">Despacho XML</div>
                        <div style="font-weight: 600; color: #f8fafc; margin-top: 2px;">${diag.engine_analysis.dispatch}</div>
                    </div>
                    <div style="background: rgba(15, 23, 42, 0.8); padding: 8px; border-radius: 6px;">
                        <div style="color: #64748b; font-size: 10px;">Heartbeat Agente</div>
                        <div style="font-weight: 600; color: #38bdf8; margin-top: 2px;">${diag.engine_analysis.agent_comm}</div>
                    </div>
                </div>
            </div>

            <div style="margin-bottom: 16px;">
                <div style="font-size: 12px; font-weight: 700; color: #facc15; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                    <span>⚠️</span> Causa Raiz Identificada
                </div>
                <div style="padding: 12px; background: rgba(234, 179, 8, 0.08); border-left: 3px solid #eab308; border-radius: 4px; font-size: 13px; color: #fef08a; font-weight: 500;">
                    ${diag.root_cause}
                </div>
            </div>

            <div style="margin-bottom: 16px;">
                <div style="font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                    <span>🔬</span> Avaliação Técnica Forense
                </div>
                <div style="padding: 12px; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 6px; font-size: 12px; color: #cbd5e1; line-height: 1.6;">
                    ${diag.technical_assessment}
                </div>
            </div>

            <div>
                <div style="font-size: 12px; font-weight: 700; color: #38bdf8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                    <span>⚡</span> Plano de Ação Recomendado (Playbook de Remediação)
                </div>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    ${diag.recommended_actions.map(act => `
                        <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: rgba(30, 41, 59, 0.7); border: 1px solid ${act.recommended ? 'rgba(56, 189, 248, 0.4)' : 'rgba(255, 255, 255, 0.08)'}; border-radius: 6px;">
                            <div>
                                <div style="font-weight: 600; font-size: 13px; color: #f8fafc; display: flex; align-items: center; gap: 6px;">
                                    ${act.title}
                                    ${act.recommended ? '<span style="background: #0284c7; color: #fff; font-size: 9px; padding: 1px 6px; border-radius: 4px;">Recomendado</span>' : ''}
                                </div>
                                <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">${act.desc}</div>
                            </div>
                            <button onclick="executeDetectionAction('${act.action}', '${site.hostname}')" style="background: ${act.recommended ? '#0284c7' : '#334155'}; color: #fff; border: none; padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; white-space: nowrap;">
                                Executar
                            </button>
                        </div>
                    `).join("")}
                </div>
            </div>
        `;
    } catch (err) {
        contentEl.innerHTML = `<div style="color: #f87171; padding: 20px;">Falha ao comunicar com o servidor de IA: ${err.message || err}</div>`;
    }
}

function closeDetectionAIDiagnosticModal() {
    const modal = document.getElementById("detectionAIDiagnoseModal");
    if (modal) modal.style.display = "none";
}

function openDetectionQuickActionsModal(hostname, activeEngine, healthStatus) {
    const modal = document.getElementById("detectionActionsModal");
    const titleEl = document.getElementById("detActionModalTitle");
    const targetHostEl = document.getElementById("detActionTargetHost");
    if (!modal) return;

    if (titleEl) titleEl.textContent = `Ações Operacionais de Detecção — ${hostname}`;
    if (targetHostEl) targetHostEl.textContent = `${hostname} (CS01) | Motor: ${activeEngine} | Saúde: ${healthStatus}`;

    window.currentDetActionHost = hostname;
    modal.style.display = "flex";
}

function closeDetectionQuickActionsModal() {
    const modal = document.getElementById("detectionActionsModal");
    if (modal) modal.style.display = "none";
}

async function executeDetectionAction(actionType, hostname) {
    const host = hostname || window.currentDetActionHost;
    if (!host) return;

    if (!confirm(`Deseja realmente executar a ação '${actionType}' no Capture Site CS01 '${host}'?`)) {
        return;
    }

    try {
        const token = (typeof getAuthToken === "function") ? getAuthToken() : (localStorage.getItem("fleet_token") || "");
        const headers = token ? { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };

        let cmdPayload = {};
        if (actionType === "start_fastmatching" || actionType === "restart_fastmatching") {
            cmdPayload = {
                hostname: host,
                service_name: "FastMatchingSvc",
                action: "Reiniciar"
            };
        } else if (actionType === "restart_detection") {
            cmdPayload = {
                hostname: host,
                service_name: "DNA.DetectionSVC",
                action: "Reiniciar"
            };
        } else if (actionType === "restart_agent_service") {
            cmdPayload = {
                hostname: host,
                service_name: "DNA.MonitorServiceSVC",
                action: "Reiniciar"
            };
        } else {
            cmdPayload = {
                hostname: host,
                service_name: "DNA.ConfigMonitorSVC",
                action: "Reiniciar"
            };
        }

        const resp = await fetch("/api/fleet/execute-action", {
            method: "POST",
            headers,
            body: JSON.stringify(cmdPayload)
        });

        if (resp.ok) {
            alert(`✅ Comando despachado com sucesso para o CS01 '${host}'! O agente local aplicará a remediação no próximo ciclo.`);
            closeDetectionAIDiagnosticModal();
            closeDetectionQuickActionsModal();
            await loadDetectionFleetData();
        } else {
            const errData = await resp.json().catch(() => ({}));
            alert(`⚠️ Resposta do servidor: ${errData.detail || errData.message || "Ação enfileirada para o host."}`);
        }
    } catch (e) {
        alert(`Erro ao despachar comando: ${e.message || e}`);
    }
}
