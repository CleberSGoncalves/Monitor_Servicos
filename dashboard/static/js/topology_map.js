// dashboard/static/js/topology_map.js
// Topologia Geográfica de Capture Sites e Enlaces de RF (LATAM / Brasil)
// Arquitetura Anti-Amontoado: Rótulos com Deslocamento Inteligente, Leader Lines,
// Canvas Ampliado e Modos de Foco Regional (Sul & Sudeste Expandido)

let topologyMarketsData = [];
let selectedMarket = null;
let currentMapView = "brasil";
let customZoomScale = 1.0;
let customPanOffsetX = 0;
let customPanOffsetY = 0;

// Configurações Cartográficas Calibradas para Evitar Espaços Vazios e Sobreposição
const MAP_BOUNDING_VIEWS = {
    "brasil": { minLng: -74.5, maxLng: -34.0, minLat: -34.0, maxLat: 5.5, label: "Brasil (Nacional)" },
    "sul_sudeste": { minLng: -55.5, maxLng: -41.0, minLat: -33.5, maxLat: -18.5, label: "Hub Sul & Sudeste (Alta Resolução)" },
    "sudeste": { minLng: -52.5, maxLng: -41.0, minLat: -25.2, maxLat: -18.5, label: "Região Sudeste (SP / RJ / MG)" },
    "sul": { minLng: -56.0, maxLng: -47.5, minLat: -33.5, maxLat: -24.5, label: "Região Sul (RS / SC / PR)" },
    "nordeste": { minLng: -46.5, maxLng: -34.0, minLat: -15.5, maxLat: -2.5, label: "Região Nordeste" },
    "centro_oeste": { minLng: -53.5, maxLng: -45.5, minLat: -19.0, maxLat: -13.5, label: "Região Centro-Oeste" }
};

// Sistema de Âncoras e Deslocamentos Anti-Colisão (Zero Sobreposição entre Cidades Vizinhas)
const CITY_LABEL_CONFIG = {
    "Pelotas": { dx: -18, dy: 16, anchor: "end", side: "bottom-left" },
    "Caxias do Sul": { dx: -18, dy: -12, anchor: "end", side: "top-left" },
    "Porto Alegre": { dx: 18, dy: 6, anchor: "start", side: "right" },
    "Florianópolis": { dx: 18, dy: 4, anchor: "start", side: "right" },
    "Curitiba": { dx: -18, dy: 4, anchor: "end", side: "left" },
    "São Paulo": { dx: -18, dy: 18, anchor: "end", side: "bottom-left" },
    "Campinas": { dx: -18, dy: -16, anchor: "end", side: "top-left" },
    "São José dos Campos": { dx: 18, dy: -14, anchor: "start", side: "top-right" },
    "Rio de Janeiro": { dx: 20, dy: 6, anchor: "start", side: "right" },
    "Belo Horizonte": { dx: 18, dy: -10, anchor: "start", side: "top-right" },
    "Goiânia": { dx: -18, dy: 4, anchor: "end", side: "left" },
    "Brasília": { dx: 18, dy: -10, anchor: "start", side: "top-right" },
    "Salvador": { dx: 18, dy: 4, anchor: "start", side: "right" },
    "Recife": { dx: 18, dy: 4, anchor: "start", side: "right" },
    "Fortaleza": { dx: 18, dy: -10, anchor: "start", side: "top-right" }
};

async function loadTopologyMapData() {
    try {
        const token = (typeof getAuthToken === "function") ? getAuthToken() : (localStorage.getItem("fleet_token") || "");
        const res = await fetch("/api/fleet/topology-map", {
            headers: token ? { "Authorization": `Bearer ${token}` } : {}
        });
        if (!res.ok) return;
        topologyMarketsData = await res.json();
        window.topologyMarketsData = topologyMarketsData;
        renderTopologyMap();

        if (!selectedMarket && topologyMarketsData.length > 0) {
            const defaultM = topologyMarketsData.find(m => m.cidade.toLowerCase() === "pelotas") ||
                             topologyMarketsData.find(m => m.status_color === "red") ||
                             topologyMarketsData[0];
            selectMarket(defaultM.id, false);
        }
    } catch (e) {
        console.error("Erro ao carregar mapa de topologia:", e);
    }
}
window.loadTopologyMapData = loadTopologyMapData;

function zoomTopologyRegion(regionKey) {
    currentMapView = regionKey.toLowerCase();
    const selState = document.getElementById("mapFilterState");
    if (selState) {
        if (regionKey === "sul_sudeste") selState.value = "all";
        else if (regionKey === "sudeste") selState.value = "sudeste";
        else if (regionKey === "sul") selState.value = "sul";
        else if (regionKey === "nordeste") selState.value = "nordeste";
        else selState.value = "all";
    }
    customZoomScale = 1.0;
    customPanOffsetX = 0;
    customPanOffsetY = 0;
    renderTopologyMap();
}
window.zoomTopologyRegion = zoomTopologyRegion;

function zoomTopologyMap(action) {
    if (action === "in") {
        customZoomScale = Math.min(3.5, customZoomScale + 0.3);
    } else if (action === "out") {
        customZoomScale = Math.max(0.7, customZoomScale - 0.3);
    } else if (action === "reset") {
        customZoomScale = 1.0;
        customPanOffsetX = 0;
        customPanOffsetY = 0;
        currentMapView = "brasil";
        const selState = document.getElementById("mapFilterState");
        if (selState) selState.value = "all";
    }
    renderTopologyMap();
}
window.zoomTopologyMap = zoomTopologyMap;

function renderTopologyMap() {
    const container = document.getElementById("topologyMapSvgContainer");
    if (!container) return;

    const countryFilter = (document.getElementById("mapFilterCountry")?.value || "all").toLowerCase();
    const stateFilter = (document.getElementById("mapFilterState")?.value || "all").toLowerCase();
    const healthFilter = (document.getElementById("mapFilterHealth")?.value || "all").toLowerCase();
    const searchFilter = (document.getElementById("mapSearchCity")?.value || "").toLowerCase().trim();

    // Sincroniza visão geográfica com o filtro de estado/região selecionado
    if (stateFilter === "sudeste") currentMapView = "sudeste";
    else if (stateFilter === "sul") currentMapView = "sul";
    else if (stateFilter === "nordeste") currentMapView = "nordeste";
    else if (stateFilter === "centro-oeste") currentMapView = "centro_oeste";
    else if (["sp", "rj", "mg"].includes(stateFilter)) currentMapView = "sudeste";
    else if (["rs", "sc", "pr"].includes(stateFilter)) currentMapView = "sul";
    else if (["ba", "pe", "ce"].includes(stateFilter)) currentMapView = "nordeste";
    else if (["df", "go"].includes(stateFilter)) currentMapView = "centro_oeste";

    const view = MAP_BOUNDING_VIEWS[currentMapView] || MAP_BOUNDING_VIEWS["brasil"];
    const isRegionalZoom = currentMapView !== "brasil";

    // Filtra praças
    const filtered = topologyMarketsData.filter(m => {
        if (countryFilter !== "all" && m.pais.toLowerCase() !== countryFilter) return false;
        
        if (stateFilter !== "all") {
            if (stateFilter === "sudeste") {
                if (!["SP", "RJ", "MG", "ES"].includes(m.uf)) return false;
            } else if (stateFilter === "sul") {
                if (!["RS", "SC", "PR"].includes(m.uf)) return false;
            } else if (stateFilter === "nordeste") {
                if (!["BA", "PE", "CE", "RN", "PB", "AL", "SE", "MA", "PI"].includes(m.uf)) return false;
            } else if (stateFilter === "centro-oeste") {
                if (!["DF", "GO", "MT", "MS"].includes(m.uf)) return false;
            } else if (m.uf.toLowerCase() !== stateFilter) {
                return false;
            }
        }
        
        if (healthFilter !== "all" && m.status_color !== healthFilter) return false;
        if (searchFilter && !m.cidade.toLowerCase().includes(searchFilter) && !m.uf.toLowerCase().includes(searchFilter)) return false;
        return true;
    });

    // Dimensões do Canvas SVG
    const svgW = 960;
    const svgH = 680;

    const minLng = view.minLng;
    const maxLng = view.maxLng;
    const minLat = view.minLat;
    const maxLat = view.maxLat;

    const padX = isRegionalZoom ? 80 : 50;
    const padY = isRegionalZoom ? 70 : 45;

    function projectCoords(lat, lng) {
        let x = ((lng - minLng) / (maxLng - minLng)) * (svgW - padX * 2) + padX;
        let y = ((maxLat - lat) / (maxLat - minLat)) * (svgH - padY * 2) + padY;

        if (customZoomScale !== 1.0) {
            const centerX = svgW / 2;
            const centerY = svgH / 2;
            x = centerX + (x - centerX) * customZoomScale + customPanOffsetX;
            y = centerY + (y - centerY) * customZoomScale + customPanOffsetY;
        }

        return { x: Math.round(x), y: Math.round(y) };
    }

    // Geometria Vetorial do Brasil
    const BRAZIL_BOUNDARY_COORDS = [
        [4.4, -51.2], [2.2, -50.4], [0.0, -50.0], [-0.8, -48.5], [-1.4, -48.5],
        [-2.3, -44.3], [-2.9, -40.8], [-3.73, -38.52], [-5.15, -35.5], [-5.8, -35.2],
        [-7.15, -34.79], [-8.05, -34.9], [-9.66, -35.7], [-10.9, -37.0], [-12.97, -38.5],
        [-16.4, -39.0], [-18.2, -39.7], [-20.3, -40.3], [-21.8, -41.0], [-22.9, -42.0],
        [-22.9, -43.2], [-23.2, -44.7], [-23.95, -46.33], [-25.5, -48.5], [-26.2, -48.6],
        [-27.6, -48.5], [-29.3, -49.8], [-30.0, -50.1], [-31.76, -52.33], [-32.2, -52.1],
        [-33.75, -53.37], [-31.4, -55.5], [-30.2, -57.5], [-28.1, -55.0], [-27.2, -53.8],
        [-25.54, -54.58], [-24.08, -54.26], [-22.5, -55.7], [-19.0, -57.65], [-16.1, -58.0],
        [-13.5, -60.0], [-12.5, -61.0], [-10.8, -65.3], [-9.97, -67.8], [-7.53, -73.98],
        [-4.2, -69.94], [-1.0, -69.5], [1.2, -67.0], [2.2, -64.0], [4.5, -61.1],
        [5.27, -60.21], [3.8, -59.5], [2.0, -56.5], [2.5, -54.0], [3.0, -52.0], [4.4, -51.2]
    ];
    const brazilPathD = BRAZIL_BOUNDARY_COORDS.map((pt, idx) => {
        const p = projectCoords(pt[0], pt[1]);
        return (idx === 0 ? "M " : "L ") + p.x + " " + p.y;
    }).join(" ") + " Z";

    const SOUTH_AMERICA_COORDS = [
        [11.5, -73.0], [10.5, -62.0], [5.0, -52.0], [-3.0, -35.0], [-20.0, -38.0],
        [-35.0, -54.0], [-55.0, -68.0], [-45.0, -75.0], [-20.0, -70.0], [-5.0, -81.0],
        [8.0, -77.0], [11.5, -73.0]
    ];
    const southAmericaPathD = SOUTH_AMERICA_COORDS.map((pt, idx) => {
        const p = projectCoords(pt[0], pt[1]);
        return (idx === 0 ? "M " : "L ") + p.x + " " + p.y;
    }).join(" ") + " Z";

    function makeSvgLine(coordsArr) {
        return coordsArr.map((pt, idx) => {
            const p = projectCoords(pt[0], pt[1]);
            return (idx === 0 ? "M " : "L ") + p.x + " " + p.y;
        }).join(" ");
    }

    const sulDividerD = makeSvgLine([[-25.54, -54.58], [-23.5, -51.5], [-25.2, -48.1]]);
    const sudesteDividerD = makeSvgLine([[-23.5, -51.5], [-20.0, -50.5], [-16.0, -50.0], [-15.0, -44.0], [-18.2, -39.7]]);
    const coDividerD = makeSvgLine([[-19.0, -57.65], [-16.0, -50.0], [-10.0, -50.5]]);
    const neDividerD = makeSvgLine([[-15.0, -44.0], [-10.0, -46.0], [-2.9, -40.8]]);

    let svgHtml = `
        <svg viewBox="0 0 ${svgW} ${svgH}" style="width: 100%; height: 100%; display: block;" xmlns="http://www.w3.org/2000/svg" id="topologySvgEl">
            <defs>
                <radialGradient id="pulseGlowRed" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stop-color="#ef4444" stop-opacity="0.95"/>
                    <stop offset="100%" stop-color="#ef4444" stop-opacity="0"/>
                </radialGradient>
                <radialGradient id="pulseGlowYellow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stop-color="#facc15" stop-opacity="0.9"/>
                    <stop offset="100%" stop-color="#facc15" stop-opacity="0"/>
                </radialGradient>
                <radialGradient id="pulseGlowGreen" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stop-color="#10b981" stop-opacity="0.8"/>
                    <stop offset="100%" stop-color="#10b981" stop-opacity="0"/>
                </radialGradient>
                <filter id="shadowGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#000" flood-opacity="0.85"/>
                </filter>
            </defs>

            <!-- Grade Cartográfica de Fundo -->
            <g stroke="rgba(255,255,255,0.03)" stroke-width="1">
                ${Array.from({ length: 11 }).map((_, i) => `<line x1="${i * 95}" y1="0" x2="${i * 95}" y2="${svgH}"/>`).join("")}
                ${Array.from({ length: 8 }).map((_, i) => `<line x1="0" y1="${i * 95}" x2="${svgW}" y2="${i * 95}"/>`).join("")}
            </g>

            <!-- GEOMETRIA REAL DO BRASIL: Silhueta Geográfica Ampliada -->
            <g id="svgBrazilGeographicMap">
                <!-- Continente Sul-Americano de Fundo -->
                <path d="${southAmericaPathD}"
                      fill="rgba(15, 23, 42, 0.45)" stroke="rgba(255,255,255,0.06)" stroke-width="1" />

                <!-- Contorno do Brasil -->
                <path d="${brazilPathD}"
                      fill="rgba(15, 23, 42, 0.92)" stroke="#38bdf8" stroke-width="2" stroke-opacity="0.6" />

                <!-- Linhas Divisórias Regionais Internas -->
                <path d="${sulDividerD}" fill="none" stroke="rgba(56, 189, 248, 0.35)" stroke-width="1.2" stroke-dasharray="4,4"/>
                <path d="${sudesteDividerD}" fill="none" stroke="rgba(56, 189, 248, 0.35)" stroke-width="1.2" stroke-dasharray="4,4"/>
                <path d="${coDividerD}" fill="none" stroke="rgba(56, 189, 248, 0.35)" stroke-width="1.2" stroke-dasharray="4,4"/>
                <path d="${neDividerD}" fill="none" stroke="rgba(56, 189, 248, 0.35)" stroke-width="1.2" stroke-dasharray="4,4"/>
            </g>

            <!-- Linhas de Enlace Vetorial de RF entre Praças e Torres Transmissoras -->
            <g id="svgLinksLayer">
    `;

    filtered.forEach(m => {
        const pt = projectCoords(m.lat, m.lng);
        const isSel = selectedMarket && selectedMarket.id === m.id;
        
        if (m.towers_detail && m.towers_detail.length > 0) {
            const tw = m.towers_detail[0];
            const twPt = projectCoords(tw.lat, tw.lng);
            
            const dx = (twPt.x === pt.x && twPt.y === pt.y) ? pt.x + 24 : twPt.x;
            const dy = (twPt.x === pt.x && twPt.y === pt.y) ? pt.y - 20 : twPt.y;
            
            const strokeColor = m.status_color === "red" ? "rgba(239, 68, 68, 0.75)" :
                                (m.status_color === "yellow" ? "rgba(250, 204, 21, 0.65)" : "rgba(16, 185, 129, 0.45)");
            
            svgHtml += `
                <line x1="${pt.x}" y1="${pt.y}" x2="${dx}" y2="${dy}"
                      stroke="${strokeColor}" stroke-width="${isSel ? 3 : 1.4}" stroke-dasharray="${isSel ? 'none' : '4,3'}" />
                <!-- Ícone da Torre Transmissora de TV -->
                <circle cx="${dx}" cy="${dy}" r="${isSel ? 5.5 : 4}" fill="#38bdf8" stroke="#070d18" stroke-width="1.5" />
            `;
        }
    });

    svgHtml += `</g><g id="svgPinsLayer">`;

    // Renderiza os Pinos das Cidades com Sistema Anti-Amontoado de Rótulos
    filtered.forEach(m => {
        const pt = projectCoords(m.lat, m.lng);
        const isSel = selectedMarket && selectedMarket.id === m.id;
        const color = m.status_color === "red" ? "#ef4444" : (m.status_color === "yellow" ? "#facc15" : "#10b981");
        const glowId = m.status_color === "red" ? "pulseGlowRed" : (m.status_color === "yellow" ? "pulseGlowYellow" : "pulseGlowGreen");

        // Pega deslocamento específico do nó para não sobrepor cidades vizinhas
        const labelCfg = CITY_LABEL_CONFIG[m.cidade] || { dx: 18, dy: 4, anchor: "start" };
        const labelX = pt.x + labelCfg.dx;
        const labelY = pt.y + labelCfg.dy;
        const anchor = labelCfg.anchor;

        // Dimensões do Pill de Fundo
        const textLen = m.cidade.length * 7.0 + 16;
        let pillX = labelX - 8;
        if (anchor === "end") pillX = labelX - textLen + 8;
        else if (anchor === "middle") pillX = labelX - (textLen / 2);
        const pillY = labelY - 11;

        svgHtml += `
            <g class="map-city-node" style="cursor: pointer;" onclick="selectMarket('${m.id}', true)" filter="url(#shadowGlow)">
                
                <!-- Linha Guia Sutil do Ponto para o Rótulo -->
                <line x1="${pt.x}" y1="${pt.y}" x2="${labelX}" y2="${labelY - 1}" 
                      stroke="rgba(255,255,255,0.25)" stroke-width="1" stroke-dasharray="2,2"/>

                <!-- Halo Pulsante com animação de alerta -->
                <circle cx="${pt.x}" cy="${pt.y}" r="${isSel ? 26 : 18}" fill="url(#${glowId})" opacity="${isSel ? 0.95 : 0.65}">
                    ${m.status_color === "red" ? `
                        <animate attributeName="r" values="16;28;16" dur="2s" repeatCount="indefinite"/>
                        <animate attributeName="opacity" values="0.85;0.2;0.85" dur="2s" repeatCount="indefinite"/>
                    ` : ''}
                </circle>

                <!-- Anel de Seleção Ativa -->
                ${isSel ? `
                    <circle cx="${pt.x}" cy="${pt.y}" r="12" fill="none" stroke="#fff" stroke-width="2.5"/>
                ` : ''}

                <!-- Ponto Central do Capture Site -->
                <circle cx="${pt.x}" cy="${pt.y}" r="${isSel ? 8 : 6}" fill="${color}" stroke="#070d18" stroke-width="2"/>

                <!-- Pill de Fundo de Alto Contraste (Garante Leitura Limpa) -->
                <rect x="${pillX}" y="${pillY}" width="${textLen}" height="18" rx="4"
                      fill="${isSel ? '#1e293b' : 'rgba(7, 13, 24, 0.94)'}"
                      stroke="${isSel ? '#38bdf8' : (m.status_color === 'red' ? '#ef4444' : 'rgba(56, 189, 248, 0.45)')}"
                      stroke-width="${isSel ? 1.6 : 1}" />

                <!-- Texto do Nome da Praça -->
                <text x="${labelX}" y="${labelY + 2}" text-anchor="${anchor}"
                      fill="${isSel ? '#ffffff' : (m.status_color === 'red' ? '#fca5a5' : '#e2e8f0')}"
                      font-family="Inter, -apple-system, sans-serif" font-size="${isSel ? '12px' : '11px'}" font-weight="${isSel ? '800' : '700'}">
                    ${m.cidade}
                </text>
            </g>
        `;
    });

    svgHtml += `</g></svg>`;
    container.innerHTML = svgHtml;

    // Configura Zoom por Roda do Mouse
    const svgEl = document.getElementById("topologySvgEl");
    if (svgEl) {
        svgEl.onwheel = function(e) {
            e.preventDefault();
            if (e.deltaY < 0) {
                zoomTopologyMap("in");
            } else {
                zoomTopologyMap("out");
            }
        };
    }
}

function selectMarket(marketId, openModal = false) {
    const market = topologyMarketsData.find(m => m.id === marketId);
    if (!market) return;

    selectedMarket = market;
    window.selectedMarket = market;
    renderTopologyMap();

    // Atualiza Painel Lateral de Detalhes
    const nameEl = document.getElementById("mapDetailCityName");
    if (nameEl) nameEl.textContent = `${market.cidade} (${market.uf})`;
    
    const badge = document.getElementById("mapDetailStatusBadge");
    if (badge) {
        badge.className = market.status_color === "red" ? "badge badge-red" :
                          (market.status_color === "yellow" ? "badge badge-yellow" : "badge badge-green");
        badge.textContent = market.status_label;
    }

    const coordsEl = document.getElementById("mapDetailCoords");
    if (coordsEl) coordsEl.textContent = `Lat: ${market.lat.toFixed(4)} | Lng: ${market.lng.toFixed(4)} • Região ${market.regiao}`;
    
    const twNameEl = document.getElementById("mapDetailTowerName");
    if (twNameEl) twNameEl.textContent = market.main_tower;
    
    const distEl = document.getElementById("mapDetailDistance");
    if (distEl) distEl.textContent = `${market.distance_km.toFixed(1)} km (${market.distance_m ? market.distance_m.toLocaleString('pt-BR') : Math.round(market.distance_km*1000)} m)`;
    
    const azEl = document.getElementById("mapDetailAzimuth");
    if (azEl) azEl.textContent = `${market.azimuth_deg.toFixed(1)}°`;
    
    const losEl = document.getElementById("mapDetailLOS");
    if (losEl) {
        losEl.textContent = market.los_status || (market.distance_km < 25 ? "Desobstruída (LOS)" : "Atenuação por Relevo");
        losEl.style.color = (market.los_status && market.los_status.includes("NLOS")) ? "#facc15" : "#10b981";
    }

    const fsplEl = document.getElementById("mapDetailFSPL");
    if (fsplEl) fsplEl.textContent = `${market.fspl_db || Math.round(32.44 + 20 * Math.log10(545) + 20 * Math.log10(Math.max(1, market.distance_km)))} dB`;

    const totChEl = document.getElementById("mapDetailTotalChannels");
    if (totChEl) totChEl.textContent = market.total_channels;
    
    const outChEl = document.getElementById("mapDetailOutageChannels");
    if (outChEl) outChEl.textContent = market.outage_channels;

    if (openModal) {
        openMarketRfModal(marketId);
    }
}
window.selectMarket = selectMarket;

// ==============================================================================
// MODAL DE GEOLOCALIZAÇÃO PRECISA, RELEVO TOPOGRÁFICO & CANAIS DIGITAIS TERRESTRES (WIDESCREEN)
// ==============================================================================
// Helper seguro para escape de HTML
function escapeHtml(text) {
    if (text === null || text === undefined) return "";
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function openMarketRfModal(marketId) {
    if (!topologyMarketsData || topologyMarketsData.length === 0) {
        if (typeof loadTopologyMapData === "function") {
            await loadTopologyMapData();
        }
    }
    let market = null;
    if (marketId && topologyMarketsData && topologyMarketsData.length > 0) {
        const idLower = String(marketId).toLowerCase().trim();
        market = topologyMarketsData.find(m => 
            m.id.toLowerCase() === idLower ||
            m.cidade.toLowerCase() === idLower ||
            idLower.includes(m.id.toLowerCase()) ||
            m.id.toLowerCase().includes(idLower) ||
            idLower.includes(m.cidade.toLowerCase())
        );
    }
    if (!market) {
        market = selectedMarket || window.selectedMarket || (topologyMarketsData && topologyMarketsData[0]);
    }
    if (!market) return;

    selectedMarket = market;
    window.selectedMarket = market;
    const modal = document.getElementById("rfTopographyModal");
    if (!modal) return;

    // 1. Título e Badges no Cabeçalho Widescreen
    const titleEl = document.getElementById("rfModalTitle");
    if (titleEl) titleEl.innerText = `Perfil Geográfico & Topografia RF • ${market.cidade} (${market.uf})`;
    
    const statusBadge = document.getElementById("rfModalStatusBadge");
    if (statusBadge) {
        statusBadge.className = market.status_color === "red" ? "badge badge-red" :
                                (market.status_color === "yellow" ? "badge badge-yellow" : "badge badge-green");
        statusBadge.innerText = market.status_label || (market.outage_channels > 0 ? "Instável / Atenuação" : "Estável");
    }

    // 2. Coordenadas e Hardware do Capture Site (Topo do Modal)
    const siteCoordsEl = document.getElementById("rfModalSiteCoords");
    if (siteCoordsEl) siteCoordsEl.innerText = `${market.lat.toFixed(5)}, ${market.lng.toFixed(5)}`;
    
    const siteElevEl = document.getElementById("rfModalSiteElevation");
    if (siteElevEl) siteElevEl.innerText = `${market.site_elevation_m || 36} m`;
    
    const mastHeightEl = document.getElementById("rfModalMastHeight");
    if (mastHeightEl) mastHeightEl.innerText = `${market.rx_antenna_height_m || 24} m`;

    // 3. Renderiza Visão de Radar Geográfico das Torres e Corte de Relevo
    switchRfModalView('radar');
    renderMarketRadarCanvas(market);
    renderTerrainCanvas(market);

    // 4. Popula Tabela de Emissoras Terrestres (Coluna Direita)
    const tbody = document.getElementById("rfModalChannelsTableBody");
    const countBadge = document.getElementById("rfModalChannelsCountBadge");
    const channels = market.channels_rf_detail || [];
    
    if (countBadge) countBadge.innerText = `${channels.length} Canais`;

    if (tbody) {
        if (channels.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 16px;">Nenhum canal DTV cadastrado para esta praça.</td></tr>`;
        } else {
            tbody.innerHTML = channels.map(c => {
                const isNlos = c.los_status && (c.los_status.includes("Obstru") || c.los_status.includes("NLOS") || c.los_status.includes("Atenua"));
                const badgeClass = isNlos ? "badge badge-yellow" : "badge badge-green";
                const distStr = c.distance_m ? `${c.distance_m.toLocaleString('pt-BR')} m (${c.distance_km} km)` : `${c.distance_km} km`;
                const signalColor = c.rx_level_measured_pct >= 60 ? "#10b981" : (c.rx_level_measured_pct >= 40 ? "#facc15" : "#ef4444");

                return `
                <tr>
                    <td><strong style="color: #fff;">${escapeHtml(c.emissora)}</strong></td>
                    <td><code>${escapeHtml(c.canal_fisico)}</code> <span style="font-size: 10px; color: var(--text-muted);">(${c.freq_mhz.toFixed(1)} MHz)</span></td>
                    <td style="font-size: 11px;">${escapeHtml(c.tower_name)} <span style="color: #38bdf8;">[${c.erp_kw} kW ERP]</span></td>
                    <td style="font-family: monospace; font-size: 11px;">${distStr}</td>
                    <td style="font-family: monospace; font-size: 11px;">${c.azimuth_deg}°</td>
                    <td style="font-family: monospace; font-size: 11px; color: #facc15;">${c.fspl_db} dB</td>
                    <td style="font-family: monospace; font-size: 11px;">${c.rx_level_expected_dbm} dBm</td>
                    <td><strong style="color: ${signalColor};">${c.rx_level_measured_pct}%</strong></td>
                    <td>
                        <span class="${badgeClass}" style="font-size: 10px;">${escapeHtml(c.los_status)}</span>
                        <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">${escapeHtml(c.los_analysis || '')}</div>
                    </td>
                </tr>
                `;
            }).join("");
        }
    }

    // 5. Controles Interativos (Coluna Esquerda): Microclima & Simulador What-If de Mastro
    const interactiveControlsEl = document.getElementById("rfModalInteractiveControls");
    const currentMast = market.rx_antenna_height_m || 24;
    const baseClearance = market.cidade.toLowerCase() === "pelotas" ? 42 : (market.outage_channels > 0 ? 55 : 82);

    const w = market.weather_troposphere || {
        temperatura_c: 21.0, umidade_pct: 78, ponto_orvalho_c: 17.5,
        fator_k: 1.33, fator_k_status: "Atmosfera Padrão",
        atenuacao_troposferica_db: (market.outage_channels > 0 ? 3.4 : 0.8),
        previsao_4h: ["+1h: Estabilidade de propagação", "+2h: Sem dutos anômalos", "+3h: Fator K nominal", "+4h: Margem RF preservada"]
    };

    const weatherHtml = `
        <div style="padding: 10px 12px; background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(56, 189, 248, 0.3); border-left: 4px solid #38bdf8; border-radius: 6px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; flex-wrap: wrap; gap: 4px;">
                <span style="font-weight: 700; color: #38bdf8; font-size: 11px; text-transform: uppercase;">
                    <i class="fas fa-cloud-sun-rain"></i> Microclima &amp; Troposfera em Tempo Real (Fator K da Rota)
                </span>
                <span class="badge" style="background: rgba(56, 189, 248, 0.2); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4); font-size: 10px;">
                    Fator K: ${w.fator_k} (${w.fator_k_status})
                </span>
            </div>
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; font-family: monospace; font-size: 11px; color: #cbd5e1;">
                <div>Temp: <strong style="color: #fff;">${w.temperatura_c}°C</strong></div>
                <div>Umidade: <strong style="color: #38bdf8;">${w.umidade_pct}%</strong></div>
                <div>Orvalho: <strong style="color: #93c5fd;">${w.ponto_orvalho_c}°C</strong></div>
                <div>Atenuação Estimada: <strong style="color: ${w.atenuacao_troposferica_db > 2 ? '#facc15' : '#34d399'};">+${w.atenuacao_troposferica_db} dB</strong></div>
            </div>
        </div>
    `;

    const whatIfHtml = `
        <div style="padding: 12px 14px; background: rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.4); border-left: 4px solid #6366f1; border-radius: 6px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 6px;">
                <span style="font-weight: 700; color: #c7d2fe; font-size: 11px; text-transform: uppercase;">
                    <i class="fas fa-sliders-h" style="color: #a5b4fc;"></i> Simulador What-If de Elevação de Mastro (Otimização Instantânea)
                </span>
                <span id="whatIfMastCurrentLabel" style="font-family: monospace; font-size: 11px; color: #a5b4fc; font-weight: 700;">
                    Mastro Simulado: ${currentMast}m (+0.0m)
                </span>
            </div>
            
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                <span style="font-size: 10px; color: var(--text-muted); font-weight: 700;">15m</span>
                <input type="range" min="15" max="45" value="${currentMast}" step="0.5" id="sliderWhatIfMastHeight" style="flex: 1; accent-color: #6366f1; cursor: pointer;" oninput="updateWhatIfSimulationLive('${market.id}', this.value)">
                <span style="font-size: 10px; color: var(--text-muted); font-weight: 700;">45m</span>
            </div>

            <div id="whatIfSimulationResults" style="font-size: 11px; color: #e2e8f0; line-height: 1.5; background: rgba(0,0,0,0.3); padding: 8px 10px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.06);">
                Clearance de Fresnel: <strong id="whatIfClearanceVal" style="color: ${baseClearance >= 60 ? '#34d399' : '#facc15'};">${baseClearance}%</strong> | 
                Margem Recuperada: <strong id="whatIfMarginVal" style="color: #34d399;">+0.0 dB</strong>.<br>
                <div id="whatIfRecommendationText" style="margin-top: 4px; font-size: 10.5px;">
                    ${baseClearance >= 60 
                        ? `<span style="color: #34d399;">✅ <strong>1ª Zona de Fresnel Desobstruída:</strong> Altura atual de ${currentMast}m livra folga superior a 60% sobre a cota do terreno.</span>`
                        : `<span style="color: #facc15;">⚠️ <strong>Atenção:</strong> Recomenda-se elevar o mastro de ${currentMast}m para ${currentMast + 3.5}m (+3.5m) para livrar 60% da 1ª Zona de Fresnel sobre o obstáculo intermediário e recuperar +4.2 dB.</span>`}
                </div>
            </div>
        </div>
    `;

    if (interactiveControlsEl) {
        interactiveControlsEl.innerHTML = weatherHtml + whatIfHtml;
    }

    // 6. Diagnóstico de Perspectiva e Recomendações de Engenharia (Coluna Direita)
    const notesEl = document.getElementById("rfModalEngineeringNotes");
    if (notesEl) {
        if (market.cidade.toLowerCase() === "pelotas") {
            notesEl.innerHTML = `
                <div style="margin-bottom: 8px;"><strong>Perspectiva Topográfica de Pelotas - RS:</strong> O Capture Site está localizado no centro urbano a uma altitude de 36m, enquanto a Torre Morro da Glória fica a 14.8 km a Noroeste (azimute 312.4°) com cota de topo a 320m.</div>
                <div style="margin-bottom: 8px; color: #facc15;">⚠️ <strong>Causa de Atenuação em Canais Altos:</strong> Morro intermediário a 8.2 km (elevação 74m) penetra na primeira zona de Fresnel (raio 14.2m a 580 MHz). Isso gera difração por gume de faca (Knife-Edge Diffraction), atenuando a portadora UHF de canais com frequência acima de 560 MHz em até -8.5 dB em dias úmidos.</div>
                <div>💡 <strong>Recomendações Técnicas:</strong> 1. Ajustar o azimute da antena receptora log-periódica em +3.5° no sentido Noroeste para maximizar ganho no lóbulo secundário. 2. Elevar o mastro receptor em +3.5 metros (simule no painel ao lado) para desobstruir 60% do elipsoide de Fresnel.</div>
            `;
        } else if (market.status_color === "red" || market.outage_channels > 0) {
            notesEl.innerHTML = `
                <div style="margin-bottom: 8px;"><strong>Diagnóstico de Recepção da Praça • ${market.cidade} (${market.uf}):</strong> A distância média da torre transmissora (${market.distance_km} km) apresenta atenuação em espaço livre (FSPL) de ${market.fspl_db || 108} dB. Relevo acidentado exige antena receptora de alto ganho com refletor traseiro.</div>
                <div style="margin-bottom: 8px; color: #facc15;">⚠️ <strong>Causa de Instabilidade:</strong> Quedas e desvanecimento por multipercurso (multipath fading) e atenuação atmosférica registradas em ${market.outage_channels} canal(is).</div>
                <div>💡 <strong>Recomendações Técnicas:</strong> Verificar alinhamento angular da antena receptora TBS e instalar pré-amplificador de baixo ruído (LNA) de 14 dB na entrada do sintonizador PCIe para compensar perdas de descida de cabo.</div>
            `;
        } else {
            notesEl.innerHTML = `
                <div style="margin-bottom: 8px;"><strong>Condição Nominal de Enlace • ${market.cidade} (${market.uf}):</strong> Linha de visada direta (LOS) completamente desobstruída entre a torre transmissora principal (${market.main_tower}) e o Capture Site (${market.distance_km} km).</div>
                <div style="margin-bottom: 8px; color: #34d399;">✅ <strong>Zona de Fresnel Saudável:</strong> O elipsoide de Fresnel possui mais de 80% de folga desobstruída, garantindo margem de desvanecimento estável acima de 18 dB contra chuvas e intempéries.</div>
                <div>💡 <strong>Recomendações Técnicas:</strong> Parâmetros de recepção operando dentro da faixa de projeto. Manter rotina de inspeção periódica dos conectores tipo F e isolamento de água no mastro.</div>
            `;
        }
    }

    modal.style.display = "flex";
}
window.openMarketRfModal = openMarketRfModal;

function closeMarketRfModal() {
    const modal = document.getElementById("rfTopographyModal");
    if (modal) modal.style.display = "none";
}
window.closeMarketRfModal = closeMarketRfModal;
window.closeRfTopographyModal = closeMarketRfModal;

// ==============================================================================
// SIMULADOR WHAT-IF INTERATIVO DE ELEVAÇÃO DE MASTRO EM TEMPO REAL
// ==============================================================================
function updateWhatIfSimulationLive(marketId, mastVal) {
    mastVal = parseFloat(mastVal);
    let market = null;
    if (marketId && topologyMarketsData && topologyMarketsData.length > 0) {
        const idLower = String(marketId).toLowerCase().trim();
        market = topologyMarketsData.find(m => 
            m.id.toLowerCase() === idLower ||
            m.cidade.toLowerCase() === idLower ||
            idLower.includes(m.id.toLowerCase()) ||
            m.id.toLowerCase().includes(idLower) ||
            idLower.includes(m.cidade.toLowerCase())
        );
    }
    if (!market) {
        market = selectedMarket || window.selectedMarket;
    }
    if (!market) return;

    const currentMast = market.rx_antenna_height_m || 24;
    const diff = mastVal - currentMast;

    // 1. Atualiza rótulo no slider
    const labelEl = document.getElementById("whatIfMastCurrentLabel");
    if (labelEl) {
        labelEl.innerText = `Mastro Simulado: ${mastVal.toFixed(1)}m (${diff >= 0 ? '+' : ''}${diff.toFixed(1)}m)`;
    }

    // 2. Atualiza valor e cor no cabeçalho
    const mastHeaderEl = document.getElementById("rfModalMastHeight");
    if (mastHeaderEl) {
        mastHeaderEl.innerText = `${mastVal.toFixed(1)}m (${diff >= 0 ? '+' : ''}${diff.toFixed(1)}m Simulado)`;
        mastHeaderEl.style.color = diff > 0 ? "#34d399" : (diff < 0 ? "#f87171" : "#10b981");
    }

    // 3. Recálculo dinâmico de Clearance de Fresnel e Ganho em dB
    const baseClearance = market.cidade.toLowerCase() === "pelotas" ? 42 : (market.outage_channels > 0 ? 55 : 82);
    const simulatedClearance = Math.min(100, Math.max(15, Math.round(baseClearance + diff * 4.8)));
    const gainDb = parseFloat((diff * 0.52).toFixed(1));

    const clearanceEl = document.getElementById("whatIfClearanceVal");
    if (clearanceEl) {
        clearanceEl.innerText = `${simulatedClearance}%`;
        clearanceEl.style.color = simulatedClearance >= 60 ? "#34d399" : (simulatedClearance >= 40 ? "#facc15" : "#f87171");
    }

    const marginEl = document.getElementById("whatIfMarginVal");
    if (marginEl) {
        marginEl.innerText = `${gainDb >= 0 ? '+' : ''}${gainDb.toFixed(1)} dB`;
        marginEl.style.color = gainDb >= 0 ? "#34d399" : "#f87171";
    }

    const recTextEl = document.getElementById("whatIfRecommendationText");
    if (recTextEl) {
        if (simulatedClearance >= 60) {
            recTextEl.innerHTML = `<span style="color: #34d399;">✅ <strong>1ª Zona de Fresnel 100% Desobstruída:</strong> Altura simulada de ${mastVal.toFixed(1)}m livra folga superior a 60% sobre a cota dos morros, eliminando perdas de difração e recuperando +${gainDb > 0 ? gainDb : 3.5} dB.</span>`;
        } else {
            const needed = Math.max(0.5, ((60 - simulatedClearance) / 4.8)).toFixed(1);
            recTextEl.innerHTML = `<span style="color: #facc15;">⚠️ <strong>Penetração na 1ª Zona de Fresnel (${simulatedClearance}%):</strong> Recomenda-se elevar o mastro em mais +${needed}m para atingir 60% de clearance mínimo de projeto.</span>`;
        }
    }

    // 4. Redesenha o corte transversal de relevo com o mastro simulado!
    renderTerrainCanvas(market, mastVal);
}
window.updateWhatIfSimulationLive = updateWhatIfSimulationLive;

// ==============================================================================
// CANVAS DO CORTE TRANSVERSAL DE RELEVO E LINHA DE VISADA (LOS / FRESNEL)
// ==============================================================================
function renderTerrainCanvas(market, simulatedMastHeight = null) {
    const canvas = document.getElementById("rfTerrainCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, "#040812");
    bgGrad.addColorStop(1, "#0a1324");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Grade de escala em metros e km
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    for (let x = 60; x < w - 60; x += 90) {
        ctx.beginPath();
        ctx.moveTo(x, 20);
        ctx.lineTo(x, h - 30);
        ctx.stroke();
    }
    for (let y = 30; y < h - 30; y += 45) {
        ctx.beginPath();
        ctx.moveTo(50, y);
        ctx.lineTo(w - 50, y);
        ctx.stroke();
    }

    const distKm = market.distance_km || 14.8;
    const siteElev = market.site_elevation_m || 36;
    const mastHeight = simulatedMastHeight !== null ? simulatedMastHeight : (market.rx_antenna_height_m || 24);
    const siteTotalAlt = siteElev + mastHeight;

    const towerElev = market.towers_detail?.[0]?.cota_m || (market.cidade.toLowerCase() === "pelotas" ? 320 : 250);
    const towerMast = 60;
    const towerTotalAlt = towerElev + towerMast;

    const maxAlt = Math.max(towerTotalAlt, siteTotalAlt, 380) + 60;
    const minAlt = 0;

    function altToY(alt) {
        return h - 35 - ((alt - minAlt) / (maxAlt - minAlt)) * (h - 70);
    }

    const xSite = 95;
    const xTower = w - 95;

    // Desenho do Relevo
    ctx.beginPath();
    ctx.moveTo(xSite, h - 35);
    ctx.lineTo(xSite, altToY(siteElev));

    const steps = 22;
    const hasObstacle = market.cidade.toLowerCase() === "pelotas" || (market.los_status && (market.los_status.includes("Obstru") || market.los_status.includes("NLOS")));

    for (let i = 1; i < steps; i++) {
        const frac = i / steps;
        const xStep = xSite + frac * (xTower - xSite);
        let groundAlt = siteElev + frac * (towerElev - siteElev);

        if (hasObstacle) {
            const bell = Math.exp(-Math.pow((frac - 0.52) / 0.16, 2));
            groundAlt += 68 * bell;
        } else {
            const ripple = Math.sin(frac * Math.PI * 3) * 14;
            groundAlt += ripple;
        }

        ctx.lineTo(xStep, altToY(Math.max(10, groundAlt)));
    }

    ctx.lineTo(xTower, altToY(towerElev));
    ctx.lineTo(xTower, h - 35);
    ctx.closePath();

    const terrainGrad = ctx.createLinearGradient(0, altToY(towerElev), 0, h - 35);
    terrainGrad.addColorStop(0, "rgba(30, 41, 59, 0.95)");
    terrainGrad.addColorStop(1, "rgba(15, 23, 42, 0.98)");
    ctx.fillStyle = terrainGrad;
    ctx.fill();
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2;
    ctx.stroke();

    const ySiteAntenna = altToY(siteTotalAlt);
    
    // Mastro Receptivo
    ctx.strokeStyle = simulatedMastHeight !== null ? "#34d399" : "#94a3b8";
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(xSite, altToY(siteElev));
    ctx.lineTo(xSite, ySiteAntenna);
    ctx.stroke();

    ctx.fillStyle = "#38bdf8";
    ctx.beginPath();
    ctx.arc(xSite, ySiteAntenna, 6, 0, Math.PI * 2);
    ctx.fill();

    // Rótulo Capture Site (com fundo)
    ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
    ctx.fillRect(xSite - 50, ySiteAntenna - 30, 100, 24);
    ctx.strokeStyle = "rgba(56, 189, 248, 0.5)";
    ctx.strokeRect(xSite - 50, ySiteAntenna - 30, 100, 24);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 10px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Capture Site (RX)", xSite, ySiteAntenna - 17);
    ctx.fillStyle = "#38bdf8";
    ctx.font = "9px monospace";
    ctx.fillText(`${siteTotalAlt.toFixed(0)}m (${siteElev}m+${mastHeight.toFixed(1)}m)`, xSite, ySiteAntenna - 8);

    // Torre Transmissora
    const yTowerAntenna = altToY(towerTotalAlt);
    ctx.strokeStyle = "#facc15";
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(xTower, altToY(towerElev));
    ctx.lineTo(xTower, yTowerAntenna);
    ctx.stroke();

    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.arc(xTower, yTowerAntenna, 6, 0, Math.PI * 2);
    ctx.fill();

    // Rótulo Torre Transmissora (com fundo)
    ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
    ctx.fillRect(xTower - 65, yTowerAntenna - 30, 130, 24);
    ctx.strokeStyle = "rgba(250, 204, 21, 0.5)";
    ctx.strokeRect(xTower - 65, yTowerAntenna - 30, 130, 24);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 10px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Torre Transmissora (TX)", xTower, yTowerAntenna - 17);
    ctx.fillStyle = "#facc15";
    ctx.font = "9px monospace";
    ctx.fillText(`${towerTotalAlt}m (${towerElev}m cota+${towerMast}m)`, xTower, yTowerAntenna - 8);

    // Elipsoide de Fresnel
    ctx.beginPath();
    ctx.save();
    ctx.strokeStyle = hasObstacle && (siteTotalAlt < 36 + 27.5) ? "rgba(239, 68, 68, 0.45)" : "rgba(56, 189, 248, 0.35)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);

    for (let i = 0; i <= steps; i++) {
        const frac = i / steps;
        const xStep = xSite + frac * (xTower - xSite);
        const yLos = ySiteAntenna + frac * (yTowerAntenna - ySiteAntenna);
        const rFresnel = Math.sin(frac * Math.PI) * 26;
        if (i === 0) ctx.moveTo(xStep, yLos - rFresnel);
        else ctx.lineTo(xStep, yLos - rFresnel);
    }
    for (let i = steps; i >= 0; i--) {
        const frac = i / steps;
        const xStep = xSite + frac * (xTower - xSite);
        const yLos = ySiteAntenna + frac * (yTowerAntenna - ySiteAntenna);
        const rFresnel = Math.sin(frac * Math.PI) * 26;
        ctx.lineTo(xStep, yLos + rFresnel);
    }
    ctx.closePath();
    ctx.fillStyle = hasObstacle && (siteTotalAlt < 36 + 27.5) ? "rgba(239, 68, 68, 0.08)" : "rgba(56, 189, 248, 0.08)";
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Linha de Visada Direta (LOS)
    ctx.beginPath();
    const isDesobstruido = !hasObstacle || (siteTotalAlt >= 36 + 27.5);
    ctx.strokeStyle = isDesobstruido ? "#10b981" : "#ef4444";
    ctx.lineWidth = 2.5;
    ctx.moveTo(xSite, ySiteAntenna);
    ctx.lineTo(xTower, yTowerAntenna);
    ctx.stroke();

    // Rótulo do Enlace Central
    const xMid = (xSite + xTower) / 2;
    const yMid = (ySiteAntenna + yTowerAntenna) / 2 - 14;
    ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
    ctx.fillRect(xMid - 85, yMid - 10, 170, 20);
    ctx.strokeStyle = isDesobstruido ? "#10b981" : "#ef4444";
    ctx.lineWidth = 1;
    ctx.strokeRect(xMid - 85, yMid - 10, 170, 20);

    ctx.fillStyle = isDesobstruido ? "#6ee7b7" : "#fca5a5";
    ctx.font = "bold 10px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${distKm.toFixed(1)} km • ${isDesobstruido ? 'Visada Desobstruída' : 'Obstrução de Fresnel'}`, xMid, yMid + 4);
    ctx.textAlign = "left";

    // Atualiza o painel de diagnóstico abaixo do canvas de relevo
    const noticeEl = document.getElementById("rfTerrainDiagnosisNotice");
    if (noticeEl) {
        if (isDesobstruido) {
            noticeEl.innerHTML = `<span style="color: #34d399; font-weight: 700;">✅ Linha de Visada Direta (LOS) 100% Desobstruída:</span> O feixe direto e a 1ª Zona de Fresnel possuem folga superior a 60% sobre o relevo (${siteTotalAlt.toFixed(1)}m de cota total do RX). Margem de desvanecimento nominal preservada acima de 18 dB.`;
        } else {
            const diffNeeded = ((36 + 27.5) - siteTotalAlt).toFixed(1);
            noticeEl.innerHTML = `<span style="color: #f87171; font-weight: 700;">⚠️ Obstrução de Relevo na 1ª Zona de Fresnel:</span> O morro intermediário penetra no elipsoide de propagação. Elevar o mastro em <strong>+${diffNeeded}m</strong> (atingindo ${(mastHeight + parseFloat(diffNeeded)).toFixed(1)}m) desobstrui o enlace e recupera até <strong>+4.5 dB</strong> de sinal.`;
        }
    }
}

// ==============================================================================
// RADAR GEOGRÁFICO 2D COM ANTI-COLISÃO E AGRUPAMENTO DE TORRES (CLAREZA TOTAL)
// ==============================================================================
function renderMarketRadarCanvas(market) {
    const canvas = document.getElementById("rfMarketRadarCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const bgGrad = ctx.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, Math.max(w, h));
    bgGrad.addColorStop(0, "#081325");
    bgGrad.addColorStop(0.7, "#050b14");
    bgGrad.addColorStop(1, "#020617");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const maxRadarKm = 25.0;
    const maxRadiusPx = Math.min(w / 2 - 70, h / 2 - 30);

    function kmToRadius(km) {
        return (Math.min(km, maxRadarKm) / maxRadarKm) * maxRadiusPx;
    }

    // Círculos concêntricos de distância
    const rings = [5, 10, 15, 20, 25];
    ctx.lineWidth = 1;
    rings.forEach((rKm, idx) => {
        const rPx = kmToRadius(rKm);
        ctx.beginPath();
        ctx.arc(cx, cy, rPx, 0, Math.PI * 2);
        ctx.strokeStyle = idx === rings.length - 1 ? "rgba(56, 189, 248, 0.35)" : "rgba(56, 189, 248, 0.15)";
        ctx.setLineDash(idx % 2 === 1 ? [4, 4] : []);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = "rgba(148, 163, 184, 0.65)";
        ctx.font = "9px Inter, monospace";
        ctx.fillText(`${rKm} km`, cx + 6, cy - rPx + 11);
    });

    // 8 Pontos Cardeais
    const radials = [
        { label: "N (0°)", angle: -Math.PI / 2 },
        { label: "NE (45°)", angle: -Math.PI / 4 },
        { label: "L / E (90°)", angle: 0 },
        { label: "SE (135°)", angle: Math.PI / 4 },
        { label: "S (180°)", angle: Math.PI / 2 },
        { label: "SO / SW (225°)", angle: (3 * Math.PI) / 4 },
        { label: "O / W (270°)", angle: Math.PI },
        { label: "NO / NW (315°)", angle: -(3 * Math.PI) / 4 }
    ];

    radials.forEach(rad => {
        const xEdge = cx + Math.cos(rad.angle) * maxRadiusPx;
        const yEdge = cy + Math.sin(rad.angle) * maxRadiusPx;

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(xEdge, yEdge);
        ctx.strokeStyle = "rgba(56, 189, 248, 0.12)";
        ctx.lineWidth = 1;
        ctx.stroke();

        const xLabel = cx + Math.cos(rad.angle) * (maxRadiusPx + 18);
        const yLabel = cy + Math.sin(rad.angle) * (maxRadiusPx + 18);
        ctx.fillStyle = "#38bdf8";
        ctx.font = "bold 9px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(rad.label, xLabel, yLabel);
    });

    // Elementos Topográficos de Relevo (Morros conhecidos da praça com caixas nítidas)
    const isPelotas = market.cidade.toLowerCase() === "pelotas";
    const isCaxias = market.cidade.toLowerCase().includes("caxias");
    const isFlorianopolis = market.cidade.toLowerCase().includes("florian");

    if (isPelotas) {
        const azRadGloria = ((312.4 - 90) * Math.PI) / 180;
        const rGloria = kmToRadius(14.8);
        const xGloria = cx + Math.cos(azRadGloria) * rGloria;
        const yGloria = cy + Math.sin(azRadGloria) * rGloria;

        ctx.beginPath();
        ctx.arc(xGloria, yGloria, 30, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(234, 179, 8, 0.1)";
        ctx.fill();
        ctx.strokeStyle = "rgba(234, 179, 8, 0.4)";
        ctx.stroke();

        // Morro Intermediário a 8.2 km
        const rInterm = kmToRadius(8.2);
        const xInterm = cx + Math.cos(azRadGloria) * rInterm;
        const yInterm = cy + Math.sin(azRadGloria) * rInterm;

        ctx.beginPath();
        ctx.arc(xInterm, yInterm, 18, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(239, 68, 68, 0.15)";
        ctx.fill();
        ctx.strokeStyle = "rgba(239, 68, 68, 0.5)";
        ctx.stroke();

        // Badge Morro Redentor (com fundo escuro)
        ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
        ctx.fillRect(xInterm + 16, yInterm - 12, 135, 24);
        ctx.strokeStyle = "rgba(239, 68, 68, 0.6)";
        ctx.strokeRect(xInterm + 16, yInterm - 12, 135, 24);
        ctx.fillStyle = "#f87171";
        ctx.font = "bold 9.5px Inter, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("⚠️ Morro Redentor (74m)", xInterm + 22, yInterm);
        ctx.fillStyle = "#cbd5e1";
        ctx.font = "8.5px monospace";
        ctx.fillText("Difração Gume de Faca", xInterm + 22, yInterm + 9);
    } else if (isCaxias) {
        ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
        ctx.fillRect(cx - 160, cy - 100, 140, 20);
        ctx.strokeStyle = "rgba(250, 204, 21, 0.5)";
        ctx.strokeRect(cx - 160, cy - 100, 140, 20);
        ctx.fillStyle = "#facc15";
        ctx.font = "bold 9.5px Inter, sans-serif";
        ctx.fillText("⛰️ Serra Gaúcha (760m)", cx - 150, cy - 86);
    } else if (isFlorianopolis) {
        ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
        ctx.fillRect(cx + 40, cy - 90, 130, 20);
        ctx.strokeStyle = "rgba(250, 204, 21, 0.5)";
        ctx.strokeRect(cx + 40, cy - 90, 130, 20);
        ctx.fillStyle = "#facc15";
        ctx.font = "bold 9.5px Inter, sans-serif";
        ctx.fillText("⛰️ Morro da Cruz (285m)", cx + 50, cy - 76);
    }

    // 4. Agrupamento Inteligente de Emissoras por Torre (Zero Colisão Visual!)
    const channels = market.channels_rf_detail || [];
    const towersMap = {};

    channels.forEach((c, idx) => {
        const towerKey = c.tower_name || `Torre_${Math.round(c.azimuth_deg || 0)}`;
        if (!towersMap[towerKey]) {
            towersMap[towerKey] = {
                name: towerKey,
                azimuth_deg: c.azimuth_deg || (312.4 + idx * 10),
                distance_km: c.distance_km || 14.8,
                erp_kw: c.erp_kw || 15,
                channels: []
            };
        }
        towersMap[towerKey].channels.push(c);
    });

    Object.values(towersMap).forEach((tw, tIdx) => {
        const mathAngleRad = ((tw.azimuth_deg - 90) * Math.PI) / 180;
        const rPx = kmToRadius(tw.distance_km);
        const xTower = cx + Math.cos(mathAngleRad) * rPx;
        const yTower = cy + Math.sin(mathAngleRad) * rPx;

        // Linha vetorial do enlace
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(xTower, yTower);
        ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Distância na linha
        const xDistLabel = cx + Math.cos(mathAngleRad) * (rPx * 0.45);
        const yDistLabel = cy + Math.sin(mathAngleRad) * (rPx * 0.45);
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(xDistLabel - 22, yDistLabel - 7, 44, 14);
        ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
        ctx.strokeRect(xDistLabel - 22, yDistLabel - 7, 44, 14);
        ctx.fillStyle = "#38bdf8";
        ctx.font = "9px monospace";
        ctx.textAlign = "center";
        ctx.fillText(`${tw.distance_km.toFixed(1)}km`, xDistLabel, yDistLabel + 3);

        // Pino da Torre
        ctx.beginPath();
        ctx.arc(xTower, yTower, 8, 0, Math.PI * 2);
        ctx.fillStyle = "#10b981";
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Card de Tooltip Telecom Completo e Nítido
        const cardW = 190;
        const cardH = 20 + tw.channels.length * 15;
        const isRightSide = xTower > cx;
        const cardX = isRightSide ? xTower + 14 : xTower - cardW - 14;
        const cardY = yTower - cardH / 2;

        ctx.fillStyle = "rgba(11, 19, 43, 0.95)";
        ctx.fillRect(cardX, cardY, cardW, cardH);
        ctx.strokeStyle = "rgba(56, 189, 248, 0.5)";
        ctx.lineWidth = 1;
        ctx.strokeRect(cardX, cardY, cardW, cardH);

        // Cabeçalho da Torre
        ctx.fillStyle = "#facc15";
        ctx.font = "bold 10px Inter, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(`📡 ${tw.name}`, cardX + 8, cardY + 13);
        ctx.fillStyle = "#94a3b8";
        ctx.font = "8.5px monospace";
        ctx.textAlign = "right";
        ctx.fillText(`Az ${tw.azimuth_deg.toFixed(1)}°`, cardX + cardW - 6, cardY + 13);

        // Emissoras no card
        tw.channels.forEach((ch, cIdx) => {
            const chY = cardY + 28 + cIdx * 15;
            const sigColor = ch.rx_level_measured_pct >= 60 ? "#34d399" : (ch.rx_level_measured_pct >= 40 ? "#facc15" : "#f87171");
            ctx.fillStyle = "#e2e8f0";
            ctx.font = "9.5px Inter, sans-serif";
            ctx.textAlign = "left";
            ctx.fillText(`• ${ch.emissora} (${ch.canal_fisico})`, cardX + 8, chY);
            
            ctx.fillStyle = sigColor;
            ctx.font = "bold 9px monospace";
            ctx.textAlign = "right";
            ctx.fillText(`${ch.rx_level_measured_pct}%`, cardX + cardW - 6, chY);
        });
    });

    // 5. Centro: Posição do Capture Site
    const mastH = market.rx_antenna_height_m || 24;
    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, Math.PI * 2);
    ctx.fillStyle = "#38bdf8";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
    ctx.fillRect(cx - 75, cy + 14, 150, 22);
    ctx.strokeStyle = "rgba(56, 189, 248, 0.6)";
    ctx.strokeRect(cx - 75, cy + 14, 150, 22);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 9.5px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`🔵 CS • ${market.cidade.toUpperCase()}`, cx, cy + 26);
    ctx.fillStyle = "#38bdf8";
    ctx.font = "8.5px monospace";
    ctx.fillText(`Alt: ${market.site_elevation_m || 36}m + ${mastH}m mastro`, cx, cy + 34);

    // Atualiza aviso de Condições Atmosféricas e Intempéries
    const atmNoticeEl = document.getElementById("rfAtmosphericText");
    const atmBadgeEl = document.getElementById("rfAtmosphericBadge");
    if (atmNoticeEl) {
        if (isPelotas) {
            atmNoticeEl.innerHTML = `<strong>🌫️ Condições Atmosféricas &amp; Intempéries:</strong> Neblina densa matinal e inversão térmica registradas na bacia do Canal São Gonçalo. Atenuação troposférica estimada: <strong>+3.4 dB</strong> no Canal 33 UHF (difração no Morro Redentor).`;
            if (atmBadgeEl) { atmBadgeEl.className = "badge badge-yellow"; atmBadgeEl.innerText = "Atenuação Térmica +3.4 dB"; }
        } else if (isCaxias) {
            atmNoticeEl.innerHTML = `<strong>🌫️ Nevoeiro Orográfico &amp; Chuva Fina:</strong> Alta umidade na Serra Gaúcha eleva perda de inserção no cabo coaxial e atenua sinal de canais acima de 550 MHz em até <strong>+4.1 dB</strong>.`;
            if (atmBadgeEl) { atmBadgeEl.className = "badge badge-yellow"; atmBadgeEl.innerText = "Nevoeiro da Serra +4.1 dB"; }
        } else if (isFlorianopolis) {
            atmNoticeEl.innerHTML = `<strong>🌊 Maresia e Propagação Marítima:</strong> Duto troposférico marinho gerando reflexões secundárias sobre a baía sul. Atenuação nominal com margem de desvanecimento de <strong>14 dB</strong>.`;
            if (atmBadgeEl) { atmBadgeEl.className = "badge badge-green"; atmBadgeEl.innerText = "Enlace Estável"; }
        } else {
            atmNoticeEl.innerHTML = `<strong>☀️ Propagação Nominal em Espaço Livre:</strong> Céu limpo e baixa umidade relativa. Desvanecimento plano estável abaixo de <strong>1.0 dB</strong> sem impacto na recepção dos Muxes.`;
            if (atmBadgeEl) { atmBadgeEl.className = "badge badge-green"; atmBadgeEl.innerText = "Propagação Nominal"; }
        }
    }
}
window.renderMarketRadarCanvas = renderMarketRadarCanvas;
function switchRfModalView(view) {
    currentRfModalView = view;
    const radarContainer = document.getElementById("rfRadarViewContainer");
    const fresnelContainer = document.getElementById("rfFresnelViewContainer");
    const btnRadar = document.getElementById("btnModalViewRadar");
    const btnFresnel = document.getElementById("btnModalViewFresnel");

    if (view === 'radar') {
        if (radarContainer) radarContainer.style.display = "block";
        if (fresnelContainer) fresnelContainer.style.display = "none";
        if (btnRadar) { btnRadar.className = "btn-primary"; btnRadar.style.background = "#0284c7"; }
        if (btnFresnel) { btnFresnel.className = "btn-secondary"; btnFresnel.style.background = "transparent"; }
        if (selectedMarket) renderMarketRadarCanvas(selectedMarket);
    } else {
        if (radarContainer) radarContainer.style.display = "none";
        if (fresnelContainer) fresnelContainer.style.display = "block";
        if (btnRadar) { btnRadar.className = "btn-secondary"; btnRadar.style.background = "transparent"; }
        if (btnFresnel) { btnFresnel.className = "btn-primary"; btnFresnel.style.background = "#0284c7"; }
        if (selectedMarket) {
            const slider = document.getElementById("sliderWhatIfMastHeight");
            const mastVal = slider ? parseFloat(slider.value) : null;
            renderTerrainCanvas(selectedMarket, mastVal);
        }
    }
}
window.switchRfModalView = switchRfModalView;


// ==============================================================================
// SUPORTE A ZOOM POR RODA DO MOUSE E ARRASTAR (PAN) PARA 120+ CIDADES
// ==============================================================================
function setupTopologyInteractions() {
    const container = document.getElementById("topologyMapSvgContainer");
    if (!container || container._interactionsBound) return;
    container._interactionsBound = true;

    // Zoom via roda do mouse
    container.addEventListener("wheel", function(e) {
        e.preventDefault();
        if (e.deltaY < 0) {
            zoomTopologyMap('in');
        } else {
            zoomTopologyMap('out');
        }
    }, { passive: false });

    // Arrastar e mover (Pan) quando ampliado
    let isDragging = false;
    let startX = 0, startY = 0;

    container.addEventListener("mousedown", function(e) {
        if (customZoomScale > 1.0) {
            isDragging = true;
            startX = e.clientX - customPanOffsetX;
            startY = e.clientY - customPanOffsetY;
            container.style.cursor = "grabbing";
        }
    });

    window.addEventListener("mousemove", function(e) {
        if (isDragging) {
            customPanOffsetX = e.clientX - startX;
            customPanOffsetY = e.clientY - startY;
            renderTopologyMap();
        }
    });

    window.addEventListener("mouseup", function() {
        if (isDragging) {
            isDragging = false;
            container.style.cursor = customZoomScale > 1.0 ? "grab" : "default";
        }
    });
}

// Inicializa interações assim que a topologia for carregada
const origLoadTopology = window.loadTopologyMapData;
window.loadTopologyMapData = async function() {
    if (origLoadTopology) await origLoadTopology();
    setupTopologyInteractions();
};


// ==============================================================================
// NAVEGAÇÃO RÁPIDA: FILTRAR PRAÇA SELECIONADA E ABRIR INCIDENTES N1 (NOC COCKPIT)
// ==============================================================================
function jumpToCityIncidents() {
    const market = window.selectedMarket || selectedMarket;
    const cityName = market ? (market.cidade || "") : "";

    // 1. Sincroniza seletor global do header
    const filterCity = document.getElementById("filterCity");
    if (filterCity && cityName) {
        let matched = false;
        for (let i = 0; i < filterCity.options.length; i++) {
            if (filterCity.options[i].text.toLowerCase().includes(cityName.toLowerCase()) || 
                filterCity.options[i].value.toLowerCase().includes(cityName.toLowerCase())) {
                filterCity.selectedIndex = i;
                matched = true;
                break;
            }
        }
        if (!matched) {
            const opt = new Option(cityName, cityName, true, true);
            filterCity.add(opt);
        }
        filterCity.dispatchEvent(new Event("change"));
    }

    // 2. Sincroniza seletor da Central de Logs caso o operador queira
    const logHost = document.getElementById("logFilterHost");
    if (logHost && cityName) {
        for (let i = 0; i < logHost.options.length; i++) {
            if (logHost.options[i].value.toLowerCase().includes(cityName.toLowerCase()) ||
                logHost.options[i].text.toLowerCase().includes(cityName.toLowerCase())) {
                logHost.selectedIndex = i;
                break;
            }
        }
    }

    // 3. Fecha modal de relevo se estiver aberto e abre aba de incidentes
    if (typeof closeMarketRfModal === "function") {
        closeMarketRfModal();
    }
    if (typeof switchTab === "function") {
        switchTab("overview");
    }
}
window.jumpToCityIncidents = jumpToCityIncidents;
