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
            headers: { "Authorization": `Bearer ${authToken}` }
        });
        if (resp.ok) {
            currentUser = await resp.json();
            document.getElementById("navUserDisplay").innerText = currentUser.username;
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
            document.getElementById(`tab-${tabName}`).classList.add("active");

            if (tabName === "ai") {
                loadAiSuggestions();
            } else if (tabName === "configs") {
                loadThresholds();
                loadUsersList();
                if (typeof loadRefreshIntervalConfig === "function") loadRefreshIntervalConfig();
            } else if (tabName === "incidents") {
                loadIncidentHistory();
            } else if (tabName === "remote-commands") {
                initRemoteCommands();
            } else if (tabName === "signals") {
                if (typeof initSignalsAnalysisTab === "function") initSignalsAnalysisTab();
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
        headers: { "Authorization": `Bearer ${authToken}` }
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
}

function renderOutageBanner(outages) {
    const container = document.getElementById("activeOutagesList");
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

// 2. Tabela de Serviços
async function loadServicesTable() {
    const city = document.getElementById("filterCity").value;
    const status = document.getElementById("filterStatus").value;

    let url = `/api/fleet/services?`;
    if (city) url += `city=${encodeURIComponent(city)}&`;
    if (status) url += `status_filter=${encodeURIComponent(status)}&`;

    const resp = await fetch(url, { headers: { "Authorization": `Bearer ${authToken}` } });
    if (!resp.ok) return;
    const services = await resp.json();

    const tbody = document.getElementById("servicesTableBody");
    tbody.innerHTML = services.map(s => {
        const isRunning = s.status_servico === "Em Execução";
        const isCrash = s.status_servico.includes("Crash-Loop") || s.status_atualizacao.includes("Crash-Loop");
        const statusBadge = isCrash ? `<span class="badge badge-red">🚨 Crash-Loop</span>` :
                            (isRunning ? `<span class="badge badge-green">🟢 Executando</span>` : `<span class="badge badge-red">🔴 ${s.status_servico}</span>`);

        const isUpdated = s.status_atualizacao.includes("Atualizado") || s.status_atualizacao === "Atualizado";
        const updBadge = s.status_atualizacao.includes("Progresso") ? `<span class="badge badge-purple">🟣 ${s.status_atualizacao}</span>` :
                         (isUpdated ? `<span class="badge badge-blue">✅ ${s.status_atualizacao}</span>` : `<span class="badge badge-yellow">⚠️ ${s.status_atualizacao}</span>`);

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
                <td>${s.cpu_uso}</td>
                <td>${s.disco_d_livre}</td>
                <td>
                    <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px;" title="Reiniciar Serviço" onclick="triggerFleetAction('restart_service', '${s.hostname}', '${s.nome_servico}')">🔄 Reiniciar</button>
                    <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px;" title="Tratar / Worklog" onclick="openIncidentActionModal('srv_${s.hostname}_${s.nome_servico}', '${s.hostname}', '${s.nome_servico}', 'servico_parado')">📝 Ação</button>
                </td>
            </tr>
        `;
    }).join("");
}

// 3. Tabela de Canais e Sinais RF
async function loadChannelsTable() {
    const city = document.getElementById("filterCity").value;
    let url = `/api/fleet/channels?`;
    if (city) url += `city=${encodeURIComponent(city)}&`;

    const resp = await fetch(url, { headers: { "Authorization": `Bearer ${authToken}` } });
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
            if (currentTab === "incidents") loadIncidentHistory();
        }
    } catch {
        alert("Erro ao registrar ação.");
    }
}

async function loadIncidentHistory() {
    const resp = await fetch("/api/incidents/history", {
        headers: { "Authorization": `Bearer ${authToken}` }
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
        headers: { "Authorization": `Bearer ${authToken}` }
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

// 6. Gestão de Usuários e LDAP
async function loadUsersList() {
    const resp = await fetch("/api/users", {
        headers: { "Authorization": `Bearer ${authToken}` }
    });
    if (!resp.ok) return;
    const users = await resp.json();

    const tbody = document.getElementById("usersTableBody");
    tbody.innerHTML = users.map(u => `
        <tr>
            <td><strong>${u.username}</strong></td>
            <td>${u.full_name}</td>
            <td>${u.email || '-'}</td>
            <td><span class="badge badge-blue">${u.role}</span></td>
            <td><span class="badge ${u.auth_type === 'ldap' ? 'badge-purple' : 'badge-green'}">${u.auth_type.toUpperCase()}</span></td>
            <td>${u.last_login || 'Nunca'}</td>
        </tr>
    `).join("");
}

async function searchLdapDirectory() {
    const q = document.getElementById("ldapSearchInput").value;
    if (!q || q.length < 2) return;

    const resp = await fetch(`/api/users/ldap-search?q=${encodeURIComponent(q)}`, {
        headers: { "Authorization": `Bearer ${authToken}` }
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
            <button class="btn-primary" style="font-size: 11px; padding: 4px 10px;" onclick="registerLdapUser('${u.username}', '${u.full_name}', '${u.email}')">Adicionar Operador</button>
        </div>
    `).join("");
}

async function registerLdapUser(username, fullName, email) {
    const resp = await fetch("/api/users", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({
            username: username,
            full_name: fullName,
            email: email,
            role: "operator",
            auth_type: "ldap"
        })
    });
    if (resp.ok) {
        alert(`Usuário '${username}' integrado e registrado com sucesso!`);
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
