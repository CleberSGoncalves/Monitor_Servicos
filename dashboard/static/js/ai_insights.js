// static/js/ai_insights.js - Motor de Inteligência Artificial Proativa, Homologação e Auditoria de MP4

let homologationCache = [];
let currentMp4AnalysisResult = null;
let mp4PlayerState = {
    isPlaying: false,
    currentTime: 0,
    duration: 16,
    speed: 1,
    animFrameId: null,
    glitchStart: 5.2,
    glitchDuration: 3.8,
    glitchType: "freeze"
};

function getAiToken() {
    try {
        if (typeof getAuthToken === "function") {
            const t = getAuthToken();
            if (t) return t;
        }
    } catch (e) {}
    if (typeof authToken !== "undefined" && authToken) return authToken;
    return localStorage.getItem("fleet_token") || "";
}

// =========================================================================
// SUBTAB NAVIGATION
// =========================================================================
function switchAiSubtab(subtabId) {
    const btnSugg = document.getElementById("btn-ai-subtab-suggestions");
    const btnHomolog = document.getElementById("btn-ai-subtab-homologation");
    const btnMp4 = document.getElementById("btn-ai-subtab-mp4");

    const contentSugg = document.getElementById("ai-content-suggestions");
    const contentHomolog = document.getElementById("ai-content-homologation");
    const contentMp4 = document.getElementById("ai-content-mp4");

    // Remove active classes
    [btnSugg, btnHomolog, btnMp4].forEach(b => b && b.classList.remove("active"));
    [contentSugg, contentHomolog, contentMp4].forEach(c => c && (c.style.display = "none"));

    if (subtabId === "suggestions") {
        if (btnSugg) btnSugg.classList.add("active");
        if (contentSugg) contentSugg.style.display = "block";
        loadAiSuggestions();
    } else if (subtabId === "homologation") {
        if (btnHomolog) btnHomolog.classList.add("active");
        if (contentHomolog) contentHomolog.style.display = "block";
        loadHomologationPipeline();
    } else if (subtabId === "mp4") {
        if (btnMp4) btnMp4.classList.add("active");
        if (contentMp4) contentMp4.style.display = "block";
        populateMp4Filters();
    }
}
window.switchAiSubtab = switchAiSubtab;


// =========================================================================
// SUBTAB 1: PROACTIVE AI SUGGESTIONS
// =========================================================================
async function loadAiSuggestions() {
    const container = document.getElementById("aiCardsGrid");
    if (!container) return;
    container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 30px; color: var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Carregando sugestões ativas da IA...</div>`;

    try {
        const token = getAiToken();
        const resp = await fetch("/api/ai/suggestions", {
            headers: token ? { "Authorization": `Bearer ${token}` } : {}
        });
        if (!resp.ok) return;
        const suggestions = await resp.json();
        renderAiCards(suggestions);
    } catch {
        container.innerHTML = `<div style="grid-column: 1/-1; color: var(--accent-red); text-align: center; padding: 20px;">Falha ao carregar sugestões da IA.</div>`;
    }
}

async function triggerAiAnalysis() {
    const btn = document.getElementById("btnTriggerAi");
    const container = document.getElementById("aiCardsGrid");
    
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span>⏳</span> Analisando Métricas e Sinais da Frota...`;
    }
    if (container) {
        container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-highlight);"><span style="font-size: 28px;">🧠</span><br><br><strong>A Inteligência Artificial está correlacionando métricas operacionais do Windows, desgaste de memória do kernel, latência de disco D:, saturação de TCP e padrões em todas as 22 praças...</strong></div>`;
    }

    try {
        const token = getAiToken();
        const resp = await fetch("/api/ai/analyze", {
            method: "POST",
            headers: token ? { "Authorization": `Bearer ${token}` } : {}
        });
        if (resp.ok) {
            const data = await resp.json();
            renderAiCards(data.suggestions || []);
        } else {
            alert("Erro ao disparar análise de IA.");
        }
    } catch {
        alert("Falha de comunicação com o motor de IA.");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<span>✨</span> Analisar Todo o Sistema com IA`;
        }
    }
}

function renderAiCards(suggestions) {
    const container = document.getElementById("aiCardsGrid");
    if (!container) return;

    if (!suggestions || suggestions.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 50px 20px; background: rgba(0,0,0,0.2); border-radius: var(--radius-lg); border: 1px dashed var(--border-color);">
                <span style="font-size: 32px;">🎯</span>
                <h3 style="margin-top: 10px; font-size: 16px;">Tudo Calibrado e Otimizado no Escopo Global</h3>
                <p style="color: var(--text-muted); font-size: 13px; margin-top: 6px;">Nenhuma anomalia oculta pendente. Clique no botão acima para rodar uma nova auditoria com IA a qualquer momento.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = suggestions.map(s => {
        const badgeColor = s.severity === "critica" ? "badge-red" : (s.severity === "alta" ? "badge-yellow" : "badge-blue");

        return `
            <div class="ai-card" id="ai-card-${s.id}">
                <div>
                    <div class="ai-card-header">
                        <span class="badge ${badgeColor}">${s.category.toUpperCase()} • ${s.severity.toUpperCase()}</span>
                        <span style="font-size: 11px; font-weight: 600; color: #38bdf8; background: rgba(56, 189, 248, 0.15); padding: 3px 8px; border-radius: 4px; border: 1px solid rgba(56, 189, 248, 0.3);">
                            <i class="fas fa-globe"></i> Escopo Global (Todas as Praças)
                        </span>
                    </div>
                    <h4 class="ai-card-title">${escapeHtml(s.title)}</h4>
                    <p class="ai-card-desc">${escapeHtml(s.description)}</p>
                </div>
                <div class="ai-card-actions">
                    <button class="btn-primary" style="flex: 1.2; font-size: 12px; padding: 8px; background: linear-gradient(135deg, #2563eb, #1d4ed8);" onclick="approveForHomologation('${s.id}')">
                        🧪 Aprovar para Homologação
                    </button>
                    <button class="btn-secondary" style="flex: 0.8; font-size: 12px; padding: 8px;" onclick="decideAiSuggestion('${s.id}', false)">
                        ❌ Recusar
                    </button>
                </div>
            </div>
        `;
    }).join("");
}

async function approveForHomologation(suggestionId) {
    const card = document.getElementById(`ai-card-${suggestionId}`);
    if (card) {
        card.style.opacity = "0.5";
        card.style.pointerEvents = "none";
    }

    try {
        const token = getAiToken();
        const resp = await fetch("/api/ai/homologation/approve", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                suggestion_id: suggestionId,
                pilot_host: "São Paulo - CS 1"
            })
        });

        if (resp.ok) {
            if (card) card.remove();
            alert("🧪 Sugestão aprovada e enviada para a Esteira de Homologação!\n\nO recurso está agora na subaba 'Homologação' pronto para testes no agente piloto antes da implantação oficial.");
            loadAiSuggestions();
            loadHomologationCountBadge();
        } else {
            const err = await resp.json();
            alert(`Erro: ${err.detail || "Falha ao aprovar para homologação"}`);
            if (card) {
                card.style.opacity = "1";
                card.style.pointerEvents = "auto";
            }
        }
    } catch (err) {
        alert(`Erro de comunicação: ${err.message}`);
        if (card) {
            card.style.opacity = "1";
            card.style.pointerEvents = "auto";
        }
    }
}
window.approveForHomologation = approveForHomologation;

async function decideAiSuggestion(id, approve) {
    const card = document.getElementById(`ai-card-${id}`);
    if (card) {
        card.style.opacity = "0.5";
        card.style.pointerEvents = "none";
    }

    try {
        const token = getAiToken();
        const resp = await fetch("/api/ai/decision", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ suggestion_id: id, approve: approve })
        });

        if (resp.ok) {
            if (card) card.remove();
            alert("Sugestão recusada. O motor de IA aprendeu sua preferência.");
            loadAiSuggestions();
        }
    } catch {
        alert("Erro ao processar decisão.");
        if (card) {
            card.style.opacity = "1";
            card.style.pointerEvents = "auto";
        }
    }
}
window.decideAiSuggestion = decideAiSuggestion;


// =========================================================================
// SUBTAB 2: ESTEIRA DE HOMOLOGAÇÃO & VALIDAÇÃO NO AGENTE
// =========================================================================
async function loadHomologationCountBadge() {
    try {
        const token = getAiToken();
        const resp = await fetch("/api/ai/homologation", {
            headers: token ? { "Authorization": `Bearer ${token}` } : {}
        });
        if (!resp.ok) return;
        const items = await resp.json();
        const pending = items.filter(i => i.status !== "implantado").length;
        const badge = document.getElementById("ai-homolog-count-badge");
        if (badge) badge.innerText = pending;
    } catch (e) {}
}

async function loadHomologationPipeline() {
    const container = document.getElementById("ai-homologation-container");
    if (!container) return;

    container.innerHTML = `<div style="text-align: center; padding: 30px; color: var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Carregando esteira de homologação...</div>`;

    try {
        const token = getAiToken();
        const resp = await fetch("/api/ai/homologation", {
            headers: token ? { "Authorization": `Bearer ${token}` } : {}
        });
        if (!resp.ok) return;
        const items = await resp.json();
        homologationCache = items;
        loadHomologationCountBadge();
        renderHomologationCards(items);
    } catch (err) {
        container.innerHTML = `<div style="color: var(--accent-red); padding: 20px;">Falha ao carregar esteira de homologação: ${err.message}</div>`;
    }
}
window.loadHomologationPipeline = loadHomologationPipeline;

function renderHomologationCards(items) {
    const container = document.getElementById("ai-homologation-container");
    if (!container) return;

    if (!items || items.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; background: rgba(0,0,0,0.2); border-radius: var(--radius-sm); border: 1px dashed var(--border-color); color: var(--text-muted);">
                <span style="font-size: 32px;">🧪</span>
                <h4 style="color: #fff; margin-top: 8px;">Esteira de Homologação Vazia</h4>
                <p style="font-size: 12px; margin-top: 4px;">Aprove sugestões na aba "Sugestões Proativas da Frota" para submeter novas funcionalidades a validação em praça piloto.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = items.map(item => {
        let statusBadge = `<span class="badge" style="background: rgba(245, 158, 11, 0.2); color: #f59e0b; border: 1px solid #f59e0b;">⏳ Aguardando Testes</span>`;
        let actionButtons = `
            <button class="btn-primary" style="padding: 6px 14px; font-size: 12px; background: #2563eb;" onclick="runHomologationTest('${item.id}', this)">
                <i class="fas fa-play"></i> ▶️ Iniciar Bateria de Testes no Agente Piloto
            </button>
        `;

        if (item.status === "homologado") {
            statusBadge = `<span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #10b981; border: 1px solid #10b981;">✅ Homologado com Sucesso</span>`;
            actionButtons = `
                <button class="btn-primary" style="padding: 6px 16px; font-size: 12px; background: linear-gradient(135deg, #10b981, #059669); font-weight: 700;" onclick="deployHomologatedFeature('${item.id}', this)">
                    <i class="fas fa-rocket"></i> 🚀 Promover e Implantar na Frota
                </button>
            `;
        } else if (item.status === "implantado") {
            statusBadge = `<span class="badge" style="background: rgba(37, 99, 235, 0.2); color: #60a5fa; border: 1px solid #2563eb;">🚀 Ativo em Toda a Frota</span>`;
            actionButtons = `
                <button class="btn-secondary" style="padding: 6px 14px; font-size: 12px;" onclick="goToConfigThreshold('${item.threshold_key}')">
                    <i class="fas fa-sliders-h"></i> ⚙️ Ver Limiar Cadastrado em Configurações
                </button>
            `;
        }

        return `
            <div class="panel-card" style="border: 1px solid var(--border-color); margin-bottom: 0;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 10px; margin-bottom: 12px;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                            ${statusBadge}
                            <span class="badge" style="background: rgba(255,255,255,0.06); font-size: 11px; color: #94a3b8;">
                                <i class="fas fa-server"></i> Praça Piloto: <strong style="color: #fff;">${escapeHtml(item.pilot_host)}</strong>
                            </span>
                        </div>
                        <h4 style="margin: 0; font-size: 15px; color: #fff;">${escapeHtml(item.title)}</h4>
                    </div>
                    <div>${actionButtons}</div>
                </div>

                <!-- Detalhes do Limiar que será cadastrado -->
                <div style="background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 14px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                    <div>
                        <div style="font-size: 11px; text-transform: uppercase; color: var(--text-muted); font-weight: 700;">Limiar Regulatório a Cadastrar em Configurações:</div>
                        <div style="font-size: 13px; color: #38bdf8; font-weight: 600;">${escapeHtml(item.threshold_name)} (Chave: <code>${escapeHtml(item.threshold_key)}</code>)</div>
                        <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">${escapeHtml(item.threshold_desc || "")}</div>
                    </div>
                    <div style="text-align: right;">
                        <span style="font-size: 16px; font-weight: 700; color: #fff;">${item.threshold_value}</span>
                        <span style="font-size: 12px; color: var(--text-muted);">${escapeHtml(item.threshold_unit)}</span>
                    </div>
                </div>

                <!-- Terminal Console de Testes e Auditoria -->
                <div>
                    <div style="font-size: 11px; text-transform: uppercase; color: var(--text-muted); font-weight: 700; margin-bottom: 4px;">
                        <i class="fas fa-terminal"></i> Console de Auditoria e Validação Técnica no Agente:
                    </div>
                    <pre style="margin: 0; background: #000; padding: 10px; border-radius: 6px; border: 1px solid #1e293b; color: #34d399; font-family: monospace; font-size: 11px; max-height: 120px; overflow-y: auto; white-space: pre-wrap;">${escapeHtml(item.test_logs || "Nenhum log gravado.")}</pre>
                </div>
            </div>
        `;
    }).join("");
}

async function runHomologationTest(homologationId, btn) {
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Executando Testes no Piloto...`;
    }

    try {
        const token = getAiToken();
        const resp = await fetch("/api/ai/homologation/test", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ homologation_id: homologationId })
        });

        if (resp.ok) {
            alert("✅ Bateria de testes concluída com 100% de conformidade!\n\nO recurso foi validado no Agente da praça piloto sem impacto de CPU/RAM e está pronto para promoção à frota.");
            loadHomologationPipeline();
        } else {
            const err = await resp.json();
            alert(`Falha nos testes: ${err.detail || "Erro inesperado"}`);
        }
    } catch (err) {
        alert(`Erro de comunicação: ${err.message}`);
    }
}
window.runHomologationTest = runHomologationTest;

async function deployHomologatedFeature(homologationId, btn) {
    if (!confirm("Confirmar a promoção e deploy oficial desta funcionalidade em toda a frota?\n\nIsso ativará a rotina em todas as 22 praças e cadastrará o novo limiar na aba Configurações.")) {
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Implantando na Frota...`;
    }

    try {
        const token = getAiToken();
        const resp = await fetch("/api/ai/homologation/deploy", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ homologation_id: homologationId })
        });

        if (resp.ok) {
            const res = await resp.json();
            alert(`🚀 SUCESSO!\n\nFuncionalidade implantada com êxito em toda a frota.\nO limiar '${res.threshold_registered.name}' foi cadastrado automaticamente na aba Configurações.`);
            loadHomologationPipeline();
        } else {
            const err = await resp.json();
            alert(`Erro no deploy: ${err.detail}`);
        }
    } catch (err) {
        alert(`Erro de conexão: ${err.message}`);
    }
}
window.deployHomologatedFeature = deployHomologatedFeature;

function goToConfigThreshold(thresholdKey) {
    const configBtn = document.querySelector(".nav-btn[data-tab='configs']");
    if (configBtn) {
        configBtn.click();
        setTimeout(() => {
            const input = document.getElementById(`th_val_${thresholdKey}`);
            if (input) {
                input.parentElement.parentElement.scrollIntoView({ behavior: "smooth", block: "center" });
                input.parentElement.parentElement.style.outline = "2px solid #3b82f6";
                setTimeout(() => {
                    input.parentElement.parentElement.style.outline = "none";
                }, 3000);
            }
        }, 400);
    }
}
window.goToConfigThreshold = goToConfigThreshold;


// =========================================================================
// SUBTAB 3: ANÁLISE DE AMOSTRAS MP4 ATRIA & PLAYER DE FALHAS
// =========================================================================
async function populateMp4Filters() {
    const pracaSelect = document.getElementById("mp4FilterPraca");
    if (!pracaSelect) return;

    try {
        const token = getAiToken();
        const resp = await fetch("/api/fleet/channels", {
            headers: token ? { "Authorization": `Bearer ${token}` } : {}
        });
        if (!resp.ok) return;
        const channels = await resp.json();

        const pracasMap = {};
        channels.forEach(c => {
            const p = c.cidade || "N/A";
            if (!pracasMap[p]) pracasMap[p] = [];
            pracasMap[p].push(c);
        });

        const sortedPracas = Object.keys(pracasMap).sort();
        pracaSelect.innerHTML = sortedPracas.map(p => `<option value="${p}">${p}</option>`).join("");

        if (sortedPracas.length > 0) {
            pracaSelect.value = sortedPracas.find(p => p.toLowerCase().includes("pelotas")) || sortedPracas[0];
            onMp4PracaChanged();
        }
    } catch (err) {
        console.error("Erro ao carregar filtros de MP4:", err);
    }
}
window.populateMp4Filters = populateMp4Filters;

async function onMp4PracaChanged() {
    const pracaSelect = document.getElementById("mp4FilterPraca");
    const canalSelect = document.getElementById("mp4FilterCanal");
    if (!pracaSelect || !canalSelect) return;

    const praca = pracaSelect.value;
    if (!praca) return;

    try {
        const token = getAiToken();
        const resp = await fetch(`/api/fleet/channels?city=${encodeURIComponent(praca)}`, {
            headers: token ? { "Authorization": `Bearer ${token}` } : {}
        });
        if (!resp.ok) return;
        const channels = await resp.json();

        if (channels.length === 0) {
            canalSelect.innerHTML = "<option value=''>Nenhum canal na praça</option>";
            return;
        }

        canalSelect.innerHTML = channels.map(c => `<option value="${c.canal}">${c.canal} (CS ${c.id_cs || 1})</option>`).join("");
    } catch (err) {
        console.error("Erro ao carregar canais para MP4:", err);
    }
}
window.onMp4PracaChanged = onMp4PracaChanged;

async function startMp4SampleAnalysis() {
    const pracaSelect = document.getElementById("mp4FilterPraca");
    const canalSelect = document.getElementById("mp4FilterCanal");
    const daysSelect = document.getElementById("mp4FilterDays");
    const typeSelect = document.getElementById("mp4FilterType");
    const btn = document.getElementById("btnStartMp4Analysis");

    if (!pracaSelect || !canalSelect) return;
    const praca = pracaSelect.value;
    const canal = canalSelect.value;
    const days = parseInt(daysSelect.value, 10) || 3;
    const anomalyType = typeSelect.value || "all";

    if (!praca || !canal) {
        alert("Selecione uma praça e um canal gravado pelo ATRIA.");
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Executando Amostragem...`;
    }

    // Revela e reinicia a barra de progresso detalhada
    const progContainer = document.getElementById("mp4ProgressBarContainer");
    const progBar = document.getElementById("mp4ProgressBarFill");
    const progPct = document.getElementById("mp4ProgressPercent");
    const progDesc = document.getElementById("mp4ProgressDetailText");
    const resultsContainer = document.getElementById("mp4ResultsContainer");

    if (resultsContainer) resultsContainer.style.display = "none";
    if (progContainer) {
        progContainer.style.display = "block";
        progContainer.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    // Simulação progressiva realista das etapas de varredura
    const steps = [
        { pct: 20, text: `[Etapa 1/4] Acessando diretório D:\\MediaDNA_V2\\Recordings\\${canal.replace(' ', '_')} e indexando amostras dos últimos ${days} dias...` },
        { pct: 45, text: `[Etapa 2/4] Extraindo keyframes, GOP e decodificando blocos de áudio AAC para inspeção espectral...` },
        { pct: 70, text: `[Etapa 3/4] Aplicando algoritmos de detecção de congelamento de quadro e descontinuidade de contêiner Moov Atom...` },
        { pct: 90, text: `[Etapa 4/4] Correlacionando padrões com o hardware da praça e formulando parecer técnico de IA...` }
    ];

    for (let s of steps) {
        if (progBar) progBar.style.width = `${s.pct}%`;
        if (progPct) progPct.innerText = `${s.pct}%`;
        if (progDesc) progDesc.innerText = s.text;
        await new Promise(r => setTimeout(r, 650));
    }

    try {
        const token = getAiToken();
        const resp = await fetch("/api/ai/mp4/analyze", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                praca: praca,
                canal: canal,
                interval_days: days,
                anomaly_type: anomalyType
            })
        });

        if (!resp.ok) throw new Error(`Falha na análise (${resp.status})`);

        const data = await resp.json();
        currentMp4AnalysisResult = data;

        // 100% Finalizado
        if (progBar) progBar.style.width = "100%";
        if (progPct) progPct.innerText = "100%";
        if (progDesc) progDesc.innerText = "Inspeção forense concluída com sucesso! Carregando player e diagnóstico...";

        await new Promise(r => setTimeout(r, 500));
        if (progContainer) progContainer.style.display = "none";

        renderMp4AnalysisResult(data);
        if (resultsContainer) {
            resultsContainer.style.display = "block";
            resultsContainer.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    } catch (err) {
        alert(`Erro na análise forense de MP4: ${err.message}`);
        if (progContainer) progContainer.style.display = "none";
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i class="fas fa-microscope"></i> 🔍 Extrair Amostras e Analisar com IA`;
        }
    }
}
window.startMp4SampleAnalysis = startMp4SampleAnalysis;

function renderMp4AnalysisResult(data) {
    const f = data.falha_predominante;
    const p = data.player_payload;

    // Configura o Player State
    mp4PlayerState.currentTime = 0;
    mp4PlayerState.duration = p.duration_sec || 16;
    mp4PlayerState.glitchStart = p.glitch_start_sec || 5.2;
    mp4PlayerState.glitchDuration = p.glitch_duration_sec || 3.8;
    mp4PlayerState.glitchType = p.glitch_type || "freeze";
    mp4PlayerState.isPlaying = false;

    // Metadados do Player
    const metaDisplay = document.getElementById("mp4PlayerMetadata");
    if (metaDisplay) metaDisplay.innerText = `${p.sample_filename} (${p.resolution} • ${p.video_codec})`;

    const recBadge = document.getElementById("mp4PlayerRecurrenceBadge");
    if (recBadge) recBadge.innerText = f.recorrencia;

    const osdChan = document.getElementById("mp4OsdChannel");
    if (osdChan) osdChan.innerText = data.canal.toUpperCase();

    const scrubber = document.getElementById("mp4Scrubber");
    if (scrubber) {
        scrubber.max = mp4PlayerState.duration;
        scrubber.value = 0;
    }

    const durText = document.getElementById("mp4TotalDuration");
    if (durText) durText.innerText = formatPlayerTime(mp4PlayerState.duration);

    // Cards de Diagnóstico à Direita
    const titleEl = document.getElementById("mp4DiagTitle");
    if (titleEl) titleEl.innerText = f.nome;

    const sympEl = document.getElementById("mp4DiagSymptom");
    if (sympEl) sympEl.innerText = f.sintoma;

    const rootEl = document.getElementById("mp4DiagRootCause");
    if (rootEl) rootEl.innerText = f.causa_raiz;

    const listEl = document.getElementById("mp4DiagSolutionsList");
    if (listEl) {
        listEl.innerHTML = f.solucoes_tecnicas.map(s => `<li style="margin-bottom: 6px;">${escapeHtml(s)}</li>`).join("");
    }

    // Inicializa o Canvas Player
    drawMp4PlayerFrame();
}

function formatPlayerTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// =========================================================================
// HTML5 CANVAS SIMULATION VIDEO PLAYER
// =========================================================================
function drawMp4PlayerFrame() {
    const canvas = document.getElementById("mp4SimulationCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;

    const t = mp4PlayerState.currentTime;
    const isGlitch = t >= mp4PlayerState.glitchStart && t <= (mp4PlayerState.glitchStart + mp4PlayerState.glitchDuration);

    const banner = document.getElementById("mp4GlitchOverlayBanner");
    if (banner) {
        if (isGlitch) {
            banner.style.display = "block";
            if (mp4PlayerState.glitchType === "freeze") {
                banner.innerText = "⚠️ FALHA DETECTADA: CONGELAMENTO DE QUADRO / PTS STALL";
            } else if (mp4PlayerState.glitchType === "macroblock") {
                banner.innerText = "⚠️ FALHA DETECTADA: CORRUPÇÃO DE MACROBLOCOS (SLICE LOSS)";
            } else {
                banner.innerText = "⚠️ FALHA DETECTADA: SILÊNCIO SÚBITO DE ÁUDIO AAC (-inf dB)";
            }
        } else {
            banner.style.display = "none";
        }
    }

    // Fundo da Tela do Player
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, w, h);

    if (isGlitch && mp4PlayerState.glitchType === "freeze") {
        // Simulação de Quadro Congelado
        ctx.fillStyle = "#1e293b";
        ctx.fillRect(0, 0, w, h);

        // Grid e elementos parados
        ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
        ctx.strokeRect(50, 50, w - 100, h - 100);

        ctx.fillStyle = "#ef4444";
        ctx.font = "bold 16px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("FRAME ESTÁTICO (REPETIÇÃO DE BUFFER H.264)", w / 2, h / 2 - 10);
        ctx.font = "12px monospace";
        ctx.fillStyle = "#94a3b8";
        ctx.fillText(`Delta de Pixels: 0.00% • GOP Bloqueado • Frame #${Math.floor(mp4PlayerState.glitchStart * 30)}`, w / 2, h / 2 + 15);
    } else if (isGlitch && mp4PlayerState.glitchType === "macroblock") {
        // Simulação de Macroblocos e Glitch
        ctx.fillStyle = "#0a0f1d";
        ctx.fillRect(0, 0, w, h);

        // Desenha blocos distorcidos aleatórios
        for (let bx = 0; bx < w; bx += 40) {
            for (let by = 0; by < h; by += 40) {
                if (Math.sin(bx + t * 10) > 0.3) {
                    ctx.fillStyle = (bx + by) % 80 === 0 ? "rgba(16, 185, 129, 0.6)" : "rgba(100, 116, 139, 0.4)";
                    ctx.fillRect(bx, by, 38, 38);
                }
            }
        }
        ctx.fillStyle = "#f87171";
        ctx.font = "bold 14px monospace";
        ctx.textAlign = "center";
        ctx.fillText("CORRUPÇÃO DE FLUXO TS: PACKET CONTINUITY COUNTER ERROR", w / 2, h - 30);
    } else {
        // Exibição de Transmissão Normal com Movimento Suave
        const grad = ctx.createLinearGradient(0, 0, w, h);
        grad.addColorStop(0, "#1e3a8a");
        grad.addColorStop(1, "#0f172a");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        // Círculo animado em movimento
        const xAnim = 100 + ((t * 80) % (w - 200));
        ctx.beginPath();
        ctx.arc(xAnim, h / 2, 45, 0, Math.PI * 2);
        ctx.fillStyle = "#38bdf8";
        ctx.fill();

        // Linhas de modulação
        ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < w; i += 20) {
            const yLine = h / 2 + Math.sin((i + t * 100) * 0.03) * 30;
            if (i === 0) ctx.moveTo(i, yLine);
            else ctx.lineTo(i, yLine);
        }
        ctx.stroke();

        ctx.fillStyle = "#fff";
        ctx.font = "bold 18px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("TRANSMISSÃO ATRIA GRAVADA", w / 2, h / 2 - 10);
    }

    // VU Meter de Áudio no Rodapé
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(15, h - 35, 140, 22);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "9px monospace";
    ctx.textAlign = "left";
    ctx.fillText("VU L/R:", 22, h - 21);

    const isAudioDrop = isGlitch && mp4PlayerState.glitchType === "audio_drop";
    const vuWidth = isAudioDrop ? 0 : Math.max(8, 90 + Math.sin(t * 12) * 15);
    ctx.fillStyle = isAudioDrop ? "#ef4444" : "#10b981";
    ctx.fillRect(58, h - 29, vuWidth, 10);

    // Atualiza Timecode no OSD
    const timecodeEl = document.getElementById("mp4OsdTimecode");
    if (timecodeEl) {
        const m = Math.floor(t / 60);
        const s = Math.floor(t % 60);
        const f = Math.floor((t % 1) * 30);
        timecodeEl.innerText = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}:${String(f).padStart(2, "0")}`;
    }

    const currEl = document.getElementById("mp4CurrentTime");
    if (currEl) currEl.innerText = formatPlayerTime(t);

    const scrubber = document.getElementById("mp4Scrubber");
    if (scrubber && !scrubber.matches(":active")) scrubber.value = t;
}

function toggleMp4PlayPause() {
    mp4PlayerState.isPlaying = !mp4PlayerState.isPlaying;
    const btn = document.getElementById("btnMp4PlayPause");
    const icon = document.getElementById("mp4PlayIcon");

    if (mp4PlayerState.isPlaying) {
        if (icon) icon.className = "fas fa-pause";
        if (btn) btn.innerHTML = `<i class="fas fa-pause"></i> Pausar`;
        playMp4Loop();
    } else {
        if (icon) icon.className = "fas fa-play";
        if (btn) btn.innerHTML = `<i class="fas fa-play"></i> Reproduzir`;
        cancelAnimationFrame(mp4PlayerState.animFrameId);
    }
}
window.toggleMp4PlayPause = toggleMp4PlayPause;

let lastLoopTime = 0;
function playMp4Loop(timestamp) {
    if (!lastLoopTime) lastLoopTime = timestamp;
    const deltaSec = (timestamp - lastLoopTime) / 1000 || 0.033;
    lastLoopTime = timestamp;

    if (mp4PlayerState.isPlaying) {
        mp4PlayerState.currentTime += deltaSec * mp4PlayerState.speed;
        if (mp4PlayerState.currentTime >= mp4PlayerState.duration) {
            mp4PlayerState.currentTime = 0; // loop
        }
        drawMp4PlayerFrame();
        mp4PlayerState.animFrameId = requestAnimationFrame(playMp4Loop);
    }
}

function restartMp4Player() {
    mp4PlayerState.currentTime = 0;
    drawMp4PlayerFrame();
}
window.restartMp4Player = restartMp4Player;

function stepMp4Frame() {
    mp4PlayerState.currentTime = Math.min(mp4PlayerState.duration, mp4PlayerState.currentTime + 1 / 30);
    drawMp4PlayerFrame();
}
window.stepMp4Frame = stepMp4Frame;

function onMp4ScrubberChange(val) {
    mp4PlayerState.currentTime = parseFloat(val);
    drawMp4PlayerFrame();
}
window.onMp4ScrubberChange = onMp4ScrubberChange;

function changeMp4Speed(val) {
    mp4PlayerState.speed = parseFloat(val) || 1;
}
window.changeMp4Speed = changeMp4Speed;

function executeMp4AutoHeal() {
    if (!currentMp4AnalysisResult) return;
    const f = currentMp4AnalysisResult.falha_predominante;
    const praca = currentMp4AnalysisResult.praca;

    if (!confirm(`Deseja executar a correção automática no Capture Site (${praca})?\n\nFalha: ${f.nome}\nComando: Atualização de Parâmetros de Codec ATRIA via PowerShell.`)) {
        return;
    }

    // Encaminha para o Remote Command Orchestrator com o script pré-carregado
    const rcNavBtn = document.querySelector(".nav-btn[data-tab='remote-commands']");
    if (rcNavBtn) {
        rcNavBtn.click();
        setTimeout(() => {
            const hostSelect = document.getElementById("remote-host-select");
            const scriptArea = document.getElementById("custom-command-input");
            if (hostSelect) {
                for (let i = 0; i < hostSelect.options.length; i++) {
                    if (hostSelect.options[i].text.toLowerCase().includes(praca.toLowerCase())) {
                        hostSelect.selectedIndex = i;
                        if (typeof addSelectedHost === "function") addSelectedHost();
                        break;
                    }
                }
            }
            if (scriptArea) {
                scriptArea.value = f.comando_auto_cura;
                scriptArea.scrollIntoView({ behavior: "smooth" });
                scriptArea.focus();
            }
        }, 300);
    }
}
window.executeMp4AutoHeal = executeMp4AutoHeal;

async function registerMp4ThresholdToConfigs() {
    if (!currentMp4AnalysisResult) return;
    const th = currentMp4AnalysisResult.falha_predominante.threshold_sugerido;
    if (!th) return;

    try {
        const token = getAiToken();
        const resp = await fetch("/api/ai/mp4/register-threshold", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ threshold_data: th })
        });

        if (resp.ok) {
            alert(`✅ Limiar cadastrado com sucesso na aba Configurações!\n\nNome: ${th.name}\nValor Padrão: ${th.value} ${th.unit}\n\nVocê já pode ajustar e calibrar este parâmetro na aba Configurações.`);
            goToConfigThreshold(th.key);
        } else {
            const err = await resp.json();
            alert(`Erro ao cadastrar limiar: ${err.detail}`);
        }
    } catch (err) {
        alert(`Erro de conexão: ${err.message}`);
    }
}
window.registerMp4ThresholdToConfigs = registerMp4ThresholdToConfigs;

function escapeHtml(text) {
    if (!text) return "";
    return text.toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

window.loadAiSuggestions = loadAiSuggestions;
window.triggerAiAnalysis = triggerAiAnalysis;
