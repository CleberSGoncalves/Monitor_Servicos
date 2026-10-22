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
    document.querySelectorAll(".rc-subtab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".rc-subtab-content").forEach(c => {
        c.classList.remove("active");
        c.style.display = "none";
    });

    if (btn) {
        btn.classList.add("active");
    } else {
        const matchingBtn = document.querySelector(`.rc-subtab-btn[data-target="${targetId}"]`);
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

// Carrega os hosts da frota disponíveis para seleção
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

        const uniqueHosts = new Map();
        if (Array.isArray(services) && services.length > 0) {
            services.forEach(s => {
                if (s.hostname && s.hostname !== "N/A" && !uniqueHosts.has(s.hostname)) {
                    uniqueHosts.set(s.hostname, s.praca || "CS");
                }
            });
        }

        hostSelect.innerHTML = "";
        if (uniqueHosts.size === 0) {
            hostSelect.innerHTML = '<option value="">Nenhuma praça encontrada</option>';
            return;
        }

        // Ordena alfabeticamente por hostname
        const sorted = Array.from(uniqueHosts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
        sorted.forEach(([hostname, praca]) => {
            const opt = document.createElement("option");
            opt.value = hostname;
            opt.textContent = `${hostname} (${praca})`;
            hostSelect.appendChild(opt);
        });

        // Se houver hosts e nenhum selecionado, seleciona o primeiro por padrão
        if (selectedRemoteHosts.length === 0 && sorted.length > 0) {
            selectedRemoteHosts = [sorted[0][0]];
            updateSelectedHostsUI();
        }
    } catch (err) {
        console.error("Erro ao carregar hosts para comandos remotos:", err);
        hostSelect.innerHTML = '<option value="">Erro ao carregar praças</option>';
    }
}

// Atualiza a visualização dos chips de hosts selecionados
function updateSelectedHostsUI() {
    const chipsContainer = document.getElementById("selected-hosts-chips");
    const countBadge = document.getElementById("selected-hosts-count");
    if (!chipsContainer) return;

    chipsContainer.innerHTML = "";
    if (countBadge) countBadge.textContent = `${selectedRemoteHosts.length} selecionado(s)`;

    if (selectedRemoteHosts.length === 0) {
        chipsContainer.innerHTML = '<span class="text-muted" style="font-size: 13px;">Nenhum host selecionado. Escolha uma ou mais praças acima.</span>';
        return;
    }

    selectedRemoteHosts.forEach(host => {
        const chip = document.createElement("span");
        chip.className = "host-chip";
        chip.innerHTML = `<strong>${host}</strong> <i class="fas fa-times" onclick="removeHostFromSelection('${host}')" title="Remover"></i>`;
        chipsContainer.appendChild(chip);
    });
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
    document.querySelectorAll(".rc-subtab-btn").forEach(btn => {
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
        card.className = "rc-command-card";
        const isPs = (cmd.shell_type || "").toLowerCase() === "powershell";
        const badgeClass = isPs ? "badge-ps" : "badge-cmd";
        
        card.innerHTML = `
            <div class="rc-card-header">
                <span class="rc-card-title">${escapeHtml(cmd.title)}</span>
                <span class="rc-shell-badge ${badgeClass}">${(cmd.shell_type || "PS").toUpperCase()}</span>
            </div>
            <div class="rc-card-desc">${escapeHtml(cmd.description || "")}</div>
            <div class="rc-card-actions">
                <button type="button" class="btn btn-sm btn-load-terminal" onclick="loadCommandIntoTerminal(${cmd.id})">
                    <i class="fas fa-terminal"></i> Carregar no Terminal
                </button>
            </div>
        `;

        if (cmd.category === "consulta") {
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
    }

    setShellType(cmd.shell_type || "powershell");
    switchRemoteTab("rc-tab-console");
    safeToast(`Comando "${cmd.title}" carregado no terminal!`);
};

// Executa o comando digitado no terminal nas praças selecionadas
window.executeTerminalCommand = function() {
    const editor = document.getElementById("rc-terminal-input");
    const script = editor ? editor.value.trim() : "";
    
    if (!script) {
        safeToast("Por favor, digite ou selecione um comando antes de executar.", "warning");
        return;
    }

    if (selectedRemoteHosts.length === 0) {
        safeToast("Selecione ao menos um Capture Site para executar o comando.", "warning");
        return;
    }

    const activeShellBtn = document.querySelector(".shell-type-btn.active");
    const shellType = activeShellBtn ? activeShellBtn.getAttribute("data-shell") : "powershell";

    executeRemoteScript(script, shellType, script.split("\n")[0].substring(0, 40));
};

function executeRemoteScript(script, shellType, title) {
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

    fetch("/api/remote-commands/execute", {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
            hosts: selectedRemoteHosts,
            shell_type: shellType,
            command_script: script,
            command_title: title || script.split("\n")[0].substring(0, 40)
        })
    })
    .then(r => r.json())
    .then(data => {
        currentExecutionId = data.execution_id;
        safeToast(data.message || "Comando disparado com sucesso!", "success");
        // Habilita botões de exportação
        const exportBtns = document.querySelectorAll(".btn-export-rc");
        exportBtns.forEach(b => b.removeAttribute("disabled"));
        // Carrega os resultados detalhados
        loadExecutionResults(currentExecutionId);
    })
    .catch(err => {
        safeToast("Falha ao disparar comando: " + err.message, "danger");
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
            tabBtn.className = `btn btn-sm btn-outline-secondary host-tab-btn ${idx === 0 ? "active" : ""}`;
            tabBtn.innerHTML = `<i class="fas fa-desktop"></i> ${r.host} <span class="badge ${r.status === 'sucesso' ? 'bg-success' : 'bg-danger'}">${(r.status || 'OK').toUpperCase()}</span>`;
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

    let html = `<div class="rc-terminal-meta">`;
    html += `Host: <strong>${resultItem.host}</strong> (${resultItem.praca || "CS"}) | Status: <span class="text-success">${(resultItem.status || 'OK').toUpperCase()}</span> | Tempo: ${resultItem.duration_ms}ms | Código de Saída: ${resultItem.exit_code}`;
    html += `</div>\n`;
    html += `<pre class="rc-terminal-stdout">${escapeHtml(resultItem.stdout || "(Sem saída no console)")}</pre>`;

    if (resultItem.stderr) {
        html += `<pre class="rc-terminal-stderr">${escapeHtml(resultItem.stderr)}</pre>`;
    }

    consoleOutput.innerHTML = html;
}

window.clearTerminalEditor = function() {
    const editor = document.getElementById("rc-terminal-input");
    if (editor) editor.value = "";
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
    const shellType = document.getElementById("new-cmd-shell").value;
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
            command_script: script
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
                <button type="button" class="btn btn-sm btn-secondary" onclick="loadAiCommandIntoEditorById('${item.id}')" title="Carregar o script no terminal para revisar">
                    <i class="fas fa-terminal"></i> Carregar no Console
                </button>
                <button type="button" class="btn btn-sm" style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); color: #6ee7b7;" onclick="saveAiCommandToCatalogById('${item.id}')" title="Salvar permanentemente no catálogo de comandos da equipe">
                    <i class="fas fa-save"></i> Salvar no Catálogo
                </button>
                <button type="button" class="btn btn-sm ${isHighRisk ? 'btn-danger' : 'btn-primary'}" onclick="triggerAiCommandExecutionById('${item.id}')" title="Executar imediatamente na(s) praça(s) selecionada(s)">
                    <i class="fas fa-bolt"></i> Executar Agora
                </button>
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
    if (editor) editor.value = item.command;

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
