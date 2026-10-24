// dashboard/static/js/classificador_falhas.js
/**
 * Módulo de Frontend: Classificador de Falhas & Base de Conhecimento Broadcast (Machine Learning).
 * 
 * Repositório central de conhecimento do dashboard sobre tipos de falhas de qualidade,
 * suas assinaturas técnicas, causas raízes e playbooks de mitigação.
 */

let cachedClassifierData = null;

document.addEventListener("DOMContentLoaded", () => {
    // Escuta troca de aba para inicializar o classificador se selecionado
    const classificadorBtn = document.querySelector(".nav-btn[data-tab='classificador']");
    if (classificadorBtn) {
        classificadorBtn.addEventListener("click", () => {
            loadClassificadorFalhas();
        });
    }
});

async function loadClassificadorFalhas() {
    const icon = document.getElementById("iconReloadClassificador");
    if (icon) icon.classList.add("fa-spin");

    try {
        const res = await fetch("/api/classificador-falhas/analise-frota", { credentials: "omit" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        cachedClassifierData = data;

        // 1. Atualiza KPIs Globais
        const total = data.total_canais_auditados || 131;
        const nominais = data.total_nominais || 0;
        const falhas = data.total_falhas_ativas || 0;
        const pct = data.taxa_conformidade_pct != null ? data.taxa_conformidade_pct : 100;
        const rfCount = data.total_rf_digital || 0;
        const yuanCount = data.total_analog_yuan || 0;
        const streamCount = data.total_stream_radio || 0;
        const tipos = data.tipos_falha_catalogados || [];
        const pracas = data.pracas_resumo || [];

        const activeWithCases = tipos.filter(t => t.count > 0).length;

        const elPct = document.getElementById("clfKpiNominalPct");
        const elNom = document.getElementById("clfKpiNominalCount");
        const elTot = document.getElementById("clfKpiTotalChannels");
        const elSplit = document.getElementById("clfKpiSplitMeios");
        const elPatTot = document.getElementById("clfKpiTotalPatterns");
        const elRange = document.getElementById("clfKpiEnumRange");
        const elFailTot = document.getElementById("clfKpiTotalFailures");
        const elActiveTypes = document.getElementById("clfKpiActiveTypesCount");

        if (elPct) elPct.textContent = `${pct}%`;
        if (elNom) elNom.textContent = `${nominais} de ${total} canais nominais`;
        if (elTot) elTot.textContent = `${total}`;
        if (elSplit) elSplit.textContent = `${rfCount} Digital RF • ${yuanCount} Yuan Analógico • ${streamCount} Stream/FM`;
        if (elPatTot) elPatTot.textContent = `${tipos.length}`;
        if (elRange) elRange.textContent = `Enumerados #01 a #${String(tipos.length).padStart(2, '0')}`;
        if (elFailTot) elFailTot.textContent = `${falhas}`;
        if (elActiveTypes) elActiveTypes.textContent = `distribuídas em ${activeWithCases} tipos com incidência`;

        // 2. Renderiza a Tabela do Catálogo de Falhas
        renderClassificadorCatalogTable(tipos, total);

        // 3. Renderiza a Matriz de Praças
        renderClassificadorPracasTable(pracas);

    } catch (err) {
        console.error("Erro ao carregar o Classificador de Falhas:", err);
    } finally {
        if (icon) icon.classList.remove("fa-spin");
    }
}
window.loadClassificadorFalhas = loadClassificadorFalhas;

// Renderiza a Tabela de Catálogo Enumerado de Falhas (#01 a #N)
function renderClassificadorCatalogTable(tipos, totalChannels) {
    const tbody = document.getElementById("clfCatalogTableBody");
    if (!tbody) return;

    if (!tipos || tipos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 25px;">Nenhum tipo de falha catalogado.</td></tr>`;
        return;
    }

    const catFilter = (document.getElementById("clfFilterCategory")?.value || "all").toLowerCase();

    tbody.innerHTML = tipos.map(t => {
        if (catFilter !== "all" && t.category.toLowerCase() !== catFilter) {
            return "";
        }

        const count = t.count || 0;
        const pct = totalChannels > 0 ? Math.round((count / totalChannels) * 100) : 0;
        const numId = `#${String(t.enum_number).padStart(2, '0')}`;
        const color = t.color || "#f59e0b";
        const icon = t.icon || "fa-exclamation-triangle";
        const isAi = (t.discovered_by || "").includes("IA") || (t.discovered_by || "").includes("Gemini") || (t.discovered_by || "").includes("Machine Learning");

        let originHtml = `<span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; font-size: 9px;">🟢 Canônico</span>`;
        if (isAi) {
            originHtml = `<span class="badge" style="background: rgba(168, 85, 247, 0.2); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.35); font-size: 9px;">🧠 Aprendido IA</span>`;
        }

        return `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.04); transition: background 0.2s;" class="clf-row">
            <td style="padding: 9px 10px; text-align: center; font-family: monospace; font-weight: 800; color: ${color}; font-size: 12px;">
                ${numId}
            </td>
            <td style="padding: 9px 10px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <i class="${icon}" style="color: ${color}; font-size: 13px;"></i>
                    <strong style="color: #fff; font-size: 12px;">${escapeHtml(t.name)}</strong>
                </div>
            </td>
            <td style="padding: 9px 10px; font-size: 11px; color: #94a3b8;">
                ${escapeHtml(t.category)}
            </td>
            <td style="padding: 9px 10px; font-size: 10px; color: #38bdf8; font-family: monospace;">
                ${escapeHtml(t.scope_meio)}
            </td>
            <td style="padding: 9px 10px; font-size: 11px; color: #cbd5e1; font-family: monospace; max-width: 320px;">
                <span title="${escapeHtml(t.signature_rules)}">${escapeHtml(t.signature_rules)}</span>
            </td>
            <td style="padding: 9px 10px; text-align: center;">
                <div style="font-weight: 800; color: ${count > 0 ? color : '#64748b'}; font-size: 11px;">
                    ${count} <span style="font-size: 9px; color: var(--text-muted); font-weight: 400;">(${pct}%)</span>
                </div>
                <div style="height: 3px; width: 60px; background: rgba(255,255,255,0.08); border-radius: 2px; margin: 3px auto 0 auto; overflow: hidden;">
                    <div style="height: 100%; width: ${pct}%; background: ${color}; border-radius: 2px;"></div>
                </div>
            </td>
            <td style="padding: 9px 10px; text-align: center;">
                ${originHtml}
            </td>
            <td style="padding: 9px 10px; text-align: center;">
                <button class="btn-secondary" onclick="openFailureDetailModal('${escapeHtml(t.pattern_id)}')" style="padding: 4px 8px; font-size: 10px; border-radius: 4px; border-color: rgba(168, 85, 247, 0.4); color: #c084fc; white-space: nowrap;">
                    <i class="fas fa-search-plus"></i> Detalhes
                </button>
            </td>
        </tr>`;
    }).join("");
}

function filterClassificadorCatalog() {
    if (cachedClassifierData && cachedClassifierData.tipos_falha_catalogados) {
        renderClassificadorCatalogTable(cachedClassifierData.tipos_falha_catalogados, cachedClassifierData.total_canais_auditados || 131);
    }
}
window.filterClassificadorCatalog = filterClassificadorCatalog;

// Renderiza a Matriz Compacta de Praças
function renderClassificadorPracasTable(pracas) {
    const tbody = document.getElementById("clfPracasTableBody");
    if (!tbody) return;

    if (!pracas || pracas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 25px;">Nenhuma praça mapeada.</td></tr>`;
        return;
    }

    tbody.innerHTML = pracas.map(p => {
        const health = p.health_pct != null ? Math.round(p.health_pct) : 100;
        const isHealthy = health >= 90;
        const isWarning = health >= 60 && health < 90;
        const healthColor = isHealthy ? "#10b981" : (isWarning ? "#f59e0b" : "#ef4444");
        const statusBadge = isHealthy ? `<span class="badge badge-green" style="font-size: 9px;">100% Íntegra</span>` :
                            (isWarning ? `<span class="badge badge-yellow" style="font-size: 9px;">Degradação</span>` :
                            `<span class="badge badge-red" style="font-size: 9px;">Alerta</span>`);

        const failList = p.falhas_detectadas || [];
        const tot = p.total_canais || 0;
        const rfCount = p.canais_rf_digital || 0;
        const anCount = p.canais_analog_stream || 0;

        let failsHtml = `<span style="color: #10b981; font-size: 11px;"><i class="fas fa-check-circle"></i> Nominal</span>`;
        if (failList.length > 0) {
            failsHtml = failList.slice(0, 3).map(f => {
                return `<span class="badge" style="background: rgba(239, 68, 68, 0.15); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.3); font-size: 9px; margin-right: 4px; font-family: monospace;">${escapeHtml(f.canal)}: ${escapeHtml(f.pattern_name.split('/')[0])}</span>`;
            }).join("");
            if (failList.length > 3) {
                failsHtml += `<span style="font-size: 9px; color: var(--text-muted); font-weight: 700;">+${failList.length - 3}</span>`;
            }
        }

        return `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.04);" class="clf-praca-row" data-praca="${escapeHtml(p.praca).toLowerCase()}">
            <td style="padding: 7px 10px;">
                <strong style="color: #fff; font-size: 12px;">📍 ${escapeHtml(p.praca)}</strong>
            </td>
            <td style="padding: 7px 10px; text-align: center; font-weight: 700; color: #cbd5e1;">
                ${tot} MUX
            </td>
            <td style="padding: 7px 10px; text-align: center; font-size: 10px; color: #94a3b8; font-family: monospace;">
                ${rfCount} Digital RF • ${anCount} Yuan/Stream
            </td>
            <td style="padding: 7px 10px; text-align: center;">
                <div style="font-weight: 800; color: ${healthColor}; font-size: 11px;">
                    ${health}%
                </div>
                <div style="height: 4px; width: 80px; background: rgba(255,255,255,0.08); border-radius: 2px; margin: 2px auto 0 auto; overflow: hidden;">
                    <div style="height: 100%; width: ${health}%; background: ${healthColor}; border-radius: 2px;"></div>
                </div>
            </td>
            <td style="padding: 7px 10px; text-align: center;">
                ${statusBadge}
            </td>
            <td style="padding: 7px 10px;">
                ${failsHtml}
            </td>
            <td style="padding: 7px 10px; text-align: center;">
                <button class="btn-primary" onclick="diagnosePracaClusterAi('${escapeHtml(p.praca)}')" style="padding: 3px 10px; font-size: 10px; background: linear-gradient(135deg, #4f46e5, #0284c7); border: none; font-weight: 700; border-radius: 4px;">
                    <i class="fas fa-brain"></i> IA
                </button>
            </td>
        </tr>`;
    }).join("");
}

function filterClassificadorPracasTable() {
    const input = document.getElementById("clfSearchPracaInput");
    if (!input) return;
    const term = input.value.toLowerCase().trim();
    const rows = document.querySelectorAll(".clf-praca-row");
    rows.forEach(r => {
        const pracaName = r.getAttribute("data-praca") || "";
        if (!term || pracaName.includes(term)) {
            r.style.display = "";
        } else {
            r.style.display = "none";
        }
    });
}
window.filterClassificadorPracasTable = filterClassificadorPracasTable;

// Abre Modal com os Detalhes do Padrão e Playbook de Mitigação
function openFailureDetailModal(patternId) {
    if (!cachedClassifierData || !cachedClassifierData.tipos_falha_catalogados) return;
    const pat = cachedClassifierData.tipos_falha_catalogados.find(t => t.pattern_id === patternId);
    if (!pat) return;

    const modal = document.getElementById("modalFailureDetail");
    const badge = document.getElementById("modalFailBadge");
    const title = document.getElementById("modalFailTitle");
    const sig = document.getElementById("modalFailSignature");
    const causes = document.getElementById("modalFailCauses");
    const playbook = document.getElementById("modalFailPlaybook");
    const countEl = document.getElementById("modalFailCount");
    const list = document.getElementById("modalFailChannelsList");

    if (badge) {
        badge.textContent = `${pat.category.toUpperCase()} • ESCOPO: ${pat.scope_meio}`;
        badge.style.background = pat.color || "#a855f7";
        badge.style.color = "#000";
    }
    if (title) title.textContent = `#${String(pat.enum_number).padStart(2, '0')} — ${pat.name}`;
    if (sig) sig.textContent = pat.signature_rules || "Assinatura técnica não informada.";
    if (causes) causes.textContent = pat.root_causes || "Causas raízes em catalogação.";
    if (playbook) playbook.textContent = pat.mitigation_playbook || "Consulte o time de engenharia da praça.";

    const channels = pat.channels || [];
    if (countEl) countEl.textContent = channels.length;

    if (list) {
        if (channels.length === 0) {
            list.innerHTML = `<div style="text-align: center; color: var(--accent-green); padding: 12px; font-size: 11px;"><i class="fas fa-check-circle"></i> Nenhum canal afetado por esta falha no momento. Operação nominal.</div>`;
        } else {
            list.innerHTML = channels.map(ch => `
                <div style="background: rgba(0,0,0,0.3); border-radius: 4px; padding: 6px 10px; display: flex; justify-content: space-between; align-items: center; font-size: 11px; font-family: monospace; border-left: 3px solid ${pat.color || '#ef4444'};">
                    <div>
                        <strong style="color: #fff;">${escapeHtml(ch.praca)}</strong>: <span style="color: #38bdf8;">${escapeHtml(ch.canal)}</span>
                        <span style="font-size: 10px; color: var(--text-muted); margin-left: 6px;">[${escapeHtml(ch.meio)}]</span>
                    </div>
                    <div style="font-size: 10px; color: #cbd5e1;">
                        ${escapeHtml(ch.symptom || '')}
                    </div>
                </div>
            `).join("");
        }
    }

    if (modal) modal.style.display = "flex";
}
window.openFailureDetailModal = openFailureDetailModal;

function closeFailureDetailModal() {
    const modal = document.getElementById("modalFailureDetail");
    if (modal) modal.style.display = "none";
}
window.closeFailureDetailModal = closeFailureDetailModal;

// Minera e aprende um novo tipo de falha com IA
async function triggerMineFailurePattern() {
    if (!confirm("Deseja iniciar a Mineração e Aprendizado de Novo Tipo de Falha com IA (Google Gemini Pro)?\\n\\nO sistema analisará os incidentes e telemetrias não catalogadas para sintetizar uma nova assinatura técnica e incorporá-la permanentemente ao Classificador de Falhas.")) {
        return;
    }

    const btn = document.querySelector("button[onclick='triggerMineFailurePattern()']");
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Minerando com Gemini Pro...`;
    }

    try {
        const res = await fetch("/api/classificador-falhas/aprender-novo-padrao", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "omit"
        });

        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        const p = data.pattern || {};

        alert(`✨ NOVO TIPO DE FALHA APRENDIDO COM SUCESSO!\\n\\n• Número: #${String(data.enum_number || 10).padStart(2, '0')}\\n• Nome: ${p.name || 'Nova Falha'}\\n• Categoria: ${p.category || 'Geral'}\\n• Confiança ML: ${Math.round((p.confidence_score || 0.95) * 100)}%\\n\\nO novo padrão foi salvo no repositório central e agora pode ser consultado por todo o dashboard!`);

        await loadClassificadorFalhas();

    } catch (err) {
        alert("Erro no aprendizado com IA: " + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i class="fas fa-brain"></i> ✨ Minerar Falhas &amp; Aprender com IA`;
        }
    }
}
window.triggerMineFailurePattern = triggerMineFailurePattern;
