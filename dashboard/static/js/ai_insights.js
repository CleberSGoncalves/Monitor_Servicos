// static/js/ai_insights.js - Motor de Inteligência Artificial Proativa

async function loadAiSuggestions() {
    const container = document.getElementById("aiCardsGrid");
    container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 30px; color: var(--text-muted);">Carregando sugestões ativas da IA...</div>`;

    try {
        const resp = await fetch("/api/ai/suggestions", {
            headers: { "Authorization": `Bearer ${authToken}` }
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
    
    btn.disabled = true;
    btn.innerHTML = `<span>⏳</span> Analisando Métricas e Sinais da Frota...`;
    container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-highlight);"><span style="font-size: 24px;">🧠</span><br><br>A Inteligência Artificial está correlacionando eventos de telemetria, histórico de quedas, saúde dos tuners e padrões de esgotamento de disco...</div>`;

    try {
        const resp = await fetch("/api/ai/analyze", {
            method: "POST",
            headers: { "Authorization": `Bearer ${authToken}` }
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
        btn.disabled = false;
        btn.innerHTML = `<span>✨</span> Analisar Todo o Sistema com IA`;
    }
}

function renderAiCards(suggestions) {
    const container = document.getElementById("aiCardsGrid");
    if (!suggestions || suggestions.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 50px 20px; background: rgba(0,0,0,0.2); border-radius: var(--radius-lg); border: 1px dashed var(--border-color);">
                <span style="font-size: 32px;">🎯</span>
                <h3 style="margin-top: 10px; font-size: 16px;">Tudo Calibrado e Otimizado</h3>
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
                        <span style="font-size: 11px; color: var(--text-muted);">${s.id}</span>
                    </div>
                    <h4 class="ai-card-title">${s.title}</h4>
                    <p class="ai-card-desc">${s.description}</p>
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
        const resp = await fetch("/api/ai/decision", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${authToken}`
            },
            body: JSON.stringify({ suggestion_id: id, approve: approve })
        });

        if (resp.ok) {
            if (card) card.remove();
            if (approve) {
                alert("🎉 Sugestão aprovada! A regra foi integrada e aplicada automaticamente ao sistema de monitoração.");
            } else {
                alert("Sugestão recusada. O motor de IA aprendeu a sua preferência e não sugerirá este mesmo padrão novamente.");
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
