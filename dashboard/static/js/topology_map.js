// dashboard/static/js/topology_map.js
// Topologia Geográfica de Capture Sites e Enlaces de RF (LATAM / Brasil)
// Arquitetura Real Multiplex: Torres Distintas por Emissora, Frequências Terrestres Reais (Multiplexes.xml),
// Visão Ampla Bilateral (Norte <-> Capture Site <-> Sul) e Foco Individual por Canal ao Clicar.

let topologyMarketsData = [];
let selectedMarket = null;
let currentMapView = "brasil";
let customZoomScale = 1.0;
let customPanOffsetX = 0;
let customPanOffsetY = 0;
let currentRfModalView = "radar";
let selectedRfChannelIndex = null; // null = Visão Ampla (Todos os Canais); 0..N = Canal específico focado

// Paleta de cores distintas para diferenciar claramente cada emissora/canal nos gráficos
const CHANNEL_COLORS = [
    { stroke: "#38bdf8", fill: "rgba(56, 189, 248, 0.14)", pin: "#0284c7", badge: "#bae6fd", name: "Azul Celeste" },
    { stroke: "#facc15", fill: "rgba(250, 204, 21, 0.14)", pin: "#eab308", badge: "#fef08a", name: "Âmbar" },
    { stroke: "#34d399", fill: "rgba(52, 211, 153, 0.14)", pin: "#10b981", badge: "#a7f3d0", name: "Esmeralda" },
    { stroke: "#c084fc", fill: "rgba(192, 132, 252, 0.14)", pin: "#9333ea", badge: "#e9d5ff", name: "Violeta" },
    { stroke: "#fb923c", fill: "rgba(251, 146, 60, 0.14)", pin: "#ea580c", badge: "#fed7aa", name: "Laranja" },
    { stroke: "#f472b6", fill: "rgba(244, 114, 182, 0.14)", pin: "#db2777", badge: "#fbcfe8", name: "Rosa" }
];

// Configurações Cartográficas Calibradas para Evitar Espaços Vazios e Sobreposição
const MAP_BOUNDING_VIEWS = {
    "brasil": { minLng: -74.5, maxLng: -34.0, minLat: -34.0, maxLat: 5.5, label: "Brasil (Nacional)" },
    "sul_sudeste": { minLng: -55.5, maxLng: -41.0, minLat: -33.5, maxLat: -18.5, label: "Hub Sul & Sudeste (Alta Resolução)" },
    "sudeste": { minLng: -52.5, maxLng: -41.0, minLat: -25.2, maxLat: -18.5, label: "Região Sudeste (SP / RJ / MG / ES)" },
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
    "Santos": { dx: 18, dy: 16, anchor: "start", side: "bottom-right" },
    "Campinas": { dx: -18, dy: -16, anchor: "end", side: "top-left" },
    "Ribeirão Preto": { dx: -18, dy: -14, anchor: "end", side: "top-left" },
    "São José dos Campos": { dx: 18, dy: -14, anchor: "start", side: "top-right" },
    "Rio de Janeiro": { dx: 20, dy: 6, anchor: "start", side: "right" },
    "Juiz de Fora": { dx: -18, dy: -12, anchor: "end", side: "top-left" },
    "Uberlândia": { dx: -18, dy: 4, anchor: "end", side: "left" },
    "Vitória": { dx: 18, dy: 4, anchor: "start", side: "right" },
    "Aracaju": { dx: 18, dy: 4, anchor: "start", side: "right" },
    "Itumbiara": { dx: -18, dy: 12, anchor: "end", side: "bottom-left" },
    "Manaus": { dx: 18, dy: 4, anchor: "start", side: "right" }
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
            const defaultM = topologyMarketsData.find(m => m.cidade.toLowerCase().includes("são josé") || m.cidade.toLowerCase().includes("campos")) ||
                             topologyMarketsData.find(m => m.cidade.toLowerCase() === "pelotas") ||
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

    if (stateFilter === "sudeste") currentMapView = "sudeste";
    else if (stateFilter === "sul") currentMapView = "sul";
    else if (stateFilter === "nordeste") currentMapView = "nordeste";
    else if (stateFilter === "centro-oeste") currentMapView = "centro_oeste";
    else if (["sp", "rj", "mg", "es"].includes(stateFilter)) currentMapView = "sudeste";
    else if (["rs", "sc", "pr"].includes(stateFilter)) currentMapView = "sul";
    else if (["ba", "pe", "ce", "se"].includes(stateFilter)) currentMapView = "nordeste";
    else if (["df", "go"].includes(stateFilter)) currentMapView = "centro_oeste";

    const view = MAP_BOUNDING_VIEWS[currentMapView] || MAP_BOUNDING_VIEWS["brasil"];
    const isRegionalZoom = currentMapView !== "brasil";

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

            <!-- GEOMETRIA REAL DO BRASIL -->
            <g id="svgBrazilGeographicMap">
                <path d="${southAmericaPathD}"
                      fill="rgba(15, 23, 42, 0.45)" stroke="rgba(255,255,255,0.06)" stroke-width="1" />
                <path d="${brazilPathD}"
                      fill="rgba(15, 23, 42, 0.92)" stroke="#38bdf8" stroke-width="2" stroke-opacity="0.6" />
                <path d="${sulDividerD}" fill="none" stroke="rgba(56, 189, 248, 0.35)" stroke-width="1.2" stroke-dasharray="4,4"/>
                <path d="${sudesteDividerD}" fill="none" stroke="rgba(56, 189, 248, 0.35)" stroke-width="1.2" stroke-dasharray="4,4"/>
                <path d="${coDividerD}" fill="none" stroke="rgba(56, 189, 248, 0.35)" stroke-width="1.2" stroke-dasharray="4,4"/>
                <path d="${neDividerD}" fill="none" stroke="rgba(56, 189, 248, 0.35)" stroke-width="1.2" stroke-dasharray="4,4"/>
            </g>

            <!-- Linhas de Enlace Vetorial de RF entre Praças e TODAS as Torres Transmissoras da Praça -->
            <g id="svgLinksLayer">
    `;

    filtered.forEach(m => {
        const pt = projectCoords(m.lat, m.lng);
        const isSel = selectedMarket && selectedMarket.id === m.id;
        
        if (m.towers_detail && m.towers_detail.length > 0) {
            m.towers_detail.forEach((tw, tIdx) => {
                const twPt = projectCoords(tw.lat, tw.lng);
                const azRad = (((tw.azimuth_deg || 0) - 90) * Math.PI) / 180;
                const minVisualDist = isSel ? 18 : 12;
                const actualDistPx = Math.hypot(twPt.x - pt.x, twPt.y - pt.y);
                const dx = actualDistPx < minVisualDist ? Math.round(pt.x + Math.cos(azRad) * minVisualDist) : twPt.x;
                const dy = actualDistPx < minVisualDist ? Math.round(pt.y + Math.sin(azRad) * minVisualDist) : twPt.y;
                
                const chColor = CHANNEL_COLORS[tIdx % CHANNEL_COLORS.length].stroke;
                const strokeColor = isSel ? chColor : (
                    m.status_color === "red" ? "rgba(239, 68, 68, 0.75)" :
                    (m.status_color === "yellow" ? "rgba(250, 204, 21, 0.65)" : "rgba(56, 189, 248, 0.55)")
                );
                
                svgHtml += `
                    <line x1="${pt.x}" y1="${pt.y}" x2="${dx}" y2="${dy}"
                          stroke="${strokeColor}" stroke-width="${isSel ? 2.5 : 1.3}" stroke-dasharray="${isSel ? 'none' : '4,3'}" />
                    <circle cx="${dx}" cy="${dy}" r="${isSel ? 5 : 3.5}" fill="${chColor}" stroke="#070d18" stroke-width="1.5" />
                `;
            });
        }
    });

    svgHtml += `</g><g id="svgPinsLayer">`;

    filtered.forEach(m => {
        const pt = projectCoords(m.lat, m.lng);
        const isSel = selectedMarket && selectedMarket.id === m.id;
        const color = m.status_color === "red" ? "#ef4444" : (m.status_color === "yellow" ? "#facc15" : "#10b981");
        const glowId = m.status_color === "red" ? "pulseGlowRed" : (m.status_color === "yellow" ? "pulseGlowYellow" : "pulseGlowGreen");

        const labelCfg = CITY_LABEL_CONFIG[m.cidade] || { dx: 18, dy: 4, anchor: "start" };
        const labelX = pt.x + labelCfg.dx;
        const labelY = pt.y + labelCfg.dy;
        const anchor = labelCfg.anchor;

        const textLen = m.cidade.length * 7.0 + 16;
        let pillX = labelX - 8;
        if (anchor === "end") pillX = labelX - textLen + 8;
        else if (anchor === "middle") pillX = labelX - (textLen / 2);
        const pillY = labelY - 11;

        svgHtml += `
            <g class="map-city-node" style="cursor: pointer;" onclick="selectMarket('${m.id}', true)" filter="url(#shadowGlow)">
                <line x1="${pt.x}" y1="${pt.y}" x2="${labelX}" y2="${labelY - 1}" 
                      stroke="rgba(255,255,255,0.25)" stroke-width="1" stroke-dasharray="2,2"/>

                <circle cx="${pt.x}" cy="${pt.y}" r="${isSel ? 26 : 18}" fill="url(#${glowId})" opacity="${isSel ? 0.95 : 0.65}">
                    ${m.status_color === "red" ? `
                        <animate attributeName="r" values="16;28;16" dur="2s" repeatCount="indefinite"/>
                        <animate attributeName="opacity" values="0.85;0.2;0.85" dur="2s" repeatCount="indefinite"/>
                    ` : ''}
                </circle>

                ${isSel ? `
                    <circle cx="${pt.x}" cy="${pt.y}" r="12" fill="none" stroke="#fff" stroke-width="2.5"/>
                ` : ''}

                <circle cx="${pt.x}" cy="${pt.y}" r="${isSel ? 8 : 6}" fill="${color}" stroke="#070d18" stroke-width="2"/>

                <rect x="${pillX}" y="${pillY}" width="${textLen}" height="18" rx="4"
                      fill="${isSel ? '#1e293b' : 'rgba(7, 13, 24, 0.94)'}"
                      stroke="${isSel ? '#38bdf8' : (m.status_color === 'red' ? '#ef4444' : 'rgba(56, 189, 248, 0.45)')}"
                      stroke-width="${isSel ? 1.6 : 1}" />

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

    const svgEl = document.getElementById("topologySvgEl");
    if (svgEl) {
        svgEl.onwheel = function(e) {
            e.preventDefault();
            if (e.deltaY < 0) zoomTopologyMap("in");
            else zoomTopologyMap("out");
        };
    }
}

function selectMarket(marketId, openModal = false) {
    const market = topologyMarketsData.find(m => m.id === marketId);
    if (!market) return;

    selectedMarket = market;
    window.selectedMarket = market;
    renderTopologyMap();

    const nameEl = document.getElementById("mapDetailCityName");
    if (nameEl) nameEl.textContent = `${market.cidade} (${market.uf})`;
    
    const badge = document.getElementById("mapDetailStatusBadge");
    if (badge) {
        badge.className = market.status_color === "red" ? "badge badge-red" :
                          (market.status_color === "yellow" ? "badge badge-yellow" : "badge badge-green");
        badge.textContent = market.status_label;
    }

    const coordsEl = document.getElementById("mapDetailCoords");
    if (coordsEl) {
        const bairroInfo = market.site_bairro ? ` • ${market.site_bairro}` : "";
        coordsEl.textContent = `Lat: ${market.lat.toFixed(4)} | Lng: ${market.lng.toFixed(4)}${bairroInfo}`;
    }
    
    const twNameEl = document.getElementById("mapDetailTowerName");
    if (twNameEl) {
        if (market.towers_detail && market.towers_detail.length > 1) {
            twNameEl.textContent = `${market.towers_detail.length} Torres Distintas (${market.towers_detail.map(t => t.bairro || t.name.split('-')[0].trim()).join(' / ')})`;
        } else {
            twNameEl.textContent = market.main_tower;
        }
    }
    
    const distEl = document.getElementById("mapDetailDistance");
    if (distEl) {
        if (market.channels_rf_detail && market.channels_rf_detail.length > 1) {
            const dists = market.channels_rf_detail.map(c => `${c.emissora.split(' ')[0]}: ${c.distance_km}km`).join(" | ");
            distEl.textContent = dists;
        } else {
            distEl.textContent = `${market.distance_km.toFixed(2)} km (${market.distance_m ? market.distance_m.toLocaleString('pt-BR') : Math.round(market.distance_km*1000)} m)`;
        }
    }
    
    const azEl = document.getElementById("mapDetailAzimuth");
    if (azEl) {
        if (market.channels_rf_detail && market.channels_rf_detail.length > 1) {
            azEl.textContent = market.channels_rf_detail.map(c => `${c.azimuth_deg}° (${c.cardinal || ''})`).join(" • ");
        } else {
            azEl.textContent = `${market.azimuth_deg.toFixed(1)}°`;
        }
    }
    
    const losEl = document.getElementById("mapDetailLOS");
    if (losEl) {
        losEl.textContent = market.los_status || "Desobstruída (LOS)";
        losEl.style.color = (market.los_status && (market.los_status.includes("NLOS") || market.los_status.includes("Obstru"))) ? "#facc15" : "#10b981";
    }

    const fsplEl = document.getElementById("mapDetailFSPL");
    if (fsplEl) fsplEl.textContent = `${market.fspl_db || 100} dB`;

    const totChEl = document.getElementById("mapDetailTotalChannels");
    if (totChEl) totChEl.textContent = market.total_channels;
    
    const outChEl = document.getElementById("mapDetailOutageChannels");
    if (outChEl) outChEl.textContent = market.outage_channels;

    if (openModal) {
        openMarketRfModal(marketId);
    }
}
window.selectMarket = selectMarket;

function escapeHtml(text) {
    if (text === null || text === undefined) return "";
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ==============================================================================
// INTERAÇÃO DE FOCO POR CANAL OU VISÃO AMPLA (TODOS OS CANAIS)
// ==============================================================================
function selectRfModalChannel(channelIdx) {
    if (channelIdx === null || channelIdx === undefined || selectedRfChannelIndex === channelIdx) {
        selectedRfChannelIndex = null; // Volta para Visão Ampla
    } else {
        selectedRfChannelIndex = Number(channelIdx);
    }

    const market = selectedMarket || window.selectedMarket;
    if (!market) return;

    renderRfModalChannelsTable(market);
    const slider = document.getElementById("sliderWhatIfMastHeight");
    const mastVal = slider ? parseFloat(slider.value) : null;
    renderMarketRadarCanvas(market, selectedRfChannelIndex);
    renderTerrainCanvas(market, mastVal, selectedRfChannelIndex);
    updateRfModalEngineeringNotes(market, selectedRfChannelIndex);
}
window.selectRfModalChannel = selectRfModalChannel;

function renderRfModalChannelsTable(market) {
    const tbody = document.getElementById("rfModalChannelsTableBody");
    const countBadge = document.getElementById("rfModalChannelsCountBadge");
    const channels = market.channels_rf_detail || [];
    
    if (countBadge) {
        const isWide = (selectedRfChannelIndex === null);
        const modeLabel = isWide
            ? `🌐 Visão Ampla (${channels.length} Canais)`
            : `🎯 Em Foco: ${channels[selectedRfChannelIndex]?.emissora || 'Canal'}`;
        countBadge.innerHTML = `
            <span>${modeLabel}</span>
            ${!isWide ? `
            <button type="button" onclick="event.stopPropagation(); selectRfModalChannel(null);" 
                    style="margin-left: 8px; padding: 2px 8px; font-size: 10px; border-radius: 4px; border: 1px solid #38bdf8; background: #0284c7; color: #fff; cursor: pointer; font-weight: 700;">
                ↩ Voltar p/ Visão Ampla (Todos)
            </button>` : ''}
        `;
    }

    if (!tbody) return;
    if (channels.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 16px;">Nenhum canal DTV cadastrado para esta praça.</td></tr>`;
        return;
    }

    tbody.innerHTML = channels.map((c, idx) => {
        const isFocused = selectedRfChannelIndex === idx;
        const chPalette = CHANNEL_COLORS[idx % CHANNEL_COLORS.length];
        const isNlos = c.los_status && (c.los_status.includes("Obstru") || c.los_status.includes("NLOS") || c.los_status.includes("Atenua"));
        const badgeClass = isNlos ? "badge badge-yellow" : "badge badge-green";
        const distStr = c.distance_m ? `${c.distance_m.toLocaleString('pt-BR')} m (${c.distance_km} km)` : `${c.distance_km} km`;
        const signalColor = c.rx_level_measured_pct >= 60 ? "#10b981" : (c.rx_level_measured_pct >= 40 ? "#facc15" : "#ef4444");
        const freqFormatted = Number(c.freq_mhz).toFixed(3).replace(".", ",") + " MHz";

        return `
        <tr onclick="selectRfModalChannel(${idx})" 
            title="Clique para focar o Radar 2D e o Corte Transversal neste canal (${escapeHtml(c.emissora)})"
            style="cursor: pointer; transition: all 0.15s ease; background: ${isFocused ? 'rgba(56, 189, 248, 0.18)' : 'transparent'}; border-left: 4px solid ${isFocused ? chPalette.stroke : 'transparent'};">
            <td style="padding: 6px 6px;">
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: ${chPalette.stroke}; flex-shrink: 0;"></span>
                    <div>
                        <strong style="color: #fff; font-size: 11px;">${escapeHtml(c.emissora)}</strong>
                        <div style="font-size: 9px; color: ${isFocused ? '#38bdf8' : 'var(--text-muted)'}; font-weight: ${isFocused ? '700' : '400'};">
                            ${isFocused ? '🎯 Em Foco (clique p/ Todos)' : '🔍 Clique p/ focar corte'}
                        </div>
                    </div>
                </div>
            </td>
            <td style="padding: 6px 6px; white-space: nowrap;">
                <code style="color: ${chPalette.badge}; font-weight: 700;">${escapeHtml(c.canal_fisico)}</code>
                <div style="font-size: 10px; color: #fff; font-family: monospace; font-weight: 700;">${freqFormatted}</div>
            </td>
            <td style="padding: 6px 6px; font-size: 10.5px;">
                <strong style="color: #e2e8f0;">${escapeHtml(c.tower_bairro || c.tower_name)}</strong>
                <div style="font-size: 9.5px; color: #38bdf8;">${c.erp_kw} kW ERP • Alt ${c.tower_total_alt_m || (c.tower_cota_m + c.tower_mast_m)}m</div>
            </td>
            <td style="padding: 6px 6px; font-family: monospace; font-size: 10.5px; white-space: nowrap;">
                <div style="color: #fff; font-weight: 700;">${c.distance_km} km</div>
                <div style="color: #38bdf8; font-size: 9.5px;">Az ${c.azimuth_deg}° (${escapeHtml((c.cardinal || c.cardinal_dir || '').split(' ')[0])})</div>
            </td>
            <td style="padding: 6px 6px; font-family: monospace; font-size: 10px; white-space: nowrap;">
                <div style="color: #facc15;">${c.fspl_db} dB</div>
                <div style="color: var(--text-muted);">${c.rx_level_expected_dbm} dBm</div>
            </td>
            <td style="padding: 6px 6px; white-space: nowrap;">
                <strong style="color: ${signalColor}; font-size: 11px;">${c.rx_level_measured_pct}%</strong>
                <div style="font-size: 9px; color: var(--text-muted);">Q: ${c.signal_quality_pct || c.rx_level_measured_pct}%</div>
            </td>
            <td style="padding: 6px 6px;">
                <span class="${badgeClass}" style="font-size: 9.5px;">${escapeHtml(c.los_status)}</span>
            </td>
        </tr>
        `;
    }).join("");
}

function updateRfModalEngineeringNotes(market, channelIdx = null) {
    const notesEl = document.getElementById("rfModalEngineeringNotes");
    if (!notesEl) return;

    const channels = market.channels_rf_detail || [];
    const focusedCh = (channelIdx !== null && channels[channelIdx]) ? channels[channelIdx] : null;

    if (focusedCh) {
        const freqStr = Number(focusedCh.freq_mhz).toFixed(3).replace(".", ",") + " MHz";
        notesEl.innerHTML = `
            <div style="margin-bottom: 8px; padding: 6px 10px; background: rgba(56, 189, 248, 0.12); border-left: 3px solid #38bdf8; border-radius: 4px;">
                <strong>🎯 Diagnóstico Individual de Canal • ${escapeHtml(focusedCh.emissora)} (${freqStr} • ${escapeHtml(focusedCh.canal_fisico)}):</strong>
                Sinal transmitido a partir de <strong>${escapeHtml(focusedCh.tower_name)}</strong> (${escapeHtml(focusedCh.tower_bairro || '')}, Lat ${focusedCh.tower_lat}, Lng ${focusedCh.tower_lng}), situado a <strong>${focusedCh.distance_km} km (${focusedCh.distance_m} m)</strong> no azimute <strong>${focusedCh.azimuth_deg}° (${escapeHtml(focusedCh.cardinal || focusedCh.cardinal_dir || '')})</strong> em relação ao Capture Site (${escapeHtml(market.site_bairro || 'Centro')}).
            </div>
            <div style="margin-bottom: 8px; color: ${focusedCh.los_status.includes('NLOS') ? '#facc15' : '#34d399'};">
                📡 <strong>Perfil de Propagação &amp; Fresnel:</strong> ${escapeHtml(focusedCh.los_status)} — ${escapeHtml(focusedCh.los_analysis)}. Perda em espaço livre (FSPL): <strong>${focusedCh.fspl_db} dB</strong> | Potência irradiada: <strong>${focusedCh.erp_kw} kW ERP</strong> | Nível medido no tuner TBS: <strong>Força ${focusedCh.rx_level_measured_pct}% / Qualidade ${focusedCh.signal_quality_pct || focusedCh.rx_level_measured_pct}%</strong>.
            </div>
            <div>
                💡 <strong>Ação de Alinhamento:</strong> Apontar antena diretiva UHF para o azimute <strong>${focusedCh.azimuth_deg}° (${escapeHtml(focusedCh.cardinal || focusedCh.cardinal_dir || '')})</strong>. Clique novamente no canal ou em <em>"🌐 Visão Ampla (Todos)"</em> para comparar o posicionamento de todas as emissoras da praça.
            </div>
        `;
        return;
    }

    if (market.cidade.toLowerCase().includes("são josé") || market.cidade.toLowerCase().includes("campos")) {
        notesEl.innerHTML = `
            <div style="margin-bottom: 8px;">
                <strong>📍 Topologia Bipolar Real • São José dos Campos (SP):</strong> O Capture Site está posicionado no meio da praça (<strong>${escapeHtml(market.site_bairro || 'Centro / Av. Anchieta')}</strong>, cota 600m), recebendo sinais de direções diametralmente opostas (Norte vs Sul-Sudoeste):
            </div>
            <div style="margin-bottom: 6px; color: #38bdf8;">
                ⬆️ <strong>Setor Norte (Azimute 343.2° N/NO • 4.34 km):</strong> <strong>Rede Globo (TV Vanguarda)</strong> operando em <strong>485,000 MHz (UHF Canal 16)</strong> a partir da torre no <strong>Alto de Santana / Vila Sinhá (Zona Norte)</strong>.
            </div>
            <div style="margin-bottom: 8px; color: #facc15;">
                ⬇️ <strong>Setor Sul-Sudoeste (Azimute 210.1° S/SO • 4.28 km):</strong> <strong>TH+ SBT HD (TH+ SBT Vale)</strong> operando em <strong>677,143 MHz (UHF Canal 48)</strong> a partir da torre no <strong>Jardim Aquarius (Zona Sul-Oeste)</strong>.
            </div>
            <div>
                💡 <strong>Recomendação de Engenharia RF:</strong> Como as torres de transmissão da Rede Globo (Norte) e do SBT (Sul-Sudoeste) estão em lados opostos (diferença angular de 133°), utiliza-se arranjo de 2 antenas UHF independentes combinadas via diplexer/splitter balanceado nas entradas do sintonizador TBS. <strong>Clique em cada canal na tabela acima</strong> para inspecionar o corte transversal individual de cada enlace!
            </div>
        `;
    } else if (market.cidade.toLowerCase() === "pelotas") {
        notesEl.innerHTML = `
            <div style="margin-bottom: 8px;"><strong>Perspectiva Topográfica de Pelotas - RS:</strong> O Capture Site está localizado em <strong>${escapeHtml(market.site_bairro || 'Centro')}</strong> (altitude 18m). A <strong>RBS TV (Globo • 545,143 MHz • UHF Canal 26)</strong> transmite da <strong>Bela Vista (Norte, Az 12.4°, 4.2 km)</strong> com visada limpa, enquanto a <strong>SBT RS (587,143 MHz • UHF Canal 33)</strong> transmite do <strong>Morro Redentor / Cascata (Noroeste, Az 312.4°, 14.8 km)</strong>.</div>
            <div style="margin-bottom: 8px; color: #facc15;">⚠️ <strong>Causa de Atenuação no Canal 33 (587,143 MHz):</strong> Elevação intermediária a 8.2 km (cota 74m) penetra na 1ª Zona de Fresnel no enlace Noroeste, causando difração por gume de faca.</div>
            <div>💡 <strong>Recomendações Técnicas:</strong> Clique em cada emissora na tabela acima para alternar entre o corte transversal de 4.2 km (RBS TV) e o de 14.8 km (SBT RS) ou simule a elevação do mastro receptor ao lado.</div>
        `;
    } else {
        const chSummary = channels.map(c => `<strong>${escapeHtml(c.emissora)}</strong> (${Number(c.freq_mhz).toFixed(3).replace('.', ',')} MHz • ${escapeHtml(c.tower_bairro || c.tower_name)} • Az ${c.azimuth_deg}° • ${c.distance_km} km)`).join(" | ");
        notesEl.innerHTML = `
            <div style="margin-bottom: 8px;"><strong>Topologia Multi-Torre • ${escapeHtml(market.cidade)} (${escapeHtml(market.uf)}):</strong> Capture Site situado em <strong>${escapeHtml(market.site_bairro || 'Centro')}</strong> (cota ${market.site_elevation_m}m + mastro ${market.rx_antenna_height_m}m).</div>
            <div style="margin-bottom: 8px; color: #38bdf8;">📡 <strong>Enlaces Sintonizados no Multiplex:</strong> ${chSummary || 'Canais em operação nominal'}.</div>
            <div>💡 <strong>Inspeção Interativa:</strong> Clique sobre qualquer canal na tabela acima para direcionar o Radar 2D e o Corte Transversal de Relevo exclusivamente para aquela emissora, ou mantenha em <strong>🌐 Visão Ampla</strong> para visualizar todos os canais simultaneamente.</div>
        `;
    }
}

// ==============================================================================
// MODAL DE GEOLOCALIZAÇÃO PRECISA, RELEVO TOPOGRÁFICO & CANAIS DIGITAIS TERRESTRES (WIDESCREEN)
// ==============================================================================
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
    selectedRfChannelIndex = null; // Inicia sempre na Visão Ampla mostrando todos os canais em suas posições reais

    const modal = document.getElementById("rfTopographyModal");
    if (!modal) return;

    const titleEl = document.getElementById("rfModalTitle");
    if (titleEl) titleEl.innerText = `Perfil Geográfico & Topografia RF • ${market.cidade} (${market.uf})`;
    
    const statusBadge = document.getElementById("rfModalStatusBadge");
    if (statusBadge) {
        statusBadge.className = market.status_color === "red" ? "badge badge-red" :
                                (market.status_color === "yellow" ? "badge badge-yellow" : "badge badge-green");
        statusBadge.innerText = market.status_label || (market.outage_channels > 0 ? "Instável / Atenuação" : "Estável");
    }

    const siteCoordsEl = document.getElementById("rfModalSiteCoords");
    if (siteCoordsEl) siteCoordsEl.innerText = `${market.lat.toFixed(5)}, ${market.lng.toFixed(5)}`;
    
    const siteElevEl = document.getElementById("rfModalSiteElevation");
    if (siteElevEl) siteElevEl.innerText = `${market.site_elevation_m || 36} m`;
    
    const mastHeightEl = document.getElementById("rfModalMastHeight");
    if (mastHeightEl) mastHeightEl.innerText = `${market.rx_antenna_height_m || 24} m`;

    // Popula Tabela de Emissoras Terrestres (com clique interativo)
    renderRfModalChannelsTable(market);

    // Controles Interativos (Coluna Esquerda): Microclima & Simulador What-If de Mastro
    const interactiveControlsEl = document.getElementById("rfModalInteractiveControls");
    const currentMast = market.rx_antenna_height_m || 24;
    const baseClearance = market.cidade.toLowerCase() === "pelotas" ? 42 : (market.outage_channels > 0 ? 55 : 86);

    const w = market.weather_troposphere || {
        temperatura_c: 21.0, umidade_pct: 72, ponto_orvalho_c: 16.0,
        fator_k: 1.33, fator_k_status: "Atmosfera Padrão",
        atenuacao_troposferica_db: (market.outage_channels > 0 ? 2.4 : 0.6)
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
                <span style="font-size: 10px; color: var(--text-muted); font-weight: 700;">10m</span>
                <input type="range" min="10" max="50" value="${currentMast}" step="0.5" id="sliderWhatIfMastHeight" style="flex: 1; accent-color: #6366f1; cursor: pointer;" oninput="updateWhatIfSimulationLive('${market.id}', this.value)">
                <span style="font-size: 10px; color: var(--text-muted); font-weight: 700;">50m</span>
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

    // Renderiza Gráficos e Notas
    switchRfModalView('radar');
    renderMarketRadarCanvas(market, selectedRfChannelIndex);
    renderTerrainCanvas(market, null, selectedRfChannelIndex);
    updateRfModalEngineeringNotes(market, selectedRfChannelIndex);

    modal.style.display = "flex";
}
window.openMarketRfModal = openMarketRfModal;
window.openRfTopographyModal = openMarketRfModal;

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
    let market = selectedMarket || window.selectedMarket;
    if (!market) return;

    const currentMast = market.rx_antenna_height_m || 24;
    const diff = mastVal - currentMast;

    const labelEl = document.getElementById("whatIfMastCurrentLabel");
    if (labelEl) {
        labelEl.innerText = `Mastro Simulado: ${mastVal.toFixed(1)}m (${diff >= 0 ? '+' : ''}${diff.toFixed(1)}m)`;
    }

    const mastHeaderEl = document.getElementById("rfModalMastHeight");
    if (mastHeaderEl) {
        mastHeaderEl.innerText = `${mastVal.toFixed(1)}m (${diff >= 0 ? '+' : ''}${diff.toFixed(1)}m Simulado)`;
        mastHeaderEl.style.color = diff > 0 ? "#34d399" : (diff < 0 ? "#f87171" : "#10b981");
    }

    const baseClearance = market.cidade.toLowerCase() === "pelotas" ? 42 : (market.outage_channels > 0 ? 55 : 86);
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
            recTextEl.innerHTML = `<span style="color: #34d399;">✅ <strong>1ª Zona de Fresnel 100% Desobstruída:</strong> Altura simulada de ${mastVal.toFixed(1)}m livra folga superior a 60% sobre a cota do terreno, garantindo ganho de ${gainDb >= 0 ? '+' : ''}${gainDb.toFixed(1)} dB.</span>`;
        } else {
            const needed = Math.max(0.5, ((60 - simulatedClearance) / 4.8)).toFixed(1);
            recTextEl.innerHTML = `<span style="color: #facc15;">⚠️ <strong>Penetração na 1ª Zona de Fresnel (${simulatedClearance}%):</strong> Recomenda-se elevar o mastro em mais +${needed}m para atingir 60% de clearance mínimo.</span>`;
        }
    }

    renderTerrainCanvas(market, mastVal, selectedRfChannelIndex);
}
window.updateWhatIfSimulationLive = updateWhatIfSimulationLive;

// ==============================================================================
// CANVAS DO CORTE TRANSVERSAL DE RELEVO E LINHA DE VISADA (LOS / FRESNEL)
// Suporta:
// 1. Visão Ampla Bilateral / Multi-Canal (selectedChannelIdx === null):
//    Mostra o Capture Site no CENTRO e as Torres em direções opostas (ex: SJC Globo Norte <-> CS Centro <-> SBT Sul)
// 2. Visão Focada em Canal (selectedChannelIdx !== null):
//    Mostra o Corte Transversal dedicado exclusivamente ao canal clicado na tabela!
// ==============================================================================
function renderTerrainCanvas(market, simulatedMastHeight = null, selectedChannelIdx = undefined) {
    if (selectedChannelIdx === undefined) selectedChannelIdx = selectedRfChannelIndex;

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

    // Grade de fundo
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    for (let x = 60; x < w - 40; x += 90) {
        ctx.beginPath();
        ctx.moveTo(x, 28);
        ctx.lineTo(x, h - 30);
        ctx.stroke();
    }
    for (let y = 36; y < h - 30; y += 45) {
        ctx.beginPath();
        ctx.moveTo(45, y);
        ctx.lineTo(w - 45, y);
        ctx.stroke();
    }

    const channels = market.channels_rf_detail || [];
    const siteElev = market.site_elevation_m || 36;
    const mastHeight = simulatedMastHeight !== null ? simulatedMastHeight : (market.rx_antenna_height_m || 24);
    const siteTotalAlt = siteElev + mastHeight;

    // Se a praça tiver 2+ canais E estivermos na Visão Ampla (selectedChannelIdx === null),
    // renderiza o Panorama Bilateral / Multi-Canal com o Capture Site no Centro!
    if (selectedChannelIdx === null && channels.length >= 2) {
        renderBilateralWideTerrainCanvas(ctx, w, h, market, channels, siteElev, mastHeight, siteTotalAlt, simulatedMastHeight);
        return;
    }

    // Caso contrário, renderiza o Corte Transversal Dedicado ao Canal Selecionado (ou canal único)
    const chIdx = (selectedChannelIdx !== null && channels[selectedChannelIdx]) ? selectedChannelIdx : 0;
    const ch = channels[chIdx] || {
        emissora: "Canal Principal",
        canal_fisico: "UHF",
        freq_mhz: 545.143,
        tower_name: market.main_tower || "Torre Principal",
        tower_bairro: "",
        distance_km: market.distance_km || 6.0,
        distance_m: market.distance_m || 6000,
        azimuth_deg: market.azimuth_deg || 45.0,
        cardinal: "NE",
        tower_cota_m: market.towers_detail?.[0]?.cota_m || (siteElev + 40),
        tower_mast_m: market.towers_detail?.[0]?.mast_m || 55,
        los_status: market.los_status || "Visada Direta (LOS)",
        terrain_profile_m: null
    };
    const chPalette = CHANNEL_COLORS[chIdx % CHANNEL_COLORS.length];

    const distKm = ch.distance_km || market.distance_km || 5.0;
    const towerElev = ch.tower_cota_m || market.towers_detail?.[0]?.cota_m || (siteElev + 35);
    const towerMast = ch.tower_mast_m || 55;
    const towerTotalAlt = towerElev + towerMast;

    const profileArr = (ch.terrain_profile_m && ch.terrain_profile_m.length >= 3)
        ? ch.terrain_profile_m
        : [siteElev, Math.round((siteElev + towerElev) / 2), towerElev];

    const minGround = Math.min(siteElev, towerElev, ...profileArr);
    const minAlt = Math.max(0, minGround - 35);
    const maxAlt = Math.max(towerTotalAlt, siteTotalAlt, ...profileArr) + 45;

    function altToY(alt) {
        return h - 34 - ((alt - minAlt) / Math.max(40, (maxAlt - minAlt))) * (h - 82);
    }

    const xSite = 115;
    const xTower = w - 125;

    // Banner superior identificando o canal em foco (sem sobreposição de texto)
    const freqStr = Number(ch.freq_mhz).toFixed(3).replace(".", ",") + " MHz";
    const cardDirShort = (ch.cardinal || ch.cardinal_dir || "").split(" ")[0];
    const towerLocShort = String(ch.tower_bairro || ch.tower_name || "").slice(0, 32);
    ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
    ctx.fillRect(45, 6, w - 90, 24);
    ctx.strokeStyle = chPalette.stroke;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(45, 6, w - 90, 24);

    ctx.fillStyle = chPalette.stroke;
    ctx.font = "bold 10px Inter, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`🎯 CANAL EM FOCO: ${ch.emissora.toUpperCase()} • ${freqStr} (${ch.canal_fisico})`, 56, 21);

    ctx.fillStyle = "#e2e8f0";
    ctx.font = "9.5px monospace";
    ctx.textAlign = "right";
    ctx.fillText(`📍 ${towerLocShort} • Az ${ch.azimuth_deg}° (${cardDirShort}) • ${distKm.toFixed(2)} km`, w - 55, 21);

    // Desenho do Perfil de Relevo Real do Canal
    ctx.beginPath();
    ctx.moveTo(xSite, h - 34);
    ctx.lineTo(xSite, altToY(siteElev));

    const nPts = profileArr.length;
    for (let i = 0; i < nPts; i++) {
        const frac = i / Math.max(1, nPts - 1);
        const xStep = xSite + frac * (xTower - xSite);
        const gAlt = profileArr[i];
        ctx.lineTo(xStep, altToY(gAlt));
    }

    ctx.lineTo(xTower, altToY(towerElev));
    ctx.lineTo(xTower, h - 34);
    ctx.closePath();

    const terrainGrad = ctx.createLinearGradient(0, altToY(Math.max(siteElev, towerElev)), 0, h - 34);
    terrainGrad.addColorStop(0, "rgba(30, 41, 59, 0.95)");
    terrainGrad.addColorStop(1, "rgba(15, 23, 42, 0.98)");
    ctx.fillStyle = terrainGrad;
    ctx.fill();
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Escala de Distância no rodapé do eixo X
    ctx.fillStyle = "#94a3b8";
    ctx.font = "9.5px monospace";
    ctx.textAlign = "center";
    for (let step = 0; step <= 4; step++) {
        const frac = step / 4;
        const xTick = xSite + frac * (xTower - xSite);
        const kmTick = (frac * distKm).toFixed(2);
        ctx.fillText(`${kmTick} km`, xTick, h - 16);
    }

    const ySiteAntenna = altToY(siteTotalAlt);
    const yTowerAntenna = altToY(towerTotalAlt);

    // Verifica se há obstrução real no perfil
    let maxPenetration = 0;
    for (let i = 1; i < nPts - 1; i++) {
        const frac = i / (nPts - 1);
        const losAltAtPt = siteTotalAlt + frac * (towerTotalAlt - siteTotalAlt);
        const clearanceM = losAltAtPt - profileArr[i];
        if (clearanceM < 12) {
            maxPenetration = Math.max(maxPenetration, 12 - clearanceM);
        }
    }
    const hasObstacle = maxPenetration > 0 || (ch.los_status && (ch.los_status.includes("Obstru") || ch.los_status.includes("NLOS")));
    const isDesobstruido = !hasObstacle || (simulatedMastHeight !== null && simulatedMastHeight >= (market.rx_antenna_height_m || 24) + 3.5);

    // Elipsoide da 1ª Zona de Fresnel
    const steps = 28;
    ctx.beginPath();
    ctx.save();
    ctx.strokeStyle = isDesobstruido ? chPalette.stroke : "rgba(239, 68, 68, 0.65)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);

    for (let i = 0; i <= steps; i++) {
        const frac = i / steps;
        const xStep = xSite + frac * (xTower - xSite);
        const yLos = ySiteAntenna + frac * (yTowerAntenna - ySiteAntenna);
        const rFresnel = Math.sin(frac * Math.PI) * 22;
        if (i === 0) ctx.moveTo(xStep, yLos - rFresnel);
        else ctx.lineTo(xStep, yLos - rFresnel);
    }
    for (let i = steps; i >= 0; i--) {
        const frac = i / steps;
        const xStep = xSite + frac * (xTower - xSite);
        const yLos = ySiteAntenna + frac * (yTowerAntenna - ySiteAntenna);
        const rFresnel = Math.sin(frac * Math.PI) * 22;
        ctx.lineTo(xStep, yLos + rFresnel);
    }
    ctx.closePath();
    ctx.fillStyle = isDesobstruido ? chPalette.fill : "rgba(239, 68, 68, 0.12)";
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Linha de Visada Direta (LOS)
    ctx.beginPath();
    ctx.strokeStyle = isDesobstruido ? chPalette.stroke : "#ef4444";
    ctx.lineWidth = 2.8;
    ctx.moveTo(xSite, ySiteAntenna);
    ctx.lineTo(xTower, yTowerAntenna);
    ctx.stroke();

    // Mastro Receptor (Capture Site RX)
    ctx.strokeStyle = simulatedMastHeight !== null ? "#34d399" : "#38bdf8";
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(xSite, altToY(siteElev));
    ctx.lineTo(xSite, ySiteAntenna);
    ctx.stroke();

    ctx.fillStyle = "#38bdf8";
    ctx.beginPath();
    ctx.arc(xSite, ySiteAntenna, 6, 0, Math.PI * 2);
    ctx.fill();

    // Card Capture Site (RX)
    const rxCardY = Math.max(36, ySiteAntenna - 36);
    ctx.fillStyle = "rgba(15, 23, 42, 0.94)";
    ctx.fillRect(xSite - 70, rxCardY, 145, 28);
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 1.2;
    ctx.strokeRect(xSite - 70, rxCardY, 145, 28);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 9.5px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`🔵 CS (${market.site_bairro || market.cidade})`, xSite + 2, rxCardY + 11);
    ctx.fillStyle = "#38bdf8";
    ctx.font = "9px monospace";
    ctx.fillText(`Cota ${siteElev}m + Mastro ${mastHeight.toFixed(1)}m`, xSite + 2, rxCardY + 22);

    // Torre Transmissora (TX)
    ctx.strokeStyle = chPalette.stroke;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(xTower, altToY(towerElev));
    ctx.lineTo(xTower, yTowerAntenna);
    ctx.stroke();

    ctx.fillStyle = chPalette.pin;
    ctx.beginPath();
    ctx.arc(xTower, yTowerAntenna, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Card Torre Transmissora (TX)
    const txCardW = 215;
    const txCardX = Math.min(w - txCardW - 10, xTower - Math.round(txCardW / 2));
    const txCardY = Math.max(36, yTowerAntenna - 38);
    ctx.fillStyle = "rgba(15, 23, 42, 0.94)";
    ctx.fillRect(txCardX, txCardY, txCardW, 30);
    ctx.strokeStyle = chPalette.stroke;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(txCardX, txCardY, txCardW, 30);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 9.5px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`📡 ${String(ch.emissora).slice(0, 24)} (${ch.canal_fisico})`, txCardX + txCardW / 2, txCardY + 12);
    ctx.fillStyle = chPalette.badge;
    ctx.font = "8.5px monospace";
    ctx.fillText(`${String(ch.tower_bairro || ch.tower_name).slice(0, 26)} • ${towerElev}m+${towerMast}m`, txCardX + txCardW / 2, txCardY + 23);

    // Rótulo Central do Enlace
    const xMid = (xSite + xTower) / 2;
    const yMid = (ySiteAntenna + yTowerAntenna) / 2 - 14;
    ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
    ctx.fillRect(xMid - 125, yMid - 11, 250, 22);
    ctx.strokeStyle = isDesobstruido ? chPalette.stroke : "#ef4444";
    ctx.lineWidth = 1.2;
    ctx.strokeRect(xMid - 125, yMid - 11, 250, 22);

    ctx.fillStyle = isDesobstruido ? "#6ee7b7" : "#fca5a5";
    ctx.font = "bold 9.5px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${freqStr} • ${distKm.toFixed(2)} km • Az ${ch.azimuth_deg}° (${cardDirShort})`, xMid, yMid + 4);
    ctx.textAlign = "left";

    const noticeEl = document.getElementById("rfTerrainDiagnosisNotice");
    if (noticeEl) {
        noticeEl.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;">
                <div>
                    <strong style="color: ${chPalette.stroke};">🎯 Canal em Foco: ${escapeHtml(ch.emissora)} (${freqStr} • ${escapeHtml(ch.canal_fisico)})</strong> — 
                    Torre: <strong>${escapeHtml(ch.tower_name)}</strong> (${escapeHtml(ch.tower_bairro || '')}) • Distância: <strong>${distKm.toFixed(2)} km</strong> • Azimute: <strong>${ch.azimuth_deg}° (${escapeHtml(ch.cardinal || '')})</strong>.
                </div>
                <button type="button" class="btn-secondary" style="padding: 2px 8px; font-size: 10px; border-color: #38bdf8; color: #38bdf8;" onclick="selectRfModalChannel(null)">
                    🌐 Voltar para Visão Ampla (Todos os Canais)
                </button>
            </div>
        `;
    }
}

// ==============================================================================
// CORTE TRANSVERSAL PANORÂMICO BILATERAL / MULTI-CANAL (VISÃO AMPLA)
// Exibe o Capture Site no Centro e os canais nas direções opostas reais
// (ex: SJC -> Rede Globo a Norte na esquerda, Capture Site no meio, SBT a Sul na direita)
// ==============================================================================
function renderBilateralWideTerrainCanvas(ctx, w, h, market, channels, siteElev, mastHeight, siteTotalAlt, simulatedMastHeight) {
    // Separa os canais em Setor Norte/Oeste (Esquerda do Panorama) e Setor Sul/Leste (Direita do Panorama)
    // Se houver 2 canais, garante que o 1º fique à esquerda e o 2º à direita do Capture Site central!
    const leftChannels = [];
    const rightChannels = [];

    channels.forEach((c, idx) => {
        const item = { ...c, _idx: idx, _palette: CHANNEL_COLORS[idx % CHANNEL_COLORS.length] };
        const az = Number(c.azimuth_deg || 0);
        // Norte / Noroeste / Nordeste superior (az >= 270 ou az <= 90) vai para um lado, Sul/Sudoeste/Sudeste (90 < az < 270) para o outro
        if (az >= 270 || az <= 90) {
            leftChannels.push(item);
        } else {
            rightChannels.push(item);
        }
    });

    // Se todos os canais estiverem no mesmo hemisfério, divide metade na esquerda e metade na direita para clareza visual
    if (leftChannels.length === 0 && rightChannels.length >= 2) {
        leftChannels.push(rightChannels.shift());
    } else if (rightChannels.length === 0 && leftChannels.length >= 2) {
        rightChannels.push(leftChannels.pop());
    }

    // Calcula limites verticais de altitude
    let allAlts = [siteElev, siteTotalAlt];
    channels.forEach(c => {
        const tElev = c.tower_cota_m || (siteElev + 30);
        const tMast = c.tower_mast_m || 55;
        allAlts.push(tElev, tElev + tMast);
        if (c.terrain_profile_m) allAlts.push(...c.terrain_profile_m);
    });
    const minAlt = Math.max(0, Math.min(...allAlts) - 35);
    const maxAlt = Math.max(...allAlts) + 48;

    function altToY(alt) {
        return h - 34 - ((alt - minAlt) / Math.max(40, (maxAlt - minAlt))) * (h - 86);
    }

    const xCenter = Math.round(w / 2);
    const xLeftEdge = 95;
    const xRightEdge = w - 95;

    // Banner de Topo: Visão Ampla Multi-Canal
    ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
    ctx.fillRect(45, 6, w - 90, 24);
    ctx.strokeStyle = "rgba(56, 189, 248, 0.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(45, 6, w - 90, 24);

    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 10px Inter, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`🌐 VISÃO AMPLA MULTI-CANAL • ${market.cidade.toUpperCase()} (${channels.length} TORRES DISTINTAS)`, 56, 21);

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "9.5px Inter, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`Clique em um canal na tabela para focar`, w - 55, 21);

    // Desenha o terreno à Esquerda (do Capture Site Central até a Torre Esquerda/Norte)
    const primaryLeft = leftChannels[0];
    const primaryRight = rightChannels[0];

    ctx.beginPath();
    ctx.moveTo(xLeftEdge, h - 34);

    if (primaryLeft) {
        const profL = (primaryLeft.terrain_profile_m && primaryLeft.terrain_profile_m.length >= 2)
            ? [...primaryLeft.terrain_profile_m].reverse() // Da Torre (esquerda) para o CS (centro)
            : [primaryLeft.tower_cota_m || siteElev + 30, siteElev];
        for (let i = 0; i < profL.length; i++) {
            const frac = i / Math.max(1, profL.length - 1);
            const xPt = xLeftEdge + frac * (xCenter - xLeftEdge);
            ctx.lineTo(xPt, altToY(profL[i]));
        }
    } else {
        ctx.lineTo(xLeftEdge, altToY(siteElev));
        ctx.lineTo(xCenter, altToY(siteElev));
    }

    if (primaryRight) {
        const profR = (primaryRight.terrain_profile_m && primaryRight.terrain_profile_m.length >= 2)
            ? primaryRight.terrain_profile_m // Do CS (centro) para a Torre (direita)
            : [siteElev, primaryRight.tower_cota_m || siteElev + 30];
        for (let i = 0; i < profR.length; i++) {
            const frac = i / Math.max(1, profR.length - 1);
            const xPt = xCenter + frac * (xRightEdge - xCenter);
            ctx.lineTo(xPt, altToY(profR[i]));
        }
    } else {
        ctx.lineTo(xRightEdge, altToY(siteElev));
    }

    ctx.lineTo(xRightEdge, h - 34);
    ctx.closePath();

    const terrainGrad = ctx.createLinearGradient(0, altToY(maxAlt - 40), 0, h - 34);
    terrainGrad.addColorStop(0, "rgba(30, 41, 59, 0.92)");
    terrainGrad.addColorStop(1, "rgba(15, 23, 42, 0.98)");
    ctx.fillStyle = terrainGrad;
    ctx.fill();
    ctx.strokeStyle = "rgba(56, 189, 248, 0.65)";
    ctx.lineWidth = 2;
    ctx.stroke();

    const ySiteAntenna = altToY(siteTotalAlt);

    // Função auxiliar para desenhar cada torre e seu feixe de Fresnel até o Capture Site Central
    function drawChannelTowerAndBeam(chObj, side, slotIdx, totalInSide) {
        const spanPx = (side === "left") ? (xCenter - xLeftEdge) : (xRightEdge - xCenter);
        // Se houver mais de 1 torre do mesmo lado, escalona a distância horizontal proporcionalmente
        const distRatio = totalInSide > 1 ? (1.0 - slotIdx * 0.28) : 1.0;
        const xTw = side === "left"
            ? Math.round(xCenter - spanPx * distRatio)
            : Math.round(xCenter + spanPx * distRatio);

        const tElev = chObj.tower_cota_m || (siteElev + 30);
        const tMast = chObj.tower_mast_m || 55;
        const yTwBase = altToY(tElev);
        const yTwTop = altToY(tElev + tMast);
        const pal = chObj._palette;

        // Elipsoide de Fresnel
        const steps = 22;
        ctx.beginPath();
        ctx.save();
        ctx.strokeStyle = pal.stroke;
        ctx.lineWidth = 1.3;
        ctx.setLineDash([4, 3]);
        for (let i = 0; i <= steps; i++) {
            const frac = i / steps;
            const xStep = xCenter + frac * (xTw - xCenter);
            const yLos = ySiteAntenna + frac * (yTwTop - ySiteAntenna);
            const rF = Math.sin(frac * Math.PI) * 16;
            if (i === 0) ctx.moveTo(xStep, yLos - rF);
            else ctx.lineTo(xStep, yLos - rF);
        }
        for (let i = steps; i >= 0; i--) {
            const frac = i / steps;
            const xStep = xCenter + frac * (xTw - xCenter);
            const yLos = ySiteAntenna + frac * (yTwTop - ySiteAntenna);
            const rF = Math.sin(frac * Math.PI) * 16;
            ctx.lineTo(xStep, yLos + rF);
        }
        ctx.closePath();
        ctx.fillStyle = pal.fill;
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Linha de Visada (LOS)
        ctx.beginPath();
        ctx.strokeStyle = pal.stroke;
        ctx.lineWidth = 2.5;
        ctx.moveTo(xCenter, ySiteAntenna);
        ctx.lineTo(xTw, yTwTop);
        ctx.stroke();

        // Estrutura física da Torre TX
        ctx.strokeStyle = pal.stroke;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(xTw, yTwBase);
        ctx.lineTo(xTw, yTwTop);
        ctx.stroke();

        ctx.fillStyle = pal.pin;
        ctx.beginPath();
        ctx.arc(xTw, yTwTop, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Rótulo de Distância no meio do feixe
        const xMid = Math.round((xCenter + xTw) / 2);
        const yMid = Math.round((ySiteAntenna + yTwTop) / 2) - (slotIdx * 18);
        const freqStr = Number(chObj.freq_mhz).toFixed(3).replace(".", ",") + " MHz";
        const cardShort = (chObj.cardinal || chObj.cardinal_dir || "").split(" ")[0];

        ctx.fillStyle = "rgba(11, 19, 43, 0.94)";
        ctx.fillRect(xMid - 84, yMid - 10, 168, 19);
        ctx.strokeStyle = pal.stroke;
        ctx.lineWidth = 1;
        ctx.strokeRect(xMid - 84, yMid - 10, 168, 19);

        ctx.fillStyle = pal.badge;
        ctx.font = "bold 9px monospace";
        ctx.textAlign = "center";
        ctx.fillText(`${freqStr} • ${chObj.distance_km} km (${cardShort})`, xMid, yMid + 3);

        // Card Completo da Torre Transmissora
        const cardW = 210;
        const cardH = 42;
        let cardX = xTw - Math.round(cardW / 2);
        cardX = Math.max(12, Math.min(w - cardW - 12, cardX));
        const cardY = Math.max(36, yTwTop - cardH - 10 - (slotIdx * 46));

        ctx.fillStyle = "rgba(11, 19, 43, 0.96)";
        ctx.fillRect(cardX, cardY, cardW, cardH);
        ctx.strokeStyle = pal.stroke;
        ctx.lineWidth = 1.4;
        ctx.strokeRect(cardX, cardY, cardW, cardH);

        ctx.fillStyle = "#fff";
        ctx.font = "bold 9.5px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`📡 ${String(chObj.emissora).slice(0, 22)} (${chObj.canal_fisico})`, cardX + cardW / 2, cardY + 13);

        ctx.fillStyle = pal.stroke;
        ctx.font = "bold 9px monospace";
        ctx.fillText(`${freqStr} • Az ${chObj.azimuth_deg}° (${cardShort})`, cardX + cardW / 2, cardY + 25);

        ctx.fillStyle = "#cbd5e1";
        ctx.font = "8.5px Inter, sans-serif";
        const bairroText = chObj.tower_bairro || chObj.tower_name;
        ctx.fillText(`${bairroText.slice(0, 26)} (${tElev}m+${tMast}m)`, cardX + cardW / 2, cardY + 36);

        // Eixo X Rodapé
        ctx.fillStyle = pal.badge;
        ctx.font = "bold 9.5px monospace";
        ctx.textAlign = "center";
        const dirArrow = side === "left" ? "⬅️" : "➡️";
        ctx.fillText(`${dirArrow} ${cardShort} (${chObj.distance_km} km)`, xTw, h - 14);
    }

    leftChannels.forEach((chObj, idx) => drawChannelTowerAndBeam(chObj, "left", idx, leftChannels.length));
    rightChannels.forEach((chObj, idx) => drawChannelTowerAndBeam(chObj, "right", idx, rightChannels.length));

    // Desenha o Capture Site (RX) no CENTRO do gráfico!
    ctx.strokeStyle = simulatedMastHeight !== null ? "#34d399" : "#38bdf8";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(xCenter, altToY(siteElev));
    ctx.lineTo(xCenter, ySiteAntenna);
    ctx.stroke();

    ctx.fillStyle = "#38bdf8";
    ctx.beginPath();
    ctx.arc(xCenter, ySiteAntenna, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Card do Capture Site Central
    const csCardW = 184;
    const csCardH = 38;
    const csCardX = xCenter - Math.round(csCardW / 2);
    const csCardY = Math.max(36, ySiteAntenna - csCardH - 12);

    ctx.fillStyle = "rgba(15, 23, 42, 0.96)";
    ctx.fillRect(csCardX, csCardY, csCardW, csCardH);
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 1.6;
    ctx.strokeRect(csCardX, csCardY, csCardW, csCardH);

    ctx.fillStyle = "#fff";
    ctx.font = "bold 10px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`🔵 CAPTURE SITE (NO MEIO)`, xCenter, csCardY + 13);

    ctx.fillStyle = "#38bdf8";
    ctx.font = "9px monospace";
    ctx.fillText(`${market.site_bairro || market.cidade}`, xCenter, csCardY + 24);
    ctx.fillStyle = "#34d399";
    ctx.fillText(`Cota ${siteElev}m + Mastro ${mastHeight.toFixed(1)}m`, xCenter, csCardY + 34);

    ctx.fillStyle = "#fff";
    ctx.font = "bold 9.5px monospace";
    ctx.fillText(`📍 CS (0.0 km • Centro)`, xCenter, h - 14);
    ctx.textAlign = "left";

    // Atualiza barra de aviso abaixo do gráfico
    const noticeEl = document.getElementById("rfTerrainDiagnosisNotice");
    if (noticeEl) {
        const summaryParts = channels.map((c, i) => {
            const p = CHANNEL_COLORS[i % CHANNEL_COLORS.length];
            const fStr = Number(c.freq_mhz).toFixed(3).replace(".", ",") + " MHz";
            return `<span style="color: ${p.stroke}; font-weight: 700;">● ${escapeHtml(c.emissora)}</span> (${fStr} • ${escapeHtml(c.tower_bairro || c.tower_name)} • ${c.distance_km} km a ${escapeHtml(c.cardinal || '')})`;
        }).join(" &nbsp;|&nbsp; ");
        noticeEl.innerHTML = `
            <div>
                <strong style="color: #38bdf8;">🌐 Visão Ampla Multi-Canal:</strong> Capture Site no centro (<strong>${escapeHtml(market.site_bairro || market.cidade)}</strong>) recebendo sinais de direções distintas: ${summaryParts}. 
                <em style="color: #93c5fd;">(Clique em um canal na tabela à direita para focar o corte transversal em um único canal).</em>
            </div>
        `;
    }
}

// ==============================================================================
// RADAR GEOGRÁFICO 2D COM ESCALA AUTO-CALIBRADA E TORRES DISTINTAS POR CANAL
// ==============================================================================
function renderMarketRadarCanvas(market, selectedChannelIdx = undefined) {
    if (selectedChannelIdx === undefined) selectedChannelIdx = selectedRfChannelIndex;

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

    const channels = market.channels_rf_detail || [];
    const maxChDist = channels.reduce((acc, c) => Math.max(acc, Number(c.distance_km || 5)), 4.0);
    // Escala dinâmica inteligente: para SJC (4.34 km), maxRadarKm = 6 km; para Pelotas (14.8 km), maxRadarKm = 18 km
    let maxRadarKm = 8.0;
    if (maxChDist <= 5.0) maxRadarKm = 6.0;
    else if (maxChDist <= 8.0) maxRadarKm = 10.0;
    else if (maxChDist <= 12.0) maxRadarKm = 14.0;
    else if (maxChDist <= 16.0) maxRadarKm = 18.0;
    else maxRadarKm = Math.ceil((maxChDist * 1.25) / 5) * 5;

    const maxRadiusPx = Math.min(w / 2 - 90, h / 2 - 34);

    function kmToRadius(km) {
        return (Math.min(km, maxRadarKm) / maxRadarKm) * maxRadiusPx;
    }

    // Círculos concêntricos dinâmicos (4 anéis)
    const rings = [
        Number((maxRadarKm * 0.25).toFixed(1)),
        Number((maxRadarKm * 0.50).toFixed(1)),
        Number((maxRadarKm * 0.75).toFixed(1)),
        Number(maxRadarKm.toFixed(1))
    ];
    ctx.lineWidth = 1;
    rings.forEach((rKm, idx) => {
        const rPx = kmToRadius(rKm);
        ctx.beginPath();
        ctx.arc(cx, cy, rPx, 0, Math.PI * 2);
        ctx.strokeStyle = idx === rings.length - 1 ? "rgba(56, 189, 248, 0.38)" : "rgba(56, 189, 248, 0.16)";
        ctx.setLineDash(idx % 2 === 1 ? [4, 4] : []);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = "rgba(148, 163, 184, 0.75)";
        ctx.font = "9px Inter, monospace";
        ctx.textAlign = "left";
        ctx.fillText(`${rKm} km`, cx + 5, cy - rPx + 10);
    });

    // 8 Pontos Cardeais
    const radials = [
        { label: "NORT (0°)", angle: -Math.PI / 2 },
        { label: "NE (45°)", angle: -Math.PI / 4 },
        { label: "LESTE (90°)", angle: 0 },
        { label: "SE (135°)", angle: Math.PI / 4 },
        { label: "SUL (180°)", angle: Math.PI / 2 },
        { label: "SO / SW (225°)", angle: (3 * Math.PI) / 4 },
        { label: "OESTE (270°)", angle: Math.PI },
        { label: "NO / NW (315°)", angle: -(3 * Math.PI) / 4 }
    ];

    radials.forEach(rad => {
        const xEdge = cx + Math.cos(rad.angle) * maxRadiusPx;
        const yEdge = cy + Math.sin(rad.angle) * maxRadiusPx;

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(xEdge, yEdge);
        ctx.strokeStyle = "rgba(56, 189, 248, 0.13)";
        ctx.lineWidth = 1;
        ctx.stroke();

        const xLabel = cx + Math.cos(rad.angle) * (maxRadiusPx + 20);
        const yLabel = cy + Math.sin(rad.angle) * (maxRadiusPx + 16);
        ctx.fillStyle = "#38bdf8";
        ctx.font = "bold 9px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(rad.label, xLabel, yLabel);
    });
    ctx.textBaseline = "alphabetic";

    // Renderiza CADA Canal/Torre em sua posição geográfica real (azimute e distância exatos)
    const placedCards = [];

    channels.forEach((ch, idx) => {
        const isFocused = (selectedChannelIdx === null) || (selectedChannelIdx === idx);
        const pal = CHANNEL_COLORS[idx % CHANNEL_COLORS.length];
        const azDeg = Number(ch.azimuth_deg || 0);
        const distKm = Number(ch.distance_km || 4.0);
        const mathAngleRad = ((azDeg - 90) * Math.PI) / 180;
        const rPx = kmToRadius(distKm);
        const xTower = cx + Math.cos(mathAngleRad) * rPx;
        const yTower = cy + Math.sin(mathAngleRad) * rPx;

        ctx.save();
        ctx.globalAlpha = isFocused ? 1.0 : 0.28;

        // Linha vetorial do enlace CS -> Torre da Emissora
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(xTower, yTower);
        ctx.strokeStyle = pal.stroke;
        ctx.lineWidth = (selectedChannelIdx === idx) ? 3.5 : 2.2;
        ctx.setLineDash((selectedChannelIdx === idx) ? [] : [5, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Badge de Distância no meio do raio
        const xDist = cx + Math.cos(mathAngleRad) * (rPx * 0.52);
        const yDist = cy + Math.sin(mathAngleRad) * (rPx * 0.52);
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(xDist - 26, yDist - 8, 52, 15);
        ctx.strokeStyle = pal.stroke;
        ctx.lineWidth = 1;
        ctx.strokeRect(xDist - 26, yDist - 8, 52, 15);
        ctx.fillStyle = pal.badge;
        ctx.font = "bold 9px monospace";
        ctx.textAlign = "center";
        ctx.fillText(`${distKm.toFixed(2)}km`, xDist, yDist + 3);

        // Halo & Pino da Torre Transmissora
        ctx.beginPath();
        ctx.arc(xTower, yTower, (selectedChannelIdx === idx) ? 14 : 10, 0, Math.PI * 2);
        ctx.fillStyle = pal.fill;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(xTower, yTower, (selectedChannelIdx === idx) ? 8.5 : 7, 0, Math.PI * 2);
        ctx.fillStyle = pal.pin;
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Card de Informações da Emissora / Torre (com prevenção de colisão)
        const cardW = 235;
        const cardH = 54;
        const placeRight = (xTower >= cx - 10);
        let cardX = placeRight ? (xTower + 16) : (xTower - cardW - 16);
        let cardY = yTower - cardH / 2;

        // Mantém dentro do canvas
        cardX = Math.max(10, Math.min(w - cardW - 10, cardX));
        cardY = Math.max(10, Math.min(h - cardH - 10, cardY));

        // Anti-colisão vertical entre cards próximos
        placedCards.forEach(prev => {
            const overlapX = Math.abs(cardX - prev.x) < cardW;
            const overlapY = Math.abs(cardY - prev.y) < (cardH + 6);
            if (overlapX && overlapY) {
                if (cardY >= cy) cardY = Math.min(h - cardH - 8, prev.y + cardH + 8);
                else cardY = Math.max(8, prev.y - cardH - 8);
            }
        });
        placedCards.push({ x: cardX, y: cardY });

        // Linha guia do pino ao card
        ctx.beginPath();
        ctx.moveTo(xTower, yTower);
        ctx.lineTo(placeRight ? cardX : cardX + cardW, cardY + cardH / 2);
        ctx.strokeStyle = pal.stroke;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = "rgba(11, 19, 43, 0.96)";
        ctx.fillRect(cardX, cardY, cardW, cardH);
        ctx.strokeStyle = pal.stroke;
        ctx.lineWidth = (selectedChannelIdx === idx) ? 2.2 : 1.3;
        ctx.strokeRect(cardX, cardY, cardW, cardH);

        const freqStr = Number(ch.freq_mhz).toFixed(3).replace(".", ",") + " MHz";
        const cardDir = ch.cardinal || ch.cardinal_dir || "";
        const shortEmissora = String(ch.emissora || "Canal").length > 21
            ? String(ch.emissora).slice(0, 20) + "…"
            : String(ch.emissora || "Canal");
        ctx.fillStyle = "#fff";
        ctx.font = "bold 9.5px Inter, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(`📡 ${shortEmissora}`, cardX + 8, cardY + 14);

        ctx.fillStyle = pal.badge;
        ctx.font = "bold 9px monospace";
        ctx.textAlign = "right";
        ctx.fillText(`${ch.canal_fisico}`, cardX + cardW - 8, cardY + 14);

        ctx.fillStyle = pal.stroke;
        ctx.font = "bold 9px monospace";
        ctx.textAlign = "left";
        ctx.fillText(`${freqStr}`, cardX + 8, cardY + 28);

        ctx.fillStyle = "#e2e8f0";
        ctx.textAlign = "right";
        ctx.fillText(`Az ${azDeg.toFixed(1)}° (${cardDir.split(' ')[0]})`, cardX + cardW - 8, cardY + 28);

        ctx.fillStyle = "#94a3b8";
        ctx.font = "9px Inter, sans-serif";
        ctx.textAlign = "left";
        const locLabel = ch.tower_bairro || ch.tower_name;
        ctx.fillText(`📍 ${locLabel.slice(0, 32)}`, cardX + 8, cardY + 43);

        const sigColor = ch.rx_level_measured_pct >= 60 ? "#34d399" : "#facc15";
        ctx.fillStyle = sigColor;
        ctx.font = "bold 9px monospace";
        ctx.textAlign = "right";
        ctx.fillText(`${ch.rx_level_measured_pct}%`, cardX + cardW - 8, cardY + 43);

        ctx.restore();
    });

    // 5. Centro: Posição do Capture Site (No Meio!)
    const mastH = market.rx_antenna_height_m || 24;
    ctx.beginPath();
    ctx.arc(cx, cy, 11, 0, Math.PI * 2);
    ctx.fillStyle = "#38bdf8";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = "rgba(15, 23, 42, 0.96)";
    ctx.fillRect(cx - 88, cy + 14, 176, 26);
    ctx.strokeStyle = "rgba(56, 189, 248, 0.75)";
    ctx.lineWidth = 1.3;
    ctx.strokeRect(cx - 88, cy + 14, 176, 26);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 9.5px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`🔵 CS • ${market.cidade.toUpperCase()}`, cx, cy + 25);
    ctx.fillStyle = "#38bdf8";
    ctx.font = "8.5px monospace";
    ctx.fillText(`${market.site_bairro || 'Centro'} (${market.site_elevation_m || 36}m+${mastH}m)`, cx, cy + 35);
    ctx.textAlign = "left";

    // Atualiza aviso inferior do Radar
    const atmNoticeEl = document.getElementById("rfAtmosphericText");
    const atmBadgeEl = document.getElementById("rfAtmosphericBadge");
    if (atmNoticeEl) {
        const chCount = channels.length;
        if (selectedChannelIdx !== null && channels[selectedChannelIdx]) {
            const fc = channels[selectedChannelIdx];
            const fStr = Number(fc.freq_mhz).toFixed(3).replace(".", ",") + " MHz";
            atmNoticeEl.innerHTML = `<strong>🎯 Foco no Canal ${escapeHtml(fc.emissora)} (${fStr} • ${escapeHtml(fc.canal_fisico)}):</strong> Torre localizada em <strong>${escapeHtml(fc.tower_bairro || fc.tower_name)}</strong> a <strong>${fc.distance_km} km</strong> (Azimute <strong>${fc.azimuth_deg}° ${escapeHtml(fc.cardinal || '')}</strong>).`;
            if (atmBadgeEl) { atmBadgeEl.className = "badge badge-blue"; atmBadgeEl.innerText = `Foco: ${fc.canal_fisico}`; }
        } else {
            atmNoticeEl.innerHTML = `<strong>🌐 Visão Ampla Geográfica (${chCount} Canais do Multiplex):</strong> Capture Site no centro (<strong>${escapeHtml(market.site_bairro || market.cidade)}</strong>) e torres plotadas nos azimutes e distâncias reais. Clique em um canal na tabela ao lado para focar.`;
            if (atmBadgeEl) { atmBadgeEl.className = "badge badge-green"; atmBadgeEl.innerText = `Raio Radar: ${maxRadarKm} km`; }
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
        if (selectedMarket) renderMarketRadarCanvas(selectedMarket, selectedRfChannelIndex);
    } else {
        if (radarContainer) radarContainer.style.display = "none";
        if (fresnelContainer) fresnelContainer.style.display = "block";
        if (btnRadar) { btnRadar.className = "btn-secondary"; btnRadar.style.background = "transparent"; }
        if (btnFresnel) { btnFresnel.className = "btn-primary"; btnFresnel.style.background = "#0284c7"; }
        if (selectedMarket) {
            const slider = document.getElementById("sliderWhatIfMastHeight");
            const mastVal = slider ? parseFloat(slider.value) : null;
            renderTerrainCanvas(selectedMarket, mastVal, selectedRfChannelIndex);
        }
    }
}
window.switchRfModalView = switchRfModalView;

// ==============================================================================
// SUPORTE A ZOOM POR RODA DO MOUSE E ARRASTAR (PAN)
// ==============================================================================
function setupTopologyInteractions() {
    const container = document.getElementById("topologyMapSvgContainer");
    if (!container || container._interactionsBound) return;
    container._interactionsBound = true;

    container.addEventListener("wheel", function(e) {
        e.preventDefault();
        if (e.deltaY < 0) zoomTopologyMap('in');
        else zoomTopologyMap('out');
    }, { passive: false });

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

const origLoadTopology = window.loadTopologyMapData;
window.loadTopologyMapData = async function() {
    if (origLoadTopology) await origLoadTopology();
    setupTopologyInteractions();
};

function jumpToCityIncidents() {
    const market = window.selectedMarket || selectedMarket;
    const cityName = market ? (market.cidade || "") : "";

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

    if (typeof closeMarketRfModal === "function") {
        closeMarketRfModal();
    }
    if (typeof switchTab === "function") {
        switchTab("overview");
    }
}
window.jumpToCityIncidents = jumpToCityIncidents;
