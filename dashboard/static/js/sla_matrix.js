// ==============================================================================
// sla_matrix.js - Matriz Geral de SLA & Situação dos Incidentes da Frota (NOC 360°)
// Kantar IBOPE Media — Central CS Fleet
// ==============================================================================

let currentMatrixFilterTier = "active"; // Default: Foco nos atrasos operacionais ativos!
let currentMatrixCategory = "";
let currentMatrixSearch = "";
let currentMatrixSort = "delay";
let matrixRefreshTimer = null;

async function fetchAndRenderSlaMatrix() {
    const container = document.getElementById("nocSlaMatrixTableBody");
    const kpisContainer = document.getElementById("nocSlaMatrixKpiBar");
    if (!container) return;

    try {
        let url = `/api/fleet/sla-matrix?sort_by=${encodeURIComponent(currentMatrixSort)}`;
        if (currentMatrixFilterTier && currentMatrixFilterTier !== "all") {
            url += `&tier=${encodeURIComponent(currentMatrixFilterTier)}`;
        }
        if (currentMatrixCategory) {
            url += `&category=${encodeURIComponent(currentMatrixCategory)}`;
        }
        if (currentMatrixSearch) {
            url += `&search=${encodeURIComponent(currentMatrixSearch)}`;
        }

        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();

        renderSlaMatrixKpis(data.kpis || {});
        renderSlaMatrixTable(data.rows || [], data.total_filtered || 0);
    } catch (err) {
        console.error("[SLAMatrix] Erro ao carregar dados:", err);
        if (container) {
            container.innerHTML = `<tr><td colspan="12" style="text-align: center; color: #ef4444; padding: 30px;">Falha ao carregar matriz de SLA: ${escapeHtml(err.message)}</td></tr>`;
        }
    }
}
window.fetchAndRenderSlaMatrix = fetchAndRenderSlaMatrix;

function renderSlaMatrixKpis(kpis) {
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };
    setVal("matrixKpiTotal", kpis.total_hosts || 0);
    setVal("matrixKpiNominal", kpis.nominal_count || 0);
    setVal("matrixKpiActive", kpis.active_alerts_count || 0);
    setVal("matrixKpiCritical", kpis.critical_count || 0);
    setVal("matrixKpiDtLag", kpis.detection_lag_count || 0);
    setVal("matrixKpiMediaLag", kpis.media_lag_count || 0);
    setVal("matrixKpiChronic", kpis.chronic_zombies_count || 0);
}

function renderSlaMatrixTable(rows, totalFiltered) {
    const tbody = document.getElementById("nocSlaMatrixTableBody");
    const countBadge = document.getElementById("badgeMatrixFilteredCount");
    if (countBadge) {
        countBadge.textContent = `${totalFiltered} Host(s)`;
    }
    if (!tbody) return;

    if (!rows || rows.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="15" style="text-align: center; padding: 40px; color: #94a3b8;">
                    <i class="fas fa-check-circle" style="color: #34d399; font-size: 24px; margin-bottom: 8px; display: block;"></i>
                    Nenhum host com anomalia para o filtro selecionado. Todos os nós operando dentro do SLA!
                </td>
            </tr>
        `;
        return;
    }

    const fmtDelay = (minVal, isDt = false) => {
        if (isDt && minVal === "N/A") {
            return `<span style="color: #64748b; font-size: 10px; font-weight: 600;">N/A</span>`;
        }
        const val = parseInt(minVal, 10);
        if (isNaN(val) || val <= 0) {
            return `<span style="color: rgba(255, 255, 255, 0.15);">-</span>`;
        }
        if (val > 1440) {
            return `<span class="badge" style="background: rgba(147, 51, 234, 0.2); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.4); font-size: 11px; font-weight: 800;" title="Atraso Crônico (>24h)">${val}</span>`;
        }
        if (val > 60) {
            return `<span class="badge" style="background: rgba(239, 68, 68, 0.25); color: #fca5a5; border: 1px solid #ef4444; font-size: 11px; font-weight: 800;" title="Atraso Crítico (>1h)">${val}</span>`;
        }
        return `<span class="badge" style="background: rgba(245, 158, 11, 0.2); color: #fde047; border: 1px solid #f59e0b; font-size: 11px; font-weight: 800;" title="Atraso Moderado (15-60m)">${val}</span>`;
    };

    let html = "";
    rows.forEach(r => {
        // Cor da barra de status na esquerda (coluna C)
        let cBarColor = "transparent";
        let cBadge = "";
        if (r.tier === "CRITICO") {
            cBarColor = "#ef4444";
            cBadge = `<div style="width: 6px; height: 32px; background: #ef4444; border-radius: 3px;" title="Crítico"></div>`;
        } else if (r.tier === "ALERTA") {
            cBarColor = "#f59e0b";
            cBadge = `<div style="width: 6px; height: 32px; background: #f59e0b; border-radius: 3px;" title="Alerta"></div>`;
        } else if (r.tier === "CRONICO") {
            cBarColor = "#8b5cf6";
            cBadge = `<div style="width: 6px; height: 32px; background: #8b5cf6; border-radius: 3px;" title="Crônico (>24h)"></div>`;
        } else {
            cBadge = `<div style="width: 6px; height: 32px; background: #10b981; border-radius: 3px; opacity: 0.5;" title="Nominal"></div>`;
        }

        // Link WAN: Operadora, Ping e Velocidade de Upload
        const wan = r.wan || {};
        let wanColor = "#34d399";
        if (wan.status === "Crítico" || wan.status === "critico") wanColor = "#ef4444";
        else if (wan.status === "Instável" || wan.status === "alerta") wanColor = "#f59e0b";

        const vol30m = wan.volume_mb_30min ? `${Math.round(wan.volume_mb_30min)} MB / 30m` : `28 MB / 30m`;
        const drainTxt = wan.drain_time_min ? `Escoamento: ${wan.drain_time_min}m` : '';

        const wanHtml = `
            <div style="font-size: 11px; line-height: 1.3;" title="${escapeHtml(wan.operadora || '')} • ${drainTxt}">
                <div style="color: #cbd5e1; font-weight: 700;">${escapeHtml(wan.operadora || 'Link')}</div>
                <div style="font-size: 10px; margin-top: 2px;">
                    <span style="color: ${wanColor}; font-weight: 700;">${wan.ping_ms || 25}ms</span> • <span style="color: #94a3b8;">${wan.upload_mbps || 20}M</span>
                </div>
            </div>
        `;

        // Coluna Dedicada: Volume de Arquivos gerados por ciclo de 30min
        const volBadge = `
            <div style="text-align: center; line-height: 1.2;" title="Volume de mídia (MP4/MP3/JPEG) gerado a cada ciclo de 30 minutos • ${drainTxt}">
                <span style="color: #38bdf8; font-size: 10px; font-weight: 700; background: rgba(56, 189, 248, 0.12); padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(56, 189, 248, 0.25); display: inline-block;">
                    ${vol30m}
                </span>
                ${wan.drain_time_min ? `<div style="font-size: 9px; color: #64748b; margin-top: 2px;" title="Tempo estimado de escoamento WAN">${wan.drain_time_min}m escoam.</div>` : ''}
            </div>
        `;

        // Telemetria de Hardware (CPU, RAM, Disco D:)
        const cpuStr = r.cpu_uso || "-";
        let cpuBadge = `<span style="color: rgba(255, 255, 255, 0.2); font-size: 11px;" title="Telemetria suspensa (Host desconectado)">-</span>`;
        if (cpuStr !== "-" && cpuStr !== "N/A") {
            const cpuNum = parseFloat(cpuStr.replace("%", "").replace("<", "").trim()) || 0;
            if (cpuNum >= 85) {
                cpuBadge = `<span class="badge" style="background: rgba(239, 68, 68, 0.25); color: #fca5a5; border: 1px solid #ef4444; font-size: 10px; font-weight: 700;">${escapeHtml(cpuStr)}</span>`;
            } else if (cpuNum >= 70) {
                cpuBadge = `<span class="badge" style="background: rgba(245, 158, 11, 0.2); color: #fde047; border: 1px solid #f59e0b; font-size: 10px; font-weight: 700;">${escapeHtml(cpuStr)}</span>`;
            } else {
                cpuBadge = `<span style="color: #38bdf8; font-weight: 600; font-size: 11px;">${escapeHtml(cpuStr)}</span>`;
            }
        }

        const ramStr = r.ram_uso || "-";
        let ramBadge = `<span style="color: rgba(255, 255, 255, 0.2); font-size: 11px;" title="Telemetria suspensa (Host desconectado)">-</span>`;
        if (ramStr !== "-" && ramStr !== "N/A") {
            ramBadge = `<span style="color: #cbd5e1; font-weight: 600; font-size: 11px;">${escapeHtml(ramStr)}</span>`;
        }

        const discoStr = r.disco_d_livre || "-";
        let discoBadge = `<span style="color: rgba(255, 255, 255, 0.2); font-size: 11px;" title="Telemetria suspensa (Host desconectado)">-</span>`;
        if (discoStr !== "-" && discoStr !== "N/A") {
            const matchGb = discoStr.match(/([\d\.,]+)\s*GB/i);
            const gbNum = matchGb ? parseFloat(matchGb[1].replace(",", ".")) : 100;
            if (gbNum < 30) {
                discoBadge = `<span class="badge" style="background: rgba(239, 68, 68, 0.25); color: #fca5a5; border: 1px solid #ef4444; font-size: 10px; font-weight: 800;" title="Espaço Crítico em D: (&lt;30GB)">${escapeHtml(discoStr)}</span>`;
            } else if (gbNum < 60) {
                discoBadge = `<span class="badge" style="background: rgba(245, 158, 11, 0.2); color: #fde047; border: 1px solid #f59e0b; font-size: 10px; font-weight: 700;">${escapeHtml(discoStr)}</span>`;
            } else {
                discoBadge = `<span style="color: #34d399; font-weight: 600; font-size: 11px;">${escapeHtml(discoStr)}</span>`;
            }
        }

        // CS Badge
        let csBadge = `<span class="badge" style="background: rgba(59, 130, 246, 0.2); color: #93c5fd; border: 1px solid #3b82f6; font-weight: 800;">CS ${r.cs}</span>`;
        if (r.cs === 3) {
            if (r.is_paytv) {
                csBadge = `<span class="badge" style="background: rgba(245, 158, 11, 0.2); color: #fde047; border: 1px solid #f59e0b; font-weight: 800;" title="Captação e Gravação de Canais por Assinatura (PayTV / Cabo)">CS 3 (PayTV)</span>`;
            } else {
                csBadge = `<span class="badge" style="background: rgba(168, 85, 247, 0.2); color: #d8b4fe; border: 1px solid #a855f7; font-weight: 800;" title="Captação e Gravação de Áudio de Emissoras de Rádio">CS 3 (Rádio)</span>`;
            }
        } else if (r.cs === 2) {
            csBadge = `<span class="badge" style="background: rgba(14, 165, 233, 0.2); color: #7dd3fc; border: 1px solid #0ea5e9; font-weight: 800;">CS 2</span>`;
        }

        html += `
            <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05); transition: background 0.15s; cursor: pointer;" 
                onmouseover="this.style.background='rgba(30, 41, 59, 0.5)'" 
                onmouseout="this.style.background='transparent'"
                onclick="openPracaAuditModal('${escapeHtml(r.praca)}', 'CS0${r.cs}')">
                <td style="padding: 6px 8px; text-align: center; vertical-align: middle;">${cBadge}</td>
                <td style="padding: 6px 8px; font-weight: 800; color: #60a5fa; font-size: 12px; vertical-align: middle;">${r.id_host || '-'}</td>
                <td style="padding: 6px 8px; vertical-align: middle;">
                    <div style="font-weight: 700; color: #f8fafc; font-size: 12px;">${escapeHtml(r.display_name)}</div>
                    <div style="font-size: 10px; color: #94a3b8;">${escapeHtml(r.hostname)}</div>
                </td>
                <td style="padding: 6px 8px; text-align: center; vertical-align: middle;">${csBadge}</td>
                <td style="padding: 6px 8px; text-align: center; vertical-align: middle;">${fmtDelay(r.ka_delay_min)}</td>
                <td style="padding: 6px 8px; text-align: center; vertical-align: middle;">${fmtDelay(r.mp3_arc_min)}</td>
                <td style="padding: 6px 8px; text-align: center; vertical-align: middle;">${fmtDelay(r.asf_arc_min)}</td>
                <td style="padding: 6px 8px; text-align: center; vertical-align: middle;">${fmtDelay(r.mp4_arc_min)}</td>
                <td style="padding: 6px 8px; text-align: center; vertical-align: middle;">${fmtDelay(r.dt_delay_min, true)}</td>
                <td style="padding: 6px 8px; vertical-align: middle;">${wanHtml}</td>
                <td style="padding: 6px 8px; text-align: center; vertical-align: middle;">${volBadge}</td>
                <td style="padding: 6px 8px; text-align: center; vertical-align: middle;">${cpuBadge}</td>
                <td style="padding: 6px 8px; text-align: center; vertical-align: middle;">${ramBadge}</td>
                <td style="padding: 6px 8px; text-align: center; vertical-align: middle;">${discoBadge}</td>
                <td style="padding: 6px 8px; text-align: center; vertical-align: middle;" onclick="event.stopPropagation()">
                    <button type="button" class="btn-primary" 
                            style="padding: 4px 10px; font-size: 10px; font-weight: 800; background: linear-gradient(135deg, #2563eb, #7c3aed); border: 1px solid #38bdf8; border-radius: 4px; color: #fff; cursor: pointer; box-shadow: 0 0 8px rgba(56, 189, 248, 0.3);"
                            onclick="openPracaAuditModal('${escapeHtml(r.praca)}', 'CS0${r.cs}')"
                            title="Abrir Raio-X forense determinístico e playbooks de auto-cura para ${escapeHtml(r.display_name)}">
                        <i class="fas fa-bolt"></i> Raio-X
                    </button>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

function setSlaMatrixFilterTier(tier) {
    currentMatrixFilterTier = tier;
    currentMatrixCategory = "";
    updateFilterButtonStyles();
    fetchAndRenderSlaMatrix();
}
window.setSlaMatrixFilterTier = setSlaMatrixFilterTier;

function setSlaMatrixCategory(cat) {
    currentMatrixCategory = cat;
    currentMatrixFilterTier = "";
    updateFilterButtonStyles();
    fetchAndRenderSlaMatrix();
}
window.setSlaMatrixCategory = setSlaMatrixCategory;

function updateFilterButtonStyles() {
    const buttons = [
        { id: "btnFilterActive", active: currentMatrixFilterTier === "active" },
        { id: "btnFilterAll", active: currentMatrixFilterTier === "all" },
        { id: "btnFilterDt", active: currentMatrixCategory === "detection" },
        { id: "btnFilterMedia", active: currentMatrixCategory === "media" },
        { id: "btnFilterWan", active: currentMatrixCategory === "wan" },
        { id: "btnFilterChronic", active: currentMatrixFilterTier === "chronic" }
    ];

    buttons.forEach(b => {
        const el = document.getElementById(b.id);
        if (el) {
            if (b.active) {
                el.style.background = "linear-gradient(135deg, #0284c7, #2563eb)";
                el.style.borderColor = "#38bdf8";
                el.style.color = "#ffffff";
                el.style.boxShadow = "0 0 10px rgba(56, 189, 248, 0.35)";
            } else {
                el.style.background = "rgba(15, 23, 42, 0.7)";
                el.style.borderColor = "rgba(255, 255, 255, 0.15)";
                el.style.color = "#cbd5e1";
                el.style.boxShadow = "none";
            }
        }
    });
}

function handleSlaMatrixSearch(val) {
    currentMatrixSearch = val;
    fetchAndRenderSlaMatrix();
}
window.handleSlaMatrixSearch = handleSlaMatrixSearch;

function handleSlaMatrixSort(val) {
    currentMatrixSort = val;
    fetchAndRenderSlaMatrix();
}
window.handleSlaMatrixSort = handleSlaMatrixSort;

// Alternador de Visualização na tela de Incidentes N1:
// 'queue' (Fila Unificada P0/P1/P2) vs 'matrix' (Matriz Geral de SLA NOC 360°)
function switchIncidentView(viewMode) {
    const queueContainer = document.getElementById("nocUnifiedQueueContainer");
    const matrixContainer = document.getElementById("nocSlaMatrixContainer");
    const guidePanel = document.getElementById("nocIncidentGuidePanel");
    const btnQueue = document.getElementById("btnViewModeQueue");
    const btnMatrix = document.getElementById("btnViewModeMatrix");

    if (viewMode === "matrix") {
        if (queueContainer) queueContainer.style.display = "none";
        if (guidePanel) guidePanel.style.display = "none";
        if (matrixContainer) matrixContainer.style.display = "block";

        if (btnQueue) {
            btnQueue.style.background = "transparent";
            btnQueue.style.color = "#94a3b8";
            btnQueue.style.borderColor = "rgba(255, 255, 255, 0.15)";
        }
        if (btnMatrix) {
            btnMatrix.style.background = "linear-gradient(135deg, #2563eb, #7c3aed)";
            btnMatrix.style.color = "#ffffff";
            btnMatrix.style.borderColor = "#60a5fa";
            btnMatrix.style.boxShadow = "0 0 12px rgba(59, 130, 246, 0.4)";
        }
        fetchAndRenderSlaMatrix();
    } else {
        if (matrixContainer) matrixContainer.style.display = "none";
        if (queueContainer) queueContainer.style.display = "flex";

        if (btnQueue) {
            btnQueue.style.background = "linear-gradient(135deg, #0284c7, #2563eb)";
            btnQueue.style.color = "#ffffff";
            btnQueue.style.borderColor = "#38bdf8";
            btnQueue.style.boxShadow = "0 0 12px rgba(56, 189, 248, 0.4)";
        }
        if (btnMatrix) {
            btnMatrix.style.background = "transparent";
            btnMatrix.style.color = "#94a3b8";
            btnMatrix.style.borderColor = "rgba(255, 255, 255, 0.15)";
            btnMatrix.style.boxShadow = "none";
        }
    }
}
window.switchIncidentView = switchIncidentView;

// Inicia polling se matriz estiver visível
setInterval(() => {
    const matrixContainer = document.getElementById("nocSlaMatrixContainer");
    if (matrixContainer && matrixContainer.style.display !== "none") {
        fetchAndRenderSlaMatrix();
    }
}, 30000);
