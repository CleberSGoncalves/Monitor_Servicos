// dashboard/static/js/remote_commands.js
/**
 * Orquestrador de Comandos Remotos (Remote Command Console)
 * Suporte nativo a PowerShell e CMD Prompt, execução multi-host, cards de consulta/correção,
 * acompanhamento em tempo real, exportação TXT/Excel e sugestões inteligentes de IA.
 */

let selectedRemoteHosts = [];
let currentExecutionId = null;
let catalogCommands = [];
let executionPollingTimer = null;

// Inicializa a aba de Remote Command
function initRemoteCommands() {
    loadRemoteCommandHosts();
    loadCatalogCommands();
    loadAiCommandSuggestions();
    setupRemoteCommandEvents();
}

// Carrega os hosts da frota disponíveis para seleção
function loadRemoteCommandHosts() {
    const hostSelect = document.getElementById("remote-host-select");
    if (!hostSelect) return;

    // Obtém hosts a partir dos dados em cache ou da tabela de serviços
    fetch("/api/fleet/services", {
        headers: { "Authorization": `Bearer ${getAuthToken()}` }
    })
    .then(r => r.json())
    .then(services => {
        const uniqueHosts = new Map();
        services.forEach(s => {
            if (s.hostname && !uniqueHosts.has(s.hostname)) {
                uniqueHosts.set(s.hostname, s.praca || "CS");
            }
        });

        hostSelect.innerHTML = "";
        uniqueHosts.forEach((praca, hostname) => {
            const opt = document.createElement("option");
            opt.value = hostname;
            opt.textContent = `${hostname} (${praca})`;
            hostSelect.appendChild(opt);
        });

        // Se houver hosts e nenhum selecionado, seleciona o primeiro por padrão
        if (uniqueHosts.size > 0 && selectedRemoteHosts.length === 0) {
            const firstHost = uniqueHosts.keys().next().value;
            selectedRemoteHosts = [firstHost];
            updateSelectedHostsUI();
        }
    })
    .catch(err => console.error("Erro ao carregar hosts para comandos remotos:", err));
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
        chip.innerHTML = `<strong>${host}</strong> <i class="fas fa-times" onclick="removeHostFromSelection('${host}')"></i>`;
        chipsContainer.appendChild(chip);
    });
}

function addHostToSelection() {
    const select = document.getElementById("remote-host-select");
    if (!select || !select.value) return;
    const host = select.value;
    if (!selectedRemoteHosts.includes(host)) {
        selectedRemoteHosts.push(host);
        updateSelectedHostsUI();
    }
}

function removeHostFromSelection(host) {
    selectedRemoteHosts = selectedRemoteHosts.filter(h => h !== host);
    updateSelectedHostsUI();
}

function selectAllHosts() {
    const select = document.getElementById("remote-host-select");
    if (!select) return;
    selectedRemoteHosts = Array.from(select.options).map(o => o.value);
    updateSelectedHostsUI();
}

function clearAllHosts() {
    selectedRemoteHosts = [];
    updateSelectedHostsUI();
}

// Configura eventos da tela
function setupRemoteCommandEvents() {
    // Switch de Shell (PowerShell vs CMD)
    document.querySelectorAll(".shell-type-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".shell-type-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            const shell = btn.getAttribute("data-shell");
            const promptLabel = document.getElementById("terminal-prompt-label");
            if (promptLabel) {
                promptLabel.textContent = shell === "powershell" ? "PS C:\\MediaDNA_V2> " : "C:\\MediaDNA_V2> ";
            }
        });
    });

    // Subabas de Remote Command
    document.querySelectorAll(".rc-subtab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".rc-subtab-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".rc-subtab-content").forEach(c => c.classList.remove("active"));
            btn.classList.add("active");
            const targetId = btn.getAttribute("data-target");
            const target = document.getElementById(targetId);
            if (target) target.classList.add("active");
        });
    });
}

// Carrega os cards de comandos catalogados
function loadCatalogCommands() {
    fetch("/api/remote-commands/catalog", {
        headers: { "Authorization": `Bearer ${getAuthToken()}` }
    })
    .then(r => r.json())
    .then(commands => {
        catalogCommands = commands;
        renderCatalogCards();
    })
    .catch(err => console.error("Erro ao carregar catálogo de comandos:", err));
}

function renderCatalogCards() {
    const consultasContainer = document.getElementById("rc-consultas-cards");
    const correcoesContainer = document.getElementById("rc-correcoes-cards");
    if (!consultasContainer || !correcoesContainer) return;

    consultasContainer.innerHTML = "";
    correcoesContainer.innerHTML = "";

    catalogCommands.forEach(cmd => {
        const card = document.createElement("div");
        card.className = "rc-command-card";
        const badgeClass = cmd.shell_type === "powershell" ? "badge-ps" : "badge-cmd";
        
        card.innerHTML = `
            <div class="rc-card-header">
                <span class="rc-card-title">${cmd.title}</span>
                <span class="rc-shell-badge ${badgeClass}">${cmd.shell_type.toUpperCase()}</span>
            </div>
            <div class="rc-card-desc">${cmd.description || ""}</div>
            <div class="rc-card-actions">
                <button class="btn btn-sm btn-outline-primary" onclick="loadCommandIntoTerminal(${cmd.id})">
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

function loadCommandIntoTerminal(cmdId) {
    const cmd = catalogCommands.find(c => c.id === cmdId);
    if (!cmd) return;

    const editor = document.getElementById("rc-terminal-input");
    if (editor) {
        editor.value = cmd.command_script;
    }

    // Ajusta o switch do shell correspondente
    document.querySelectorAll(".shell-type-btn").forEach(b => {
        if (b.getAttribute("data-shell") === cmd.shell_type) {
            b.click();
        }
    });

    showToast(`Comando "${cmd.title}" carregado no terminal!`);
}

// Executa o comando digitado no terminal nas praças selecionadas
function executeTerminalCommand() {
    const editor = document.getElementById("rc-terminal-input");
    const script = editor ? editor.value.trim() : "";
    
    if (!script) {
        showToast("Por favor, digite ou selecione um comando antes de executar.", "warning");
        return;
    }

    if (selectedRemoteHosts.length === 0) {
        showToast("Selecione ao menos um Capture Site para executar o comando.", "warning");
        return;
    }

    const activeShellBtn = document.querySelector(".shell-type-btn.active");
    const shellType = activeShellBtn ? activeShellBtn.getAttribute("data-shell") : "powershell";

    const execBtn = document.getElementById("btn-run-remote-cmd");
    if (execBtn) {
        execBtn.disabled = true;
        execBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Executando nas Praças...';
    }

    const consoleOutput = document.getElementById("rc-console-output");
    if (consoleOutput) {
        consoleOutput.innerHTML = `<div class="rc-terminal-line"><span class="text-cyan">⚡ Disparando comando [${shellType.toUpperCase()}] em ${selectedRemoteHosts.length} praça(s)...</span></div>`;
    }

    fetch("/api/remote-commands/execute", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${getAuthToken()}`
        },
        body: JSON.stringify({
            hosts: selectedRemoteHosts,
            shell_type: shellType,
            command_script: script,
            command_title: script.split("\n")[0].substring(0, 40)
        })
    })
    .then(r => r.json())
    .then(data => {
        currentExecutionId = data.execution_id;
        showToast(data.message || "Comando disparado!", "success");
        // Habilita botões de exportação
        const exportBtns = document.querySelectorAll(".btn-export-rc");
        exportBtns.forEach(b => b.removeAttribute("disabled"));
        // Carrega os resultados detalhados
        loadExecutionResults(currentExecutionId);
    })
    .catch(err => {
        showToast("Falha ao disparar comando: " + err.message, "danger");
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

    fetch(`/api/remote-commands/executions/${execId}`, {
        headers: { "Authorization": `Bearer ${getAuthToken()}` }
    })
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

    if (hostsTabContainer) {
        hostsTabContainer.innerHTML = "";
        execData.results.forEach((r, idx) => {
            const tabBtn = document.createElement("button");
            tabBtn.className = `btn btn-sm btn-outline-secondary host-tab-btn ${idx === 0 ? "active" : ""}`;
            tabBtn.innerHTML = `<i class="fas fa-desktop"></i> ${r.host} <span class="badge ${r.status === 'sucesso' ? 'bg-success' : 'bg-danger'}">${r.status.toUpperCase()}</span>`;
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
    html += `Host: <strong>${resultItem.host}</strong> (${resultItem.praca || "CS"}) | Status: <span class="text-success">${resultItem.status.toUpperCase()}</span> | Tempo: ${resultItem.duration_ms}ms | Código de Saída: ${resultItem.exit_code}`;
    html += `</div>\n`;
    html += `<pre class="rc-terminal-stdout">${escapeHtml(resultItem.stdout || "(Sem saída)")}</pre>`;

    if (resultItem.stderr) {
        html += `<pre class="rc-terminal-stderr">${escapeHtml(resultItem.stderr)}</pre>`;
    }

    consoleOutput.innerHTML = html;
}

function clearTerminalEditor() {
    const editor = document.getElementById("rc-terminal-input");
    if (editor) editor.value = "";
    const consoleOutput = document.getElementById("rc-console-output");
    if (consoleOutput) consoleOutput.innerHTML = '<div class="text-muted" style="padding: 10px;">Console limpo. Digite ou selecione um comando e clique em Executar.</div>';
}

function copyTerminalCommand() {
    const editor = document.getElementById("rc-terminal-input");
    if (!editor || !editor.value) return;
    navigator.clipboard.writeText(editor.value)
        .then(() => showToast("Comando copiado para a área de transferência!"))
        .catch(() => showToast("Falha ao copiar comando", "warning"));
}

// Exportação de Resultados (TXT ou CSV)
function exportExecutionResults(format) {
    if (!currentExecutionId) {
        showToast("Nenhuma execução ativa para exportar.", "warning");
        return;
    }

    const url = `/api/remote-commands/executions/${currentExecutionId}/export?format=${format}`;
    fetch(url, {
        headers: { "Authorization": `Bearer ${getAuthToken()}` }
    })
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
        showToast(`Arquivo ${format.toUpperCase()} exportado com sucesso!`);
    })
    .catch(err => showToast("Erro ao exportar resultados: " + err.message, "danger"));
}

// Salva um novo comando customizado no catálogo
function saveCustomCommand(event) {
    if (event) event.preventDefault();

    const title = document.getElementById("new-cmd-title").value.trim();
    const description = document.getElementById("new-cmd-desc").value.trim();
    const category = document.getElementById("new-cmd-category").value;
    const shellType = document.getElementById("new-cmd-shell").value;
    const script = document.getElementById("new-cmd-script").value.trim();

    if (!title || !script) {
        showToast("Título e Script do comando são obrigatórios.", "warning");
        return;
    }

    fetch("/api/remote-commands/catalog", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${getAuthToken()}`
        },
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
        showToast("Novo comando salvo com sucesso no catálogo!", "success");
        // Limpa formulário
        document.getElementById("form-create-remote-cmd").reset();
        // Volta para a aba de console e recarrega catálogo
        document.querySelector('.rc-subtab-btn[data-target="rc-tab-console"]').click();
        loadCatalogCommands();
    })
    .catch(err => showToast("Falha ao salvar comando: " + err.message, "danger"));
}

// Sugestões de Comandos da IA
function loadAiCommandSuggestions() {
    const container = document.getElementById("rc-ai-suggestions-container");
    if (!container) return;

    fetch("/api/remote-commands/ai-suggestions", {
        headers: { "Authorization": `Bearer ${getAuthToken()}` }
    })
    .then(r => r.json())
    .then(suggestions => {
        container.innerHTML = "";
        suggestions.forEach(item => {
            const card = document.createElement("div");
            card.className = "ai-cmd-card";
            card.innerHTML = `
                <div class="ai-cmd-header">
                    <h4>${item.title}</h4>
                    <span class="rc-shell-badge ${item.shell_type === 'powershell' ? 'badge-ps' : 'badge-cmd'}">${item.shell_type.toUpperCase()}</span>
                </div>
                <div class="ai-cmd-reason">
                    <i class="fas fa-brain text-purple"></i> <strong>Diagnóstico da IA:</strong> ${item.reason}
                </div>
                <pre class="ai-cmd-code">${escapeHtml(item.command)}</pre>
                <div class="ai-cmd-actions">
                    <button class="btn btn-sm btn-primary" onclick="loadAiCommandIntoEditor('${encodeURIComponent(item.command)}', '${item.shell_type}')">
                        <i class="fas fa-bolt"></i> ${item.action_label}
                    </button>
                </div>
            `;
            container.appendChild(card);
        });
    })
    .catch(err => console.error("Erro ao carregar sugestões da IA para comandos:", err));
}

function loadAiCommandIntoEditor(encodedCommand, shellType) {
    const command = decodeURIComponent(encodedCommand);
    const editor = document.getElementById("rc-terminal-input");
    if (editor) editor.value = command;

    document.querySelectorAll(".shell-type-btn").forEach(b => {
        if (b.getAttribute("data-shell") === shellType) b.click();
    });

    document.querySelector('.rc-subtab-btn[data-target="rc-tab-console"]').click();
    showToast("Comando sugerido pela IA carregado no terminal!");
}

function escapeHtml(text) {
    if (!text) return "";
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
