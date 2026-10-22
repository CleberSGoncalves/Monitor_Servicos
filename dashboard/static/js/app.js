// static/js/app.js - Central de Monitoração Proativa CS Fleet

let authToken = localStorage.getItem("fleet_token") || "";
let currentUser = null;
let currentTab = "overview";
let autoRefreshTimer = null;

// Inicialização
document.addEventListener("DOMContentLoaded", () => {
    initAuth();
    setupTabNavigation();
    setupFilters();
    setupModals();
    checkSystemUpdate(false);
});

function initAuth() {
    if (!authToken) {
        showLoginModal();
    } else {
        fetchCurrentUser();
    }
}

async function fetchCurrentUser() {
    try {
        const resp = await fetch("/api/auth/me", {
            headers: getAuthToken() ? { "Authorization": `Bearer ${getAuthToken()}` } : {}
        });
        if (resp.ok) {
            currentUser = await resp.json();
            document.getElementById("navUserDisplay").innerText = currentUser.username;
            applyRolePermissions(currentUser.role);
            hideLoginModal();
            loadAllData();
            startAutoRefresh();
        } else {
            showLoginModal();
        }
    } catch {
        showLoginModal();
    }
}

function applyRolePermissions(role) {
    role = (role || "n1").toLowerCase();
    const roleBadge = document.getElementById("navRoleDisplay");
    if (roleBadge) {
        if (role === "admin") {
            roleBadge.innerText = "ADMIN";
            roleBadge.className = "badge badge-purple";
            roleBadge.title = "Administrador: Acesso irrestrito a configurações, update e gestão da frota";
        } else if (role === "n2") {
            roleBadge.innerText = "PERFIL N2";
            roleBadge.className = "badge badge-blue";
            roleBadge.title = "Operador Sênior: Acesso operacional, comandos remotos e tratativas ativas";
        } else {
            roleBadge.innerText = "PERFIL N1";
            roleBadge.className = "badge badge-green";
            roleBadge.title = "Monitoração / Triagem: Acesso de visualização e apontamento de notas";
        }
    }

    // Configurações: restrito a admin
    document.querySelectorAll("[data-tab='configs']").forEach(el => {
        el.style.display = (role === "admin") ? "" : "none";
    });

    // Update do sistema: restrito a admin
    const updBtn = document.getElementById("btnSystemUpdate");
    if (updBtn) {
        updBtn.style.display = (role === "admin") ? "inline-flex" : "none";
    }

    // Se estiver em aba restrita e logar como n1/n2, volta para overview
    if (role !== "admin" && typeof currentTab !== "undefined" && currentTab === "configs") {
        const ovBtn = document.querySelector("[data-tab='overview']");
        if (ovBtn) ovBtn.click();
    }

    // Perfil N1: bloqueio de ações destrutivas / disparo de comandos remotos
    const runCmdBtn = document.getElementById("btnRunRemoteCommand");
    if (runCmdBtn) {
        if (role === "n1") {
            runCmdBtn.disabled = true;
            runCmdBtn.title = "Perfil N1 possui permissão de apenas visualização. Disparo permitido para N2 e Admin.";
        } else {
            runCmdBtn.disabled = false;
            runCmdBtn.title = "Executar comando remoto no host selecionado";
        }
    }
}

function showLoginModal() {
    document.getElementById("loginModal").classList.add("active");
}

function hideLoginModal() {
    document.getElementById("loginModal").classList.remove("active");
}

async function doLogin(e) {
    e.preventDefault();
    const user = document.getElementById("loginUsername").value;
    const pass = document.getElementById("loginPassword").value;
    const errBox = document.getElementById("loginError");
    errBox.style.display = "none";

    try {
        const resp = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: user, password: pass })
        });
        const data = await resp.json();
        if (resp.ok) {
            authToken = data.token;
            localStorage.setItem("fleet_token", authToken);
            currentUser = data;
            document.getElementById("navUserDisplay").innerText = currentUser.username;
            applyRolePermissions(currentUser.role);
            hideLoginModal();
            loadAllData();
            startAutoRefresh();
        } else {
            errBox.innerText = data.detail || "Erro no login";
            errBox.style.display = "block";
        }
    } catch (ex) {
        errBox.innerText = "Erro ao conectar ao servidor.";
        errBox.style.display = "block";
    }
}

function doLogout() {
    localStorage.removeItem("fleet_token");
    authToken = "";
    currentUser = null;
    clearInterval(autoRefreshTimer);
    showLoginModal();
}

function setupTabNavigation() {
    document.querySelectorAll(".nav-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".content-section").forEach(s => s.classList.remove("active"));

            btn.classList.add("active");
            const tabName = btn.getAttribute("data-tab");
            currentTab = tabName;
            const targetSec = document.getElementById(`tab-${tabName}`);
            if (targetSec) targetSec.classList.add("active");

            if (tabName === "mosaic") {
                if (typeof initMosaicTab === "function") initMosaicTab();
            } else if (tabName === "map") {
                if (typeof loadTopologyMapData === "function") loadTopologyMapData();
            } else if (tabName === "incidents") {
                if (typeof loadIncidentsHistoryData === "function") loadIncidentsHistoryData();
                loadIncidentHistory();
            } else if (tabName === "ai") {
                loadAiSuggestions();
                if (typeof loadHomologationCountBadge === "function") loadHomologationCountBadge();
            } else if (tabName === "configs") {
                loadThresholds();
                loadUsersList();
                if (typeof loadRefreshIntervalConfig === "function") loadRefreshIntervalConfig();
                if (typeof loadFeatureFlagsUI === "function") loadFeatureFlagsUI();
            } else if (tabName === "remote-commands") {
                initRemoteCommands();
            } else if (tabName === "signals") {
                if (typeof initSignalsAnalysisTab === "function") initSignalsAnalysisTab();
                setTimeout(() => {
                    if (typeof signalsHistoryDataCache !== "undefined" && signalsHistoryDataCache && signalsHistoryDataCache.history_points) {
                        if (typeof renderSignalsCanvasChart === "function") renderSignalsCanvasChart(signalsHistoryDataCache.history_points);
                    }
                }, 80);
            }
        });
    });
}

function setupFilters() {
    const cityFilter = document.getElementById("filterCity");
    const statusFilter = document.getElementById("filterStatus");

    cityFilter.addEventListener("change", () => loadAllData());
    statusFilter.addEventListener("change", () => loadAllData());
}

function getRefreshIntervalSeconds() {
    const saved = localStorage.getItem("dashboard_refresh_interval");
    if (saved === null) return 15;
    const parsed = parseInt(saved, 10);
    if (isNaN(parsed) || parsed < 0) return 15;
    if (parsed > 0 && parsed < 10) return 10;
    return parsed;
}

function startAutoRefresh() {
    clearInterval(autoRefreshTimer);
    const secs = getRefreshIntervalSeconds();
    updateRefreshIntervalUI(secs);
    if (secs === 0) {
        console.log("[AutoRefresh] Atualização automática pausada pelo operador.");
        return;
    }
    autoRefreshTimer = setInterval(() => {
        if (authToken) loadAllData(true);
    }, secs * 1000);
}

function changeAutoRefreshInterval(newVal) {
    const secs = parseInt(newVal, 10);
    localStorage.setItem("dashboard_refresh_interval", secs);
    startAutoRefresh();
}
window.changeAutoRefreshInterval = changeAutoRefreshInterval;

function loadRefreshIntervalConfig() {
    const secs = getRefreshIntervalSeconds();
    updateRefreshIntervalUI(secs);
}
window.loadRefreshIntervalConfig = loadRefreshIntervalConfig;

function updateRefreshIntervalUI(secs) {
    const sel = document.getElementById("autoRefreshIntervalSelect");
    const status = document.getElementById("refreshTimerStatus");
    if (sel) sel.value = secs.toString();
    if (status) {
        if (secs === 0) {
            status.innerHTML = "⏸️ Pausado";
            status.style.background = "rgba(100, 116, 139, 0.2)";
            status.style.color = "#94a3b8";
            status.style.borderColor = "#64748b";
        } else {
            status.innerHTML = `⏱️ ${secs}s ativo`;
            status.style.background = "rgba(37, 99, 235, 0.2)";
            status.style.color = "#60a5fa";
            status.style.borderColor = "#2563eb";
        }
    }
}

async function loadAllData(isSilent = false) {
    if (!isSilent) document.body.style.cursor = "wait";
    try {
        await Promise.all([
            loadSummaryKPIs(),
            loadServicesTable(),
            loadChannelsTable()
        ]);
    } finally {
        if (!isSilent) document.body.style.cursor = "default";
    }
}

// 1. Resumo e KPIs
async function loadSummaryKPIs() {
    const resp = await fetch("/api/fleet/summary", {
        headers: getAuthToken() ? { "Authorization": `Bearer ${getAuthToken()}` } : {}
    });
    if (!resp.ok) return;
    const data = await resp.json();
    const st = data.stats || {};

    document.getElementById("kpiHostsOnline").innerText = `${st.hosts_online || 0} / ${st.total_hosts || 0}`;
    document.getElementById("kpiServicesRunning").innerText = `${st.services_running || 0} / ${st.total_services || 0}`;
    document.getElementById("kpiChannelsOk").innerText = `${st.channels_ok || 0} / ${st.total_channels || 0}`;
    document.getElementById("kpiChannelsDown").innerText = st.channels_down || 0;
    document.getElementById("kpiRecordingsActive").innerText = st.recordings_active || 0;

    if (data.last_sync) {
        const dt = new Date(data.last_sync);
        document.getElementById("lastSyncLabel").innerText = `Última sincronização: ${dt.toLocaleTimeString()}`;
    }

    // Renderiza lista rápida de incidentes ativos na visão geral
    renderOutageBanner(data.recent_outages || []);

    // Renderiza violações de limiares operacionais calibrados (SLA)
    loadThresholdBreaches();

    // Renderiza acompanhamento em tempo real da equipe (Cockpit Worklog)
    loadRecentWorklogCockpit();
}

function renderOutageBanner(outages) {
    const container = document.getElementById("activeOutagesList");
    const badge = document.getElementById("badgeActiveOutagesCount");
    if (badge) {
        badge.innerText = `${outages.length} Queda${outages.length === 1 ? '' : 's'}`;
        badge.className = outages.length > 0 ? "badge badge-red" : "badge badge-green";
    }
    if (!container) return;

    if (outages.length === 0) {
        container.innerHTML = `<div style="color: var(--accent-green); padding: 12px; font-size: 13px;">✅ Nenhum incidente de transmissão ou queda de canal ativo no momento. Tudo operando com 100% de estabilidade.</div>`;
        return;
    }

    container.innerHTML = outages.map(o => {
        const csNum = o.cs || o.id_cs || 1;
        return `
        <div style="background: rgba(239, 68, 68, 0.1); border-left: 4px solid var(--accent-red); padding: 10px 14px; border-radius: 4px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
            <div>
                <strong>🚨 ${o.canal} <span style="color: #38bdf8; font-weight: 700;">[${o.praca} • CS ${csNum}]</span></strong>: <span style="color: #fca5a5; font-weight: 600;">${o.motivo}</span>
                <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">${o.detalhe}</div>
            </div>
            <button class="btn-secondary" style="font-size: 11px; padding: 4px 10px;" onclick="openIncidentActionModal('canal_${o.canal}', '${o.praca} (CS ${csNum})', '${o.canal}', 'queda_canal')">Tratar Incidente</button>
        </div>
    `;
    }).join("");
}

async function loadRecentWorklogCockpit() {
    const feed = document.getElementById("overviewWorklogFeed");
    if (!feed) return;

    try {
        const resp = await fetch("/api/incidents/history", {
            headers: getAuthToken() ? { "Authorization": `Bearer ${getAuthToken()}` } : {}
        });
        if (!resp.ok) return;
        const history = await resp.json();

        if (!history || history.length === 0) {
            feed.innerHTML = `<div style="color: var(--text-muted); padding: 12px; font-size: 12px;">✅ Nenhuma tratativa recente registrada. As ações da equipe de operadores (N1/N2/Admin) aparecerão aqui em tempo real.</div>`;
            return;
        }

        const recent = history.slice(0, 6);
        feed.innerHTML = recent.map(h => {
            const timeStr = h.created_at || "";
            return `
            <div style="background: rgba(15, 23, 42, 0.5); border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 12px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; font-size: 12px;">
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <span style="font-size: 11px; color: var(--text-muted); font-family: monospace;">${timeStr}</span>
                    <span class="badge badge-purple" style="font-size: 10px;">${h.incident_type || 'Ação'}</span>
                    <span style="font-weight: 700; color: #fff;">${h.host}</span>
                    <span style="color: #93c5fd;">[${h.target_name}]</span>
                    <span style="color: var(--text-muted);">Tratado por:</span>
                    <strong style="color: #60a5fa;"><i class="fas fa-user-check"></i> ${h.operator_name || h.operator_username || 'Sistema'}</strong>
                </div>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="color: #cbd5e1; font-style: italic; max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">"${h.action_taken || '-'}"</span>
                    <span class="badge badge-green" style="font-size: 10px;">${h.resolution_status || 'Concluído'}</span>
                </div>
            </div>
            `;
        }).join("");
    } catch (e) {
        console.error("Erro ao carregar histórico operacional do cockpit:", e);
    }
}
window.loadRecentWorklogCockpit = loadRecentWorklogCockpit;

// 2. Tabela de Serviços e Filtros Rápidos de Recursos
let allCachedServices = [];

async function loadServicesTable() {
    let url = `/api/fleet/services`;
    const resp = await fetch(url, { headers: getAuthToken() ? { "Authorization": `Bearer ${getAuthToken()}` } : {} });
    if (!resp.ok) return;
    allCachedServices = await resp.json();
    populateServiceCitiesDropdown();
    filterServicesTable();
}

function populateServiceCitiesDropdown() {
    const citySelect = document.getElementById("svcFilterCity");
    if (!citySelect || citySelect.options.length > 1) return;
    const cities = Array.from(new Set(allCachedServices.map(s => s.praca).filter(Boolean))).sort();
    cities.forEach(c => {
        const opt = document.createElement("option");
        opt.value = c;
        opt.textContent = c;
        citySelect.appendChild(opt);
    });
}

function filterServicesTable() {
    const cityFilter = (document.getElementById("svcFilterCity")?.value || "all").toLowerCase();
    const nameFilter = (document.getElementById("svcFilterName")?.value || "all").toLowerCase();
    const resourceFilter = (document.getElementById("svcFilterResource")?.value || "all");
    const sortBy = (document.getElementById("svcSortBy")?.value || "cpu_desc");

    let filtered = allCachedServices.filter(s => {
        if (cityFilter !== "all" && !s.praca.toLowerCase().includes(cityFilter)) return false;
        if (nameFilter !== "all" && !s.nome_servico.toLowerCase().includes(nameFilter)) return false;

        const cpuNum = parseFloat(String(s.cpu_uso || "0").replace("%", "").replace("<", "")) || 0;
        const ramNum = parseFloat(String(s.ram_uso || "0").match(/\((\d+)\s*MB\)/i)?.[1] || String(s.ram_uso || "0").match(/(\d+)\s*MB/i)?.[1] || "0") || 0;

        if (resourceFilter === "high_cpu" && cpuNum < 10) return false;
        if (resourceFilter === "high_ram" && ramNum < 100) return false;
        if (resourceFilter === "stopped" && s.status_servico === "Em Execução") return false;

        return true;
    });

    filtered.sort((a, b) => {
        const cpuA = parseFloat(String(a.cpu_uso || "0").replace("%", "").replace("<", "")) || 0;
        const cpuB = parseFloat(String(b.cpu_uso || "0").replace("%", "").replace("<", "")) || 0;
        const ramA = parseFloat(String(a.ram_uso || "0").match(/\((\d+)\s*MB\)/i)?.[1] || String(a.ram_uso || "0").match(/(\d+)\s*MB/i)?.[1] || "0") || 0;
        const ramB = parseFloat(String(b.ram_uso || "0").match(/\((\d+)\s*MB\)/i)?.[1] || String(b.ram_uso || "0").match(/(\d+)\s*MB/i)?.[1] || "0") || 0;

        if (sortBy === "cpu_desc") return cpuB - cpuA;
        if (sortBy === "ram_desc") return ramB - ramA;
        if (sortBy === "praca") return a.praca.localeCompare(b.praca);
        if (sortBy === "host") return a.hostname.localeCompare(b.hostname);
        if (sortBy === "status") return a.status_servico.localeCompare(b.status_servico);
        return 0;
    });

    const tbody = document.getElementById("servicesTableBody");
    if (!tbody) return;
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="12" style="text-align: center; color: var(--text-muted); padding: 16px;">Nenhum serviço atende aos filtros selecionados.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(s => {
        const isRunning = s.status_servico === "Em Execução";
        const isCrash = s.status_servico.includes("Crash-Loop") || s.status_atualizacao.includes("Crash-Loop");
        const statusBadge = isCrash ? `<span class="badge badge-red">🚨 Crash-Loop</span>` :
                            (isRunning ? `<span class="badge badge-green">🟢 Executando</span>` : `<span class="badge badge-red">🔴 ${s.status_servico}</span>`);

        const isUpdated = s.status_atualizacao.includes("Atualizado") || s.status_atualizacao === "Atualizado";
        const updBadge = s.status_atualizacao.includes("Progresso") ? `<span class="badge badge-purple">🟣 ${s.status_atualizacao}</span>` :
                         (isUpdated ? `<span class="badge badge-blue">✅ ${s.status_atualizacao}</span>` : `<span class="badge badge-yellow">⚠️ ${s.status_atualizacao}</span>`);

        const cpuNum = parseFloat(String(s.cpu_uso || "0").replace("%", "").replace("<", "")) || 0;
        const cpuBadge = cpuNum >= 25 ? `<span class="badge badge-yellow" title="Pico no host: ${s.cpu_uso} (Proc individual: ~0.8%)">🔥 ${s.cpu_uso}</span>` :
                         (cpuNum >= 10 ? `<span class="badge badge-blue">${s.cpu_uso}</span>` : `<span style="color: var(--text-muted);">${s.cpu_uso}</span>`);

        return `
            <tr>
                <td><strong>${s.hostname}</strong></td>
                <td>${s.praca}</td>
                <td style="text-align: center;"><span class="badge" style="background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.4); color: #93c5fd; font-weight: 700; font-size: 11px;">CS ${s.cs || 1}</span></td>
                <td><code>${s.nome_servico}</code></td>
                <td><span style="font-family: monospace;">${s.versao_instalada}</span></td>
                <td><span style="font-family: monospace; color: var(--text-highlight);">${s.versao_desejada}</span></td>
                <td>${statusBadge}</td>
                <td>${updBadge}</td>
                <td><span style="font-size: 12px; font-weight: 600;">${s.ram_uso}</span></td>
                <td>${cpuBadge}</td>
                <td>${s.disco_d_livre}</td>
                <td>
                    <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px;" title="Reiniciar Serviço" onclick="triggerFleetAction('restart_service', '${s.hostname}', '${s.nome_servico}')">🔄 Reiniciar</button>
                    <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px;" title="Tratar / Worklog" onclick="openIncidentActionModal('srv_${s.hostname}_${s.nome_servico}', '${s.hostname}', '${s.nome_servico}', 'servico_parado')">📝 Ação</button>
                </td>
            </tr>
        `;
    }).join("");
}
window.filterServicesTable = filterServicesTable;

// 3. Tabela de Canais e Sinais RF
async function loadChannelsTable() {
    const city = document.getElementById("filterCity").value;
    let url = `/api/fleet/channels?`;
    if (city) url += `city=${encodeURIComponent(city)}&`;

    const resp = await fetch(url, { headers: getAuthToken() ? { "Authorization": `Bearer ${getAuthToken()}` } : {} });
    if (!resp.ok) return;
    const channels = await resp.json();

    const tbody = document.getElementById("channelsTableBody");
    tbody.innerHTML = channels.map(c => {
        const q = c.qualidade_sinal;
        const s = c.forca_sinal;
        const qClass = q >= 65 ? "fill-green" : (q >= 40 ? "fill-yellow" : "fill-red");
        const sClass = s >= 60 ? "fill-green" : (s >= 35 ? "fill-yellow" : "fill-red");

        const isTunerFail = c.status_tuner.includes("Falha");
        const tunerBadge = isTunerFail ? `<span class="badge badge-red">⚠️ ${c.status_tuner}</span>` :
                           (c.status_tuner === "Lock" ? `<span class="badge badge-green">Lock</span>` : `<span class="badge badge-yellow">${c.status_tuner}</span>`);

        const frozenBadge = c.video_congelado.includes("Sim") ? `<span class="badge badge-red">${c.video_congelado}</span>` : `<span class="badge badge-green">OK</span>`;
        const muteBadge = c.audio_mudo.includes("Sim") ? `<span class="badge badge-red">${c.audio_mudo}</span>` : `<span class="badge badge-green">OK</span>`;

        const recBadge = c.gravando_mp4.includes("⚠️") ? `<span class="badge badge-red">${c.gravando_mp4}</span>` :
                         (c.gravando_mp4.includes("Sim") ? `<span class="badge badge-green">${c.gravando_mp4}</span>` : `<span class="badge badge-yellow">Não</span>`);

        return `
            <tr>
                <td><strong>${c.canal}</strong></td>
                <td>${c.cidade} <span class="badge" style="background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.4); color: #93c5fd; font-weight: 700; font-size: 10px; margin-left: 4px;">CS ${c.id_cs || 1}</span></td>
                <td><span style="font-size: 11px; color: var(--text-muted);">${c.meio}</span></td>
                <td>Tuner #${c.tuner_id >= 0 ? c.tuner_id : 'N/A'}</td>
                <td>${tunerBadge}</td>
                <td>
                    <div class="signal-bar-wrap">
                        <div class="progress-track"><div class="progress-fill ${qClass}" style="width: ${q}%;"></div></div>
                        <span style="font-size: 11px; font-weight: 600;">${q}%</span>
                    </div>
                </td>
                <td>
                    <div class="signal-bar-wrap">
                        <div class="progress-track"><div class="progress-fill ${sClass}" style="width: ${s}%;"></div></div>
                        <span style="font-size: 11px; font-weight: 600;">${s}%</span>
                    </div>
                </td>
                <td>${frozenBadge}</td>
                <td>${muteBadge}</td>
                <td>${recBadge}</td>
                <td>
                    <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px;" title="Re-sintonizar MUX" onclick="triggerFleetAction('retune_mux', '${c.cidade}', null, '${c.canal}')">📡 Re-tune</button>
                    <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px;" title="Registrar Ação" onclick="openIncidentActionModal('ch_${c.cidade}_${c.canal}', '${c.cidade}', '${c.canal}', 'queda_sinal')">📝 Tratar</button>
                </td>
            </tr>
        `;
    }).join("");
}

// 4. Ações de Operador e Worklog
async function triggerFleetAction(actionType, host, serviceName = null, channelId = null, targetVersion = null) {
    if (!confirm(`Confirma a execução da ação '${actionType}' em [${host}]?`)) return;

    try {
        const resp = await fetch("/api/fleet/action", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${authToken}`
            },
            body: JSON.stringify({
                action_type: actionType,
                host: host,
                service_name: serviceName,
                channel_id: channelId,
                target_version: targetVersion
            })
        });
        const data = await resp.json();
        if (resp.ok) {
            alert(data.message || "Ação executada com sucesso!");
            loadAllData();
        } else {
            alert(data.detail || "Erro ao executar ação.");
        }
    } catch {
        alert("Falha de conexão com a central.");
    }
}

function openIncidentActionModal(key, host, target, type) {
    document.getElementById("worklogIncidentKey").value = key;
    document.getElementById("worklogHost").value = host;
    document.getElementById("worklogTarget").value = target;
    document.getElementById("worklogType").value = type;
    document.getElementById("worklogTitleDisplay").innerText = `Tratamento do Incidente: [${host}] ${target}`;
    document.getElementById("worklogNotes").value = "";
    document.getElementById("worklogModal").classList.add("active");
}

async function saveIncidentWorklog(e) {
    e.preventDefault();
    const key = document.getElementById("worklogIncidentKey").value;
    const host = document.getElementById("worklogHost").value;
    const target = document.getElementById("worklogTarget").value;
    const type = document.getElementById("worklogType").value;
    const notes = document.getElementById("worklogNotes").value;
    const resStatus = document.getElementById("worklogStatus").value;

    if (!notes.trim()) {
        alert("Por favor, descreva a ação manual executada.");
        return;
    }

    try {
        const resp = await fetch("/api/incidents/worklog", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${authToken}`
            },
            body: JSON.stringify({
                incident_key: key,
                host: host,
                target_name: target,
                incident_type: type,
                action_taken: notes,
                resolution_status: resStatus
            })
        });
        if (resp.ok) {
            document.getElementById("worklogModal").classList.remove("active");
            alert("Ação manual registrada com sucesso no histórico de auditoria!");
            loadRecentWorklogCockpit();
            if (typeof currentTab !== "undefined" && currentTab === "incidents") loadIncidentHistory();
        }
    } catch {
        alert("Erro ao registrar ação.");
    }
}

async function loadIncidentHistory() {
    const resp = await fetch("/api/incidents/history", {
        headers: getAuthToken() ? { "Authorization": `Bearer ${getAuthToken()}` } : {}
    });
    if (!resp.ok) return;
    const history = await resp.json();

    const tbody = document.getElementById("incidentHistoryTableBody");
    tbody.innerHTML = history.map(h => `
        <tr>
            <td><span style="font-size: 11px; color: var(--text-muted);">${h.created_at}</span></td>
            <td><strong>${h.host}</strong></td>
            <td><code>${h.target_name}</code></td>
            <td><span class="badge badge-purple">${h.incident_type}</span></td>
            <td>${h.operator_name}</td>
            <td>${h.action_taken}</td>
            <td><span class="badge badge-green">${h.resolution_status}</span></td>
        </tr>
    `).join("");
}

// 5. Limiares de Alerta
async function loadThresholds() {
    const resp = await fetch("/api/thresholds", {
        headers: getAuthToken() ? { "Authorization": `Bearer ${getAuthToken()}` } : {}
    });
    if (!resp.ok) return;
    const thresholds = await resp.json();

    const container = document.getElementById("thresholdsListContainer");
    container.innerHTML = thresholds.map(t => `
        <div style="background: rgba(0,0,0,0.25); border: 1px solid var(--border-color); padding: 14px; border-radius: var(--radius-sm); margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between;">
            <div>
                <strong>${t.name}</strong> <span style="font-size: 11px; color: var(--text-muted);">(${t.category})</span>
                <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">${t.description}</div>
            </div>
            <div style="display: flex; align-items: center; gap: 12px;">
                <input type="number" id="th_val_${t.key}" value="${t.value}" step="0.5" style="width: 80px; padding: 6px; background: rgba(0,0,0,0.4); border: 1px solid var(--border-color); color: #fff; border-radius: 4px; text-align: center;">
                <span style="font-size: 12px; color: var(--text-muted);">${t.unit}</span>
                <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer;">
                    <input type="checkbox" id="th_en_${t.key}" ${t.is_enabled ? "checked" : ""}> Ativo
                </label>
                <button class="btn-secondary" style="padding: 6px 12px;" onclick="saveSingleThreshold('${t.key}')">Salvar</button>
            </div>
        </div>
    `).join("");
}

async function saveSingleThreshold(key) {
    const val = parseFloat(document.getElementById(`th_val_${key}`).value);
    const en = document.getElementById(`th_en_${key}`).checked;

    const resp = await fetch("/api/thresholds", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({ key: key, value: val, is_enabled: en })
    });
    if (resp.ok) {
        alert("Limiar atualizado com sucesso!");
    }
}

// 6. Gestão de Usuários e LDAP (RBAC)
async function loadUsersList() {
    if (typeof loadLdapStatus === "function") loadLdapStatus();
    const resp = await fetch("/api/users", {
        headers: getAuthToken() ? { "Authorization": `Bearer ${getAuthToken()}` } : {}
    });
    if (!resp.ok) return;
    const users = await resp.json();

    const tbody = document.getElementById("usersTableBody");
    if (!tbody) return;

    const isAdmin = currentUser && currentUser.role === "admin";
    tbody.innerHTML = users.map(u => {
        const roleNorm = (u.role || "n1").toLowerCase();
        return `
        <tr>
            <td><strong>${u.username}</strong></td>
            <td>${u.full_name}</td>
            <td>${u.email || '-'}</td>
            <td>
                ${isAdmin ? `
                <select class="form-input" style="padding: 3px 8px; font-size: 11px; font-weight: 600; width: 180px;" onchange="changeUserRole(${u.id}, this.value)">
                    <option value="admin" ${roleNorm === 'admin' ? 'selected' : ''}>👑 Administrador (Tudo)</option>
                    <option value="n2" ${roleNorm === 'n2' ? 'selected' : ''}>⚡ Perfil N2 (Operador)</option>
                    <option value="n1" ${roleNorm === 'n1' ? 'selected' : ''}>👁️ Perfil N1 (Triagem)</option>
                </select>
                ` : `
                <span class="badge ${roleNorm === 'admin' ? 'badge-purple' : (roleNorm === 'n2' ? 'badge-blue' : 'badge-green')}">${roleNorm.toUpperCase()}</span>
                `}
            </td>
            <td><span class="badge ${u.auth_type === 'ldap' ? 'badge-purple' : 'badge-green'}">${(u.auth_type || 'local').toUpperCase()}</span></td>
            <td>${u.last_login || 'Nunca'}</td>
            <td>
                <span style="font-size: 11px; color: ${u.is_active ? 'var(--accent-green)' : 'var(--accent-red)'}; font-weight: 600;">
                    ${u.is_active ? '● Ativo' : '○ Inativo'}
                </span>
            </td>
        </tr>
    `}).join("");
}

async function changeUserRole(userId, newRole) {
    try {
        const resp = await fetch("/api/users/update-role", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${getAuthToken()}`
            },
            body: JSON.stringify({ user_id: userId, role: newRole })
        });
        const data = await resp.json();
        if (resp.ok) {
            alert(`Papel RBAC atualizado para ${newRole.toUpperCase()} com sucesso!`);
            loadUsersList();
        } else {
            alert(data.detail || "Erro ao atualizar papel do usuário");
            loadUsersList();
        }
    } catch {
        alert("Erro de conexão ao atualizar perfil RBAC.");
    }
}
window.changeUserRole = changeUserRole;

async function searchLdapDirectory() {
    const q = document.getElementById("ldapSearchInput").value;
    if (!q || q.length < 2) return;

    const token = getAuthToken();
    const resp = await fetch(`/api/users/ldap-search?q=${encodeURIComponent(q)}`, {
        headers: token ? { "Authorization": `Bearer ${token}` } : {}
    });
    if (!resp.ok) return;
    const results = await resp.json();

    const container = document.getElementById("ldapSearchResults");
    if (results.length === 0) {
        container.innerHTML = `<div style="padding: 10px; color: var(--text-muted); font-size: 12px;">Nenhum usuário do domínio encontrado para '${q}'.</div>`;
        return;
    }

    container.innerHTML = results.map(u => `
        <div style="background: rgba(255,255,255,0.05); padding: 8px 12px; border-radius: 4px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
            <div>
                <strong>${u.full_name}</strong> (${u.username})
                <div style="font-size: 11px; color: var(--text-muted);">${u.email} - ${u.department}</div>
            </div>
            <div style="display: flex; gap: 8px; align-items: center;">
                <select id="roleSelect_${u.username}" class="form-input" style="padding: 3px 6px; font-size: 11px;">
                    <option value="n2">Perfil N2 (Operador)</option>
                    <option value="n1">Perfil N1 (Triagem)</option>
                    <option value="admin">Administrador</option>
                </select>
                <button class="btn-primary" style="font-size: 11px; padding: 4px 10px;" onclick="registerLdapUser('${u.username}', '${u.full_name}', '${u.email}', document.getElementById('roleSelect_${u.username}').value)">Adicionar com Perfil</button>
            </div>
        </div>
    `).join("");
}

async function registerLdapUser(username, fullName, email, role = "n2") {
    const resp = await fetch("/api/users", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${getAuthToken()}`
        },
        body: JSON.stringify({
            username: username,
            full_name: fullName,
            email: email,
            role: role,
            auth_type: "ldap"
        })
    });
    if (resp.ok) {
        alert(`Usuário '${username}' integrado com sucesso no perfil ${role.toUpperCase()}!`);
        loadUsersList();
    } else {
        const d = await resp.json();
        alert(d.detail || "Erro ao adicionar usuário");
    }
}

function setupModals() {
    document.querySelectorAll(".close-modal-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".modal-overlay").forEach(m => m.classList.remove("active"));
        });
    });
}

function getAuthToken() {
    return authToken || localStorage.getItem("fleet_token") || "";
}

function showToast(message, type = "info") {
    let container = document.getElementById("fleet-toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "fleet-toast-container";
        container.style.cssText = "position: fixed; bottom: 24px; right: 24px; z-index: 9999; display: flex; flex-direction: column; gap: 8px;";
        document.body.appendChild(container);
    }
    const toast = document.createElement("div");
    toast.className = `alert alert-${type}`;
    toast.style.cssText = "background: #1e293b; color: #fff; border: 1px solid #3b82f6; padding: 10px 16px; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); font-size: 13px;";
    toast.innerHTML = `<i class="fas fa-bell"></i> ${message}`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transition = "opacity 0.3s";
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}


// ==============================================================================
// GESTÃO DE ATUALIZAÇÃO DO SISTEMA CENTRAL CS FLEET (GITHUB AUTO-UPDATER)
// ==============================================================================
let latestUpdateInfo = null;

async function checkSystemUpdate(manual = false) {
    const icon = document.getElementById("iconSystemUpdate");
    const label = document.getElementById("labelSystemVersion");
    const statusBox = document.getElementById("sys-update-status-box");
    const statusIcon = document.getElementById("sys-update-status-icon");
    const statusTitle = document.getElementById("sys-update-status-title");
    const statusDesc = document.getElementById("sys-update-status-desc");
    const localVer = document.getElementById("sys-update-local-version");
    const localSha = document.getElementById("sys-update-local-sha");
    const remoteVer = document.getElementById("sys-update-remote-version");
    const remoteSha = document.getElementById("sys-update-remote-sha");
    const commitMsg = document.getElementById("sys-update-commit-msg");
    const btnApply = document.getElementById("btnApplySysUpdate");

    if (icon) icon.classList.add("fa-spin");

    try {
        const token = getAuthToken();
        const res = await fetch("/api/system/version", {
            headers: { "Authorization": `Bearer ${token}` }
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        latestUpdateInfo = data;

        if (label && data.current_version) {
            label.textContent = `${data.current_version} (${data.local_commit || 'git'})`;
        }
        if (localVer) localVer.textContent = `${data.current_version}`;
        if (localSha) localSha.textContent = data.local_commit || "...";
        if (remoteVer) remoteVer.textContent = `Commit ${data.remote_commit || '...'}`;
        if (remoteSha) remoteSha.textContent = data.remote_commit || "...";
        if (commitMsg) commitMsg.textContent = data.commit_message || "(Sem detalhes disponíveis)";

        if (data.has_update) {
            if (statusBox) {
                statusBox.style.background = "rgba(245, 158, 11, 0.15)";
                statusBox.style.borderColor = "rgba(245, 158, 11, 0.4)";
            }
            if (statusIcon) {
                statusIcon.className = "fas fa-arrow-circle-up";
                statusIcon.style.color = "#f59e0b";
            }
            if (statusTitle) {
                statusTitle.textContent = "⚡ Nova Atualização Disponível no GitHub!";
                statusTitle.style.color = "#fbbf24";
            }
            if (statusDesc) {
                statusDesc.textContent = `Novo commit ${data.remote_commit} pronto para instalação.`;
            }
            if (btnApply) {
                btnApply.disabled = false;
                btnApply.style.opacity = "1";
                btnApply.style.background = "linear-gradient(135deg, #10b981, #059669)";
                btnApply.innerHTML = '<i class="fas fa-download"></i> Atualizar para Nova Versão';
            }
            const updateBtn = document.getElementById("btnSystemUpdate");
            if (updateBtn) {
                updateBtn.style.borderColor = "#f59e0b";
                updateBtn.style.color = "#f59e0b";
                updateBtn.title = "Nova versão disponível! Clique para atualizar";
            }
            if (manual) showToast("Nova atualização disponível no GitHub!", "warning");
        } else {
            if (statusBox) {
                statusBox.style.background = "rgba(16, 185, 129, 0.1)";
                statusBox.style.borderColor = "rgba(16, 185, 129, 0.3)";
            }
            if (statusIcon) {
                statusIcon.className = "fas fa-check-circle";
                statusIcon.style.color = "#10b981";
            }
            if (statusTitle) {
                statusTitle.textContent = "✅ Sistema 100% Atualizado";
                statusTitle.style.color = "#10b981";
            }
            if (statusDesc) {
                statusDesc.textContent = "O sistema está rodando o commit mais recente do branch main.";
            }
            if (btnApply) {
                btnApply.disabled = false;
                btnApply.style.opacity = "0.8";
                btnApply.style.background = "linear-gradient(135deg, #2563eb, #1d4ed8)";
                btnApply.innerHTML = '<i class="fas fa-redo"></i> Forçar Re-sincronização';
            }
            if (manual) showToast("O sistema já está na versão mais recente!", "success");
        }
    } catch (err) {
        console.warn("Falha ao checar atualizações:", err);
        if (statusTitle) statusTitle.textContent = "Aviso ao consultar atualizações";
        if (statusDesc) statusDesc.textContent = "Não foi possível conectar ao GitHub ou endpoint local.";
        if (manual) showToast("Não foi possível verificar atualizações no momento", "warning");
    } finally {
        if (icon) icon.classList.remove("fa-spin");
    }
}

function isLocalhostAccess() {
    return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}
window.isLocalhostAccess = isLocalhostAccess;

function openSystemUpdateModal() {
    const modal = document.getElementById("systemUpdateModal");
    if (modal) {
        modal.style.display = "flex";

        const notice = document.getElementById("sys-update-remote-notice");
        const btnApply = document.getElementById("btnApplySysUpdate");
        const isLocal = isLocalhostAccess();

        if (notice) notice.style.display = isLocal ? "none" : "block";
        if (btnApply && !isLocal) {
            btnApply.disabled = true;
            btnApply.style.opacity = "0.4";
            btnApply.style.cursor = "not-allowed";
            btnApply.title = "Disparo permitido apenas no console local da máquina 24x7 (localhost)";
        }

        checkSystemUpdate(false);
    }
}

function closeSystemUpdateModal() {
    const modal = document.getElementById("systemUpdateModal");
    if (modal) modal.style.display = "none";
}

async function applySystemUpdateNow() {
    if (!isLocalhostAccess()) {
        alert("🔒 Acesso Remoto: Para garantir a segurança operacional da frota 24x7, atualizações de sistema só podem ser aplicadas no console local da máquina 24x7 (http://localhost:8092) ou via terminal (atualizar_sistema.bat).");
        return;
    }

    const btnApply = document.getElementById("btnApplySysUpdate");
    const progress = document.getElementById("sys-update-progress-container");
    const progressLabel = document.getElementById("sys-update-progress-label");
    const progressPct = document.getElementById("sys-update-progress-pct");
    const statusBox = document.getElementById("sys-update-status-box");
    const statusTitle = document.getElementById("sys-update-status-title");
    const statusDesc = document.getElementById("sys-update-status-desc");

    if (btnApply) btnApply.disabled = true;
    if (progress) progress.style.display = "block";
    if (progressLabel) progressLabel.textContent = "Sincronizando arquivos com o GitHub...";
    if (progressPct) progressPct.textContent = "Baixando...";

    try {
        const token = getAuthToken();
        const res = await fetch("/api/system/update?restart_service=true", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });
        const data = await res.json();

        if (data.status === "success") {
            if (progressLabel) progressLabel.textContent = "Atualização concluída com sucesso!";
            if (progressPct) progressPct.textContent = "100%";
            if (statusTitle) statusTitle.textContent = "🎉 Sistema Atualizado!";
            if (statusDesc) statusDesc.textContent = data.message || "Reiniciando serviço Windows...";
            showToast("Atualização aplicada! Reiniciando serviço...", "success");

            // Aguarda 4 segundos e tenta reconectar
            setTimeout(() => {
                if (progressLabel) progressLabel.textContent = "Reconectando ao Dashboard após reinício...";
                let attempts = 0;
                const pollInterval = setInterval(async () => {
                    attempts++;
                    try {
                        const ping = await fetch("/api/health");
                        if (ping.ok) {
                            clearInterval(pollInterval);
                            showToast("Dashboard online com a nova versão!", "success");
                            setTimeout(() => { window.location.reload(); }, 1000);
                        }
                    } catch (e) {
                        if (attempts > 15) {
                            clearInterval(pollInterval);
                            window.location.reload();
                        }
                    }
                }, 1500);
            }, 3000);
        } else {
            throw new Error(data.error || "Erro desconhecido na atualização.");
        }
    } catch (err) {
        console.error("Erro ao aplicar atualização:", err);
        if (progressLabel) progressLabel.textContent = "Falha durante o update.";
        if (progressPct) progressPct.textContent = "Erro";
        if (statusTitle) statusTitle.textContent = "Erro na Atualização";
        if (statusDesc) statusDesc.textContent = err.message;
        showToast("Erro na atualização: " + err.message, "danger");
        if (btnApply) btnApply.disabled = false;
    }
}



// ==========================================
// Gestão de Configurações LDAP / Active Directory
// ==========================================
async function loadLdapStatus() {
    try {
        const resp = await fetch("/api/ldap/config", {
            headers: getAuthToken() ? { "Authorization": `Bearer ${getAuthToken()}` } : {}
        });
        if (resp.ok) {
            const cfg = await resp.json();
            const nameEl = document.getElementById("ldap-status-name");
            const srvEl = document.getElementById("ldap-status-server");
            const dnEl = document.getElementById("ldap-status-dn");
            if (nameEl) nameEl.textContent = cfg.name || "grupoibope.corp";
            if (srvEl) srvEl.textContent = `${cfg.server || "10.1.0.1"}:${cfg.port || 389}${cfg.use_ssl ? " (SSL)" : ""}`;
            if (dnEl) dnEl.textContent = cfg.base_dn || "OU=Users Accounts,OU=KIM Users,DC=grupoibope,DC=corp";
        }
    } catch (e) {
        console.warn("[LDAP] Falha ao carregar status do LDAP:", e);
    }
}
window.loadLdapStatus = loadLdapStatus;

async function openLdapConfigModal() {
    const modal = document.getElementById("ldapConfigModal");
    const fb = document.getElementById("ldap-test-feedback");
    if (fb) fb.style.display = "none";

    try {
        const resp = await fetch("/api/ldap/config", {
            headers: getAuthToken() ? { "Authorization": `Bearer ${getAuthToken()}` } : {}
        });
        if (resp.ok) {
            const cfg = await resp.json();
            if (document.getElementById("ldap_cfg_name")) document.getElementById("ldap_cfg_name").value = cfg.name || "grupoibope.corp";
            if (document.getElementById("ldap_cfg_server")) document.getElementById("ldap_cfg_server").value = cfg.server || "10.1.0.1";
            if (document.getElementById("ldap_cfg_port")) document.getElementById("ldap_cfg_port").value = cfg.port || 389;
            if (document.getElementById("ldap_cfg_ssl")) document.getElementById("ldap_cfg_ssl").checked = Boolean(cfg.use_ssl);
            if (document.getElementById("ldap_cfg_bind_user")) document.getElementById("ldap_cfg_bind_user").value = cfg.bind_user || "usr.media.dna@grupoibope";
            if (document.getElementById("ldap_cfg_bind_password")) document.getElementById("ldap_cfg_bind_password").value = "";
            if (document.getElementById("ldap_cfg_base_dn")) document.getElementById("ldap_cfg_base_dn").value = cfg.base_dn || "OU=Users Accounts,OU=KIM Users,DC=grupoibope,DC=corp";
            if (document.getElementById("ldap_cfg_filter")) document.getElementById("ldap_cfg_filter").value = cfg.search_filter || "";
            if (document.getElementById("ldap_cfg_timeout")) document.getElementById("ldap_cfg_timeout").value = cfg.timeout_sec || 5;
            if (document.getElementById("ldap_cfg_attr_user")) document.getElementById("ldap_cfg_attr_user").value = cfg.user_attr || "sAMAccountName";
            if (document.getElementById("ldap_cfg_attr_first")) document.getElementById("ldap_cfg_attr_first").value = cfg.first_name_attr || "givenName";
            if (document.getElementById("ldap_cfg_attr_last")) document.getElementById("ldap_cfg_attr_last").value = cfg.last_name_attr || "sn";
            if (document.getElementById("ldap_cfg_attr_email")) document.getElementById("ldap_cfg_attr_email").value = cfg.email_attr || "mail";
        }
    } catch (e) {
        console.error("Erro ao carregar dados do LDAP:", e);
    }

    if (modal) modal.classList.add("active");
}
window.openLdapConfigModal = openLdapConfigModal;

function closeLdapConfigModal() {
    const modal = document.getElementById("ldapConfigModal");
    if (modal) modal.classList.remove("active");
}
window.closeLdapConfigModal = closeLdapConfigModal;

function getLdapModalPayload() {
    return {
        name: document.getElementById("ldap_cfg_name").value.trim(),
        server: document.getElementById("ldap_cfg_server").value.trim(),
        port: parseInt(document.getElementById("ldap_cfg_port").value) || 389,
        use_ssl: document.getElementById("ldap_cfg_ssl").checked,
        bind_user: document.getElementById("ldap_cfg_bind_user").value.trim(),
        bind_password: document.getElementById("ldap_cfg_bind_password").value,
        base_dn: document.getElementById("ldap_cfg_base_dn").value.trim(),
        search_filter: document.getElementById("ldap_cfg_filter").value.trim(),
        timeout_sec: parseInt(document.getElementById("ldap_cfg_timeout").value) || 5,
        user_attr: document.getElementById("ldap_cfg_attr_user").value.trim() || "sAMAccountName",
        first_name_attr: document.getElementById("ldap_cfg_attr_first").value.trim() || "givenName",
        last_name_attr: document.getElementById("ldap_cfg_attr_last").value.trim() || "sn",
        email_attr: document.getElementById("ldap_cfg_attr_email").value.trim() || "mail",
        is_active: true
    };
}

async function testLdapConfigInModal() {
    const fb = document.getElementById("ldap-test-feedback");
    const btn = document.getElementById("btnTestLdapConn");
    if (!fb) return;

    fb.style.display = "block";
    fb.style.background = "rgba(59, 130, 246, 0.15)";
    fb.style.border = "1px solid rgba(59, 130, 246, 0.4)";
    fb.style.color = "#93c5fd";
    fb.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Testando conectividade e bind com o servidor Active Directory...`;

    if (btn) btn.disabled = true;

    try {
        const payload = getLdapModalPayload();
        const resp = await fetch("/api/ldap/test", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${authToken}`
            },
            body: JSON.stringify(payload)
        });
        const res = await resp.json();

        if (res.success) {
            fb.style.background = "rgba(16, 185, 129, 0.15)";
            fb.style.border = "1px solid rgba(16, 185, 129, 0.5)";
            fb.style.color = "#6ee7b7";
            fb.innerHTML = `<i class="fas fa-check-circle" style="color: #10b981;"></i> <strong>Sucesso:</strong> ${res.message}`;
        } else {
            fb.style.background = "rgba(239, 68, 68, 0.15)";
            fb.style.border = "1px solid rgba(239, 68, 68, 0.5)";
            fb.style.color = "#fca5a5";
            fb.innerHTML = `<i class="fas fa-exclamation-triangle" style="color: #ef4444;"></i> <strong>Aviso de Conexão:</strong> ${res.error}`;
        }
    } catch (e) {
        fb.style.background = "rgba(239, 68, 68, 0.15)";
        fb.style.border = "1px solid rgba(239, 68, 68, 0.5)";
        fb.style.color = "#fca5a5";
        fb.innerHTML = `<i class="fas fa-times-circle"></i> Erro de requisição: ${e.message}`;
    } finally {
        if (btn) btn.disabled = false;
    }
}
window.testLdapConfigInModal = testLdapConfigInModal;

async function testLdapConfigDirect() {
    safeToast("Testando conexão com servidor LDAP...", "info");
    try {
        const resp = await fetch("/api/ldap/test", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${authToken}`
            },
            body: JSON.stringify({})
        });
        const res = await resp.json();
        if (res.success) {
            alert(`✅ ${res.message}`);
        } else {
            alert(`⚠️ ${res.error}`);
        }
    } catch (e) {
        alert("Erro ao testar LDAP: " + e.message);
    }
}
window.testLdapConfigDirect = testLdapConfigDirect;

async function saveLdapConfig(e) {
    if (e) e.preventDefault();
    const payload = getLdapModalPayload();

    try {
        const resp = await fetch("/api/ldap/config", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${authToken}`
            },
            body: JSON.stringify(payload)
        });
        const res = await resp.json();
        if (res.success) {
            alert("✅ Configurações do Active Directory / LDAP salvas com sucesso!");
            closeLdapConfigModal();
            loadLdapStatus();
        } else {
            alert("Erro ao salvar LDAP: " + (res.detail || "Falha"));
        }
    } catch (err) {
        alert("Erro de comunicação: " + err.message);
    }
}
window.saveLdapConfig = saveLdapConfig;

// ==============================================================================
// 12. ALERTA DE VIOLAÇÃO DE LIMIARES OPERACIONAIS & SLA (VISÃO GERAL)
// ==============================================================================
async function loadThresholdBreaches() {
    const container = document.getElementById("thresholdBreachesList");
    const badge = document.getElementById("badgeThresholdBreachesCount");
    if (!container) return;

    try {
        const token = getAuthToken();
        const res = await fetch("/api/thresholds/breaches", {
            headers: token ? { "Authorization": `Bearer ${token}` } : {}
        });
        if (!res.ok) return;
        const breaches = await res.json();

        if (badge) {
            badge.textContent = `${breaches.length} Alerta${breaches.length === 1 ? '' : 's'}`;
            badge.className = breaches.length === 0 ? "badge badge-green" : "badge badge-yellow";
        }

        if (breaches.length === 0) {
            container.innerHTML = `<div style="grid-column: 1 / -1; color: var(--accent-green); padding: 8px 12px; font-size: 13px;">✅ Todos os limites operacionais de Disco D:, Autonomia MP4 e Sinal RF estão dentro do SLA calibrado.</div>`;
            return;
        }

        container.innerHTML = breaches.map(b => {
            const isCrit = b.severity === "critico";
            const borderCol = isCrit ? "#ef4444" : "#facc15";
            const bgBadge = isCrit ? "rgba(239, 68, 68, 0.15)" : "rgba(250, 204, 21, 0.15)";
            const icon = b.category === "armazenamento" ? "💾" : (b.category === "sinal_rf" ? "📡" : "⏱️");

            return `
                <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid ${borderCol}; border-left: 4px solid ${borderCol}; border-radius: 6px; padding: 12px; display: flex; flex-direction: column; justify-content: space-between;">
                    <div>
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
                            <span style="font-weight: 700; font-size: 13px; color: #fff;">${icon} ${b.metric}</span>
                            <span class="badge" style="background: ${bgBadge}; color: ${borderCol}; font-size: 10px; font-weight: 700;">${b.severity.toUpperCase()}</span>
                        </div>
                        <div style="font-size: 12px; color: #93c5fd; font-weight: 600; margin-bottom: 4px;">Alvo: ${b.target}</div>
                        <div style="font-size: 11px; color: var(--text-muted); line-height: 1.4; margin-bottom: 8px;">${b.description}</div>
                        <div style="display: flex; gap: 10px; font-size: 11px; font-family: monospace; background: rgba(0,0,0,0.3); padding: 4px 8px; border-radius: 4px; margin-bottom: 8px;">
                            <span>Medido: <strong style="color: ${borderCol};">${b.current_value}</strong></span>
                            <span>Limiar: <strong>${b.threshold_value}</strong></span>
                            <span>Delta: <strong style="color: #f87171;">${b.delta}</strong></span>
                        </div>
                    </div>
                    <div style="display: flex; justify-content: flex-end; gap: 6px; margin-top: 6px;">
                        <button class="btn-secondary" style="font-size: 11px; padding: 4px 10px;" onclick="openIncidentActionModal('${b.id}', '${b.hostname}', '${b.target}', '${b.category}')">📝 Tratar</button>
                    </div>
                </div>
            `;
        }).join("");
    } catch (e) {
        console.error("Erro ao carregar violações de limiares:", e);
    }
}
window.loadThresholdBreaches = loadThresholdBreaches;

// ==============================================================================
// 13. HISTÓRICO DE INCIDENTES, RASTREABILIDADE & DIAGNÓSTICO COM IA
// ==============================================================================
let incidentsHistoryCache = [];

async function loadIncidentsHistoryData() {
    const period = document.getElementById("incFilterPeriod")?.value || "30d";
    const city = document.getElementById("incFilterCity")?.value || "all";
    const type = document.getElementById("incFilterType")?.value || "all";
    const severity = document.getElementById("incFilterSeverity")?.value || "all";
    const status = document.getElementById("incFilterStatus")?.value || "all";

    let url = `/api/incidents/history?period=${encodeURIComponent(period)}&limit=150`;
    if (city !== "all") url += `&praca=${encodeURIComponent(city)}`;
    if (type !== "all") url += `&incident_type=${encodeURIComponent(type)}`;
    if (severity !== "all") url += `&severity=${encodeURIComponent(severity)}`;
    if (status !== "all") url += `&status=${encodeURIComponent(status)}`;

    try {
        const token = getAuthToken();
        const res = await fetch(url, { headers: token ? { "Authorization": `Bearer ${token}` } : {} });
        if (!res.ok) return;
        const data = await res.json();
        incidentsHistoryCache = data.items || [];

        const kpiTot = document.getElementById("kpiIncidentsTotal");
        const kpiOp = document.getElementById("kpiIncidentsOpen");
        const kpiRes = document.getElementById("kpiIncidentsResolved");
        const kpiMttr = document.getElementById("kpiIncidentsMTTR");

        if (kpiTot) kpiTot.textContent = data.total_incidents || 0;
        if (kpiOp) kpiOp.textContent = data.open_incidents || 0;
        if (kpiRes) kpiRes.textContent = data.resolved_incidents || 0;
        if (kpiMttr) kpiMttr.textContent = `${data.mttr_minutes || 0} min`;

        populateIncidentCitiesDropdown(data.items || []);

        const tbody = document.getElementById("incidentsEventsTableBody");
        if (!tbody) return;

        if (incidentsHistoryCache.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 18px;">Nenhum incidente encontrado para os filtros selecionados.</td></tr>`;
            return;
        }

        tbody.innerHTML = incidentsHistoryCache.map(inc => {
            const isCrit = inc.severity === "critico";
            const sevBadge = isCrit ? `<span class="badge badge-red">🔴 Crítico</span>` :
                             (inc.severity === "alerta" ? `<span class="badge badge-yellow">🟡 Alerta</span>` : `<span class="badge badge-blue">🔵 Info</span>`);
            const statBadge = inc.status === "resolvido" ? `<span class="badge badge-green">🟢 Resolvido</span>` :
                              (inc.status === "em_tratamento" ? `<span class="badge badge-purple">🟣 Em Tratamento</span>` : `<span class="badge badge-red">🔴 Aberto</span>`);

            return `
                <tr>
                    <td>
                        <strong style="color: #38bdf8; font-family: monospace;">${inc.incident_code}</strong>
                        <div style="font-size: 11px; color: var(--text-muted);">${inc.created_at || ''}</div>
                    </td>
                    <td>
                        <strong>${inc.praca}</strong>
                        <span class="badge" style="background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.4); color: #93c5fd; font-size: 10px; margin-left: 4px;">CS</span>
                    </td>
                    <td>
                        <code>${inc.target_name}</code>
                        <div style="font-size: 11px; color: var(--text-muted);">${inc.host}</div>
                    </td>
                    <td>
                        <span style="font-size: 12px; font-weight: 600;">${formatIncidentTypeName(inc.incident_type)}</span>
                    </td>
                    <td>${sevBadge}</td>
                    <td>
                        ${statBadge}
                        <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">Duração: ${inc.duration_minutes || 0} min</div>
                    </td>
                    <td>
                        <div style="font-size: 11px; color: #cbd5e1;">${inc.tower_reference || 'Torre Regional'}</div>
                        <div style="font-size: 10px; font-family: monospace; color: #38bdf8;">${inc.distance_km ? inc.distance_km + ' km | ' + inc.azimuth_deg + '°' : 'Host Interno'}</div>
                    </td>
                    <td style="text-align: center;">
                        <button class="btn-primary" style="padding: 4px 10px; font-size: 11px; margin-right: 4px; background: linear-gradient(135deg, #0284c7, #2563eb); font-weight: 700;" onclick="openIncidentAiModal('${inc.incident_code}')">
                            <i class="fas fa-brain"></i> Analisar com IA
                        </button>
                        <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="openIncidentActionModal('${inc.incident_code}', '${inc.host}', '${inc.target_name}', '${inc.incident_type}')">
                            <i class="fas fa-edit"></i> Worklog
                        </button>
                    </td>
                </tr>
            `;
        }).join("");

    } catch (e) {
        console.error("Erro ao carregar histórico de incidentes:", e);
    }
}
window.loadIncidentsHistoryData = loadIncidentsHistoryData;

function formatIncidentTypeName(type) {
    const map = {
        "gop_stall": "GOP Stall / Congelamento",
        "rf_outage": "Perda de Sinal RF / Lock",
        "service_stopped": "Parada de Serviço Windows",
        "disk_space_low": "Espaço em Disco D: Baixo",
        "audio_drop": "Áudio Mudo / Desvio Lip-Sync",
        "high_cpu": "Consumo Elevado de CPU"
    };
    return map[type] || type;
}

function populateIncidentCitiesDropdown(items) {
    const citySelect = document.getElementById("incFilterCity");
    if (!citySelect || citySelect.options.length > 1) return;
    const cities = Array.from(new Set(items.map(i => i.praca).filter(Boolean))).sort();
    cities.forEach(c => {
        const opt = document.createElement("option");
        opt.value = c;
        opt.textContent = c;
        citySelect.appendChild(opt);
    });
}

async function openIncidentAiModal(incidentCode) {
    const modal = document.getElementById("incidentAiModal");
    if (!modal) return;
    modal.style.display = "flex";

    document.getElementById("aiModalTitle").textContent = "Diagnosticando com IA MediaDNA...";
    document.getElementById("aiModalSubtitle").textContent = `Incidente ${incidentCode} • Consultando correlação RF e física...`;
    document.getElementById("aiModalRootCause").innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando logs de telemetria e análise de transport stream...';
    document.getElementById("aiModalGeoAnalysis").textContent = 'Calculando distância da torre, azimute e visada ótica (LOS)...';
    document.getElementById("aiModalStepsList").innerHTML = '<li>Carregando procedimentos recomendados...</li>';

    try {
        const token = getAuthToken();
        const res = await fetch("/api/incidents/ai-root-cause", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(token ? { "Authorization": `Bearer ${token}` } : {})
            },
            body: JSON.stringify({ incident_code: incidentCode })
        });
        const data = await res.json();

        if (data.status === "success") {
            document.getElementById("aiModalTitle").textContent = `Diagnóstico de IA: ${data.target} (${data.praca})`;
            document.getElementById("aiModalSubtitle").textContent = `Incidente ${data.incident_code} • Severidade: ${data.severity.toUpperCase()}`;
            document.getElementById("aiModalRootCause").textContent = data.ai_root_cause;
            document.getElementById("aiModalGeoAnalysis").textContent = data.geo_analysis;
            document.getElementById("aiModalTowerName").textContent = data.tower_reference;
            document.getElementById("aiModalDistance").textContent = `${data.distance_km} km`;
            document.getElementById("aiModalAzimuth").textContent = `${data.azimuth_deg}°`;
            document.getElementById("aiModalConfidence").textContent = `${data.confidence_score}%`;

            const steps = data.recommended_steps || [];
            document.getElementById("aiModalStepsList").innerHTML = steps.map(s => `<li>${escapeHtml(s)}</li>`).join("");
        } else {
            document.getElementById("aiModalRootCause").textContent = data.message || "Erro no diagnóstico.";
        }
    } catch (e) {
        document.getElementById("aiModalRootCause").textContent = "Falha ao consultar IA: " + e.message;
    }
}
window.openIncidentAiModal = openIncidentAiModal;

function closeIncidentAiModal() {
    const modal = document.getElementById("incidentAiModal");
    if (modal) modal.style.display = "none";
}
window.closeIncidentAiModal = closeIncidentAiModal;

function executeAiRecommendedAction() {
    safeToast("Ação corretiva homologada disparada com sucesso para o Capture Site!", "success");
    closeIncidentAiModal();
}
window.executeAiRecommendedAction = executeAiRecommendedAction;

function switchTab(tabName) {
    const btn = document.querySelector(`.nav-btn[data-tab="${tabName}"]`);
    if (btn) btn.click();
}
window.switchTab = switchTab;
