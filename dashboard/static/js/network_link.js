// ==============================================================================
// MONITORAMENTO DE LINK, VELOCIDADE DE UPLOAD & CAPACIDADE DE TRANSMISSÃO
// Módulo de Auditoria Proativa de Conectividade da Frota MediaDNA (LATAM / Brasil)
// ==============================================================================

let cachedLinkMetrics = [];
let networkFilterPraca = "all";
let networkFilterSLA = "all";

async function loadNetworkLinkMonitoring() {
    const tableBody = document.getElementById("networkLinkTableBody");
    if (!tableBody) return;

    try {
        const token = (typeof getAuthToken === "function") ? getAuthToken() : (localStorage.getItem("fleet_token") || "");
        const resp = await fetch("/api/fleet/network-link/metrics", {
            headers: token ? { "Authorization": `Bearer ${token}` } : {}
        });

        if (!resp.ok) {
            console.error("[NetworkLink] Falha ao carregar métricas de link:", resp.status);
            return;
        }

        const metrics = await resp.json();
        cachedLinkMetrics = metrics;

        // Atualiza os Cards de Resumo (KPIs)
        updateNetworkLinkKpis(metrics);

        // Preenche o dropdown de praças se ainda não estiver preenchido
        populateNetworkPracasDropdown(metrics);

        // Renderiza a tabela filtrada
        renderNetworkLinkTable();
    } catch (err) {
        console.error("[NetworkLink] Erro ao carregar monitoramento de link:", err);
    }
}
window.loadNetworkLinkMonitoring = loadNetworkLinkMonitoring;

function updateNetworkLinkKpis(metrics) {
    if (!metrics || metrics.length === 0) return;

    // 1. Throughput Médio de Upload da Frota
    const avgUpload = (metrics.reduce((acc, m) => acc + m.measured_upload_mbps, 0) / metrics.length).toFixed(1);
    const kpiAvgEl = document.getElementById("kpiNetAvgUpload");
    if (kpiAvgEl) kpiAvgEl.innerText = `${avgUpload} Mbps`;

    // 2. Volume de Mídia Gerado nas últimas 24h (GB estimado: 48 blocos de 30min x soma dos volumes)
    const totalVol24hGb = ((metrics.reduce((acc, m) => acc + m.volume_mb_30min, 0) * 48) / 1024.0).toFixed(1);
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

function populateNetworkPracasDropdown(metrics) {
    const sel = document.getElementById("netFilterCity");
    if (!sel || sel.children.length > 1) return;

    const uniqueCities = Array.from(new Set(metrics.map(m => m.praca))).sort();
    uniqueCities.forEach(city => {
        const opt = document.createElement("option");
        opt.value = city;
        opt.textContent = city;
        sel.appendChild(opt);
    });
}

function applyNetworkFilters() {
    const citySel = document.getElementById("netFilterCity");
    const slaSel = document.getElementById("netFilterSLA");
    if (citySel) networkFilterPraca = citySel.value;
    if (slaSel) networkFilterSLA = slaSel.value;
    renderNetworkLinkTable();
}
window.applyNetworkFilters = applyNetworkFilters;

function renderNetworkLinkTable() {
    const tableBody = document.getElementById("networkLinkTableBody");
    if (!tableBody) return;

    let filtered = cachedLinkMetrics.filter(m => {
        if (networkFilterPraca !== "all" && m.praca !== networkFilterPraca) return false;
        if (networkFilterSLA !== "all" && m.status !== networkFilterSLA) return false;
        return true;
    });

    if (filtered.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 20px;">Nenhum Capture Site encontrado com os filtros selecionados.</td></tr>`;
        return;
    }

    tableBody.innerHTML = filtered.map(m => {
        const isCrit = m.status === "critico";
        const isWarn = m.status === "alerta";
        const badgeColor = isCrit ? "#ef4444" : (isWarn ? "#facc15" : "#10b981");
        const badgeBg = isCrit ? "rgba(239, 68, 68, 0.15)" : (isWarn ? "rgba(250, 204, 21, 0.15)" : "rgba(16, 185, 129, 0.15)");
        const badgeClass = isCrit ? "badge badge-red" : (isWarn ? "badge badge-yellow" : "badge badge-green");

        return `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                <td>
                    <div style="font-weight: 700; color: #fff; font-size: 13px;">${m.praca} (${m.uf})</div>
                    <div style="font-size: 11px; color: #38bdf8; font-family: monospace;">${m.hostname} • CS ${m.cs}</div>
                </td>
                <td>
                    <span style="font-size: 12px; color: #e2e8f0;"><i class="fas fa-network-wired text-blue"></i> ${m.operadora}</span>
                    <div style="font-size: 11px; color: var(--text-muted);">Ping: ${m.ping_ms} ms • Perda: ${m.packet_loss_pct}%</div>
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
                    <div style="font-weight: 700; color: ${m.drain_time_minutes > 25 ? '#ef4444' : (m.drain_time_minutes > 18 ? '#facc15' : '#10b981')};">
                        ${m.drain_time_minutes.toFixed(1)} min
                    </div>
                    <div style="font-size: 10px; color: var(--text-muted);">Teto Máx: 25.0 min</div>
                </td>
                <td>
                    <span class="${badgeClass}" style="font-size: 10px; font-weight: 700;">
                        ${m.status_label}
                    </span>
                    ${m.pending_files_count > 0 ? `
                        <div style="font-size: 11px; color: #f87171; margin-top: 2px;">
                            ⚠️ ${m.pending_files_count} arquivo(s) aguardando .SENT
                        </div>
                    ` : ''}
                </td>
                <td>
                    <button class="btn-primary" style="padding: 5px 10px; font-size: 11px; background: linear-gradient(135deg, #0284c7, #2563eb); font-weight: 700; white-space: nowrap;" onclick="openNetworkAiModal('${m.praca}', ${m.cs}, '${m.hostname}')">
                        <i class="fas fa-brain"></i> IA Diagnóstico
                    </button>
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
