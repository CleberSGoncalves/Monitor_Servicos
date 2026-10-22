// dashboard/static/js/topology_map.js
// Topologia Geográfica de Capture Sites e Enlaces de RF (LATAM / Brasil)

let topologyMarketsData = [];
let selectedMarket = null;

async function loadTopologyMapData() {
    try {
        const token = getAuthToken();
        const res = await fetch("/api/fleet/topology-map", {
            headers: token ? { "Authorization": `Bearer ${token}` } : {}
        });
        if (!res.ok) return;
        topologyMarketsData = await res.json();
        renderTopologyMap();
        
        // Se nenhuma cidade estiver selecionada, seleciona a primeira com problema ou Pelotas
        if (!selectedMarket && topologyMarketsData.length > 0) {
            const problematic = topologyMarketsData.find(m => m.status_color === "red") ||
                                topologyMarketsData.find(m => m.cidade.toLowerCase() === "pelotas") ||
                                topologyMarketsData[0];
            selectMarket(problematic.id);
        }
    } catch (e) {
        console.error("Erro ao carregar mapa de topologia:", e);
    }
}

function renderTopologyMap() {
    const container = document.getElementById("topologyMapSvgContainer");
    if (!container) return;

    const countryFilter = (document.getElementById("mapFilterCountry")?.value || "all").toLowerCase();
    const stateFilter = (document.getElementById("mapFilterState")?.value || "all").toLowerCase();
    const healthFilter = (document.getElementById("mapFilterHealth")?.value || "all").toLowerCase();
    const searchFilter = (document.getElementById("mapSearchCity")?.value || "").toLowerCase().trim();

    // Filtra praças
    const filtered = topologyMarketsData.filter(m => {
        if (countryFilter !== "all" && m.pais.toLowerCase() !== countryFilter) return false;
        if (stateFilter !== "all" && m.uf.toLowerCase() !== stateFilter) return false;
        if (healthFilter !== "all" && m.status_color !== healthFilter) return false;
        if (searchFilter && !m.cidade.toLowerCase().includes(searchFilter) && !m.uf.toLowerCase().includes(searchFilter)) return false;
        return true;
    });

    // Dimensões do Viewport SVG (Projeção Equirretangular calibrada para América do Sul)
    const svgW = 760;
    const svgH = 540;

    // Bounding Box da América do Sul / Brasil
    const minLng = -74.0, maxLng = -34.0;
    const minLat = -34.5, maxLat = 5.5;

    function projectCoords(lat, lng) {
        const x = ((lng - minLng) / (maxLng - minLng)) * (svgW - 80) + 40;
        const y = ((maxLat - lat) / (maxLat - minLat)) * (svgH - 80) + 40;
        return { x: Math.round(x), y: Math.round(y) };
    }

    // Gera elementos SVG de fundo (Grade cartográfica e contorno simplificado do Brasil)
    let svgHtml = `
        <svg viewBox="0 0 ${svgW} ${svgH}" style="width: 100%; height: 100%; display: block;" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <radialGradient id="pulseGlowRed" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stop-color="#ef4444" stop-opacity="0.8"/>
                    <stop offset="100%" stop-color="#ef4444" stop-opacity="0"/>
                </radialGradient>
                <radialGradient id="pulseGlowYellow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stop-color="#facc15" stop-opacity="0.8"/>
                    <stop offset="100%" stop-color="#facc15" stop-opacity="0"/>
                </radialGradient>
                <radialGradient id="pulseGlowGreen" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stop-color="#10b981" stop-opacity="0.6"/>
                    <stop offset="100%" stop-color="#10b981" stop-opacity="0"/>
                </radialGradient>
                <filter id="shadowGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000" flood-opacity="0.6"/>
                </filter>
            </defs>

            <!-- Grade Cartográfica de Fundo -->
            <g stroke="rgba(255,255,255,0.04)" stroke-width="1">
                ${Array.from({ length: 9 }).map((_, i) => `<line x1="${i * 90}" y1="0" x2="${i * 90}" y2="${svgH}"/>`).join("")}
                ${Array.from({ length: 7 }).map((_, i) => `<line x1="0" y1="${i * 90}" x2="${svgW}" y2="${i * 90}"/>`).join("")}
            </g>

            <!-- Silhueta Vetorial Representativa da América do Sul e Costa do Brasil -->
            <path d="M 120 40 L 220 30 L 380 40 L 520 80 L 610 130 L 660 190 L 680 230 L 650 280 L 580 340 L 520 400 L 460 460 L 410 510 L 370 520 L 350 490 L 370 420 L 320 360 L 250 320 L 170 240 L 140 160 Z"
                  fill="rgba(15, 23, 42, 0.75)" stroke="rgba(56, 189, 248, 0.22)" stroke-width="1.5" stroke-dasharray="4,4" />

            <!-- Linhas de Enlace de RF entre Praças e Torres -->
            <g id="svgLinksLayer">
    `;

    filtered.forEach(m => {
        const pt = projectCoords(m.lat, m.lng);
        const isSel = selectedMarket && selectedMarket.id === m.id;
        
        // Se tiver torre com coordenadas, desenha vetor de RF
        if (m.towers_detail && m.towers_detail.length > 0) {
            const tw = m.towers_detail[0];
            const twPt = projectCoords(tw.lat, tw.lng);
            // Pequeno deslocamento representativo se torre for muito perto
            const dx = (twPt.x === pt.x && twPt.y === pt.y) ? pt.x + 16 : twPt.x;
            const dy = (twPt.x === pt.x && twPt.y === pt.y) ? pt.y - 14 : twPt.y;
            
            const strokeColor = m.status_color === "red" ? "rgba(239, 68, 68, 0.6)" :
                                (m.status_color === "yellow" ? "rgba(250, 204, 21, 0.5)" : "rgba(16, 185, 129, 0.35)");
            
            svgHtml += `
                <line x1="${pt.x}" y1="${pt.y}" x2="${dx}" y2="${dy}"
                      stroke="${strokeColor}" stroke-width="${isSel ? 2 : 1}" stroke-dasharray="3,3" />
                <circle cx="${dx}" cy="${dy}" r="3" fill="#38bdf8" opacity="0.8" />
            `;
        }
    });

    svgHtml += `</g><g id="svgPinsLayer">`;

    // Renderiza os Pinos das Cidades
    filtered.forEach(m => {
        const pt = projectCoords(m.lat, m.lng);
        const isSel = selectedMarket && selectedMarket.id === m.id;
        const color = m.status_color === "red" ? "#ef4444" : (m.status_color === "yellow" ? "#facc15" : "#10b981");
        const glowId = m.status_color === "red" ? "pulseGlowRed" : (m.status_color === "yellow" ? "pulseGlowYellow" : "pulseGlowGreen");

        svgHtml += `
            <g class="map-city-node" style="cursor: pointer;" onclick="selectMarket('${m.id}')" filter="url(#shadowGlow)">
                <!-- Halo Pulsante -->
                <circle cx="${pt.x}" cy="${pt.y}" r="${isSel ? 24 : 16}" fill="url(#${glowId})" opacity="${isSel ? 0.9 : 0.6}">
                    ${m.status_color === "red" ? `
                        <animate attributeName="r" values="14;24;14" dur="2s" repeatCount="indefinite"/>
                        <animate attributeName="opacity" values="0.8;0.2;0.8" dur="2s" repeatCount="indefinite"/>
                    ` : ''}
                </circle>

                <!-- Anel Externo de Seleção -->
                ${isSel ? `
                    <circle cx="${pt.x}" cy="${pt.y}" r="11" fill="none" stroke="#fff" stroke-width="2"/>
                ` : ''}

                <!-- Ponto Central do Capture Site -->
                <circle cx="${pt.x}" cy="${pt.y}" r="${isSel ? 7 : 5.5}" fill="${color}" stroke="#0b1329" stroke-width="1.5"/>

                <!-- Rótulo do Nome da Praça -->
                <text x="${pt.x}" y="${pt.y + 16}" text-anchor="middle"
                      fill="${isSel ? '#ffffff' : '#cbd5e1'}"
                      font-family="Inter, sans-serif" font-size="${isSel ? '12px' : '10px'}" font-weight="${isSel ? '800' : '600'}"
                      style="paint-order: stroke; stroke: #070d18; stroke-width: 3px; stroke-linecap: butt; stroke-linejoin: miter;">
                    ${m.cidade}
                </text>
            </g>
        `;
    });

    svgHtml += `</g></svg>`;
    container.innerHTML = svgHtml;
}

function selectMarket(marketId) {
    const market = topologyMarketsData.find(m => m.id === marketId);
    if (!market) return;

    selectedMarket = market;
    renderTopologyMap();

    // Atualiza Painel Lateral de Detalhes
    document.getElementById("mapDetailCityName").textContent = `${market.cidade} (${market.uf})`;
    
    const badge = document.getElementById("mapDetailStatusBadge");
    if (badge) {
        badge.className = market.status_color === "red" ? "badge badge-red" :
                          (market.status_color === "yellow" ? "badge badge-yellow" : "badge badge-green");
        badge.textContent = market.status_label;
    }

    document.getElementById("mapDetailCoords").textContent = `Lat: ${market.lat.toFixed(4)} | Lng: ${market.lng.toFixed(4)} • Região ${market.regiao}`;
    document.getElementById("mapDetailTowerName").textContent = market.main_tower;
    document.getElementById("mapDetailDistance").textContent = `${market.distance_km.toFixed(1)} km`;
    document.getElementById("mapDetailAzimuth").textContent = `${market.azimuth_deg.toFixed(1)}°`;
    
    const losEl = document.getElementById("mapDetailLOS");
    if (losEl) {
        losEl.textContent = market.distance_km < 25 ? "Desobstruída (LOS)" : "Atenuação por Relevo";
        losEl.style.color = market.distance_km < 25 ? "#10b981" : "#facc15";
    }

    const fspl = Math.round(32.44 + 20 * Math.log10(545) + 20 * Math.log10(Math.max(1, market.distance_km)));
    const fsplEl = document.getElementById("mapDetailFSPL");
    if (fsplEl) fsplEl.textContent = `${fspl} dB`;

    document.getElementById("mapDetailTotalChannels").textContent = market.total_channels;
    document.getElementById("mapDetailOutageChannels").textContent = market.outage_channels;
}

function jumpToCityIncidents() {
    if (!selectedMarket) return;
    
    // 1. Muda para a aba de Incidentes
    switchTab("incidents");

    // 2. Define o filtro da cidade
    const citySelect = document.getElementById("incFilterCity");
    if (citySelect) {
        let optExists = false;
        for (let i = 0; i < citySelect.options.length; i++) {
            if (citySelect.options[i].value.toLowerCase() === selectedMarket.cidade.toLowerCase()) {
                citySelect.selectedIndex = i;
                optExists = true;
                break;
            }
        }
        if (!optExists) {
            const opt = document.createElement("option");
            opt.value = selectedMarket.cidade;
            opt.textContent = `${selectedMarket.cidade} (${selectedMarket.uf})`;
            citySelect.appendChild(opt);
            citySelect.value = selectedMarket.cidade;
        }
    }

    // 3. Dispara a busca filtrada na aba de incidentes
    loadIncidentsHistoryData();
}

// Inicialização automática quando a aba de mapa for aberta
document.addEventListener("DOMContentLoaded", () => {
    // Se a aba inicial for map ou ao alternar
    const mapTabBtn = document.querySelector('button[data-tab="map"]');
    if (mapTabBtn) {
        mapTabBtn.addEventListener("click", () => {
            setTimeout(loadTopologyMapData, 50);
        });
    }
});
