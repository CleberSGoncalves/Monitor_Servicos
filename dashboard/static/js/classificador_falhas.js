// dashboard/static/js/classificador_falhas.js
/**
 * Módulo de Frontend: Classificador de Falhas & Base de Conhecimento Broadcast (Machine Learning).
 * 
 * Repositório central de conhecimento do dashboard sobre tipos de falhas de qualidade,
 * suas assinaturas técnicas, causas raízes, playbooks de mitigação e rastreabilidade (Falha X Canal).
 */

let cachedClassifierData = null;
let currentClfSubtab = "catalogo"; // "catalogo" ou "relacao"
let currentClfRelViewMode = "timeline"; // "timeline", "byChannel", "byFailure"

// Helper seguro para escape HTML (independente de escopo global)
function clfSafeEscape(text) {
    if (text === null || text === undefined) return "";
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

document.addEventListener("DOMContentLoaded", () => {
    // Escuta troca de aba na navbar principal para carregar o classificador
    const classificadorBtn = document.querySelector(".nav-btn[data-tab='classificador']");
    if (classificadorBtn) {
        classificadorBtn.addEventListener("click", () => {
            loadClassificadorFalhas();
        });
    }

    // Se a aba classificador já estiver aberta na inicialização, carrega automaticamente
    const tabClassificador = document.getElementById("tab-classificador");
    if (tabClassificador && tabClassificador.classList.contains("active")) {
        loadClassificadorFalhas();
    }
});

// ==============================================================================
// 1. CARREGAMENTO E SINCRONIZAÇÃO GLOBAL DOS DADOS
// ==============================================================================
async function loadClassificadorFalhas() {
    const icon = document.getElementById("iconReloadClassificador");
    if (icon) icon.classList.add("fa-spin");

    try {
        const res = await fetch("/api/classificador-falhas/analise-frota", { credentials: "same-origin" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        cachedClassifierData = data;

        // 1. Atualiza KPIs Globais do Topo
        const total = data.total_canais_auditados || 131;
        const nominais = data.total_nominais || 0;
        const falhas = data.total_falhas_ativas || 0;
        const pct = data.taxa_conformidade_pct != null ? data.taxa_conformidade_pct : 100;
        const rfCount = data.total_rf_digital || 0;
        const yuanCount = data.total_analog_yuan || 0;
        const streamCount = data.total_stream_radio || 0;
        const tipos = data.tipos_falha_catalogados || [];
        const pracas = data.pracas_resumo || [];
        const ocorrencias = data.ocorrencias_rastreabilidade || [];
        const totaisRel = data.totais_rastreabilidade || {};

        const activeWithCases = tipos.filter(t => t.count > 0).length;

        const elPct = document.getElementById("clfKpiNominalPct");
        const elNom = document.getElementById("clfKpiNominalCount");
        const elTot = document.getElementById("clfKpiTotalChannels");
        const elSplit = document.getElementById("clfKpiSplitMeios");
        const elPatTot = document.getElementById("clfKpiTotalPatterns");
        const elRange = document.getElementById("clfKpiEnumRange");
        const elFailTot = document.getElementById("clfKpiTotalFailures");
        const elActiveTypes = document.getElementById("clfKpiActiveTypesCount");
        const badgeFails = document.getElementById("clfSubtabFailsBadge");

        if (elPct) elPct.textContent = `${pct}%`;
        if (elNom) elNom.textContent = `${nominais} de ${total} canais nominais`;
        if (elTot) elTot.textContent = `${total}`;
        if (elSplit) elSplit.textContent = `${rfCount} Digital RF • ${yuanCount} Yuan Analógico • ${streamCount} Stream/FM`;
        if (elPatTot) elPatTot.textContent = `${tipos.length}`;
        if (elRange) elRange.textContent = `Enumerados #01 a #${String(tipos.length).padStart(2, '0')}`;
        if (elFailTot) elFailTot.textContent = `${falhas}`;
        if (elActiveTypes) elActiveTypes.textContent = `distribuídas em ${activeWithCases} tipos com incidência`;
        if (badgeFails) badgeFails.textContent = `${falhas}`;

        // 2. Renderiza Sub-Aba 1: Catálogo e Matriz de Praças
        renderClassificadorCatalogTable(tipos, total);
        renderClassificadorPracasTable(pracas);

        // 3. Renderiza Sub-Aba 2: Relação Falha X Canal (Rastreabilidade)
        renderClassificadorRelacaoSubtab(ocorrencias, totaisRel, tipos, pracas);

    } catch (err) {
        console.error("Erro ao carregar o Classificador de Falhas:", err);
    } finally {
        if (icon) icon.classList.remove("fa-spin");
    }
}
window.loadClassificadorFalhas = loadClassificadorFalhas;

// ==============================================================================
// 2. NAVEGAÇÃO DE SUB-ABAS (CATÁLOGO vs RELAÇÃO FALHA X CANAL)
// ==============================================================================
function switchClfSubtab(tabName) {
    currentClfSubtab = tabName;

    const btnCat = document.getElementById("btnClfSubtabCatalogo");
    const btnRel = document.getElementById("btnClfSubtabRelacao");
    const secCat = document.getElementById("clfSubtabContentCatalogo");
    const secRel = document.getElementById("clfSubtabContentRelacao");

    if (tabName === "catalogo") {
        if (btnCat) {
            btnCat.classList.add("active");
            btnCat.style.background = "rgba(168, 85, 247, 0.25)";
            btnCat.style.borderColor = "rgba(168, 85, 247, 0.5)";
            btnCat.style.color = "#fff";
        }
        if (btnRel) {
            btnRel.classList.remove("active");
            btnRel.style.background = "rgba(255,255,255,0.04)";
            btnRel.style.borderColor = "rgba(255,255,255,0.12)";
            btnRel.style.color = "#94a3b8";
        }
        if (secCat) secCat.style.display = "block";
        if (secRel) secRel.style.display = "none";
    } else {
        if (btnRel) {
            btnRel.classList.add("active");
            btnRel.style.background = "rgba(56, 189, 248, 0.25)";
            btnRel.style.borderColor = "rgba(56, 189, 248, 0.5)";
            btnRel.style.color = "#fff";
        }
        if (btnCat) {
            btnCat.classList.remove("active");
            btnCat.style.background = "rgba(255,255,255,0.04)";
            btnCat.style.borderColor = "rgba(255,255,255,0.12)";
            btnCat.style.color = "#94a3b8";
        }
        if (secCat) secCat.style.display = "none";
        if (secRel) secRel.style.display = "block";
    }
}
window.switchClfSubtab = switchClfSubtab;

// ==============================================================================
// 3. RENDERIZAÇÃO: CATÁLOGO DE FALHAS ENUMERADAS (#01 a #N)
// ==============================================================================
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
                    <strong style="color: #fff; font-size: 12px;">${clfSafeEscape(t.name)}</strong>
                </div>
            </td>
            <td style="padding: 9px 10px; font-size: 11px; color: #94a3b8;">
                ${clfSafeEscape(t.category)}
            </td>
            <td style="padding: 9px 10px; font-size: 10px; color: #38bdf8; font-family: monospace;">
                ${clfSafeEscape(t.scope_meio)}
            </td>
            <td style="padding: 9px 10px; font-size: 11px; color: #cbd5e1; font-family: monospace; max-width: 320px;">
                <span title="${clfSafeEscape(t.signature_rules)}">${clfSafeEscape(t.signature_rules)}</span>
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
                <button class="btn-secondary" onclick="openFailureDetailModal('${clfSafeEscape(t.pattern_id)}')" style="padding: 4px 8px; font-size: 10px; border-radius: 4px; border-color: rgba(168, 85, 247, 0.4); color: #c084fc; white-space: nowrap;">
                    <i class="fas fa-search-plus"></i> Playbook
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

// ==============================================================================
// 4. RENDERIZAÇÃO: MATRIZ DE PRAÇAS & SAÚDE OPERACIONAL
// ==============================================================================
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
                return `<span class="badge" style="background: rgba(239, 68, 68, 0.15); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.3); font-size: 9px; margin-right: 4px; font-family: monospace;">${clfSafeEscape(f.canal)}: ${clfSafeEscape(f.pattern_name.split('/')[0])}</span>`;
            }).join("");
            if (failList.length > 3) {
                failsHtml += `<span style="font-size: 9px; color: var(--text-muted); font-weight: 700;">+${failList.length - 3}</span>`;
            }
        }

        return `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.04);" class="clf-praca-row" data-praca="${clfSafeEscape(p.praca).toLowerCase()}">
            <td style="padding: 7px 10px;">
                <strong style="color: #fff; font-size: 12px;">📍 ${clfSafeEscape(p.praca)}</strong>
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
                <button class="btn-primary" onclick="diagnosePracaClusterAi('${clfSafeEscape(p.praca)}')" style="padding: 3px 10px; font-size: 10px; background: linear-gradient(135deg, #4f46e5, #0284c7); border: none; font-weight: 700; border-radius: 4px;">
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

// ==============================================================================
// 5. SUB-ABA 2: RELAÇÃO FALHA X CANAL (RASTREABILIDADE COMPLETA & TIMELINE)
// ==============================================================================
function renderClassificadorRelacaoSubtab(ocorrencias, totaisRel, tipos, pracas) {
    // 1. Atualiza KPIs de Rastreabilidade
    const elTotInc = document.getElementById("clfRelKpiTotalIncidents");
    const elUniqCh = document.getElementById("clfRelKpiUniqueChannels");
    const elTopPat = document.getElementById("clfRelKpiTopPattern");
    const elTopPrc = document.getElementById("clfRelKpiTopPraca");

    if (elTotInc) elTotInc.textContent = `${totaisRel.total_ocorrencias || ocorrencias.length || 0}`;
    if (elUniqCh) elUniqCh.textContent = `${totaisRel.canais_unicos_afetados || 0}`;
    if (elTopPat) elTopPat.textContent = `${totaisRel.falha_mais_recorrente || "Nenhuma"}`;
    if (elTopPrc) elTopPrc.textContent = `${totaisRel.praca_mais_impactada || "Nenhuma"}`;

    // 2. Preenche os Dropdowns de Filtro (se ainda não preenchidos)
    populateRelacaoFilters(tipos, pracas);

    // 3. Aplica os Filtros e Renderiza a View Selecionada
    filterClassificadorRelacao();
}

function populateRelacaoFilters(tipos, pracas) {
    const selPattern = document.getElementById("clfRelFilterPattern");
    const selPraca = document.getElementById("clfRelFilterPraca");

    if (selPattern && selPattern.options.length <= 1) {
        selPattern.innerHTML = `<option value="all">Todos os Tipos de Falha (#01 a #${tipos.length || 10})</option>`;
        tipos.forEach(t => {
            const num = `#${String(t.enum_number).padStart(2, '0')}`;
            const opt = document.createElement("option");
            opt.value = t.pattern_id;
            opt.textContent = `${num} - ${t.name.split('/')[0].trim()}`;
            selPattern.appendChild(opt);
        });
    }

    if (selPraca && selPraca.options.length <= 1) {
        selPraca.innerHTML = `<option value="all">Todas as Praças</option>`;
        const sortedPracas = [...pracas].sort((a,b) => a.praca.localeCompare(b.praca));
        sortedPracas.forEach(p => {
            const opt = document.createElement("option");
            opt.value = p.praca;
            opt.textContent = `📍 ${p.praca}`;
            selPraca.appendChild(opt);
        });
    }
}

// Alterna entre Modos de Visualização da Relação Falha X Canal
function switchClfRelacaoView(mode) {
    currentClfRelViewMode = mode;

    const btnTimeline = document.getElementById("btnClfViewTimeline");
    const btnByCh = document.getElementById("btnClfViewByChannel");
    const btnByFail = document.getElementById("btnClfViewByFailure");

    const viewTimeline = document.getElementById("clfRelViewTimeline");
    const viewByCh = document.getElementById("clfRelViewByChannel");
    const viewByFail = document.getElementById("clfRelViewByFailure");

    // Reseta botões
    [btnTimeline, btnByCh, btnByFail].forEach(b => {
        if (b) {
            b.style.background = "transparent";
            b.style.color = "#94a3b8";
            b.style.fontWeight = "600";
        }
    });

    // Esconde views
    if (viewTimeline) viewTimeline.style.display = "none";
    if (viewByCh) viewByCh.style.display = "none";
    if (viewByFail) viewByFail.style.display = "none";

    if (mode === "timeline") {
        if (btnTimeline) {
            btnTimeline.style.background = "#38bdf8";
            btnTimeline.style.color = "#000";
            btnTimeline.style.fontWeight = "700";
        }
        if (viewTimeline) viewTimeline.style.display = "block";
    } else if (mode === "byChannel") {
        if (btnByCh) {
            btnByCh.style.background = "#38bdf8";
            btnByCh.style.color = "#000";
            btnByCh.style.fontWeight = "700";
        }
        if (viewByCh) viewByCh.style.display = "block";
    } else if (mode === "byFailure") {
        if (btnByFail) {
            btnByFail.style.background = "#38bdf8";
            btnByFail.style.color = "#000";
            btnByFail.style.fontWeight = "700";
        }
        if (viewByFail) viewByFail.style.display = "block";
    }

    filterClassificadorRelacao();
}
window.switchClfRelacaoView = switchClfRelacaoView;

// Filtra e Renderiza a Visão Ativa
function filterClassificadorRelacao() {
    if (!cachedClassifierData || !cachedClassifierData.ocorrencias_rastreabilidade) return;

    const term = (document.getElementById("clfRelSearchInput")?.value || "").toLowerCase().trim();
    const patFilter = document.getElementById("clfRelFilterPattern")?.value || "all";
    const pracaFilter = document.getElementById("clfRelFilterPraca")?.value || "all";
    const meioFilter = document.getElementById("clfRelFilterMeio")?.value || "all";
    const sevFilter = document.getElementById("clfRelFilterSeverity")?.value || "all";

    const allOcc = cachedClassifierData.ocorrencias_rastreabilidade;

    const filtered = allOcc.filter(o => {
        // Filtro texto
        if (term) {
            const combined = `${o.canal} ${o.praca} ${o.pattern_name} ${o.symptom} ${o.pattern_num}`.toLowerCase();
            if (!combined.includes(term)) return false;
        }

        // Filtro Pattern
        if (patFilter !== "all" && o.pattern_id !== patFilter) return false;

        // Filtro Praça
        if (pracaFilter !== "all" && o.praca !== pracaFilter) return false;

        // Filtro Meio
        if (meioFilter !== "all") {
            if (meioFilter === "digital" && !o.is_digital_rf) return false;
            if (meioFilter === "yuan" && !o.is_analog_yuan) return false;
            if (meioFilter === "stream" && (o.is_digital_rf || o.is_analog_yuan)) return false;
        }

        // Filtro Severidade
        if (sevFilter !== "all" && o.severity !== sevFilter) return false;

        return true;
    });

    const countLabel = document.getElementById("clfRelFilterCountLabel");
    if (countLabel) {
        countLabel.textContent = `Mostrando ${filtered.length} de ${allOcc.length} ocorrências`;
    }

    if (currentClfRelViewMode === "timeline") {
        renderClassificadorRelacaoTable(filtered);
    } else if (currentClfRelViewMode === "byChannel") {
        renderClassificadorByChannelView(filtered);
    } else if (currentClfRelViewMode === "byFailure") {
        renderClassificadorByFailureView(filtered);
    }
}
window.filterClassificadorRelacao = filterClassificadorRelacao;

// MODO 1: Tabela Linha do Tempo (Timeline Detalhada)
function renderClassificadorRelacaoTable(ocorrencias) {
    const tbody = document.getElementById("clfRelTableBody");
    if (!tbody) return;

    if (!ocorrencias || ocorrencias.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: #10b981; padding: 35px; font-size: 13px;">
            <i class="fas fa-check-circle" style="font-size: 18px; margin-bottom: 6px; display: block;"></i>
            Nenhuma falha encontrada com os filtros selecionados. A operação está 100% nominal!
        </td></tr>`;
        return;
    }

    tbody.innerHTML = ocorrencias.map(o => {
        const sevColor = o.severity === "Crítica" ? "#ef4444" : (o.severity === "Atenção" ? "#f59e0b" : "#38bdf8");
        const sevBg = o.severity === "Crítica" ? "rgba(239, 68, 68, 0.15)" : (o.severity === "Atenção" ? "rgba(245, 158, 11, 0.15)" : "rgba(56, 189, 248, 0.15)");

        let meioBadge = `<span class="badge" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; font-size: 9px; font-family: monospace;">📡 Digital RF</span>`;
        if (o.is_analog_yuan) {
            meioBadge = `<span class="badge" style="background: rgba(168, 85, 247, 0.15); color: #c084fc; font-size: 9px; font-family: monospace;">🔌 Yuan TW6802</span>`;
        } else if (!o.is_digital_rf) {
            meioBadge = `<span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; font-size: 9px; font-family: monospace;">🌐 Stream/FM</span>`;
        }

        return `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.04); transition: background 0.15s;">
            <td style="padding: 8px 10px; font-family: monospace; font-size: 10px; color: #cbd5e1; white-space: nowrap;">
                <span title="${clfSafeEscape(o.timestamp)}"><i class="far fa-clock" style="color: #64748b; margin-right: 4px;"></i>${clfSafeEscape(o.timestamp_formatado || o.hora_curta)}</span>
            </td>
            <td style="padding: 8px 10px; white-space: nowrap;">
                <strong style="color: #fff; font-size: 11px;">📍 ${clfSafeEscape(o.praca)}</strong>
                <div style="font-size: 9px; color: var(--text-muted); font-family: monospace;">CS ${o.cs}</div>
            </td>
            <td style="padding: 8px 10px; white-space: nowrap;">
                <div style="font-weight: 700; color: #38bdf8; font-size: 12px; font-family: monospace;">${clfSafeEscape(o.canal)}</div>
                ${o.idpv ? `<span style="font-size: 9px; color: #94a3b8; font-family: monospace;">IDPV: ${clfSafeEscape(o.idpv)}</span>` : ""}
            </td>
            <td style="padding: 8px 10px; white-space: nowrap;">
                ${meioBadge}
            </td>
            <td style="padding: 8px 10px;">
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span class="badge" style="background: ${o.color || '#ef4444'}22; color: ${o.color || '#ef4444'}; border: 1px solid ${o.color || '#ef4444'}55; font-family: monospace; font-size: 9px; font-weight: 800;">
                        ${clfSafeEscape(o.pattern_num)}
                    </span>
                    <strong style="color: #fff; font-size: 11px; white-space: nowrap;">${clfSafeEscape(o.pattern_name.split('/')[0])}</strong>
                </div>
                <div style="font-size: 9px; color: var(--text-muted); margin-top: 2px;">
                    ${clfSafeEscape(o.category)}
                </div>
            </td>
            <td style="padding: 8px 10px; font-family: monospace; font-size: 10px; color: #cbd5e1; max-width: 320px;">
                <div style="background: rgba(0,0,0,0.25); padding: 4px 8px; border-radius: 4px; border-left: 2px solid ${o.color || '#38bdf8'}; line-height: 1.3;" title="${clfSafeEscape(o.symptom)}">
                    ${clfSafeEscape(o.symptom)}
                </div>
            </td>
            <td style="padding: 8px 10px; text-align: center;">
                <span class="badge" style="background: ${sevBg}; color: ${sevColor}; font-size: 9px; font-weight: 800;">
                    ${clfSafeEscape(o.severity)}
                </span>
            </td>
            <td style="padding: 8px 10px; text-align: center;">
                <span class="badge badge-red" style="font-size: 9px;">
                    🔴 ${clfSafeEscape(o.status)}
                </span>
            </td>
            <td style="padding: 8px 10px; text-align: center; white-space: nowrap;">
                <button class="btn-secondary" onclick="openFailureDetailModal('${clfSafeEscape(o.pattern_id)}')" style="padding: 3px 6px; font-size: 9px; border-radius: 4px; color: #c084fc; border-color: rgba(168, 85, 247, 0.4);" title="Ver Playbook de Solução">
                    <i class="fas fa-tools"></i> Playbook
                </button>
            </td>
        </tr>`;
    }).join("");
}

// MODO 2: Visão Agrupada por Canal (Visão Canal 360°)
function renderClassificadorByChannelView(ocorrencias) {
    const container = document.getElementById("clfRelByChannelContainer");
    if (!container) return;

    if (!ocorrencias || ocorrencias.length === 0) {
        container.innerHTML = `<div style="text-align: center; color: #10b981; grid-column: 1 / -1; padding: 40px;">
            <i class="fas fa-check-circle" style="font-size: 24px;"></i><br><br>Nenhum canal com falhas ativas no filtro atual.
        </div>`;
        return;
    }

    // Agrupa ocorrências por canal
    const byChannel = {};
    ocorrencias.forEach(o => {
        const key = `${o.praca}__${o.canal}`;
        if (!byChannel[key]) {
            byChannel[key] = {
                praca: o.praca,
                canal: o.canal,
                meio: o.meio,
                is_digital_rf: o.is_digital_rf,
                is_analog_yuan: o.is_analog_yuan,
                cs: o.cs,
                fails: []
            };
        }
        byChannel[key].fails.push(o);
    });

    container.innerHTML = Object.values(byChannel).map(ch => {
        let meioBadge = `<span class="badge" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; font-size: 9px;">📡 Digital RF</span>`;
        if (ch.is_analog_yuan) meioBadge = `<span class="badge" style="background: rgba(168, 85, 247, 0.15); color: #c084fc; font-size: 9px;">🔌 Yuan TW6802</span>`;
        else if (!ch.is_digital_rf) meioBadge = `<span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; font-size: 9px;">🌐 Stream</span>`;

        return `
        <div style="background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 12px 14px; display: flex; flex-direction: column; justify-content: space-between;">
            <div>
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                    <div>
                        <strong style="color: #38bdf8; font-size: 13px; font-family: monospace;">${clfSafeEscape(ch.canal)}</strong>
                        <div style="font-size: 10px; color: #94a3b8;">📍 ${clfSafeEscape(ch.praca)} (CS ${ch.cs})</div>
                    </div>
                    <div>${meioBadge}</div>
                </div>

                <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 10px;">
                    ${ch.fails.map(f => `
                        <div style="background: rgba(0,0,0,0.3); border-radius: 4px; padding: 6px 8px; border-left: 3px solid ${f.color || '#ef4444'};">
                            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 10px;">
                                <strong style="color: #fff;">${clfSafeEscape(f.pattern_num)} ${clfSafeEscape(f.pattern_name.split('/')[0])}</strong>
                                <span style="font-family: monospace; color: #64748b; font-size: 9px;">${clfSafeEscape(f.hora_curta || '')}</span>
                            </div>
                            <div style="font-size: 9px; color: #cbd5e1; font-family: monospace; margin-top: 3px; line-height: 1.2;">
                                ${clfSafeEscape(f.symptom)}
                            </div>
                        </div>
                    `).join("")}
                </div>
            </div>

            <div style="margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 8px; display: flex; justify-content: space-between; align-items: center;">
                <span class="badge badge-red" style="font-size: 9px;">${ch.fails.length} falha(s) ativa(s)</span>
                <button class="btn-secondary" onclick="openFailureDetailModal('${clfSafeEscape(ch.fails[0].pattern_id)}')" style="font-size: 9px; padding: 3px 8px; border-radius: 4px; color: #c084fc;">
                    <i class="fas fa-tools"></i> Ver Playbook
                </button>
            </div>
        </div>`;
    }).join("");
}

// MODO 3: Visão Agrupada por Tipo de Falha (Falha -> Canais Afetados)
function renderClassificadorByFailureView(ocorrencias) {
    const container = document.getElementById("clfRelByFailureContainer");
    if (!container) return;

    if (!ocorrencias || ocorrencias.length === 0) {
        container.innerHTML = `<div style="text-align: center; color: #10b981; padding: 40px;">
            <i class="fas fa-check-circle" style="font-size: 24px;"></i><br><br>Nenhum tipo de falha incidente no filtro atual.
        </div>`;
        return;
    }

    // Agrupa ocorrências por pattern_id
    const byPattern = {};
    ocorrencias.forEach(o => {
        if (!byPattern[o.pattern_id]) {
            byPattern[o.pattern_id] = {
                pattern_id: o.pattern_id,
                enum_number: o.enum_number,
                pattern_num: o.pattern_num,
                pattern_name: o.pattern_name,
                category: o.category,
                color: o.color,
                icon: o.icon,
                channels: []
            };
        }
        byPattern[o.pattern_id].channels.push(o);
    });

    container.innerHTML = Object.values(byPattern).map(pat => {
        return `
        <div style="background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 14px 18px; border-left: 5px solid ${pat.color || '#ef4444'};">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-family: monospace; font-weight: 800; color: ${pat.color || '#ef4444'}; font-size: 15px;">
                        ${clfSafeEscape(pat.pattern_num)}
                    </span>
                    <div>
                        <h4 style="margin: 0; font-size: 14px; font-weight: 800; color: #fff;">
                            ${clfSafeEscape(pat.pattern_name)}
                        </h4>
                        <div style="font-size: 10px; color: var(--text-muted);">${clfSafeEscape(pat.category)}</div>
                    </div>
                </div>

                <div style="display: flex; gap: 8px; align-items: center;">
                    <span class="badge badge-red" style="font-size: 10px; font-weight: 800;">
                        ${pat.channels.length} canais afetados
                    </span>
                    <button class="btn-secondary" onclick="openFailureDetailModal('${clfSafeEscape(pat.pattern_id)}')" style="font-size: 10px; padding: 4px 10px; color: #c084fc; border-color: rgba(168, 85, 247, 0.4);">
                        <i class="fas fa-search-plus"></i> Playbook Técnico
                    </button>
                </div>
            </div>

            <!-- Grid de Canais Afetados por esta Falha -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 8px;">
                ${pat.channels.map(ch => `
                    <div style="background: rgba(0,0,0,0.3); border-radius: 6px; padding: 8px 10px; display: flex; justify-content: space-between; align-items: center; font-size: 11px;">
                        <div>
                            <strong style="color: #38bdf8; font-family: monospace;">${clfSafeEscape(ch.canal)}</strong>
                            <div style="font-size: 9px; color: #94a3b8;">📍 ${clfSafeEscape(ch.praca)}</div>
                        </div>
                        <div style="text-align: right; font-family: monospace; font-size: 9px; color: #cbd5e1;">
                            <div>${clfSafeEscape(ch.hora_curta || '')}</div>
                            <span class="badge" style="background: rgba(255,255,255,0.06); font-size: 8px;">${clfSafeEscape(ch.meio.split(' ')[0])}</span>
                        </div>
                    </div>
                `).join("")}
            </div>
        </div>`;
    }).join("");
}

// ==============================================================================
// 6. MODAL: DETALHES DO PADRÃO & PLAYBOOK DE MITIGAÇÃO
// ==============================================================================
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
                        <strong style="color: #fff;">${clfSafeEscape(ch.praca)}</strong>: <span style="color: #38bdf8;">${clfSafeEscape(ch.canal)}</span>
                        <span style="font-size: 10px; color: var(--text-muted); margin-left: 6px;">[${clfSafeEscape(ch.meio)}]</span>
                    </div>
                    <div style="font-size: 10px; color: #cbd5e1;">
                        ${clfSafeEscape(ch.symptom || '')}
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

// ==============================================================================
// 7. MINERAÇÃO E APRENDIZADO DE NOVO TIPO DE FALHA COM IA (GEMINI PRO)
// ==============================================================================
async function triggerMineFailurePattern() {
    if (!confirm("Deseja iniciar a Mineração e Aprendizado de Novo Tipo de Falha com IA (Google Gemini Pro)?\n\nO sistema analisará os incidentes e telemetrias não catalogadas para sintetizar uma nova assinatura técnica e incorporá-la permanentemente ao Classificador de Falhas.")) {
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
            credentials: "same-origin"
        });

        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        const p = data.pattern || {};

        alert(`✨ NOVO TIPO DE FALHA APRENDIDO COM SUCESSO!\n\n• Número: #${String(data.enum_number || 10).padStart(2, '0')}\n• Nome: ${p.name || 'Nova Falha'}\n• Categoria: ${p.category || 'Geral'}\n• Confiança ML: ${Math.round((p.confidence_score || 0.95) * 100)}%\n\nO novo padrão foi salvo no repositório central e agora pode ser consultado por todo o dashboard!`);

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
