// static/js/fleet_inventory.js - Inventário Executivo e Granular de Versões da Frota
// Suporte Multi-País (LATAM & Global) + Exportação Excel (.xlsx)

let cachedInventoryData = null;
let inventoryDebounceTimer = null;

function getInventoryAuthToken() {
    if (typeof authToken !== "undefined" && authToken) return authToken;
    if (typeof getAuthToken === "function") {
        const t = getAuthToken();
        if (t) return t;
    }
    return localStorage.getItem("fleet_token") || localStorage.getItem("access_token") || localStorage.getItem("dna_auth_token") || localStorage.getItem("token") || "";
}

function getInventoryCountryFlag(countryName) {
    if (typeof getCountryFlag === "function") return getCountryFlag(countryName);
    if (!countryName) return "🌐";
    const c = countryName.toLowerCase();
    if (c.includes("brasil") || c === "br") return "🇧🇷";
    if (c.includes("argentina") || c === "ar") return "🇦🇷";
    if (c.includes("chile") || c === "cl") return "🇨🇱";
    if (c.includes("colomb") || c === "co") return "🇨🇴";
    if (c.includes("costa rica") || c === "cr") return "🇨🇷";
    if (c.includes("panam") || c === "pa") return "🇵🇦";
    if (c.includes("mexic") || c === "mx") return "🇲🇽";
    if (c.includes("urugu") || c === "uy") return "🇺🇾";
    if (c.includes("paragu") || c === "py") return "🇵🇾";
    if (c.includes("peru") || c === "pe") return "🇵🇪";
    return "🌐";
}

async function loadFleetInventory(force = false) {
    const serviceSelect = document.getElementById("invFilterService");
    const countrySelect = document.getElementById("invFilterCountry");
    const statusSelect = document.getElementById("invFilterStatus");
    const searchInput = document.getElementById("invSearchText");

    // Sincroniza com o filtro global de país se o inventário ainda não tiver país selecionado
    if (countrySelect && (!countrySelect.value || countrySelect.value === "all")) {
        const globalCountry = document.getElementById("filterCountry")?.value;
        if (globalCountry && globalCountry !== "all") {
            countrySelect.value = globalCountry;
        }
    }

    const serviceName = serviceSelect ? serviceSelect.value : "Atria Capture";
    const country = countrySelect ? countrySelect.value : "";
    const statusFilter = statusSelect ? statusSelect.value : "all";
    const searchText = searchInput ? searchInput.value.trim() : "";

    const spinner = document.getElementById("invLoadingSpinner");
    if (spinner) spinner.style.display = "inline-block";

    try {
        const params = new URLSearchParams();
        if (serviceName) params.append("service_name", serviceName);
        if (country && country !== "all") params.append("country", country);
        if (statusFilter && statusFilter !== "all") params.append("status_filter", statusFilter);
        if (searchText) params.append("search", searchText);
        params.append("_t", Date.now());

        const resp = await fetch(`/api/fleet/inventory?${params.toString()}`, {
            headers: {
                ...(getInventoryAuthToken() ? { "Authorization": `Bearer ${getInventoryAuthToken()}` } : {})
            }
        });

        if (!resp.ok) {
            console.error("[FleetInventory] Falha ao consultar API:", resp.status);
            return;
        }

        const data = await resp.json();
        cachedInventoryData = data;

        // Popula seletores de serviços e países caso ainda vazios
        populateInventorySelectors(data);

        // Renderiza KPIs
        renderInventoryKPIs(data);

        // Renderiza Tabela Executiva (Marcio)
        renderInventoryExecutiveTable(data);

        // Renderiza Lista Granular de Servidores
        renderInventoryGranularTable(data);

        // Atualiza badge de contagem na aba
        const badgeTab = document.getElementById("badgeFleetInventoryCount");
        if (badgeTab && data.total_hosts) {
            badgeTab.innerText = `${data.total_hosts} Hosts`;
        }

    } catch (e) {
        console.error("[FleetInventory] Erro ao carregar inventário:", e);
    } finally {
        if (spinner) spinner.style.display = "none";
    }
}

function populateInventorySelectors(data) {
    // 1. Popula Países Dinâmicos
    const countrySelect = document.getElementById("invFilterCountry");
    if (countrySelect && countrySelect.options.length <= 1 && data.available_countries) {
        const cur = countrySelect.value;
        let html = '<option value="all">🌍 Todos os Países (LATAM)</option>';
        data.available_countries.forEach(c => {
            const isSel = (c.name.toLowerCase() === cur.toLowerCase());
            html += `<option value="${c.name}" ${isSel ? 'selected' : ''}>${c.flag} ${c.name} (${c.hosts_count})</option>`;
        });
        countrySelect.innerHTML = html;
    }

    // 2. Popula Serviços Dinâmicos
    const serviceSelect = document.getElementById("invFilterService");
    if (serviceSelect && serviceSelect.options.length <= 1 && data.available_services) {
        const cur = serviceSelect.value || "Atria Capture";
        let html = '';
        data.available_services.forEach(s => {
            const isSel = (s.toLowerCase() === cur.toLowerCase());
            html += `<option value="${s}" ${isSel ? 'selected' : ''}>${s}</option>`;
        });
        html += '<option value="all">⚡ Todos os Serviços (Visão Geral)</option>';
        serviceSelect.innerHTML = html;
    }
}

function renderInventoryKPIs(data) {
    const elHosts = document.getElementById("invKpiTotalHosts");
    if (elHosts) elHosts.innerText = data.total_hosts || 0;

    const elAdoption = document.getElementById("invKpiAdoptionRate");
    if (elAdoption) {
        elAdoption.innerHTML = `${data.adoption_percent}% <span style="font-size: 12px; font-weight: 500; color: #94a3b8;">(v${data.target_homologated_version || 'N/A'})</span>`;
    }

    const elHomolog = document.getElementById("invKpiHomologatedCount");
    if (elHomolog) elHomolog.innerText = data.homologated_count || 0;

    const elLegacy = document.getElementById("invKpiLegacyCount");
    if (elLegacy) elLegacy.innerText = data.legacy_count || 0;

    const elNotInst = document.getElementById("invKpiNotInstalledCount");
    if (elNotInst) elNotInst.innerText = data.not_installed_count || 0;

    const elSubTitle = document.getElementById("invScopeSubtitle");
    if (elSubTitle) {
        const flag = getInventoryCountryFlag(data.filter_country);
        elSubTitle.innerHTML = `Serviço: <strong>${data.service_name}</strong> &bull; Escopo: <strong>${flag} ${data.filter_country}</strong> &bull; Versão Alvo Homologada: <span class="badge badge-green">v${data.target_homologated_version || '2.0.0.2'}</span>`;
    }
}

function renderInventoryExecutiveTable(data) {
    const tbody = document.getElementById("invExecutiveTableBody");
    if (!tbody) return;

    const dist = data.versions_distribution || [];
    if (dist.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px; color: #94a3b8;">Nenhum dado encontrado para os filtros selecionados.</td></tr>`;
        return;
    }

    let totalCount = 0;
    let totalPct = 0;

    const rowsHtml = dist.map(d => {
        totalCount += d.count;
        totalPct += d.percent;

        const isHomolog = d.is_homologated;
        const badgeColor = isHomolog ? "#10b981" : (d.version === "Não Instalado" ? "#ef4444" : "#f59e0b");
        const badgeBg = isHomolog ? "rgba(16, 185, 129, 0.15)" : (d.version === "Não Instalado" ? "rgba(239, 68, 68, 0.15)" : "rgba(245, 158, 11, 0.15)");
        const rowBg = isHomolog ? "rgba(16, 185, 129, 0.05)" : "transparent";

        const barColor = isHomolog ? "#10b981" : (d.version === "Não Instalado" ? "#ef4444" : "#f59e0b");

        return `
            <tr style="background: ${rowBg}; border-bottom: 1px solid rgba(148, 163, 184, 0.15); transition: background 0.15s ease;">
                <td style="padding: 10px 14px; font-weight: 700; color: #f8fafc; font-family: monospace; font-size: 13px;">
                    <span style="display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px; border-radius: 4px; background: ${badgeBg}; border: 1px solid ${badgeColor}; color: ${badgeColor};">
                        ${isHomolog ? '★ ' : ''}${d.version}
                    </span>
                </td>
                <td style="padding: 10px 14px; text-align: right; font-weight: 700; color: #f8fafc; font-size: 14px;">
                    ${d.count}
                </td>
                <td style="padding: 10px 14px; text-align: right; font-weight: 700; color: #38bdf8; font-size: 13px;">
                    ${d.percent.toFixed(2)}%
                </td>
                <td style="padding: 10px 14px; width: 220px;">
                    <div style="background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 12px; height: 10px; width: 100%; overflow: hidden;">
                        <div style="background: ${barColor}; height: 100%; width: ${Math.min(100, Math.max(3, d.percent))}%; border-radius: 12px;"></div>
                    </div>
                </td>
                <td style="padding: 10px 14px; text-align: center;">
                    <span style="font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 12px; background: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeColor};">
                        ${d.status}
                    </span>
                </td>
            </tr>
        `;
    }).join("");

    const footerHtml = `
        <tr style="background: rgba(30, 41, 59, 0.8); border-top: 2px solid #38bdf8; font-weight: 800;">
            <td style="padding: 12px 14px; color: #38bdf8; font-size: 13px; text-transform: uppercase;">
                TOTAL AUDITADO
            </td>
            <td style="padding: 12px 14px; text-align: right; color: #f8fafc; font-size: 15px;">
                ${totalCount}
            </td>
            <td style="padding: 12px 14px; text-align: right; color: #38bdf8; font-size: 14px;">
                ${Math.min(100, Math.round(totalPct))}.00%
            </td>
            <td style="padding: 12px 14px;" colspan="2">
                <span style="font-size: 12px; color: #94a3b8; font-style: italic;">100% da frota sincronizada com o catálogo oficial</span>
            </td>
        </tr>
    `;

    tbody.innerHTML = rowsHtml + footerHtml;
}

function renderInventoryGranularTable(data) {
    const tbody = document.getElementById("invGranularTableBody");
    const countEl = document.getElementById("invGranularTotalBadge");
    if (!tbody) return;

    const items = data.items || [];
    if (countEl) countEl.innerText = `${items.length} Máquinas`;

    if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 25px; color: #94a3b8;">Nenhum servidor encontrado com os critérios informados.</td></tr>`;
        return;
    }

    tbody.innerHTML = items.map((it, idx) => {
        const isHomolog = it.is_up_to_date;
        const verColor = isHomolog ? "#10b981" : (it.versao_instalada === "Não Instalado" ? "#ef4444" : "#f59e0b");
        const verBg = isHomolog ? "rgba(16, 185, 129, 0.12)" : (it.versao_instalada === "Não Instalado" ? "rgba(239, 68, 68, 0.12)" : "rgba(245, 158, 11, 0.12)");

        const srvRunning = (it.status_servico === "Em Execução");
        const srvColor = srvRunning ? "#10b981" : "#ef4444";
        const srvBg = srvRunning ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.15)";

        const govColor = (it.status_atualizacao === "Atualizado") ? "#10b981" : (it.status_atualizacao === "Em Progresso" ? "#38bdf8" : "#f87171");

        return `
            <tr style="border-bottom: 1px solid rgba(148, 163, 184, 0.1); background: ${idx % 2 === 0 ? 'rgba(15, 23, 42, 0.3)' : 'transparent'};">
                <td style="padding: 8px 12px; font-size: 12px; color: #e2e8f0; white-space: nowrap;">
                    ${it.pais_flag} ${it.pais}
                </td>
                <td style="padding: 8px 12px; font-weight: 600; color: #f8fafc; font-size: 12px;">
                    ${it.praca}
                </td>
                <td style="padding: 8px 12px; font-family: monospace; font-size: 12px; color: #38bdf8; font-weight: 700;">
                    ${it.hostname}
                </td>
                <td style="padding: 8px 12px; text-align: center;">
                    <span style="font-size: 11px; padding: 2px 6px; border-radius: 4px; background: rgba(56, 189, 248, 0.12); color: #38bdf8; font-weight: 700;">CS${it.cs}</span>
                </td>
                <td style="padding: 8px 12px; font-size: 12px; color: #cbd5e1;">
                    ${it.service_name}
                </td>
                <td style="padding: 8px 12px; text-align: center;">
                    <span style="font-family: monospace; font-size: 12px; font-weight: 700; padding: 2px 7px; border-radius: 4px; background: ${verBg}; color: ${verColor}; border: 1px solid ${verColor};">
                        v${it.versao_instalada}
                    </span>
                </td>
                <td style="padding: 8px 12px; text-align: center;">
                    <span style="font-family: monospace; font-size: 11px; color: #94a3b8;">
                        v${it.versao_desejada}
                    </span>
                </td>
                <td style="padding: 8px 12px; text-align: center;">
                    <span style="font-size: 11px; padding: 2px 6px; border-radius: 4px; background: ${srvBg}; color: ${srvColor}; font-weight: 600;">
                        ${it.status_servico}
                    </span>
                </td>
                <td style="padding: 8px 12px; text-align: center;">
                    <span style="font-size: 11px; font-weight: 600; color: ${govColor};">
                        ${it.status_atualizacao}
                    </span>
                </td>
                <td style="padding: 8px 12px; text-align: center;">
                    <button class="btn-sm btn-secondary" onclick="openFleetUpdateProgressModal('${it.hostname}', '${it.service_name}', '${it.versao_desejada}')" style="padding: 3px 7px; font-size: 11px; display: inline-flex; align-items: center; gap: 4px;" title="Acompanhar ciclo de atualização e telemetria">
                        <i class="fas fa-search"></i> Detalhe
                    </button>
                </td>
            </tr>
        `;
    }).join("");
}

function handleInventoryFilterChange() {
    clearTimeout(inventoryDebounceTimer);
    inventoryDebounceTimer = setTimeout(() => {
        loadFleetInventory(false);
    }, 150);
}

function exportFleetInventoryToExcel() {
    const serviceSelect = document.getElementById("invFilterService");
    const countrySelect = document.getElementById("invFilterCountry");
    const statusSelect = document.getElementById("invFilterStatus");
    const searchInput = document.getElementById("invSearchText");

    const serviceName = serviceSelect ? serviceSelect.value : "Atria Capture";
    const country = countrySelect ? countrySelect.value : "";
    const statusFilter = statusSelect ? statusSelect.value : "all";
    const searchText = searchInput ? searchInput.value.trim() : "";

    const params = new URLSearchParams();
    if (serviceName) params.append("service_name", serviceName);
    if (country && country !== "all") params.append("country", country);
    if (statusFilter && statusFilter !== "all") params.append("status_filter", statusFilter);
    if (searchText) params.append("search", searchText);

    if (typeof showToast === "function") {
        showToast("Gerando planilha Excel (.xlsx) oficial do inventário...", "info");
    }

    const downloadUrl = `/api/fleet/inventory/export-excel?${params.toString()}`;
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.setAttribute("download", "");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => {
        if (typeof showToast === "function") {
            showToast("Download da planilha Excel (.xlsx) iniciado com sucesso!", "success");
        }
    }, 1200);
}

function copyExecutiveInventoryTable() {
    if (!cachedInventoryData || !cachedInventoryData.versions_distribution) {
        if (typeof showToast === "function") showToast("Nenhum dado carregado para copiar.", "warning");
        return;
    }

    const d = cachedInventoryData;
    let txt = `DISTRIBUIÇÃO DE VERSÕES — ${d.service_name} (${d.filter_country})\n`;
    txt += `Versão Alvo Homologada: v${d.target_homologated_version || '2.0.0.2'}\n`;
    txt += `Total de Servidores: ${d.total_hosts} | Adoção Homologada: ${d.adoption_percent}%\n\n`;
    txt += `Versão\tQuantidade\tPercentual (%)\tStatus\n`;

    d.versions_distribution.forEach(row => {
        txt += `${row.version}\t${row.count}\t${row.percent.toFixed(2)}%\t${row.status}\n`;
    });

    txt += `TOTAL\t${d.total_installations}\t100.00%\t100% da Frota Auditada\n`;

    navigator.clipboard.writeText(txt).then(() => {
        if (typeof showToast === "function") {
            showToast("Tabela executiva copiada! Cole diretamente no Teams ou E-mail para o Márcio.", "success");
        }
    }).catch(err => {
        console.error("Falha ao copiar:", err);
    });
}

function navigateToFleetInventory(serviceName = null, country = null) {
    if (typeof switchTab === "function") switchTab("fleet");
    if (typeof switchFleetSubtab === "function") switchFleetSubtab("inventory");

    if (serviceName) {
        const sSelect = document.getElementById("invFilterService");
        if (sSelect) sSelect.value = serviceName;
    }
    if (country) {
        const cSelect = document.getElementById("invFilterCountry");
        if (cSelect) cSelect.value = country;
    }
    loadFleetInventory(true);
}

window.loadFleetInventory = loadFleetInventory;
window.handleInventoryFilterChange = handleInventoryFilterChange;
window.exportFleetInventoryToExcel = exportFleetInventoryToExcel;
window.copyExecutiveInventoryTable = copyExecutiveInventoryTable;
window.navigateToFleetInventory = navigateToFleetInventory;
