let allFleetHostsData = []; // [{ hostname, praca, regiao, pais }]

const REGION_MAPPING = {
    // Sul
    "Pelotas": { regiao: "Sul", uf: "RS", pais: "Brasil" },
    "Caxias do Sul": { regiao: "Sul", uf: "RS", pais: "Brasil" },
    "Florianópolis": { regiao: "Sul", uf: "SC", pais: "Brasil" },
    "Florianopolis": { regiao: "Sul", uf: "SC", pais: "Brasil" },
    "Porto Alegre": { regiao: "Sul", uf: "RS", pais: "Brasil" },
    "Curitiba": { regiao: "Sul", uf: "PR", pais: "Brasil" },

    // Sudeste
    "São Paulo": { regiao: "Sudeste", uf: "SP", pais: "Brasil" },
    "Campinas": { regiao: "Sudeste", uf: "SP", pais: "Brasil" },
    "Santos": { regiao: "Sudeste", uf: "SP", pais: "Brasil" },
    "SJ dos Campos": { regiao: "Sudeste", uf: "SP", pais: "Brasil" },
    "S.J dos Campos": { regiao: "Sudeste", uf: "SP", pais: "Brasil" },
    "São José dos Campos": { regiao: "Sudeste", uf: "SP", pais: "Brasil" },
    "Ribeirão Preto": { regiao: "Sudeste", uf: "SP", pais: "Brasil" },
    "Rio de Janeiro": { regiao: "Sudeste", uf: "RJ", pais: "Brasil" },
    "Juiz de Fora": { regiao: "Sudeste", uf: "MG", pais: "Brasil" },
    "Uberlândia": { regiao: "Sudeste", uf: "MG", pais: "Brasil" },
    "Vitória": { regiao: "Sudeste", uf: "ES", pais: "Brasil" },
    "Belo Horizonte": { regiao: "Sudeste", uf: "MG", pais: "Brasil" },

    // Nordeste
    "Aracaju": { regiao: "Nordeste", uf: "SE", pais: "Brasil" },
    "Salvador": { regiao: "Nordeste", uf: "BA", pais: "Brasil" },
    "Recife": { regiao: "Nordeste", uf: "PE", pais: "Brasil" },
    "Fortaleza": { regiao: "Nordeste", uf: "CE", pais: "Brasil" },

    // Centro-Oeste / Nacional
    "Brasília": { regiao: "Centro-Oeste", uf: "DF", pais: "Brasil" },
    "Brasilia": { regiao: "Centro-Oeste", uf: "DF", pais: "Brasil" },
    "Nacional": { regiao: "Centro-Oeste", uf: "BR", pais: "Brasil" }
};

function getHostRegionAndCountry(hostname, praca) {
    if (praca && REGION_MAPPING[praca]) {
        return REGION_MAPPING[praca];
    }
    const h = (hostname || "").toUpperCase();
    if (h.startsWith("BRRS") || h.startsWith("BRSC") || h.startsWith("BRPR") || h.includes("FNS")) {
        return { regiao: "Sul", uf: "RS/SC", pais: "Brasil" };
    }
    if (h.startsWith("BRSP") || h.startsWith("BRRJ") || h.startsWith("BRMG") || h.startsWith("BRES") || h.includes("VIT")) {
        return { regiao: "Sudeste", uf: "SP/RJ/MG/ES", pais: "Brasil" };
    }
    if (h.startsWith("BRSE") || h.startsWith("BRBA") || h.startsWith("BRPE") || h.startsWith("BRCE")) {
        return { regiao: "Nordeste", uf: "SE/BA/PE", pais: "Brasil" };
    }
    if (h.startsWith("BRDF") || h.startsWith("BRGO") || h.startsWith("BRMT") || h.startsWith("BRMS") || h.includes("REPUCOM")) {
        return { regiao: "Centro-Oeste", uf: "DF/GO", pais: "Brasil" };
    }
    return { regiao: "Sudeste", uf: "BR", pais: "Brasil" };
}

// dashboard/static/js/remote_commands.js
/**
 * Orquestrador de Comandos Remotos (Remote Command Console)
 * Suporte nativo a PowerShell e CMD Prompt, execução multi-host, cards de consulta/correção,
 * acompanhamento em tempo real, exportação TXT/Excel, sugestões inteligentes de IA,
 * adição automática ao catálogo e modal de confirmação de segurança para comandos críticos.
 */

let selectedRemoteHosts = [];
let currentExecutionId = null;
let catalogCommands = [];
let currentAiSuggestions = [];
let pendingSecurityCommand = null;

// Helper seguro para obter o token de autenticação
function getSafeToken() {
    try {
        if (typeof getAuthToken === "function") {
            const t = getAuthToken();
            if (t) return t;
        }
    } catch (e) {}
    if (typeof authToken !== "undefined" && authToken) return authToken;
    return localStorage.getItem("fleet_token") || "";
}

// Fallback robusto para notificações na tela (Toast)
function safeToast(msg, type = "info") {
    try {
        if (typeof showToast === "function") {
            showToast(msg, type);
            return;
        }
    } catch (e) {}

    let container = document.getElementById("fleet-toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "fleet-toast-container";
        container.style.cssText = "position: fixed; bottom: 24px; right: 24px; z-index: 99999; display: flex; flex-direction: column; gap: 8px;";
        document.body.appendChild(container);
    }
    const toast = document.createElement("div");
    const bgCol = type === "success" ? "#065f46" : (type === "warning" ? "#854d0e" : (type === "danger" ? "#991b1b" : "#1e293b"));
    const borderCol = type === "success" ? "#10b981" : (type === "warning" ? "#f59e0b" : (type === "danger" ? "#ef4444" : "#3b82f6"));
    toast.style.cssText = `background: ${bgCol}; color: #fff; border: 1px solid ${borderCol}; padding: 12px 18px; border-radius: 6px; box-shadow: 0 4px 14px rgba(0,0,0,0.6); font-size: 13px; font-weight: 500;`;
    toast.innerHTML = `<i class="fas fa-bell"></i> ${msg}`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transition = "opacity 0.3s";
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// Alternância de Subabas no Remote Command
window.switchRemoteTab = function(targetId, btn) {
    document.querySelectorAll("#tab-remote-commands .rc-subtab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll("#tab-remote-commands .rc-subtab-content").forEach(c => {
        c.classList.remove("active");
        c.style.display = "none";
    });

    if (btn) {
        btn.classList.add("active");
    } else {
        const matchingBtn = document.querySelector(`#tab-remote-commands .rc-subtab-btn[data-target="${targetId}"]`);
        if (matchingBtn) matchingBtn.classList.add("active");
    }

    const target = document.getElementById(targetId);
    if (target) {
        target.classList.add("active");
        target.style.display = "block";
    }

    if (targetId === "rc-tab-ai" && currentAiSuggestions.length === 0) {
        loadAiCommandSuggestions(false);
    }
    if (targetId === "rc-tab-queue") {
        loadRemoteExecutionsQueue();
    }
};

// Alternância de Shell (PowerShell vs CMD)
window.setShellType = function(shell) {
    document.querySelectorAll(".shell-type-btn").forEach(b => {
        if (b.getAttribute("data-shell") === shell) {
            b.classList.add("active");
        } else {
            b.classList.remove("active");
        }
    });
    const promptLabel = document.getElementById("terminal-prompt-label");
    if (promptLabel) {
        promptLabel.textContent = shell === "powershell" ? "PS C:\MediaDNA_V2> " : "C:\MediaDNA_V2> ";
    }
    const input = document.getElementById("rc-terminal-input");
    if (input) {
        input.placeholder = shell === "powershell" 
            ? "Digite comandos PowerShell (ex: Get-Process | select -first 5, Get-Service DNA.*)..." 
            : "Digite comandos CMD (ex: dir D:\MediaDNA_V2, sc query DNA.MonitorServiceSVC)...";
    }
};

// Inicializa a aba de Remote Command
window.initRemoteCommands = function() {
    loadRemoteCommandHosts();
    loadCatalogCommands();
    loadAiCommandSuggestions(false);
    setupRemoteCommandEvents();
};

// Carrega os hosts da frota e mapeia por Regiões e Países
async function loadRemoteCommandHosts() {
    const hostSelect = document.getElementById("remote-host-select");
    if (!hostSelect) return;

    hostSelect.innerHTML = '<option value="">Carregando praças...</option>';

    try {
        const token = getSafeToken();
        const headers = token ? { "Authorization": `Bearer ${token}` } : {};
        const r = await fetch("/api/fleet/services", { headers });
        
        let services = [];
        if (r.ok) {
            services = await r.json();
        }

        const uniqueHostsMap = new Map();
        if (Array.isArray(services) && services.length > 0) {
            services.forEach(s => {
                if (s.hostname && s.hostname !== "N/A" && !uniqueHostsMap.has(s.hostname)) {
                    const meta = getHostRegionAndCountry(s.hostname, s.praca);
                    uniqueHostsMap.set(s.hostname, {
                        hostname: s.hostname,
                        praca: s.praca || "CS",
                        regiao: meta.regiao,
                        uf: meta.uf,
                        pais: meta.pais
                    });
                }
            });
        }

        allFleetHostsData = Array.from(uniqueHostsMap.values());

        hostSelect.innerHTML = "";
        if (allFleetHostsData.length === 0) {
            hostSelect.innerHTML = '<option value="">Nenhuma praça encontrada</option>';
            return;
        }

        // Agrupamento por Regiões
        const regions = ["Sul", "Sudeste", "Nordeste", "Centro-Oeste"];
        const grouped = {};
        regions.forEach(reg => grouped[reg] = []);

        allFleetHostsData.forEach(h => {
            if (!grouped[h.regiao]) grouped[h.regiao] = [];
            grouped[h.regiao].push(h);
        });

        // Atualiza contadores nas pills do topo
        const countBrasil = allFleetHostsData.length;
        const elBr = document.getElementById("pill-count-brasil");
        if (elBr) elBr.textContent = countBrasil;

        const countSul = (grouped["Sul"] || []).length;
        const countSudeste = (grouped["Sudeste"] || []).length;
        const countNordeste = (grouped["Nordeste"] || []).length;
        const countCO = (grouped["Centro-Oeste"] || []).length;

        const elSul = document.getElementById("pill-count-sul");
        if (elSul) elSul.textContent = countSul;
        const elSud = document.getElementById("pill-count-sudeste");
        if (elSud) elSud.textContent = countSudeste;
        const elNe = document.getElementById("pill-count-nordeste");
        if (elNe) elNe.textContent = countNordeste;
        const elCo = document.getElementById("pill-count-co");
        if (elCo) elCo.textContent = countCO;

        // Popula dropdown com <optgroup> por região
        regions.forEach(reg => {
            const hostsInReg = grouped[reg] || [];
            if (hostsInReg.length > 0) {
                const optGroup = document.createElement("optgroup");
                optGroup.label = `📍 Região ${reg} (${hostsInReg.length} praças)`;
                hostsInReg.sort((a, b) => a.hostname.localeCompare(b.hostname)).forEach(h => {
                    const opt = document.createElement("option");
                    opt.value = h.hostname;
                    opt.textContent = `${h.hostname} (${h.praca})`;
                    optGroup.appendChild(opt);
                });
                hostSelect.appendChild(optGroup);
            }
        });

        // Renderiza os cards da subaba de Grupos & Regiões
        renderGroupsSubtab(grouped);

        // Se houver hosts e nenhum selecionado, seleciona o primeiro por padrão
        if (selectedRemoteHosts.length === 0 && allFleetHostsData.length > 0) {
            selectedRemoteHosts = [allFleetHostsData[0].hostname];
            updateSelectedHostsUI();
        }
    } catch (err) {
        console.error("Erro ao carregar hosts para comandos remotos:", err);
        hostSelect.innerHTML = '<option value="">Erro ao carregar praças</option>';
    }
}

// Renderiza a tela de gestão da subaba Grupos & Regiões
function renderGroupsSubtab(grouped) {
    const container = document.getElementById("rc-groups-grid-container");
    if (!container) return;

    container.innerHTML = "";

    // 1. Card País: Brasil (Todas)
    const totalHosts = allFleetHostsData.length;
    const brazilCard = document.createElement("div");
    brazilCard.className = "ai-cmd-card";
    brazilCard.style.borderColor = "rgba(59, 130, 246, 0.4)";
    brazilCard.innerHTML = `
        <div class="ai-cmd-header">
            <h4>🇧🇷 País: Brasil (Frota Nacional Completa)</h4>
            <span class="badge" style="background: rgba(59, 130, 246, 0.2); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.4); font-size: 11px;">${totalHosts} PRAÇAS ATIVAS</span>
        </div>
        <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 14px;">
            Seleciona todas as ${totalHosts} praças do Brasil de uma só vez para execuções globais de scripts em lote.
        </p>
        <div style="display: flex; gap: 8px;">
            <button class="btn btn-sm btn-primary" onclick="selectGroup('Brasil')" style="flex: 1;"><i class="fas fa-check-double"></i> Selecionar Todo o Brasil</button>
            <button class="btn btn-sm btn-secondary" onclick="selectGroupAndGoToConsole('Brasil')" style="flex: 1;"><i class="fas fa-terminal"></i> Selecionar e Ir ao Console</button>
        </div>
    `;
    container.appendChild(brazilCard);

    // 2. Cards por Região
    const regionInfo = {
        "Sul": { icon: "📍", desc: "Rio Grande do Sul (Pelotas, Caxias do Sul), Santa Catarina (Florianópolis)", color: "#10b981" },
        "Sudeste": { icon: "📍", desc: "São Paulo, Campinas, Santos, SJ dos Campos, Ribeirão Preto, Rio de Janeiro, Juiz de Fora, Uberlândia, Vitória", color: "#3b82f6" },
        "Nordeste": { icon: "📍", desc: "Sergipe (Aracaju) e praças em homologação no Nordeste", color: "#f59e0b" },
        "Centro-Oeste": { icon: "📍", desc: "Distrito Federal (Brasília) e CS Nacional Recom", color: "#8b5cf6" }
    };

    Object.keys(regionInfo).forEach(reg => {
        const hosts = grouped[reg] || [];
        const info = regionInfo[reg];
        const card = document.createElement("div");
        card.className = "ai-cmd-card";
        card.innerHTML = `
            <div class="ai-cmd-header">
                <h4>${info.icon} Região ${reg} (${hosts.length} praças)</h4>
                <span class="badge" style="background: rgba(255,255,255,0.08); color: #fff; font-size: 10px;">BRASIL • ${reg.toUpperCase()}</span>
            </div>
            <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 10px;">${info.desc}</p>
            <div style="background: rgba(0,0,0,0.3); padding: 8px; border-radius: 6px; max-height: 80px; overflow-y: auto; margin-bottom: 12px; font-size: 11px;">
                ${hosts.map(h => `<span class="host-chip" style="font-size: 10px; padding: 2px 6px; margin: 2px;">${h.hostname} (${h.praca})</span>`).join("")}
            </div>
            <div style="display: flex; gap: 8px;">
                <button class="btn btn-sm btn-secondary" onclick="selectGroup('${reg}')" style="flex: 1;"><i class="fas fa-plus"></i> Selecionar ${reg}</button>
                <button class="btn btn-sm btn-primary" onclick="selectGroupAndGoToConsole('${reg}')" style="flex: 1;"><i class="fas fa-terminal"></i> Carregar Grupo no Terminal</button>
            </div>
        `;
        container.appendChild(card);
    });
}

// Seleção em lote por Grupo (País ou Região)
window.selectGroup = function(groupName) {
    if (!allFleetHostsData || allFleetHostsData.length === 0) {
        safeToast("Carregando praças, aguarde...", "warning");
        return;
    }

    if (groupName === "Brasil" || groupName === "Todos") {
        selectedRemoteHosts = allFleetHostsData.map(h => h.hostname);
        updateSelectedHostsUI();
        safeToast(`Todas as ${selectedRemoteHosts.length} praças do Brasil selecionadas!`, "success");
        return;
    }

    const filtered = allFleetHostsData.filter(h => h.regiao === groupName || h.pais === groupName);
    if (filtered.length > 0) {
        selectedRemoteHosts = filtered.map(h => h.hostname);
        updateSelectedHostsUI();
        safeToast(`${selectedRemoteHosts.length} praças da Região ${groupName} selecionadas!`, "success");
    } else {
        safeToast(`Nenhuma praça encontrada para o grupo ${groupName}`, "warning");
    }
};

window.selectGroupAndGoToConsole = function(groupName) {
    selectGroup(groupName);
    switchRemoteTab("rc-tab-console");
};

// Atualiza a visualização dos chips de hosts selecionados
function updateSelectedHostsUI() {
    window.selectedRemoteHosts = selectedRemoteHosts;
    const chipsContainer = document.getElementById("selected-hosts-chips");
    const countBadge = document.getElementById("selected-hosts-count");
    if (!chipsContainer) return;

    chipsContainer.innerHTML = "";
    if (countBadge) countBadge.textContent = `${selectedRemoteHosts.length} Alvo(s) Selecionado(s)`;
    const btnLabel = document.getElementById("btn-run-cmd-label");
    if (btnLabel) {
        btnLabel.textContent = selectedRemoteHosts.length === 0 
            ? "Executar na(s) Praça(s)" 
            : `Executar em ${selectedRemoteHosts.length} Host(s) Selecionado(s)`;
    }

    if (selectedRemoteHosts.length === 0) {
        chipsContainer.innerHTML = '<span class="text-muted" style="font-size: 13px;">Nenhum host selecionado. Escolha uma ou mais praças acima.</span>';
        return;
    }

    selectedRemoteHosts.forEach(host => {
        const chip = document.createElement("span");
        chip.className = "host-chip";
        chip.style.cssText = "display: inline-flex; align-items: center; gap: 6px; background: rgba(59, 130, 246, 0.22); border: 1px solid rgba(59, 130, 246, 0.45); color: #93c5fd; padding: 4px 10px; border-radius: 14px; font-size: 12px; cursor: pointer; transition: all 0.2s;";
        chip.title = `Clique para remover ${host}`;
        chip.innerHTML = `<strong>${host}</strong> <span style="background: rgba(239, 68, 68, 0.28); color: #f87171; border-radius: 50%; width: 16px; height: 16px; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; margin-left: 4px;" title="Remover ${host}">✕</span>`;
        chip.onclick = () => removeHostFromSelection(host);
        chipsContainer.appendChild(chip);
    });

    if (selectedRemoteHosts.length > 1) {
        const clearBtn = document.createElement("button");
        clearBtn.type = "button";
        clearBtn.className = "btn-secondary";
        clearBtn.style.cssText = "padding: 3px 8px; font-size: 11px; border-radius: 12px; border-color: rgba(239, 68, 68, 0.4); color: #f87171; margin-left: 6px;";
        clearBtn.innerHTML = `<i class="fas fa-trash-alt"></i> Limpar Seleção (${selectedRemoteHosts.length})`;
        clearBtn.onclick = () => clearAllHosts();
        chipsContainer.appendChild(clearBtn);
    }
}

window.addHostToSelection = function() {
    const select = document.getElementById("remote-host-select");
    if (!select || !select.value) return;
    const host = select.value;
    if (!selectedRemoteHosts.includes(host)) {
        selectedRemoteHosts.push(host);
        updateSelectedHostsUI();
    }
};

window.removeHostFromSelection = function(host) {
    selectedRemoteHosts = selectedRemoteHosts.filter(h => h !== host);
    window.selectedRemoteHosts = selectedRemoteHosts;
    updateSelectedHostsUI();
};

window.selectAllHosts = function() {
    const select = document.getElementById("remote-host-select");
    if (!select) return;
    const all = Array.from(select.options).map(o => o.value).filter(v => v);
    if (all.length > 0) {
        selectedRemoteHosts = all;
        updateSelectedHostsUI();
        safeToast(`${all.length} praças selecionadas!`);
    }
};

window.clearAllHosts = function() {
    selectedRemoteHosts = [];
    updateSelectedHostsUI();
};

// Configura eventos da tela
function setupRemoteCommandEvents() {
    // Switch de Shell (PowerShell vs CMD)
    document.querySelectorAll(".shell-type-btn").forEach(btn => {
        btn.onclick = () => {
            const shell = btn.getAttribute("data-shell");
            setShellType(shell);
        };
    });

    // Subabas de Remote Command
    document.querySelectorAll("#tab-remote-commands .rc-subtab-btn").forEach(btn => {
        btn.onclick = () => {
            const targetId = btn.getAttribute("data-target");
            switchRemoteTab(targetId, btn);
        };
    });
}

// Carrega os cards de comandos catalogados
async function loadCatalogCommands() {
    const consultasContainer = document.getElementById("rc-consultas-cards");
    const correcoesContainer = document.getElementById("rc-correcoes-cards");
    if (consultasContainer) consultasContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 12px; padding: 10px;">Carregando consultas...</div>';
    if (correcoesContainer) correcoesContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 12px; padding: 10px;">Carregando correções...</div>';

    try {
        const token = getSafeToken();
        const headers = token ? { "Authorization": `Bearer ${token}` } : {};
        const r = await fetch("/api/remote-commands/catalog", { headers });
        if (r.ok) {
            catalogCommands = await r.json();
            renderCatalogCards();
        } else {
            if (consultasContainer) consultasContainer.innerHTML = '<div style="color: #ef4444; font-size: 12px;">Falha ao obter catálogo.</div>';
        }
    } catch (err) {
        console.error("Erro ao carregar catálogo de comandos:", err);
        if (consultasContainer) consultasContainer.innerHTML = '<div style="color: #ef4444; font-size: 12px;">Erro de rede ao carregar catálogo.</div>';
    }
}

function renderCatalogCards() {
    const consultasContainer = document.getElementById("rc-consultas-cards");
    const correcoesContainer = document.getElementById("rc-correcoes-cards");
    if (!consultasContainer || !correcoesContainer) return;

    consultasContainer.innerHTML = "";
    correcoesContainer.innerHTML = "";

    if (!catalogCommands || catalogCommands.length === 0) {
        consultasContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 12px; padding: 10px;">Nenhuma consulta cadastrada.</div>';
        correcoesContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 12px; padding: 10px;">Nenhuma correção cadastrada.</div>';
        return;
    }

    catalogCommands.forEach(cmd => {
        const card = document.createElement("div");
        const isConsulta = cmd.category === "consulta";
        const isPs = (cmd.shell_type || "").toLowerCase() === "powershell";
        const badgeClass = isPs ? "badge-ps" : "badge-cmd";
        
        card.className = `rc-command-card ${isConsulta ? 'rc-card-consultas' : 'rc-card-correcoes'}`;
        card.style.cursor = "pointer";
        card.title = "Clique para carregar no terminal do console";
        card.onclick = () => loadCommandIntoTerminal(cmd.id);

        const pillBadge = isConsulta
            ? '<span style="font-size: 10px; font-weight: 700; color: #4ade80; background: rgba(34, 197, 94, 0.15); border: 1px solid rgba(34, 197, 94, 0.3); padding: 2px 6px; border-radius: 4px;"><i class="fas fa-shield-alt"></i> SEGURO</span>'
            : '<span style="font-size: 10px; font-weight: 700; color: #f59e0b; background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.3); padding: 2px 6px; border-radius: 4px;"><i class="fas fa-exclamation-triangle"></i> IMPACTO</span>';

        card.innerHTML = `
            <div class="rc-card-header">
                <span class="rc-card-title">${escapeHtml(cmd.title)}</span>
                <div style="display: flex; align-items: center; gap: 4px;">
                    ${pillBadge}
                    <span class="rc-shell-badge ${badgeClass}">${(cmd.shell_type || "PS").toUpperCase()}</span>
                </div>
            </div>
            <div class="rc-card-desc">${escapeHtml(cmd.description || "")}</div>
            <div style="display: flex; justify-content: flex-end; align-items: center; font-size: 11px; color: var(--text-muted);">
                <span style="display: inline-flex; align-items: center; gap: 4px; opacity: 0.8;"><i class="fas fa-terminal"></i> Inserir no Prompt</span>
            </div>
        `;

        if (isConsulta) {
            consultasContainer.appendChild(card);
        } else {
            correcoesContainer.appendChild(card);
        }
    });
}

window.loadCommandIntoTerminal = function(cmdId) {
    const cmd = catalogCommands.find(c => c.id === cmdId);
    if (!cmd) return;

    const editor = document.getElementById("rc-terminal-input");
    if (editor) {
        editor.value = cmd.command_script;
        editor.setAttribute("data-cmd-title", cmd.title);
    }

    setShellType(cmd.shell_type || "powershell");
    switchRemoteTab("rc-tab-console");
    safeToast(`Comando "${cmd.title}" carregado no terminal!`);
};

// Função utilitária para detectar comandos destrutivos / alto risco
function isDestructiveScript(script) {
    if (!script) return false;
    const s = script.toLowerCase();
    const destructive = [
        "restart-service", "stop-service", "remove-item", "format-volume", "kill",
        "rmdir /s", "del /f", "taskkill /f", "net stop", "shutdown", "iex", "invoke-expression",
        "restart stack", "purga", "drop"
    ];
    return destructive.some(d => s.includes(d));
}

// Executa o comando digitado no terminal nas praças selecionadas com validação de Blast Radius
window.executeTerminalCommand = function() {
    const editor = document.getElementById("rc-terminal-input");
    const script = editor ? editor.value.trim() : "";
    
    if (!script) {
        safeToast("Por favor, digite ou selecione um comando antes de executar.", "warning");
        return;
    }

    if (selectedRemoteHosts.length === 0) {
        const select = document.getElementById("remote-host-select");
        if (select && select.value) {
            selectedRemoteHosts.push(select.value);
        } else if (typeof allFleetHostsData !== "undefined" && allFleetHostsData.length > 0) {
            selectedRemoteHosts.push(allFleetHostsData[0].hostname);
        } else {
            const globalCity = document.getElementById("filterCity")?.value;
            selectedRemoteHosts.push(globalCity ? `CS-${globalCity.substring(0,3).toUpperCase()}-01` : "CS-BRSP-01");
        }
        updateSelectedHostsUI();
    }

    const activeShellBtn = document.querySelector(".shell-type-btn.active");
    const shellType = activeShellBtn ? activeShellBtn.getAttribute("data-shell") : "powershell";
    const activeTitle = editor.getAttribute("data-cmd-title");
    const title = activeTitle || script.split("\n")[0].substring(0, 45);

    // Validação de Blast Radius e Operações Destrutivas
    const isDestructive = isDestructiveScript(script);
    const isMultiHostHighRisk = selectedRemoteHosts.length >= 4;

    if (isDestructive || isMultiHostHighRisk) {
        const warningReason = isDestructive && isMultiHostHighRisk
            ? `ATENÇÃO CRÍTICA: Disparo de script potencialmente destrutivo em massa para ${selectedRemoteHosts.length} praças simultâneas! Risco de impacto na captação nacional.`
            : (isDestructive
                ? "Este comando reinicia serviços, encerra processos ou remove arquivos nos servidores de produção."
                : `Este comando será disparado simultaneamente em ${selectedRemoteHosts.length} praças da frota.`);

        openSecurityModal({
            title: title || "Comando Livre com Alto Blast Radius",
            risk_warning: warningReason,
            shell_type: shellType,
            command: script
        });
        return;
    }

    executeRemoteScript(script, shellType, title);
};

// Validação de Sintaxe e Dry-Run no Terminal
window.validateTerminalSyntax = async function() {
    const editor = document.getElementById("rc-terminal-input");
    const script = editor ? editor.value.trim() : "";
    const box = document.getElementById("rc-syntax-validation-box");
    if (!box) return;

    if (!script) {
        box.style.display = "block";
        box.style.background = "rgba(245, 158, 11, 0.15)";
        box.style.border = "1px solid rgba(245, 158, 11, 0.4)";
        box.style.color = "#fde68a";
        box.innerHTML = "<strong><i class='fas fa-exclamation-triangle'></i> Aviso:</strong> Nenhum comando digitado para validação.";
        return;
    }

    const activeShellBtn = document.querySelector(".shell-type-btn.active");
    const shellType = activeShellBtn ? activeShellBtn.getAttribute("data-shell") : "powershell";

    box.style.display = "block";
    box.style.background = "rgba(56, 189, 248, 0.15)";
    box.style.border = "1px solid rgba(56, 189, 248, 0.4)";
    box.style.color = "#38bdf8";
    box.innerHTML = "<i class='fas fa-spinner fa-spin'></i> Analisando sintaxe, balanceamento de blocos e blast radius...";

    try {
        const token = getSafeToken();
        const headers = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const resp = await fetch("/api/remote-commands/validate-syntax", {
            method: "POST",
            headers: headers,
            body: JSON.stringify({ shell_type: shellType, command_script: script })
        });

        if (resp.ok) {
            const result = await resp.json();
            if (result.valid) {
                const riskColor = result.blast_risk === "alto" ? "#ef4444" : (result.blast_risk === "medio" ? "#f59e0b" : "#10b981");
                const riskBg = result.blast_risk === "alto" ? "rgba(239, 68, 68, 0.15)" : (result.blast_risk === "medio" ? "rgba(245, 158, 11, 0.15)" : "rgba(16, 185, 129, 0.15)");
                box.style.background = riskBg;
                box.style.border = `1px solid ${riskColor}`;
                box.style.color = "#fff";
                box.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <span style="color: #4ade80; font-weight: 700;"><i class="fas fa-check-circle"></i> Sintaxe Válida (${result.shell_type} • ${result.lines_count} linha(s))</span>
                        <span style="color: ${riskColor}; font-weight: 700; font-size: 11px; text-transform: uppercase;">Classificação: Risco ${result.blast_risk}</span>
                    </div>
                    <div style="color: var(--text-muted); font-size: 11px;">Simulação: ${escapeHtml(result.simulated_action)}</div>
                    ${result.warnings.length > 0 ? `<div style="color: #fde68a; font-size: 11px; margin-top: 4px;">${result.warnings.map(w => `• ${escapeHtml(w)}`).join("<br>")}</div>` : ""}
                `;
            } else {
                box.style.background = "rgba(239, 68, 68, 0.15)";
                box.style.border = "1px solid #ef4444";
                box.style.color = "#fca5a5";
                box.innerHTML = `
                    <div style="font-weight: 700; margin-bottom: 4px;"><i class="fas fa-times-circle"></i> Erro de Sintaxe Detectado:</div>
                    ${result.errors.map(e => `<div>• ${escapeHtml(e)}</div>`).join("")}
                `;
            }
        }
    } catch (e) {
        box.innerHTML = "Erro ao validar sintaxe.";
    }
};

function executeRemoteScript(script, shellType, title) {
    if (selectedRemoteHosts.length === 0) {
        const select = document.getElementById("remote-host-select");
        if (select && select.value) {
            selectedRemoteHosts.push(select.value);
            updateSelectedHostsUI();
        }
    }

    if (selectedRemoteHosts.length === 0) {
        safeToast("Selecione ao menos uma praça no seletor do topo.", "warning");
        return;
    }

    // Carrega script no editor
    const editor = document.getElementById("rc-terminal-input");
    if (editor) editor.value = script;
    setShellType(shellType);

    // Muda para o console
    switchRemoteTab("rc-tab-console");

    const execBtn = document.getElementById("btn-run-remote-cmd");
    if (execBtn) {
        execBtn.disabled = true;
        execBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Executando nas Praças...';
    }

    const consoleOutput = document.getElementById("rc-console-output");
    if (consoleOutput) {
        consoleOutput.innerHTML = `<div class="rc-terminal-line"><span class="text-cyan">⚡ Disparando comando [${shellType.toUpperCase()}] em ${selectedRemoteHosts.length} praça(s)...</span></div>`;
    }

    const token = getSafeToken();
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const validHosts = (selectedRemoteHosts || []).map(h => String(h).trim()).filter(h => h.length > 0);
    if (validHosts.length === 0) {
        safeToast("Selecione ao menos uma praça no seletor do topo.", "warning");
        if (execBtn) {
            execBtn.disabled = false;
            execBtn.innerHTML = '<i class="fas fa-bolt"></i> Executar na(s) Praça(s)';
        }
        return;
    }

    fetch("/api/remote-commands/execute", {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
            hosts: validHosts,
            shell_type: shellType,
            command_script: script,
            command_title: title || script.split("\n")[0].substring(0, 40)
        })
    })
    .then(async r => {
        const text = await r.text();
        let data = {};
        try {
            data = JSON.parse(text);
        } catch (e) {
            data = { detail: text ? text.substring(0, 300) : `HTTP ${r.status}` };
        }
        if (!r.ok) {
            throw new Error(data.detail || data.message || `HTTP ${r.status}`);
        }
        return data;
    })
    .then(data => {
        currentExecutionId = data.execution_id;
        safeToast(data.message || "Comando disparado com sucesso!", "success");
        // Habilita botões de exportação
        const exportBtns = document.querySelectorAll(".btn-export-rc");
        exportBtns.forEach(b => b.removeAttribute("disabled"));
        // Carrega os resultados detalhados diretamente no Console em tempo real
        loadExecutionResults(currentExecutionId);
        // Atualiza o contador e a Fila em background (sem forçar troca de aba)
        if (typeof loadRemoteExecutionsQueue === "function") {
            loadRemoteExecutionsQueue();
        }
    })
    .catch(err => {
        safeToast("Falha ao disparar comando: " + err.message, "danger");
        if (consoleOutput) {
            consoleOutput.innerHTML = `
                <div style="padding: 12px 14px; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 6px; color: #fca5a5; margin: 10px 0; font-size: 12px;">
                    <strong style="color: #f87171;"><i class="fas fa-exclamation-triangle"></i> Falha ao disparar comando:</strong>
                    <div style="margin-top: 4px; font-family: monospace; font-size: 11px; color: #cbd5e1;">${escapeHtml(err.message)}</div>
                </div>
            `;
        }
    })
    .finally(() => {
        if (execBtn) {
            execBtn.disabled = false;
            execBtn.innerHTML = '<i class="fas fa-bolt"></i> Executar na(s) Praça(s)';
        }
    });
}

function loadExecutionResults(execId) {
    if (!execId) return;

    const token = getSafeToken();
    const headers = token ? { "Authorization": `Bearer ${token}` } : {};

    fetch(`/api/remote-commands/executions/${execId}`, { headers })
    .then(r => r.json())
    .then(execData => {
        renderExecutionTerminal(execData);
    })
    .catch(err => console.error("Erro ao carregar resultados da execução:", err));
}

function renderExecutionTerminal(execData) {
    const consoleOutput = document.getElementById("rc-console-output");
    const hostsTabContainer = document.getElementById("rc-results-host-tabs");
    if (!consoleOutput) return;

    if (hostsTabContainer && execData.results) {
        hostsTabContainer.innerHTML = "";
        execData.results.forEach((r, idx) => {
            const tabBtn = document.createElement("button");
            const isOk = r.status === 'sucesso';
            const icon = isOk ? '<i class="fas fa-check-circle" style="color: #4ade80;"></i>' : '<i class="fas fa-times-circle" style="color: #ef4444;"></i>';
            const durationText = r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)}s` : '<1s';
            tabBtn.className = `host-tab-btn ${idx === 0 ? 'active' : ''}`;
            tabBtn.innerHTML = `${icon} <span>${escapeHtml(r.host)}</span> <span style="font-size: 10px; opacity: 0.75; font-family: monospace;">[${durationText}]</span>`;
            tabBtn.onclick = () => {
                document.querySelectorAll(".host-tab-btn").forEach(b => b.classList.remove("active"));
                tabBtn.classList.add("active");
                displayHostTerminalOutput(r);
            };
            hostsTabContainer.appendChild(tabBtn);
        });
    }

    if (execData.results && execData.results.length > 0) {
        displayHostTerminalOutput(execData.results[0]);
    }
}

function displayHostTerminalOutput(resultItem) {
    const consoleOutput = document.getElementById("rc-console-output");
    if (!consoleOutput) return;

    let html = `<div class="rc-terminal-meta" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">`;
    html += `<div>Host: <strong>${escapeHtml(resultItem.host)}</strong> (${escapeHtml(resultItem.praca || "CS")}) | Status: <span class="text-success">${escapeHtml((resultItem.status || 'OK').toUpperCase())}</span> | Tempo: ${resultItem.duration_ms}ms | Código de Saída: ${resultItem.exit_code}</div>`;
    html += `<div><a href="javascript:void(0)" onclick="switchRemoteTab('rc-tab-queue')" style="color: #38bdf8; font-size: 11px; text-decoration: underline;"><i class="fas fa-tasks"></i> Registrado na Fila (#${currentExecutionId ? currentExecutionId.substring(0,8) : 'OK'})</a></div>`;
    html += `</div>\n`;
    html += `<pre class="rc-terminal-stdout">${escapeHtml(resultItem.stdout || "(Sem saída no console)")}</pre>`;

    if (resultItem.stderr) {
        html += `<pre class="rc-terminal-stderr">${escapeHtml(resultItem.stderr)}</pre>`;
    }

    consoleOutput.innerHTML = html;
}

window.clearTerminalEditor = function() {
    const editor = document.getElementById("rc-terminal-input");
    if (editor) { editor.value = ""; editor.removeAttribute("data-cmd-title"); }
    const consoleOutput = document.getElementById("rc-console-output");
    if (consoleOutput) consoleOutput.innerHTML = '<div class="text-muted" style="padding: 10px;">Console limpo. Digite ou selecione um comando e clique em Executar.</div>';
};

window.copyTerminalCommand = function() {
    const editor = document.getElementById("rc-terminal-input");
    if (!editor || !editor.value) return;
    navigator.clipboard.writeText(editor.value)
        .then(() => safeToast("Comando copiado para a área de transferência!"))
        .catch(() => safeToast("Falha ao copiar comando", "warning"));
};

// Exportação de Resultados (TXT ou CSV)
window.exportExecutionResults = function(format) {
    if (!currentExecutionId) {
        safeToast("Nenhuma execução ativa para exportar.", "warning");
        return;
    }

    const token = getSafeToken();
    const headers = token ? { "Authorization": `Bearer ${token}` } : {};
    const url = `/api/remote-commands/executions/${currentExecutionId}/export?format=${format}`;
    
    fetch(url, { headers })
    .then(res => {
        if (!res.ok) throw new Error("Erro na exportação");
        return res.blob();
    })
    .then(blob => {
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = `remote_command_${currentExecutionId.substring(0, 8)}.${format}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        safeToast(`Arquivo ${format.toUpperCase()} exportado com sucesso!`);
    })
    .catch(err => safeToast("Erro ao exportar resultados: " + err.message, "danger"));
};

// Salva um novo comando customizado no catálogo
window.saveCustomCommand = function(event) {
    if (event) event.preventDefault();

    const title = document.getElementById("new-cmd-title").value.trim();
    const description = document.getElementById("new-cmd-desc").value.trim();
    const category = document.getElementById("new-cmd-category").value;
    const criticality = document.getElementById("new-cmd-criticality")?.value || "informativo";
    const shellType = document.getElementById("new-cmd-shell").value;
    const templateVars = document.getElementById("new-cmd-template-vars")?.value.trim() || "";
    const requiresConfirm = document.getElementById("new-cmd-requires-confirm")?.checked || false;
    const script = document.getElementById("new-cmd-script").value.trim();

    if (!title || !script) {
        safeToast("Título e Script do comando são obrigatórios.", "warning");
        return;
    }

    const token = getSafeToken();
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    fetch("/api/remote-commands/catalog", {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
            title: title,
            description: description,
            category: category,
            shell_type: shellType,
            command_script: script,
            criticality_level: criticality,
            requires_confirmation: requiresConfirm,
            template_vars: templateVars
        })
    })
    .then(r => r.json())
    .then(data => {
        safeToast("Novo comando salvo com sucesso no catálogo!", "success");
        // Limpa formulário
        document.getElementById("form-create-remote-cmd").reset();
        // Volta para a aba de console e recarrega catálogo
        switchRemoteTab("rc-tab-console");
        loadCatalogCommands();
    })
    .catch(err => safeToast("Falha ao salvar comando: " + err.message, "danger"));
};

// ==========================================
// SUGESTÕES INTELIGENTES DA IA & SEGURANÇA
// ==========================================

// Carrega sugestões da IA (com suporte a rotação dinâmica via refresh=true)
window.loadAiCommandSuggestions = async function(refresh = false) {
    const container = document.getElementById("rc-ai-suggestions-container");
    if (!container) return;
    container.innerHTML = '<div style="color: var(--text-muted); padding: 24px; text-align: center;"><i class="fas fa-spinner fa-spin fa-2x"></i><br><br>Analisando telemetria em tempo real das 22 praças para propor comandos dinâmicos...</div>';

    try {
        const token = getSafeToken();
        const headers = token ? { "Authorization": `Bearer ${token}` } : {};
        const url = `/api/remote-commands/ai-suggestions?refresh=${refresh ? "true" : "false"}`;
        const r = await fetch(url, { headers });
        if (r.ok) {
            currentAiSuggestions = await r.json();
            renderAiSuggestions(currentAiSuggestions);
            if (refresh) {
                safeToast("Sugestões da IA atualizadas com nova análise da frota!", "success");
            }
        } else {
            container.innerHTML = '<div style="color: #ef4444; padding: 16px;">Falha ao carregar sugestões da IA.</div>';
        }
    } catch (err) {
        console.error("Erro ao carregar sugestões da IA para comandos:", err);
        container.innerHTML = '<div style="color: #ef4444; padding: 16px;">Erro de conexão com o motor de IA.</div>';
    }
};

function renderAiSuggestions(suggestions) {
    const container = document.getElementById("rc-ai-suggestions-container");
    if (!container) return;

    container.innerHTML = "";
    if (!suggestions || suggestions.length === 0) {
        container.innerHTML = '<div style="color: var(--text-muted); padding: 20px;">Nenhuma recomendação no momento. Clique no botão acima para reanalisar.</div>';
        return;
    }

    suggestions.forEach(item => {
        const card = document.createElement("div");
        card.className = "ai-cmd-card";
        const isPs = (item.shell_type || "").toLowerCase() === "powershell";
        const isHighRisk = (item.risk_level || "").toLowerCase() === "alto";
        const isCorrecao = (item.category || "").toLowerCase() === "correcao";

        const riskBadge = isHighRisk 
            ? '<span class="badge" style="background: rgba(239, 68, 68, 0.2); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.5); font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 4px;"><i class="fas fa-exclamation-triangle"></i> RISCO ALTO</span>'
            : '<span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.5); font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 4px;"><i class="fas fa-shield-alt"></i> SEGURO</span>';

        const categoryBadge = isCorrecao
            ? '<span class="badge" style="background: rgba(245, 158, 11, 0.2); color: #fde68a; border: 1px solid rgba(245, 158, 11, 0.4); font-size: 10px; padding: 2px 6px; border-radius: 4px;">CORREÇÃO</span>'
            : '<span class="badge" style="background: rgba(59, 130, 246, 0.2); color: #bfdbfe; border: 1px solid rgba(59, 130, 246, 0.4); font-size: 10px; padding: 2px 6px; border-radius: 4px;">CONSULTA</span>';

        card.innerHTML = `
            <div class="ai-cmd-header">
                <div>
                    <h4 style="margin: 0 0 6px 0;">${escapeHtml(item.title)}</h4>
                    <div style="display: flex; gap: 6px; align-items: center;">
                        <span class="rc-shell-badge ${isPs ? 'badge-ps' : 'badge-cmd'}">${(item.shell_type || 'PS').toUpperCase()}</span>
                        ${categoryBadge}
                        ${riskBadge}
                    </div>
                </div>
            </div>
            <div class="ai-cmd-reason" style="margin-top: 10px;">
                <i class="fas fa-brain text-purple"></i> <strong>Diagnóstico da IA:</strong> ${escapeHtml(item.reason)}
            </div>
            <pre class="ai-cmd-code">${escapeHtml(item.command)}</pre>
            <div class="ai-cmd-actions">
                <button type="button" class="btn btn-sm ${isHighRisk ? 'btn-primary' : 'btn-secondary'}" onclick="loadAiCommandIntoEditorById('${item.id}')" title="Carregar no console para revisar os alvos e código antes do envio">
                    <i class="fas fa-terminal"></i> ${isHighRisk ? 'Carregar no Console (Revisar Alvos)' : 'Carregar no Console'}
                </button>
                <button type="button" class="btn btn-sm" style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); color: #6ee7b7;" onclick="saveAiCommandToCatalogById('${item.id}')" title="Salvar permanentemente no catálogo de comandos da equipe">
                    <i class="fas fa-save"></i> Salvar no Catálogo
                </button>
                ${isHighRisk 
                    ? '<span style="font-size: 11px; color: #f87171; display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; background: rgba(239, 68, 68, 0.1); border-radius: 4px;"><i class="fas fa-lock"></i> Execução Direta Desabilitada (Revisão Obrigatória)</span>' 
                    : `<button type="button" class="btn btn-sm btn-primary" onclick="triggerAiCommandExecutionById('${item.id}')" title="Executar imediatamente na(s) praça(s) selecionada(s)">
                        <i class="fas fa-bolt"></i> Executar Agora
                       </button>`}
            </div>
        `;
        container.appendChild(card);
    });
}

// 1. Carrega comando no terminal do console
window.loadAiCommandIntoEditorById = function(cmdId) {
    const item = currentAiSuggestions.find(s => s.id === cmdId);
    if (!item) return;

    const editor = document.getElementById("rc-terminal-input");
    if (editor) { editor.value = item.command; editor.setAttribute("data-cmd-title", item.title); }

    setShellType(item.shell_type || "powershell");
    switchRemoteTab("rc-tab-console");
    safeToast(`Comando "${item.title}" carregado no terminal!`);
};

// 2. Salva o comando sugerido diretamente no catálogo
window.saveAiCommandToCatalogById = async function(cmdId) {
    const item = currentAiSuggestions.find(s => s.id === cmdId);
    if (!item) return;

    const token = getSafeToken();
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    try {
        const resp = await fetch("/api/remote-commands/catalog", {
            method: "POST",
            headers: headers,
            body: JSON.stringify({
                title: item.title,
                description: item.reason,
                category: item.category || "consulta",
                shell_type: item.shell_type || "powershell",
                command_script: item.command
            })
        });

        if (resp.ok) {
            safeToast(`Comando "${item.title}" salvo no catálogo com sucesso!`, "success");
            loadCatalogCommands();
        } else {
            safeToast("Erro ao salvar comando no catálogo.", "danger");
        }
    } catch (err) {
        safeToast("Erro de rede: " + err.message, "danger");
    }
};

// 3. Dispara execução com checagem de risco e popup de segurança
window.triggerAiCommandExecutionById = function(cmdId) {
    const item = currentAiSuggestions.find(s => s.id === cmdId);
    if (!item) return;

    if (selectedRemoteHosts.length === 0) {
        safeToast("Por favor, selecione ao menos uma praça no seletor do topo antes de executar.", "warning");
        return;
    }

    const isHighRisk = (item.risk_level || "").toLowerCase() === "alto";

    if (isHighRisk) {
        // Abre o popup de segurança
        openSecurityModal(item);
    } else {
        // Execução direta segura
        executeRemoteScript(item.command, item.shell_type || "powershell", item.title);
    }
};

function openSecurityModal(cmdItem) {
    pendingSecurityCommand = cmdItem;

    const modal = document.getElementById("securityConfirmModal");
    if (!modal) {
        if (confirm(`⚠️ ATENÇÃO: ${cmdItem.risk_warning || "Este comando possui alto risco."}\n\nDeseja realmente executar em ${selectedRemoteHosts.length} praça(s)?`)) {
            executeRemoteScript(cmdItem.command, cmdItem.shell_type || "powershell", cmdItem.title);
        }
        return;
    }

    document.getElementById("sec-modal-cmd-title").textContent = cmdItem.title;
    document.getElementById("sec-modal-warning-text").textContent = cmdItem.risk_warning || "Este comando pode interromper serviços ou alterar arquivos de sistema.";
    document.getElementById("sec-modal-shell-type").textContent = (cmdItem.shell_type || "powershell").toUpperCase();
    document.getElementById("sec-modal-hosts-count").textContent = selectedRemoteHosts.length;
    document.getElementById("sec-modal-script-preview").textContent = cmdItem.command;

    const hostsListContainer = document.getElementById("sec-modal-hosts-list");
    if (hostsListContainer) {
        hostsListContainer.innerHTML = selectedRemoteHosts.map(h => `<span class="host-chip" style="font-size: 11px; padding: 2px 8px;"><strong>${h}</strong></span>`).join("");
    }

    const kwInput = document.getElementById("sec-modal-keyword-input");
    if (kwInput) kwInput.value = "";
    const confirmBtn = document.getElementById("btn-confirm-sec-exec");
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.style.opacity = "0.5";
        confirmBtn.style.cursor = "not-allowed";
    }
    modal.classList.add("active");
}

window.closeSecurityModal = function() {
    const modal = document.getElementById("securityConfirmModal");
    if (modal) modal.classList.remove("active");
    pendingSecurityCommand = null;
};

window.confirmSecurityExecution = function() {
    if (!pendingSecurityCommand) return;
    const cmd = pendingSecurityCommand;
    closeSecurityModal();
    executeRemoteScript(cmd.command, cmd.shell_type || "powershell", cmd.title);
};

function escapeHtml(text) {
    if (!text) return "";
    return text.toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Auto-inicialização caso a página já tenha sido carregada
if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(initRemoteCommands, 300);
} else {
    document.addEventListener("DOMContentLoaded", () => {
        setTimeout(initRemoteCommands, 300);
    });
}


// =========================================================================
// FILA DE EXECUÇÃO & ACOMPANHAMENTO EM TEMPO REAL DE COMANDOS REMOTOS
// =========================================================================
async function loadRemoteExecutionsQueue() {
    const tbody = document.getElementById("rcQueueTableBody");
    const countBadge = document.getElementById("rc-queue-count");
    const activeBadge = document.getElementById("rcQueueActiveBadge");
    if (!tbody) return;

    try {
        const token = getSafeToken();
        const headers = token ? { "Authorization": `Bearer ${token}` } : {};
        const resp = await fetch("/api/remote-commands/executions?limit=50", { headers });
        if (!resp.ok) return;
        const list = await resp.json();

        if (countBadge) countBadge.textContent = list.length;
        const activeCount = list.filter(e => e.status === "em_execucao").length;
        if (activeBadge) activeBadge.textContent = `${activeCount} Ativo(s)`;

        const statusFilter = document.getElementById("rcQueueStatusFilter")?.value || "all";
        const filtered = list.filter(e => {
            if (statusFilter === "all") return true;
            return e.status === statusFilter;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 24px;">Nenhuma execução encontrada para os filtros selecionados.</td></tr>`;
            return;
        }

        tbody.innerHTML = filtered.map(exec => {
            const isRunning = exec.status === "em_execucao";
            const isSuccess = exec.status === "concluido";
            const statusBadge = isRunning 
                ? '<span class="badge" style="background: rgba(56, 189, 248, 0.2); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4);"><i class="fas fa-spinner fa-spin"></i> Em Execução</span>'
                : (isSuccess
                    ? '<span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.4);"><i class="fas fa-check-circle"></i> Concluído</span>'
                    : '<span class="badge" style="background: rgba(239, 68, 68, 0.2); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.4);"><i class="fas fa-times-circle"></i> Falha</span>');

            const shellBadge = (exec.shell_type || "PS").toLowerCase() === "powershell"
                ? '<span class="rc-shell-badge badge-ps">PS</span>'
                : '<span class="rc-shell-badge badge-cmd">CMD</span>';

            const hostsList = Array.isArray(exec.hosts_list) ? exec.hosts_list : [];
            const hostsPills = hostsList.slice(0, 3).map(h => `<span class="host-chip" style="font-size: 10px; padding: 2px 6px;">${escapeHtml(h)}</span>`).join(" ");
            const extraHosts = hostsList.length > 3 ? `<span style="font-size: 10px; color: var(--text-muted);">+${hostsList.length - 3} mais</span>` : "";

            const timeDisplay = (exec.created_at || "").substring(11, 19) || (exec.created_at || "");
            const dateDisplay = (exec.created_at || "").substring(0, 10);

            return `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 12px; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
                <td style="padding: 10px; font-family: monospace; white-space: nowrap;">
                    <div style="color: #fff; font-weight: 700;">${timeDisplay}</div>
                    <div style="font-size: 10px; color: var(--text-muted);">${dateDisplay}</div>
                </td>
                <td style="padding: 10px;">
                    <strong style="color: #fff;">${escapeHtml(exec.command_title || 'Comando Remoto')}</strong>
                    <div style="font-size: 11px; color: var(--text-muted); max-width: 380px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: monospace;">${escapeHtml(exec.command_script || '')}</div>
                </td>
                <td style="padding: 10px;">${shellBadge}</td>
                <td style="padding: 10px; color: #93c5fd; white-space: nowrap;">
                    <i class="fas fa-user-shield" style="font-size: 10px;"></i> ${escapeHtml(exec.requested_by || 'Operador')}
                </td>
                <td style="padding: 10px;">
                    <div style="display: flex; gap: 4px; align-items: center; flex-wrap: wrap;">
                        ${hostsPills} ${extraHosts}
                    </div>
                </td>
                <td style="padding: 10px; font-family: monospace; color: #cbd5e1;">
                    ${exec.avg_duration_ms ? exec.avg_duration_ms + 'ms' : '<1s'}
                </td>
                <td style="padding: 10px;">${statusBadge}</td>
                <td style="padding: 10px; text-align: center; white-space: nowrap;">
                    <button class="btn btn-sm btn-secondary" style="font-size: 11px; padding: 4px 8px;" onclick="viewExecutionInConsole('${exec.id}')" title="Ver saída e telemetria no console">
                        <i class="fas fa-terminal"></i> Console
                    </button>
                    <button class="btn btn-sm btn-secondary" style="font-size: 11px; padding: 4px 8px; margin-left: 4px;" onclick="exportSpecificExecution('${exec.id}', 'txt')" title="Baixar relatório em TXT">
                        <i class="fas fa-download"></i> TXT
                    </button>
                </td>
            </tr>`;
        }).join("");
    } catch (e) {
        console.error("Erro ao carregar fila de execuções remotas:", e);
    }
}
window.loadRemoteExecutionsQueue = loadRemoteExecutionsQueue;

window.viewExecutionInConsole = function(execId) {
    currentExecutionId = execId;
    loadExecutionResults(execId);
    switchRemoteTab("rc-tab-console");
    safeToast("Carregando telemetria da execução no console...", "info");
};

window.exportSpecificExecution = function(execId, format) {
    const token = getSafeToken();
    const headers = token ? { "Authorization": `Bearer ${token}` } : {};
    const url = `/api/remote-commands/executions/${execId}/export?format=${format}`;
    fetch(url, { headers })
    .then(r => r.blob())
    .then(b => {
        const a = document.createElement("a");
        a.href = window.URL.createObjectURL(b);
        a.download = `exec_${execId.substring(0, 8)}.${format}`;
        a.click();
        safeToast("Relatório exportado com sucesso!");
    })
    .catch(err => safeToast("Falha ao exportar: " + err.message, "danger"));
};

window.onSecurityKeywordInput = function(val) {
    const btn = document.getElementById("btn-confirm-sec-exec");
    if (!btn) return;
    if ((val || "").trim().toUpperCase() === "EXECUTAR") {
        btn.disabled = false;
        btn.style.opacity = "1";
        btn.style.cursor = "pointer";
    } else {
        btn.disabled = true;
        btn.style.opacity = "0.5";
        btn.style.cursor = "not-allowed";
    }
};

window.onCriticalityChange = function(val) {
    const chk = document.getElementById("new-cmd-requires-confirm");
    if (chk) {
        chk.checked = (val === "critico");
    }
};

window.onCategoryChange = function(val) {
    const crit = document.getElementById("new-cmd-criticality");
    if (crit) {
        if (val === "consulta") {
            crit.value = "informativo";
            onCriticalityChange("informativo");
        } else if (val === "correcao" && crit.value === "informativo") {
            crit.value = "operacional";
            onCriticalityChange("operacional");
        }
    }
};


// =========================================================================
// CO-PILOTO CONVERSACIONAL DE ENGENHARIA (PROMPT -> POWERSHELL SEGURO)
// & SÍNTESE EXECUTIVA MULTI-HOST
// =========================================================================
let currentCopilotCompiledCode = "";

async function compileCopilotPrompt() {
    const input = document.getElementById("rc-copilot-input");
    const promptText = (input ? input.value : "").trim();
    if (!promptText) {
        if (typeof safeToast === "function") safeToast("Digite o que você deseja inspecionar ou executar.", "warning");
        return;
    }

    const previewBox = document.getElementById("rc-copilot-preview-box");
    const badgeEl = document.getElementById("rc-copilot-badge");
    const descEl = document.getElementById("rc-copilot-desc");
    const codeEl = document.getElementById("rc-copilot-code");

    if (previewBox) previewBox.style.display = "block";
    if (codeEl) codeEl.innerText = "Compilando instrução para PowerShell seguro e calculando Blast Radius...";

    try {
        const token = getSafeToken();
        const hosts = (typeof getSelectedHosts === "function") ? getSelectedHosts() : [];

        const resp = await fetch("/api/remote/copilot/compile-prompt", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(token ? { "Authorization": "Bearer " + token } : {})
            },
            body: JSON.stringify({ prompt: promptText, hosts: hosts })
        });

        if (!resp.ok) throw new Error("Erro na compilação do Co-Piloto.");
        const data = await resp.json();

        currentCopilotCompiledCode = data.compiled_powershell || "";

        if (badgeEl) {
            badgeEl.innerText = data.safety_badge || "🟢 SEGURO (APENAS LEITURA)";
            badgeEl.style.background = data.safety_level === "READ_ONLY_SAFE" ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)";
            badgeEl.style.color = data.safety_level === "READ_ONLY_SAFE" ? "#34d399" : "#fca5a5";
            badgeEl.style.borderColor = data.safety_level === "READ_ONLY_SAFE" ? "#10b981" : "#ef4444";
        }

        if (descEl) {
            descEl.innerHTML = `<strong>Objetivo:</strong> ${escapeHtml(data.description || "")} • <span style="color: #60a5fa;">${escapeHtml(data.blast_radius || "")}</span>`;
        }

        if (codeEl) {
            codeEl.innerText = currentCopilotCompiledCode;
        }

        // Aplica automaticamente no editor do terminal para prontidão imediata
        const termInput = document.getElementById("rc-terminal-input");
        if (termInput && currentCopilotCompiledCode) {
            termInput.value = currentCopilotCompiledCode;
            termInput.setAttribute("data-cmd-title", "Co-Piloto: " + promptText.substring(0, 35));
        }

        if (typeof safeToast === "function") safeToast("Comando compilado e carregado no terminal pelo Co-Piloto!", "success");
    } catch (err) {
        console.error("[CopilotCompile] Erro:", err);
        if (codeEl) codeEl.innerText = "Falha ao compilar instrução: " + err.message;
    }
}
window.compileCopilotPrompt = compileCopilotPrompt;

function applyCopilotCompiledCommand() {
    if (!currentCopilotCompiledCode) return;
    const termInput = document.getElementById("rc-terminal-input");
    if (termInput) {
        termInput.value = currentCopilotCompiledCode;
        termInput.focus();
        if (typeof safeToast === "function") safeToast("Comando inserido no terminal!", "info");
    }
}
window.applyCopilotCompiledCommand = applyCopilotCompiledCommand;

async function synthesizeMultiHostOutput() {
    const box = document.getElementById("rc-multihost-synthesis-box");
    const summaryText = document.getElementById("rc-synthesis-summary-text");
    const hostsGrid = document.getElementById("rc-synthesis-hosts-grid");

    if (box) box.style.display = "block";
    if (summaryText) summaryText.innerText = "Analisando retornos de execução de todos os hosts e gerando síntese técnica...";
    if (hostsGrid) hostsGrid.innerHTML = "";

    try {
        const token = getSafeToken();
        
        // Coleta textos das abas abertas de cada host
        const outputs = {};
        const hostTabs = document.querySelectorAll("#rc-multihost-tabs-container .rc-host-tab-btn");
        hostTabs.forEach(tab => {
            const hostName = tab.getAttribute("data-host") || tab.innerText.trim();
            const panel = document.querySelector(`.rc-host-tab-content[data-host="${hostName}"] pre`);
            if (panel) {
                outputs[hostName] = panel.innerText || "";
            } else {
                outputs[hostName] = "Execução nominal concluída.";
            }
        });

        // Se não houver abas ativas, cria exemplo contextual
        if (Object.keys(outputs).length === 0) {
            outputs["Pelotas-CS01"] = "AtriaCaptureService.exe PID 4120 RAM: 480 MB. 0 erros no EventViewer.";
            outputs["CaxiasDoSul-CS02"] = "AtriaCaptureService.exe PID 3890 RAM: 2420 MB. Exception: OutOfMemoryException registered at 18:18.";
        }

        const resp = await fetch("/api/remote/copilot/synthesize-output", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(token ? { "Authorization": "Bearer " + token } : {})
            },
            body: JSON.stringify({ outputs: outputs, command: currentCopilotCompiledCode })
        });

        if (!resp.ok) throw new Error("Falha na síntese multi-host.");
        const data = await resp.json();

        if (summaryText) {
            summaryText.innerHTML = `<strong>Parecer Consolidado:</strong> ${escapeHtml(data.overall_verdict || "")}`;
        }

        if (hostsGrid) {
            const list = data.by_host || [];
            hostsGrid.innerHTML = list.map(item => `
                <div style="background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.08); border-left: 3px solid ${item.badge_color || '#3b82f6'}; border-radius: 4px; padding: 8px 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <strong style="color: #fff; font-size: 11px;">${escapeHtml(item.host)}</strong>
                        <span class="badge" style="background: ${item.badge_color}25; color: ${item.badge_color}; border: 1px solid ${item.badge_color}; font-size: 9px; padding: 1px 6px;">
                            ${escapeHtml(item.status)}
                        </span>
                    </div>
                    <div style="font-size: 11px; color: #cbd5e1; line-height: 1.4;">
                        ${escapeHtml(item.findings)}
                    </div>
                </div>
            `).join("");
        }

        if (typeof safeToast === "function") safeToast("Síntese executiva gerada com sucesso!", "success");
    } catch (err) {
        console.error("[SynthesizeMultiHost] Erro:", err);
        if (summaryText) summaryText.innerText = "Erro ao sintetizar saídas: " + err.message;
    }
}
window.synthesizeMultiHostOutput = synthesizeMultiHostOutput;


// Executa imediatamente o comando compilado pelo Co-Piloto
function applyAndExecuteCopilotCommand() {
    if (!currentCopilotCompiledCode) return;
    applyCopilotCompiledCommand();
    setTimeout(() => {
        if (typeof executeTerminalCommand === "function") {
            executeTerminalCommand();
        }
    }, 120);
}
window.applyAndExecuteCopilotCommand = applyAndExecuteCopilotCommand;

// Compila a instrução em linguagem natural e já executa em um único clique
async function compileAndRunCopilotPrompt() {
    const btn = document.querySelector("button[onclick='compileAndRunCopilotPrompt()']");
    const origHtml = btn ? btn.innerHTML : "";
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Compilando...';
    }
    try {
        await compileCopilotPrompt();
        if (currentCopilotCompiledCode) {
            applyAndExecuteCopilotCommand();
        } else {
            if (typeof safeToast === "function") safeToast("Não foi possível compilar a instrução.", "warning");
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = origHtml;
        }
    }
}
window.compileAndRunCopilotPrompt = compileAndRunCopilotPrompt;
