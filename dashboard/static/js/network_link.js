// ==============================================================================
// MONITORAMENTO DE LINK, VELOCIDADE DE UPLOAD & CAPACIDADE DE TRANSMISSÃO
// Módulo de Auditoria Proativa de Conectividade da Frota MediaDNA (LATAM / Brasil)
// ==============================================================================

let cachedLinkMetrics = [];
let networkFilterView = "worst15"; // "worst15", "critico", "alerta", "estavel", "all"
let networkFilterRegion = "all";
let networkFilterPraca = "all";
let networkFilterSLA = "all";
let networkFilterSearch = "";

async function loadNetworkLinkMonitoring() {
    const tableBody = document.getElementById("networkLinkTableBody");
    const icon = document.getElementById("iconReloadNetworkLink");
    if (icon) icon.classList.add("fa-spin");

    if (tableBody && cachedLinkMetrics.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 36px 20px; color: #94a3b8;">
                    <div style="display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 50%; background: rgba(56, 189, 248, 0.12); margin-bottom: 12px; border: 1px solid rgba(56, 189, 248, 0.3);">
                        <i class="fas fa-circle-notch fa-spin fa-lg" style="color: #38bdf8;"></i>
                    </div>
                    <div style="font-size: 13px; font-weight: 700; color: #f1f5f9; letter-spacing: 0.2px;">Auditando Links WAN &amp; Vazão de Escoamento da Frota...</div>
                    <div style="font-size: 11px; color: #64748b; margin-top: 5px;">Calculando throughput real, ping, perda de pacotes e SLA de envio de 200+ estações...</div>
                </td>
            </tr>
        `;
    }

    try {
        const token = (typeof getAuthToken === "function") ? getAuthToken() : (localStorage.getItem("fleet_token") || localStorage.getItem("access_token") || "");
        const resp = await fetch("/api/fleet/network-link/metrics", {
            headers: token ? { "Authorization": `Bearer ${token}` } : {}
        });

        if (!resp.ok) {
            throw new Error(`HTTP ${resp.status} - Falha ao carregar métricas de link`);
        }

        const metrics = await resp.json();
        cachedLinkMetrics = metrics;

        // Atualiza os Cards de Resumo (KPIs)
        updateNetworkLinkKpis(metrics);

        // Preenche o dropdown de praças dinamicamente
        populateNetworkPracasDropdown(metrics);

        // Atualiza os badges dos pills de filtro rápido
        updateNetworkFilterPillCounts(metrics);

        // Renderiza a tabela com o filtro ativo
        renderNetworkLinkTable();
    } catch (err) {
        console.error("[NetworkLink] Erro ao carregar monitoramento de link:", err);
        if (tableBody) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align: center; padding: 32px 20px; color: #f87171;">
                        <i class="fas fa-exclamation-triangle fa-2x" style="margin-bottom: 10px; display: block; color: #ef4444;"></i>
                        <div style="font-weight: 700; font-size: 13px; color: #fecaca;">Erro ao sincronizar conectividade da frota</div>
                        <div style="font-size: 11px; color: #94a3b8; margin: 6px 0 14px;">${err.message}</div>
                        <button onclick="loadNetworkLinkMonitoring()" class="btn-primary" style="font-size: 11px; padding: 6px 16px;">
                            <i class="fas fa-redo"></i> Tentar Novamente
                        </button>
                    </td>
                </tr>
            `;
        }
    } finally {
        if (icon) icon.classList.remove("fa-spin");
    }
}
window.loadNetworkLinkMonitoring = loadNetworkLinkMonitoring;

function updateNetworkLinkKpis(metrics) {
    if (!metrics || metrics.length === 0) return;

    // 1. Throughput Médio de Upload da Frota
    const avgUpload = (metrics.reduce((acc, m) => acc + (m.measured_upload_mbps || 0), 0) / metrics.length).toFixed(1);
    const kpiAvgEl = document.getElementById("kpiNetAvgUpload");
    if (kpiAvgEl) kpiAvgEl.innerText = `${avgUpload} Mbps`;

    // 2. Volume de Mídia Gerado nas últimas 24h (GB estimado: 48 blocos de 30min x soma dos volumes)
    const totalVol24hGb = ((metrics.reduce((acc, m) => acc + (m.volume_mb_30min || 0), 0) * 48) / 1024.0).toFixed(1);
    const kpiVolEl = document.getElementById("kpiNetTotalVolume24h");
    if (kpiVolEl) kpiVolEl.innerText = `${totalVol24hGb} GB`;

    // 3. Taxa de Entrega de Arquivos no Prazo (.SENT < 10min)
    const compliantCount = metrics.filter(m => m.status === "estavel").length;
    const slaPct = ((compliantCount / metrics.length) * 100.0).toFixed(1);
    const kpiSlaEl = document.getElementById("kpiNetSlaSentPct");
    if (kpiSlaEl) kpiSlaEl.innerText = `${slaPct}%`;

    // 4. Praças com Alerta ou Gargalo Ativo
    const atRiskCount = metrics.filter(m => m.status !== "estavel").length;
    const kpiRiskEl = document.getElementById("kpiNetAtRiskCount");
    if (kpiRiskEl) {
        kpiRiskEl.innerText = `${atRiskCount} CS`;
        kpiRiskEl.style.color = atRiskCount > 0 ? "#f87171" : "#10b981";
    }
}

function updateNetworkFilterPillCounts(metrics) {
    const critCount = metrics.filter(m => m.status === "critico" || m.drain_time_minutes > 25 || m.packet_loss_pct >= 2.5).length;
    const warnCount = metrics.filter(m => m.status === "alerta" || (m.drain_time_minutes > 16 && m.drain_time_minutes <= 25) || (m.packet_loss_pct >= 1.0 && m.packet_loss_pct < 2.5)).length;
    const okCount = metrics.length - critCount - warnCount;

    const elCrit = document.getElementById("netPillCountCrit");
    const elWarn = document.getElementById("netPillCountWarn");
    const elOk = document.getElementById("netPillCountOk");
    const elAll = document.getElementById("netPillCountAll");

    if (elCrit) elCrit.textContent = critCount;
    if (elWarn) elWarn.textContent = warnCount;
    if (elOk) elOk.textContent = okCount;
    if (elAll) elAll.textContent = metrics.length;
}

function populateNetworkPracasDropdown(metrics) {
    const sel = document.getElementById("netFilterCity");
    if (!sel) return;
    const curVal = sel.value;

    const uniqueCities = Array.from(new Set(metrics.map(m => m.praca).filter(Boolean))).sort((a,b) => a.localeCompare(b));
    sel.innerHTML = `<option value="all">Todas as Praças (${uniqueCities.length})</option>`;
    uniqueCities.forEach(city => {
        const opt = document.createElement("option");
        opt.value = city;
        opt.textContent = city;
        if (city === curVal) opt.selected = true;
        sel.appendChild(opt);
    });
}

function setNetworkFilterPill(mode) {
    networkFilterView = mode;

    const pillWorst = document.getElementById("btnNetPillWorst15");
    const pillCrit = document.getElementById("btnNetPillCrit");
    const pillWarn = document.getElementById("btnNetPillWarn");
    const pillOk = document.getElementById("btnNetPillOk");
    const pillAll = document.getElementById("btnNetPillAll");

    const allPills = [
        { el: pillWorst, bg: "rgba(239, 68, 68, 0.2)", border: "rgba(239, 68, 68, 0.5)", color: "#fca5a5" },
        { el: pillCrit, bg: "rgba(239, 68, 68, 0.2)", border: "rgba(239, 68, 68, 0.5)", color: "#ef4444" },
        { el: pillWarn, bg: "rgba(245, 158, 11, 0.2)", border: "rgba(245, 158, 11, 0.5)", color: "#f59e0b" },
        { el: pillOk, bg: "rgba(16, 185, 129, 0.2)", border: "rgba(16, 185, 129, 0.5)", color: "#10b981" },
        { el: pillAll, bg: "rgba(56, 189, 248, 0.2)", border: "rgba(56, 189, 248, 0.5)", color: "#38bdf8" }
    ];

    allPills.forEach(p => {
        if (!p.el) return;
        p.el.classList.remove("active");
        p.el.style.background = "rgba(255,255,255,0.04)";
        p.el.style.border = "1px solid rgba(255,255,255,0.1)";
    });

    const activeItem = mode === "worst15" ? allPills[0] :
                       mode === "critico" ? allPills[1] :
                       mode === "alerta" ? allPills[2] :
                       mode === "estavel" ? allPills[3] : allPills[4];

    if (activeItem && activeItem.el) {
        activeItem.el.classList.add("active");
        activeItem.el.style.background = activeItem.bg;
        activeItem.el.style.border = `1px solid ${activeItem.border}`;
    }

    renderNetworkLinkTable();
}
window.setNetworkFilterPill = setNetworkFilterPill;

function applyNetworkFilters() {
    const citySel = document.getElementById("netFilterCity");
    const regSel = document.getElementById("netFilterRegion");
    const slaSel = document.getElementById("netFilterSLA");
    const searchInput = document.getElementById("netFilterSearch");

    if (citySel) networkFilterPraca = citySel.value;
    if (regSel) networkFilterRegion = regSel.value;
    if (slaSel) networkFilterSLA = slaSel.value;
    if (searchInput) networkFilterSearch = searchInput.value.toLowerCase().trim();

    // Se o operador está buscando especificamente ou selecionou praça/região, saímos do modo worst15
    if (networkFilterPraca !== "all" || networkFilterRegion !== "all" || networkFilterSearch !== "") {
        if (networkFilterView === "worst15") {
            setNetworkFilterPill("all");
            return;
        }
    }

    renderNetworkLinkTable();
}
window.applyNetworkFilters = applyNetworkFilters;

function renderNetworkLinkTable() {
    const tableBody = document.getElementById("networkLinkTableBody");
    const summaryLabel = document.getElementById("netViewSummaryLabel");
    if (!tableBody) return;

    let filtered = cachedLinkMetrics.filter(m => {
        // Filtro de Texto
        if (networkFilterSearch) {
            const combined = `${m.praca} ${m.hostname} ${m.operadora} ${m.uf} ${m.regiao || ''}`.toLowerCase();
            if (!combined.includes(networkFilterSearch)) return false;
        }

        // Filtro de Região
        if (networkFilterRegion !== "all" && m.regiao !== networkFilterRegion) return false;

        // Filtro de Praça
        if (networkFilterPraca !== "all" && m.praca !== networkFilterPraca) return false;

        // Filtro de SLA Dropdown
        if (networkFilterSLA !== "all" && m.status !== networkFilterSLA) return false;

        // Filtro de Status via Pills
        if (networkFilterView === "critico" && m.status !== "critico") return false;
        if (networkFilterView === "alerta" && m.status !== "alerta") return false;
        if (networkFilterView === "estavel" && m.status !== "estavel") return false;

        return true;
    });

    const isWorst15 = (networkFilterView === "worst15" && networkFilterPraca === "all" && networkFilterRegion === "all" && !networkFilterSearch);
    if (isWorst15) {
        filtered = filtered.slice(0, 15);
    }

    // Atualiza subtítulo do painel
    if (summaryLabel) {
        if (isWorst15) {
            summaryLabel.innerHTML = `⚠️ <strong style="color: #fca5a5;">Exibindo as 15 Piores Conexões da Frota (Foco NOC)</strong> • Total da frota: ${cachedLinkMetrics.length} Capture Sites`;
        } else if (networkFilterView === "critico") {
            summaryLabel.innerHTML = `🚨 <strong style="color: #ef4444;">Exibindo ${filtered.length} Conexões em Gargalo Crítico</strong>`;
        } else if (networkFilterView === "alerta") {
            summaryLabel.innerHTML = `🟡 <strong style="color: #f59e0b;">Exibindo ${filtered.length} Conexões em Alerta de Escoamento</strong>`;
        } else if (networkFilterView === "estavel") {
            summaryLabel.innerHTML = `🟢 <strong style="color: #10b981;">Exibindo ${filtered.length} Conexões Nominais (SLA 100%)</strong>`;
        } else {
            summaryLabel.innerHTML = `🌐 <strong style="color: #38bdf8;">Exibindo ${filtered.length} de ${cachedLinkMetrics.length} Capture Sites da Frota</strong>`;
        }
    }

    if (filtered.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 30px;">Nenhum Capture Site encontrado com os filtros selecionados.</td></tr>`;
        return;
    }

    tableBody.innerHTML = filtered.map(m => {
        const isCrit = m.status === "critico" || m.drain_time_minutes > 25;
        const isHighLoss = m.packet_loss_pct > 1.0;
        const isWarn = !isCrit && (m.status === "alerta" || m.drain_time_minutes > 18 || isHighLoss);
        
        // Fim do "Mar de Verde": Destaque real de anomalias
        let badgeClass = "badge badge-green";
        let statusLabel = "🟢 EXCELENTE";

        if (isCrit) {
            badgeClass = "badge badge-red";
            statusLabel = "🚨 CRÍTICO (GARGALO WAN)";
        } else if (isHighLoss) {
            badgeClass = "badge badge-yellow";
            statusLabel = `⚠️ ATENÇÃO (PERDA ${m.packet_loss_pct}%)`;
        } else if (isWarn) {
            badgeClass = "badge badge-yellow";
            statusLabel = "🟡 ATENÇÃO (ESCOAMENTO)";
        }

        // Buffer Gauge Visual de Escoamento (Teto Operacional de 25 min)
        const pctDrain = Math.min(100, Math.round((m.drain_time_minutes / 25.0) * 100));
        const gaugeColor = isCrit ? "#ef4444" : (isWarn ? "#facc15" : "#10b981");

        const needsAttention = isCrit || isWarn || isHighLoss;

        return `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                <td>
                    <div style="font-weight: 700; color: #fff; font-size: 13px;">${m.praca} (${m.uf})</div>
                    <div style="font-size: 11px; color: #38bdf8; font-family: monospace;">${m.hostname} • CS ${m.cs}</div>
                </td>
                <td>
                    <span style="font-size: 12px; color: #e2e8f0;"><i class="fas fa-network-wired text-blue"></i> ${m.operadora}</span>
                    <div style="font-size: 11px; color: ${isHighLoss ? '#f87171; font-weight: 700;' : 'var(--text-muted);'}">
                        Ping: ${m.ping_ms} ms • Perda: ${m.packet_loss_pct}% ${isHighLoss ? '⚠️' : ''}
                    </div>
                </td>
                <td>
                    <span class="badge" style="background: rgba(255,255,255,0.06); color: #cbd5e1; font-size: 11px;">
                        ${m.ch_video_count} Vídeo / ${m.ch_audio_count} Áudio
                    </span>
                </td>
                <td>
                    <strong style="color: #fff; font-size: 13px;">${m.volume_mb_30min} MB</strong>
                    <div style="font-size: 10px; color: var(--text-muted);">MP4 + MP3 + JPEG</div>
                </td>
                <td>
                    <span style="color: #94a3b8; font-family: monospace;">${m.min_upload_mbps_required} Mbps</span>
                </td>
                <td>
                    <strong style="color: ${m.measured_upload_mbps >= m.min_upload_mbps_required ? '#34d399' : '#f87171'}; font-size: 13px; font-family: monospace;">
                        ${m.measured_upload_mbps.toFixed(1)} Mbps
                    </strong>
                </td>
                <td>
                    <div style="font-weight: 700; color: ${gaugeColor}; font-size: 12px; margin-bottom: 3px;">
                        ${m.drain_time_minutes.toFixed(1)} min <span style="font-size: 10px; color: var(--text-muted); font-weight: normal;">(${pctDrain}% do teto)</span>
                    </div>
                    <div style="width: 105px; height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden;">
                        <div style="width: ${pctDrain}%; height: 100%; background: ${gaugeColor}; border-radius: 3px;"></div>
                    </div>
                </td>
                <td>
                    <span class="${badgeClass}" style="font-size: 10px; font-weight: 700;">
                        ${statusLabel}
                    </span>
                    ${m.pending_files_count > 0 ? `
                        <div style="font-size: 11px; color: #f87171; margin-top: 2px;">
                            ⚠️ ${m.pending_files_count} arquivo(s) aguardando .SENT
                        </div>
                    ` : ''}
                </td>
                <td>
                    ${needsAttention ? `
                        <button class="btn-primary" style="padding: 5px 12px; font-size: 11px; background: linear-gradient(135deg, #0284c7, #2563eb); font-weight: 700; white-space: nowrap;" onclick="openNetworkAiModal('${m.praca}', ${m.cs}, '${m.hostname}')">
                            <i class="fas fa-brain"></i> IA Diagnóstico
                        </button>
                    ` : `
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="color: #64748b; font-size: 11px; font-weight: 600;">✓ Nominal</span>
                            <button class="btn-secondary" style="padding: 3px 6px; font-size: 10px; color: var(--text-muted);" title="Diagnóstico preventivo de rotina" onclick="openNetworkAiModal('${m.praca}', ${m.cs}, '${m.hostname}')">
                                <i class="fas fa-stethoscope"></i>
                            </button>
                        </div>
                    `}
                </td>
            </tr>
        `;
    }).join("");
}

async function openNetworkAiModal(praca, cs, hostname) {
    const modal = document.getElementById("networkAiDiagModal");
    if (!modal) return;
    modal.style.display = "flex";

    document.getElementById("netAiModalTitle").innerText = `Diagnóstico de Link & Conectividade • ${praca} (CS ${cs})`;
    document.getElementById("netAiModalSubtitle").innerText = `Host Alvo: ${hostname} • Auditoria de Pipeline e Upload MediaDNA`;
    document.getElementById("netAiModalRootCause").innerHTML = `<i class="fas fa-spinner fa-spin"></i> Inspecionando tráfego de rede e fila de uploadspot.aspx...`;
    document.getElementById("netAiModalStepsList").innerHTML = `<li>Avaliando telemetria...</li>`;

    try {
        const token = (typeof getAuthToken === "function") ? getAuthToken() : (localStorage.getItem("fleet_token") || "");
        const resp = await fetch("/api/fleet/network-link/ai-diagnose", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(token ? { "Authorization": `Bearer ${token}` } : {})
            },
            body: JSON.stringify({
                praca: praca,
                cs: cs,
                hostname: hostname
            })
        });

        if (!resp.ok) throw new Error(`Falha no diagnóstico (${resp.status})`);
        const diag = await resp.json();

        document.getElementById("netAiModalRootCause").innerText = diag.causa_raiz;
        document.getElementById("netAiModalOperadora").innerText = diag.operadora;
        document.getElementById("netAiModalUploadReal").innerText = `${diag.measured_upload_mbps.toFixed(1)} Mbps`;
        document.getElementById("netAiModalUploadMin").innerText = `${diag.min_upload_mbps_required.toFixed(2)} Mbps`;
        document.getElementById("netAiModalDrainTime").innerText = `${diag.drain_time_minutes.toFixed(1)} min`;
        document.getElementById("netAiModalLatency").innerText = `${diag.ping_ms} ms (Loss: ${diag.packet_loss_pct}%)`;

        const stepsList = document.getElementById("netAiModalStepsList");
        if (stepsList) {
            stepsList.innerHTML = diag.acoes_recomendadas.map(a => `<li style="margin-bottom: 6px;">${escapeHtml(a)}</li>`).join("");
        }

        const scriptEl = document.getElementById("netAiModalScript");
        if (scriptEl) {
            scriptEl.innerText = diag.script_auto_healing;
        }

        const btnExec = document.getElementById("btnNetExecuteAiAction");
        if (btnExec) {
            btnExec.setAttribute("onclick", `executeNetworkAiScript('${diag.hostname}', '${diag.praca}', ${diag.cs})`);
        }
    } catch (err) {
        document.getElementById("netAiModalRootCause").innerText = "Erro ao diagnosticar link: " + err.message;
    }
}
window.openNetworkAiModal = openNetworkAiModal;

function closeNetworkAiModal() {
    const modal = document.getElementById("networkAiDiagModal");
    if (modal) modal.style.display = "none";
}
window.closeNetworkAiModal = closeNetworkAiModal;

function copyNetworkAiScript(btn) {
    const pre = document.getElementById("netAiModalScript");
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
                prompt("Copie o script de teste de rede:", text);
            }
        } catch (e) {
            prompt("Copie o script de teste de rede:", text);
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
window.copyNetworkAiScript = copyNetworkAiScript;

async function executeNetworkAiScript(targetHost, praca, cs) {
    const pre = document.getElementById("netAiModalScript");
    if (!pre) return;
    const script = pre.innerText.trim();

    const confirmed = confirm(
        `🌐 CONFIRMAÇÃO DE EXECUÇÃO DE DIAGNÓSTICO DE REDE\n\n` +
        `Deseja disparar o teste de rede e reciclagem do FileTransferSVC?\n\n` +
        `Host Alvo: ${targetHost}\n` +
        `Praça: ${praca} (CS ${cs})\n\n` +
        `• Clique em [OK] para executar no Capture Site remoto.\n` +
        `• Clique em [Cancelar] para abortar.`
    );

    if (confirmed) {
        try {
            safeToast(`⚡ Disparando teste de link para ${targetHost}...`, "info");
            const token = (typeof getAuthToken === "function") ? getAuthToken() : (localStorage.getItem("fleet_token") || "");
            const resp = await fetch("/api/remote-commands/execute", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { "Authorization": `Bearer ${token}` } : {})
                },
                body: JSON.stringify({
                    hosts: [targetHost],
                    shell_type: "powershell",
                    command_script: script,
                    command_title: `Teste de Link & Reset FileTransfer (${praca} • ${targetHost})`
                })
            });

            const data = await resp.json();
            const execId = (data && data.execution_id) ? data.execution_id : (typeof data === "string" ? data : null);

            if (resp.ok && execId) {
                safeToast(`✅ Diagnóstico disparado com sucesso para ${targetHost}!`, "success");
                closeNetworkAiModal();
                const rcNavBtn = document.querySelector(".nav-btn[data-tab='remote-commands']");
                if (rcNavBtn) rcNavBtn.click();
                setTimeout(() => {
                    if (typeof switchRemoteTab === "function") switchRemoteTab("rc-tab-console");
                    if (typeof pollExecutionOutput === "function") {
                        pollExecutionOutput(execId);
                    }
                }, 250);
            } else {
                alert(`⚠️ Erro ao disparar comando de rede: ${data.detail || data.error || "Falha na execução"}`);
            }
        } catch (err) {
            alert("Erro na comunicação com o host remoto: " + err.message);
        }
    }
}
window.executeNetworkAiScript = executeNetworkAiScript;
