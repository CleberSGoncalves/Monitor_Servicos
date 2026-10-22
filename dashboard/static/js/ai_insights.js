// static/js/ai_insights.js - Motor de Inteligência Artificial Proativa

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
                <p style="color: var(--text-muted); font-size: 13px; margin-top: 6px;">Nenhuma anomalia oculta detectada. Clique no botão acima para rodar uma nova auditoria com IA a qualquer momento.</p>
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
                    <button class="btn-primary" style="flex: 1; font-size: 12px; padding: 8px;" onclick="decideAiSuggestion('${s.id}', true)">
                        ✅ Aprovar e Integrar
                    </button>
                    <button class="btn-secondary" style="flex: 1; font-size: 12px; padding: 8px;" onclick="decideAiSuggestion('${s.id}', false)">
                        ❌ Recusar
                    </button>
                </div>
            </div>
        `;
    }).join("");
}

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
            if (approve) {
                alert("🎉 Sugestão sistêmica aprovada! A regra foi integrada e aplicada automaticamente ao sistema de monitoração em toda a frota.");
            } else {
                alert("Sugestão recusada. O motor de IA aprendeu a sua preferência e apresentará novas alternativas sistêmicas na próxima análise.");
            }
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

function escapeHtml(text) {
    if (!text) return "";
    return text.toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

window.loadAiSuggestions = loadAiSuggestions;
window.triggerAiAnalysis = triggerAiAnalysis;
window.decideAiSuggestion = decideAiSuggestion;
