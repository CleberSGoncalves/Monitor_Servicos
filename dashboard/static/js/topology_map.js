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
let selectedRfChannelIndex = null;
let currentRfModalCs = "all";
window.currentRfModalCs = currentRfModalCs; // null = Visão Ampla (Todos os Canais); 0..N = Canal específico focado

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
    "sudeste": { minLng: -53.5, maxLng: -39.5, minLat: -25.5, maxLat: -14.0, label: "Região Sudeste (SP / RJ / MG / ES)" },
    "sul": { minLng: -58.0, maxLng: -47.5, minLat: -34.0, maxLat: -22.5, label: "Região Sul (RS / SC / PR)" },
    "nordeste": { minLng: -49.0, maxLng: -34.0, minLat: -18.5, maxLat: -2.0, label: "Região Nordeste (BA / PE / CE / RN / SE / AL / PB / MA / PI)" },
    "centro_oeste": { minLng: -61.0, maxLng: -45.5, minLat: -24.5, maxLat: -10.5, label: "Região Centro-Oeste (MT / MS / GO / DF)" },
    "norte": { minLng: -74.0, maxLng: -46.0, minLat: -12.5, maxLat: 5.5, label: "Região Norte (AM / PA / RO / AC / TO / AP)" }
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
    "Itumbiara": { dx: -18, dy: 12, anchor: "end", side: "bottom-left" }
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
        else if (regionKey === "centro_oeste" || regionKey === "centro-oeste") selState.value = "centro-oeste";
        else if (regionKey === "norte") selState.value = "norte";
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

function ensureTopologyMapStyles() {
    if (document.getElementById("topologyMapInjectedStyles")) return;
    const styleEl = document.createElement("style");
    styleEl.id = "topologyMapInjectedStyles";
    styleEl.textContent = `
        /* Efeito de Foco / Spotlight para Cidades no Mapa de Topologia */
        .map-city-node {
            cursor: pointer;
            transition: opacity 0.18s cubic-bezier(0.4, 0, 0.2, 1);
        }
        /* Quando qualquer cidade está sob o mouse (hover), esmaece todas as outras cidades da frota */
        #svgPinsLayer.has-hover .map-city-node:not(.is-hovered) {
            opacity: 0.22 !important;
            filter: grayscale(0.35) brightness(0.75);
        }
        /* Cidade em foco ativo (hover) */
        .map-city-node.is-hovered {
            opacity: 1 !important;
            filter: drop-shadow(0 0 10px rgba(56, 189, 248, 0.65)) !important;
        }
        .map-city-node.is-hovered .city-marker-glow {
            r: 30px !important;
            opacity: 0.95 !important;
        }
        .map-city-node.is-hovered .city-focus-ring {
            r: 13px !important;
            opacity: 1 !important;
            stroke: #38bdf8 !important;
            stroke-width: 2.5px !important;
        }
        .map-city-node.is-hovered .city-marker-dot {
            r: 8.5px !important;
            stroke: #ffffff !important;
            stroke-width: 2.5px !important;
        }
        .map-city-node.is-hovered .city-pill-rect {
            fill: #0f172a !important;
            stroke: #38bdf8 !important;
            stroke-width: 2px !important;
            filter: drop-shadow(0 2px 8px rgba(56, 189, 248, 0.55)) !important;
        }
        .map-city-node.is-hovered .city-pill-text {
            fill: #ffffff !important;
            font-weight: 800 !important;
        }
        .map-city-node.is-hovered .city-leader-line {
            stroke: #38bdf8 !important;
            stroke-width: 1.5px !important;
            stroke-dasharray: none !important;
        }
        /* Cidade selecionada */
        .map-city-node.is-selected .city-focus-ring {
            opacity: 1 !important;
            stroke: #ffffff !important;
            stroke-width: 2.5px !important;
        }
        .map-city-node.is-selected .city-pill-rect {
            fill: #1e293b !important;
            stroke: #38bdf8 !important;
            stroke-width: 1.8px !important;
        }
        .map-city-node.is-selected .city-pill-text {
            fill: #ffffff !important;
            font-weight: 800 !important;
        }
    `;
    document.head.appendChild(styleEl);
}

function renderTopologyMap() {
    ensureTopologyMapStyles();
    const container = document.getElementById("topologyMapSvgContainer");
    if (!container) return;

    const countryFilter = (document.getElementById("mapFilterCountry")?.value || "all").toLowerCase();
    const stateFilter = (document.getElementById("mapFilterState")?.value || "all").toLowerCase();
    const healthFilter = (document.getElementById("mapFilterHealth")?.value || "all").toLowerCase();
    const searchFilter = (document.getElementById("mapSearchCity")?.value || "").toLowerCase().trim();

    if (stateFilter === "sudeste") currentMapView = "sudeste";
    else if (stateFilter === "sul") currentMapView = "sul";
    else if (stateFilter === "nordeste") currentMapView = "nordeste";
    else if (stateFilter === "centro-oeste" || stateFilter === "centro_oeste") currentMapView = "centro_oeste";
    else if (stateFilter === "norte") currentMapView = "norte";
    else if (["sp", "rj", "mg", "es"].includes(stateFilter)) currentMapView = "sudeste";
    else if (["rs", "sc", "pr"].includes(stateFilter)) currentMapView = "sul";
    else if (["ba", "pe", "ce", "rn", "pb", "al", "se", "ma", "pi"].includes(stateFilter)) currentMapView = "nordeste";
    else if (["df", "go", "mt", "ms"].includes(stateFilter)) currentMapView = "centro_oeste";
    else if (["am", "pa", "ro", "ac", "to", "ap", "rr"].includes(stateFilter)) currentMapView = "norte";

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
            } else if (stateFilter === "centro-oeste" || stateFilter === "centro_oeste") {
                if (!["DF", "GO", "MT", "MS"].includes(m.uf)) return false;
            } else if (stateFilter === "norte") {
                if (!["AM", "PA", "RO", "AC", "TO", "AP", "RR"].includes(m.uf)) return false;
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

            <!-- Camada de Enlaces (Livre de poluição visual na visão macro de frota - canais detalhados exibidos no Radar / Modal) -->
            <g id="svgLinksLayer"></g>
            <g id="svgPinsLayer">
    `;

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
            <g id="city-node-${m.id}"
               class="map-city-node ${isSel ? 'is-selected' : ''}"
               data-market-id="${m.id}"
               style="cursor: pointer; pointer-events: all;"
               onclick="handleCityClick('${m.id}', event)"
               onmouseenter="handleCityHover('${m.id}', event)"
               onmousemove="handleCityMouseMove(event)"
               onmouseleave="handleCityLeave('${m.id}', event)">

                <!-- Área expandida de captura de clique e mouse (sempre clicável e sem perda de eventos) -->
                <circle cx="${pt.x}" cy="${pt.y}" r="24" fill="#000000" fill-opacity="0.001" pointer-events="all" style="cursor: pointer;"/>

                <line class="city-leader-line" x1="${pt.x}" y1="${pt.y}" x2="${labelX}" y2="${labelY - 1}" 
                      stroke="${isSel ? '#38bdf8' : 'rgba(255,255,255,0.25)'}" stroke-width="${isSel ? 1.5 : 1}" stroke-dasharray="${isSel ? 'none' : '2,2'}" style="pointer-events: none;"/>

                <!-- Halo Luminoso de Status -->
                <circle class="city-marker-glow" cx="${pt.x}" cy="${pt.y}" r="${isSel ? 26 : 18}" fill="url(#${glowId})" opacity="${isSel ? 0.95 : 0.65}" style="pointer-events: none;">
                    ${m.status_color === "red" ? `
                        <animate attributeName="r" values="16;28;16" dur="2s" repeatCount="indefinite"/>
                        <animate attributeName="opacity" values="0.85;0.2;0.85" dur="2s" repeatCount="indefinite"/>
                    ` : ''}
                </circle>

                <!-- Anel Externo de Seleção / Foco -->
                <circle class="city-focus-ring" cx="${pt.x}" cy="${pt.y}" r="${isSel ? 12 : 9}" fill="none" 
                        stroke="${isSel ? '#ffffff' : 'rgba(56, 189, 248, 0.4)'}" stroke-width="${isSel ? 2.5 : 1}" opacity="${isSel ? 1 : 0}" style="pointer-events: none;"/>

                <!-- Bolinha Central da Cidade -->
                <circle class="city-marker-dot" cx="${pt.x}" cy="${pt.y}" r="${isSel ? 8 : 6}" fill="${color}" stroke="#070d18" stroke-width="2" pointer-events="all" style="cursor: pointer;"/>

                <!-- Pill com o Nome da Cidade -->
                <rect class="city-pill-rect" x="${pillX}" y="${pillY}" width="${textLen}" height="18" rx="4"
                      fill="${isSel ? '#1e293b' : 'rgba(7, 13, 24, 0.94)'}"
                      stroke="${isSel ? '#38bdf8' : (m.status_color === 'red' ? '#ef4444' : 'rgba(56, 189, 248, 0.45)')}"
                      stroke-width="${isSel ? 1.6 : 1}" pointer-events="all" style="cursor: pointer;" />

                <text class="city-pill-text" x="${labelX}" y="${labelY + 2}" text-anchor="${anchor}"
                      fill="${isSel ? '#ffffff' : (m.status_color === 'red' ? '#fca5a5' : '#e2e8f0')}"
                      font-family="Inter, -apple-system, sans-serif" font-size="${isSel ? '12px' : '11px'}" font-weight="${isSel ? '800' : '700'}" pointer-events="all" style="cursor: pointer; user-select: none;">
                    ${m.cidade}
                </text>
            </g>
        `;
    });

    svgHtml += `</g></svg>`;

    const tooltipHtml = `
        <div id="topologyCityTooltip" style="display: none; position: absolute; pointer-events: none; z-index: 100; min-width: 270px; max-width: 330px; background: rgba(15, 23, 42, 0.96); backdrop-filter: blur(12px); border: 1px solid rgba(56, 189, 248, 0.45); border-radius: 8px; box-shadow: 0 16px 36px rgba(0, 0, 0, 0.85); padding: 12px 14px; font-family: Inter, -apple-system, sans-serif; color: #e2e8f0;"></div>
    `;
    container.innerHTML = svgHtml + tooltipHtml;

    // Monitoramento global de saída do container para garantir limpeza 100% de efeitos de hover
    if (!container._leaveBound) {
        container._leaveBound = true;
        container.addEventListener("mouseleave", function() {
            document.querySelectorAll(".map-city-node.is-hovered").forEach(el => el.classList.remove("is-hovered"));
            const pinsLayer = document.getElementById("svgPinsLayer");
            if (pinsLayer) pinsLayer.classList.remove("has-hover");
            const tooltip = document.getElementById("topologyCityTooltip");
            if (tooltip) tooltip.style.display = "none";
            if (selectedMarket) updateMarketDetailPanel(selectedMarket);
        });
    }

    const svgEl = document.getElementById("topologySvgEl");
    if (svgEl) {
        svgEl.onwheel = function(e) {
            e.preventDefault();
            if (e.deltaY < 0) zoomTopologyMap("in");
            else zoomTopologyMap("out");
        };
    }
}

function handleCityHover(marketId, event) {
    if (!topologyMarketsData || topologyMarketsData.length === 0) return;
    const market = topologyMarketsData.find(m => m.id === marketId);
    if (!market) return;

    // 1. Limpeza defensiva prévia: remove .is-hovered de qualquer outra cidade antes de ativar a atual
    document.querySelectorAll(".map-city-node.is-hovered").forEach(el => {
        if (el.id !== `city-node-${marketId}`) {
            el.classList.remove("is-hovered");
        }
    });

    // 2. Efeito de Foco / Spotlight: esmaece todas as outras cidades
    const pinsLayer = document.getElementById("svgPinsLayer");
    if (pinsLayer) pinsLayer.classList.add("has-hover");

    const nodeEl = document.getElementById(`city-node-${marketId}`);
    if (nodeEl) {
        nodeEl.classList.add("is-hovered");
        // ATENÇÃO: NÃO USAR appendChild(nodeEl) aqui! Reparentar elemento sob o cursor no DOM
        // quebra o ciclo de eventos de clique e mouseleave do Chromium/WebKit.
    }

    // 2. Atualização imediata do painel lateral (preview em tempo real)
    updateMarketDetailPanel(market);

    // 3. Tooltip Flutuante Inteligente
    const tooltip = document.getElementById("topologyCityTooltip");
    if (tooltip) {
        const badgeBg = market.status_color === "red" ? "rgba(239, 68, 68, 0.2)" : 
                        (market.status_color === "yellow" ? "rgba(250, 204, 21, 0.2)" : "rgba(16, 185, 129, 0.2)");
        const badgeColor = market.status_color === "red" ? "#f87171" : 
                           (market.status_color === "yellow" ? "#facc15" : "#34d399");
        const badgeBorder = market.status_color === "red" ? "rgba(239, 68, 68, 0.4)" : 
                            (market.status_color === "yellow" ? "rgba(250, 204, 21, 0.4)" : "rgba(16, 185, 129, 0.4)");

        const outageText = (market.outage_channels > 0)
            ? `<span style="color: #f87171; font-weight: 700;"><i class="fas fa-exclamation-triangle"></i> ${market.outage_channels} falha(s)</span>`
            : `<span style="color: #34d399; font-weight: 600;"><i class="fas fa-check-circle"></i> 100% OK</span>`;

        let towersText = market.main_tower || "Torre Única";
        if (market.towers_detail && market.towers_detail.length > 1) {
            towersText = `${market.towers_detail.length} torres distintas`;
        }

        const distVal = market.distance_km ? Number(market.distance_km).toFixed(1) : "0.0";
        const azVal = market.azimuth_deg ? Number(market.azimuth_deg).toFixed(0) : "0";

        tooltip.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px; margin-bottom: 8px;">
                <div style="font-size: 13px; font-weight: 800; color: #ffffff; display: flex; align-items: center; gap: 6px;">
                    <i class="fas fa-city" style="color: #38bdf8;"></i>
                    ${escapeHtml(market.cidade)} <span style="font-size: 11px; color: #94a3b8; font-weight: 600;">(${escapeHtml(market.uf)})</span>
                </div>
                <span style="font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 4px; background: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeBorder}; text-transform: uppercase;">
                    ${escapeHtml(market.status_label || "Normal")}
                </span>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 11px; margin-bottom: 8px;">
                <div style="background: rgba(0,0,0,0.35); padding: 6px 8px; border-radius: 5px; border: 1px solid rgba(255,255,255,0.05);">
                    <div style="font-size: 9px; color: #94a3b8; text-transform: uppercase;">Canais Monitorados</div>
                    <div style="font-size: 12px; font-weight: 700; color: #fff;">${market.total_channels || 0} canais</div>
                </div>
                <div style="background: rgba(0,0,0,0.35); padding: 6px 8px; border-radius: 5px; border: 1px solid rgba(255,255,255,0.05);">
                    <div style="font-size: 9px; color: #94a3b8; text-transform: uppercase;">Saúde do Sinal</div>
                    <div style="font-size: 12px;">${outageText}</div>
                </div>
            </div>

            <div style="font-size: 11px; color: #cbd5e1; line-height: 1.5; margin-bottom: 8px; background: rgba(0,0,0,0.25); padding: 7px 9px; border-radius: 5px; border: 1px solid rgba(255,255,255,0.04);">
                <div><i class="fas fa-broadcast-tower" style="color: #38bdf8; width: 14px;"></i> <strong>Torre:</strong> ${escapeHtml(towersText)}</div>
                <div><i class="fas fa-ruler-horizontal" style="color: #38bdf8; width: 14px;"></i> <strong>Distância:</strong> ${distVal} km (${azVal}°)</div>
                <div><i class="fas fa-eye" style="color: #10b981; width: 14px;"></i> <strong>Visada:</strong> <span style="color: ${(market.los_status && market.los_status.includes('NLOS')) ? '#facc15' : '#10b981'}">${escapeHtml(market.los_status || 'Desobstruída (LOS)')}</span></div>
            </div>

            <div style="font-size: 9.5px; color: #38bdf8; font-weight: 600; text-align: center; border-top: 1px dashed rgba(56,189,248,0.25); padding-top: 6px;">
                <i class="fas fa-mouse-pointer"></i> Clique para abrir Radar & Perfil de Relevo RF
            </div>
        `;

        tooltip.style.display = "block";
        positionCityTooltip(event);
    }
}

function positionCityTooltip(event) {
    const tooltip = document.getElementById("topologyCityTooltip");
    if (!tooltip || tooltip.style.display === "none") return;
    const container = document.getElementById("topologyMapSvgContainer");
    if (!container) return;

    const rect = container.getBoundingClientRect();
    let x = (event.clientX - rect.left) + 16;
    let y = (event.clientY - rect.top) + 16;

    const ttW = tooltip.offsetWidth || 270;
    const ttH = tooltip.offsetHeight || 170;

    if (x + ttW > rect.width - 12) {
        x = (event.clientX - rect.left) - ttW - 16;
    }
    if (y + ttH > rect.height - 12) {
        y = (event.clientY - rect.top) - ttH - 16;
    }
    if (x < 10) x = 10;
    if (y < 10) y = 10;

    tooltip.style.left = `${Math.round(x)}px`;
    tooltip.style.top = `${Math.round(y)}px`;
}

function handleCityMouseMove(event) {
    positionCityTooltip(event);
}

function handleCityLeave(marketId, event) {
    const pinsLayer = document.getElementById("svgPinsLayer");
    if (pinsLayer) pinsLayer.classList.remove("has-hover");

    // Remove .is-hovered de todas as cidades defensivamente
    document.querySelectorAll(".map-city-node.is-hovered").forEach(el => {
        el.classList.remove("is-hovered");
    });

    const tooltip = document.getElementById("topologyCityTooltip");
    if (tooltip) tooltip.style.display = "none";

    // Restaura o painel lateral para a cidade selecionada anteriormente
    if (selectedMarket) {
        updateMarketDetailPanel(selectedMarket);
    }
}

function updateMarketDetailPanel(market) {
    if (!market) return;

    const nameEl = document.getElementById("mapDetailCityName");
    if (nameEl) nameEl.textContent = `${market.cidade} (${market.uf})`;
    
    const badge = document.getElementById("mapDetailStatusBadge");
    if (badge) {
        badge.className = market.status_color === "red" ? "badge badge-red" :
                          (market.status_color === "yellow" ? "badge badge-yellow" : "badge badge-green");
        badge.textContent = market.status_label || "Normal";
    }

    const coordsEl = document.getElementById("mapDetailCoords");
    if (coordsEl) {
        const latVal = typeof market.lat === "number" ? market.lat.toFixed(4) : market.lat;
        const lngVal = typeof market.lng === "number" ? market.lng.toFixed(4) : market.lng;
        const bairroInfo = market.site_bairro ? ` • ${market.site_bairro}` : "";
        coordsEl.textContent = `Lat: ${latVal} | Lng: ${lngVal}${bairroInfo}`;
    }
    
    const twNameEl = document.getElementById("mapDetailTowerName");
    if (twNameEl) {
        if (market.towers_detail && market.towers_detail.length > 1) {
            twNameEl.textContent = `${market.towers_detail.length} Torres Distintas (${market.towers_detail.map(t => t.bairro || t.name.split('-')[0].trim()).join(' / ')})`;
        } else {
            twNameEl.textContent = market.main_tower || "Torre de Transmissão";
        }
    }
    
    const distEl = document.getElementById("mapDetailDistance");
    if (distEl) {
        if (market.channels_rf_detail && market.channels_rf_detail.length > 1) {
            const dists = market.channels_rf_detail.map(c => `${c.emissora.split(' ')[0]}: ${c.distance_km}km`).join(" | ");
            distEl.textContent = dists;
        } else {
            const distKm = Number(market.distance_km) || 0;
            distEl.textContent = `${distKm.toFixed(2)} km (${market.distance_m ? market.distance_m.toLocaleString('pt-BR') : Math.round(distKm*1000)} m)`;
        }
    }
    
    const azEl = document.getElementById("mapDetailAzimuth");
    if (azEl) {
        if (market.channels_rf_detail && market.channels_rf_detail.length > 1) {
            azEl.textContent = market.channels_rf_detail.map(c => `${c.azimuth_deg}° (${c.cardinal || ''})`).join(" • ");
        } else {
            const azDeg = Number(market.azimuth_deg) || 0;
            azEl.textContent = `${azDeg.toFixed(1)}°`;
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
    if (totChEl) totChEl.textContent = market.total_channels || 0;
    
    const outChEl = document.getElementById("mapDetailOutageChannels");
    if (outChEl) outChEl.textContent = market.outage_channels || 0;

    const csButtonsContainer = document.getElementById("mapDetailCsButtonsContainer");
    if (csButtonsContainer) {
        const csList = market.available_cs_info || [];
        if (csList.length > 0) {
            let pillsHtml = `
                <div style="font-size: 10px; color: var(--text-muted); width: 100%; margin-bottom: 2px;">
                    <i class="fas fa-server" style="color: #38bdf8;"></i> Capture Sites Disponíveis (${csList.length}):
                </div>
                <button type="button" class="btn-secondary" style="flex: 1; font-size: 10px; padding: 4px 6px; font-weight: 700; background: rgba(56, 189, 248, 0.12); border-color: rgba(56, 189, 248, 0.4); color: #38bdf8;" onclick="openMarketRfModal('${market.id}', 'all')">
                    🌐 Todas
                </button>
            `;
            csList.forEach(cs => {
                const isCs1 = (cs.cs === 1);
                pillsHtml += `
                    <button type="button" class="btn-secondary" style="flex: 1; font-size: 10px; padding: 4px 6px; font-weight: 700; background: ${isCs1 ? 'rgba(56, 189, 248, 0.08)' : 'rgba(168, 85, 247, 0.12)'}; border-color: ${isCs1 ? 'rgba(56, 189, 248, 0.3)' : 'rgba(168, 85, 247, 0.35)'}; color: ${isCs1 ? '#38bdf8' : '#c084fc'};" onclick="openMarketRfModal('${market.id}', ${cs.cs})" title="${cs.hostname || ''} (${cs.channels_count} canais • ${cs.services_count} svcs)">
                        🖥️ ${escapeHtml(cs.label || cs.cs_label)} (${cs.channels_count} ch)
                    </button>
                `;
            });
            csButtonsContainer.innerHTML = pillsHtml;
        } else {
            csButtonsContainer.innerHTML = "";
        }
    }
}

function handleCityClick(marketId, event) {
    if (event) {
        event.stopPropagation();
    }
    selectMarket(marketId, true);
}
window.handleCityClick = handleCityClick;

function selectMarket(marketId, openModal = false) {
    if (!topologyMarketsData || topologyMarketsData.length === 0) return;
    let market = null;
    if (marketId) {
        const idLower = String(marketId).toLowerCase().trim();
        market = topologyMarketsData.find(m => 
            m.id.toLowerCase() === idLower ||
            m.cidade.toLowerCase() === idLower ||
            idLower.includes(m.id.toLowerCase()) ||
            m.id.toLowerCase().includes(idLower) ||
            idLower.includes(m.cidade.toLowerCase())
        );
    }
    if (!market) market = topologyMarketsData[0];
    if (!market) return;

    selectedMarket = market;
    window.selectedMarket = market;

    // Atualiza a seleção visual das cidades no mapa
    document.querySelectorAll(".map-city-node").forEach(el => {
        if (el.getAttribute("data-market-id") === market.id) {
            el.classList.add("is-selected");
        } else {
            el.classList.remove("is-selected");
        }
    });

    updateMarketDetailPanel(market);

    if (openModal) {
        openMarketRfModal(market.id);
    }
}
window.handleCityHover = handleCityHover;
window.handleCityMouseMove = handleCityMouseMove;
window.handleCityLeave = handleCityLeave;
window.positionCityTooltip = positionCityTooltip;
window.updateMarketDetailPanel = updateMarketDetailPanel;
window.selectMarket = selectMarket;

function escapeHtml(text) {
    if (text === null || text === undefined) return "";
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ==============================================================================
// INTERAÇÃO DE FOCO POR CANAL OU VISÃO AMPLA (TODOS OS CANAIS)
// ==============================================================================

function renderRfModalCsSelector(market) {
    const container = document.getElementById("rfModalCsSelectorContainer");
    const summary = document.getElementById("rfModalActiveCsSummary");
    if (!container) return;

    const csList = market.available_cs_info || [];
    const allChannels = market.channels_rf_detail || [];

    if (csList.length === 0) {
        container.innerHTML = `<span class="badge badge-blue" style="font-size: 10px;">CS01 (Principal)</span>`;
        if (summary) summary.innerHTML = `<span>Host: ${market.site_bairro || 'Local'} • ${allChannels.length} canais DTV</span>`;
        return;
    }

    let pillsHtml = `
        <button type="button" class="${currentRfModalCs === 'all' ? 'btn-primary' : 'btn-secondary'}" 
                style="padding: 3px 10px; font-size: 11px; font-weight: 700; border-radius: 4px; ${currentRfModalCs === 'all' ? 'background: #0284c7;' : ''}" 
                onclick="switchRfModalCs('all')">
            🌐 Todas as CSs (${allChannels.length})
        </button>
    `;

    csList.forEach(cs => {
        const isActive = String(currentRfModalCs) === String(cs.cs);
        const bgStyle = isActive ? 'background: #0284c7; border-color: #38bdf8;' : (cs.cs === 1 ? 'border-color: rgba(56,189,248,0.4);' : 'border-color: rgba(168,85,247,0.4);');
        pillsHtml += `
            <button type="button" class="${isActive ? 'btn-primary' : 'btn-secondary'}" 
                    style="padding: 3px 10px; font-size: 11px; font-weight: 700; border-radius: 4px; ${bgStyle}" 
                    onclick="switchRfModalCs(${cs.cs})"
                    title="Host: ${cs.hostname || ''} | ${cs.channels_count} canais DTV | ${cs.services_count} microsserviços">
                🖥️ ${escapeHtml(cs.label || cs.cs_label)} (${cs.channels_count} canais)
            </button>
        `;
    });

    container.innerHTML = pillsHtml;

    if (summary) {
        if (currentRfModalCs === 'all') {
            summary.innerHTML = `<span>🌐 <strong>Visão Multi-CS:</strong> ${csList.length} Capture Sites • ${allChannels.length} canais consolidados</span>`;
        } else {
            const activeCs = csList.find(c => String(c.cs) === String(currentRfModalCs));
            if (activeCs) {
                summary.innerHTML = `<span>🖥️ <strong>${escapeHtml(activeCs.label)}:</strong> Host <code style="color: #38bdf8; font-weight: 700;">${escapeHtml(activeCs.hostname)}</code> • ${activeCs.channels_count} canais TBS • ${activeCs.services_count} serviços</span>`;
            } else {
                summary.innerHTML = `<span>CS0${currentRfModalCs}</span>`;
            }
        }
    }
}
window.renderRfModalCsSelector = renderRfModalCsSelector;

function switchRfModalCs(csNum) {
    currentRfModalCs = (csNum !== undefined && csNum !== null) ? csNum : "all";
    window.currentRfModalCs = currentRfModalCs;
    selectedRfChannelIndex = null; // reseta foco individual de canal ao trocar de CS

    const market = selectedMarket || window.selectedMarket;
    if (!market) return;

    const titleEl = document.getElementById("rfModalTitle");
    if (titleEl) {
        if (currentRfModalCs === "all") {
            titleEl.innerText = `Perfil Geográfico & Topografia RF • ${market.cidade} (${market.uf})`;
        } else {
            const csList = market.available_cs_info || [];
            const activeCs = csList.find(c => String(c.cs) === String(currentRfModalCs));
            const csText = activeCs ? activeCs.label : `CS0${currentRfModalCs}`;
            titleEl.innerText = `Perfil Geográfico & Topografia RF • ${market.cidade} (${market.uf}) — ${csText}`;
        }
    }

    renderRfModalCsSelector(market);
    renderRfModalChannelsTable(market);
    renderMarketRadarCanvas(market, null);
    renderTerrainCanvas(market, null, null);
    updateRfModalEngineeringNotes(market, null);
}
window.switchRfModalCs = switchRfModalCs;

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
    const allChannels = market.channels_rf_detail || [];
    
    // Filtragem por CS selecionada
    let channels = allChannels;
    if (currentRfModalCs !== "all") {
        channels = allChannels.filter(c => Number(c.cs) === Number(currentRfModalCs));
    }

    if (countBadge) {
        const isWide = (selectedRfChannelIndex === null);
        const csLabel = (currentRfModalCs === "all") ? "Todas as CSs" : `CS0${currentRfModalCs}`;
        const modeLabel = isWide
            ? `🌐 Visão Ampla ${csLabel} (${channels.length} Canais)`
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
        const csList = market.available_cs_info || [];
        const activeCs = csList.find(c => String(c.cs) === String(currentRfModalCs));
        const csName = activeCs ? activeCs.label : `CS0${currentRfModalCs}`;
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 18px;">
            <i class="fas fa-info-circle" style="color: #38bdf8;"></i> Nenhum canal sintonizado no sintonizador TBS de <strong>${escapeHtml(csName)}</strong>.
            <div style="margin-top: 6px;"><button type="button" class="btn-secondary" style="font-size: 10px; padding: 3px 8px;" onclick="switchRfModalCs('all')">Ver Todos os Canais da Praça</button></div>
        </td></tr>`;
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
        const csNum = c.cs || 1;
        const csBadgeClass = csNum === 1 ? 'badge badge-blue' : 'badge badge-purple';
        const csLabelText = c.cs_label || (csNum === 1 ? 'CS01 (Principal)' : (csNum === 2 ? 'CS02 (BKP)' : `CS0${csNum}`));
        const hostText = c.hostname || 'Local';

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
                <span class="${csBadgeClass}" style="font-size: 9px; font-weight: 700; padding: 2px 6px;">${escapeHtml(csLabelText)}</span>
                <div style="font-size: 9px; color: #94a3b8; font-family: monospace; margin-top: 2px;" title="${escapeHtml(hostText)}">
                    <i class="fas fa-desktop" style="font-size: 8px;"></i> ${escapeHtml(hostText)}
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
                ${(c.rx_level_measured_pct === 0 && (c.rx_quality_pct === 0 || !c.rx_quality_pct)) ? `
                    <strong style="color: #ef4444; font-size: 11px;">0% (Sem Sinal)</strong>
                    <div style="font-size: 9px; color: #ef4444; font-weight: 700;">Perda de Lock</div>
                ` : `
                    <strong style="color: ${signalColor}; font-size: 11px;">${c.rx_level_measured_pct}%</strong>
                    <div style="font-size: 9px; color: var(--text-muted);">Q: ${c.rx_quality_pct != null ? c.rx_quality_pct : (c.signal_quality_pct || c.rx_level_measured_pct)}%</div>
                `}
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
async function openMarketRfModal(marketId, targetCs = "all") {
    currentRfModalCs = (targetCs !== undefined && targetCs !== null) ? targetCs : "all";
    window.currentRfModalCs = currentRfModalCs;
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
    if (titleEl) {
        if (currentRfModalCs === "all") {
            titleEl.innerText = `Perfil Geográfico & Topografia RF • ${market.cidade} (${market.uf})`;
        } else {
            const csList = market.available_cs_info || [];
            const activeCs = csList.find(c => String(c.cs) === String(currentRfModalCs));
            const csText = activeCs ? activeCs.label : `CS0${currentRfModalCs}`;
            titleEl.innerText = `Perfil Geográfico & Topografia RF • ${market.cidade} (${market.uf}) — ${csText}`;
        }
    }
    renderRfModalCsSelector(market);
    
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

    // Exibe o modal imediatamente para o usuário
    modal.style.display = "flex";

    try {
        // Renderiza Gráficos e Notas
        switchRfModalView('radar');
        renderMarketRadarCanvas(market, selectedRfChannelIndex);
        renderTerrainCanvas(market, null, selectedRfChannelIndex);
        updateRfModalEngineeringNotes(market, selectedRfChannelIndex);
    } catch (renderErr) {
        console.error("Erro ao renderizar dados topográficos do modal RF:", renderErr);
    }
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
    ctx.fillRect(cx - 98, cy + 13, 196, 28);
    ctx.strokeStyle = "rgba(56, 189, 248, 0.75)";
    ctx.lineWidth = 1.3;
    ctx.strokeRect(cx - 98, cy + 13, 196, 28);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 9.5px Inter, sans-serif";
    ctx.textAlign = "center";

    let csHeaderTitle = `🔵 CS • ${market.cidade.toUpperCase()}`;
    if (currentRfModalCs !== "all") {
        const csList = market.available_cs_info || [];
        const activeCsObj = csList.find(x => String(x.cs) === String(currentRfModalCs));
        csHeaderTitle = `🔵 ${activeCsObj ? activeCsObj.cs_label : ('CS0' + currentRfModalCs)} • ${market.cidade.toUpperCase()}`;
    }
    ctx.fillText(csHeaderTitle, cx, cy + 24);

    ctx.fillStyle = "#38bdf8";
    ctx.font = "8.5px monospace";
    let csSubTitle = `${market.site_bairro || 'Centro'} (${market.site_elevation_m || 36}m+${mastH}m)`;
    if (currentRfModalCs !== "all") {
        const csList = market.available_cs_info || [];
        const activeCsObj = csList.find(x => String(x.cs) === String(currentRfModalCs));
        if (activeCsObj && activeCsObj.hostname) {
            csSubTitle = `${activeCsObj.hostname} (${market.site_elevation_m || 36}m+${mastH}m)`;
        }
    }
    ctx.fillText(csSubTitle, cx, cy + 36);
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


// ==============================================================================
// MOTOR DE IA: OTIMIZAÇÃO DE APONTAMENTO & TRADE-OFF MULTI-TORRE
// ==============================================================================

async function openTopologyAiTradeoffModal() {
    const modal = document.getElementById("topologyAiTradeoffModal");
    const body = document.getElementById("topoAiTradeoffModalBody");
    const title = document.getElementById("topoAiTradeoffModalTitle");
    if (!modal || !body) return;

    modal.style.display = "flex";
    const currentMarket = (typeof currentRfModalMarket !== "undefined" && currentRfModalMarket) ? currentRfModalMarket : null;
    let cidade = currentMarket ? currentMarket.cidade : "";
    if (!cidade) {
        const rawTitle = document.getElementById("rfModalTitle")?.textContent || "";
        cidade = rawTitle.replace(/Perfil Geogr[áa]fico & Topografia RF\s*[\•\—\-]\s*/gi, "").split(/[\•\—\-]/)[0].trim();
    }
    cidade = cidade.replace(/\(.*?\)/g, "").trim() || "Praça Atual";
    if (title) title.innerHTML = `🧠 Otimização de Apontamento & Trade-Off Multi-Torre • <span style="color: #38bdf8;">${escapeHtml(cidade)}</span>`;

    body.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; color: #c084fc;">
            <i class="fas fa-brain fa-spin fa-3x" style="color: #a855f7; margin-bottom: 16px;"></i>
            <h4 style="color: #fff; margin: 0 0 8px 0; font-size: 17px; font-weight: 800;">IA Gemini Analisando Geometria de Enlaces & Lóbulos RF...</h4>
            <p style="color: #94a3b8; font-size: 12px; max-width: 580px; margin: 0 auto; line-height: 1.5;">
                Avaliando a dispersão angular das torres transmissoras, cálculo de atenuação por razão frente-costas (Front-to-Back Ratio) e simulando soluções de hardware (Antenas Bidirecionais, Dual-Antenna e Combinadores Seletivos).
            </p>
        </div>
    `;

    try {
        const token = (typeof getAuthToken === "function") ? getAuthToken() : (localStorage.getItem("fleet_token") || localStorage.getItem("token") || "");
        const resp = await fetch("/api/topology/ai-aiming-tradeoff", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(token ? { "Authorization": `Bearer ${token}` } : {})
            },
            body: JSON.stringify({
                cidade: cidade,
                current_mast_m: (typeof currentSimulatedMastM !== "undefined" && currentSimulatedMastM) ? currentSimulatedMastM : 25.0
            })
        });

        if (!resp.ok) throw new Error("HTTP " + resp.status);
        const data = await resp.json();
        if (data.status === "error") {
            throw new Error(data.message || "Não foi possível gerar a análise técnica de RF para esta praça.");
        }
        renderTopologyAiTradeoffResult(data);
    } catch (err) {
        body.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #ef4444;">
                <i class="fas fa-exclamation-triangle fa-3x" style="margin-bottom: 12px;"></i>
                <h4 style="color: #fff; margin: 0 0 8px 0;">Erro ao gerar laudo com IA</h4>
                <p style="color: #94a3b8; font-size: 12px;">${escapeHtml(err.message)}</p>
                <button class="btn-secondary" onclick="openTopologyAiTradeoffModal()" style="margin-top: 14px; padding: 6px 14px;">Tentar Novamente</button>
            </div>
        `;
    }
}
window.openTopologyAiTradeoffModal = openTopologyAiTradeoffModal;

window.closeTopologyAiTradeoffModal = function() {
    const modal = document.getElementById("topologyAiTradeoffModal");
    if (modal) modal.style.display = "none";
};

function renderTopologyAiTradeoffResult(data) {
    const body = document.getElementById("topoAiTradeoffModalBody");
    if (!body) return;

    const hasConflict = data.has_aiming_conflict;
    const spread = data.angular_spread_deg || 0;
    const clusters = data.clusters || [];

    const conflictColor = hasConflict ? "#ef4444" : "#10b981";
    const conflictBadge = hasConflict 
        ? `<span class="badge badge-red" style="font-size: 11px; padding: 3px 8px;"><i class="fas fa-exclamation-triangle"></i> Conflito Crítico Multi-Torre (${spread}° de Dispersão)</span>`
        : `<span class="badge badge-green" style="font-size: 11px; padding: 3px 8px;"><i class="fas fa-check-circle"></i> Geometria Concentrada (${spread}° de Dispersão)</span>`;

    function renderAiMarkdownWithTables(rawMd) {
        if (!rawMd) return "";
        const lines = rawMd.split("\n");
        let htmlOut = [];
        let inTable = false;
        let tableRows = [];

        function flushTable() {
            if (!tableRows.length) return;
            let tHtml = `<div style="overflow-x: auto; margin: 14px 0;"><table style="width: 100%; border-collapse: collapse; font-size: 11px; font-family: monospace; background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(255,255,255,0.12); border-radius: 6px;">`;
            tableRows.forEach((row, rIdx) => {
                const cols = row.split("|").slice(1, -1).map(c => c.trim());
                if (rIdx === 0) {
                    tHtml += `<tr style="background: rgba(30, 41, 59, 0.95); border-bottom: 2px solid rgba(56, 189, 248, 0.4);">` +
                        cols.map(c => `<th style="padding: 8px 10px; color: #38bdf8; text-align: left; font-weight: 700;">${escapeHtml(c)}</th>`).join("") +
                        `</tr>`;
                } else if (rIdx === 1 && cols[0].includes("---")) {
                    // separator line
                } else {
                    const bg = (rIdx % 2 === 0) ? "rgba(255,255,255,0.02)" : "transparent";
                    tHtml += `<tr style="background: ${bg}; border-bottom: 1px solid rgba(255,255,255,0.06);">` +
                        cols.map(c => `<td style="padding: 6px 10px; color: #e2e8f0;">${escapeHtml(c)}</td>`).join("") +
                        `</tr>`;
                }
            });
            tHtml += `</table></div>`;
            htmlOut.push(tHtml);
            tableRows = [];
            inTable = false;
        }

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
                inTable = true;
                tableRows.push(line.trim());
            } else {
                if (inTable) flushTable();
                if (line.startsWith("### ")) {
                    htmlOut.push(`<h4 style="color: #38bdf8; font-size: 14px; font-weight: 800; margin: 20px 0 8px 0; border-bottom: 1px solid rgba(56, 189, 248, 0.25); padding-bottom: 5px;">${escapeHtml(line.slice(4))}</h4>`);
                } else if (line.startsWith("#### ")) {
                    htmlOut.push(`<h5 style="color: #c084fc; font-size: 13px; font-weight: 700; margin: 16px 0 6px 0;">${escapeHtml(line.slice(5))}</h5>`);
                } else if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
                    const itemTxt = line.trim().slice(2);
                    const formatted = escapeHtml(itemTxt)
                        .replace(/\*\*(.*?)\*\*/g, '<strong style="color: #fff;">$1</strong>')
                        .replace(/\*(.*?)\*/g, '<em style="color: #cbd5e1;">$1</em>');
                    htmlOut.push(`<div style="margin-left: 12px; margin-bottom: 5px; font-size: 12px; color: #cbd5e1; display: flex; align-items: flex-start; gap: 6px;"><span style="color: #38bdf8;">•</span><span>${formatted}</span></div>`);
                } else if (line.trim() === "---") {
                    htmlOut.push(`<hr style="border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 16px 0;">`);
                } else if (line.trim()) {
                    const formatted = escapeHtml(line)
                        .replace(/\*\*(.*?)\*\*/g, '<strong style="color: #fff;">$1</strong>')
                        .replace(/\*(.*?)\*/g, '<em style="color: #cbd5e1;">$1</em>');
                    htmlOut.push(`<p style="margin: 0 0 8px 0; font-size: 12.5px; line-height: 1.6; color: #cbd5e1;">${formatted}</p>`);
                }
            }
        }
        if (inTable) flushTable();
        return htmlOut.join("");
    }

    let reportHtml = renderAiMarkdownWithTables(data.ai_report_markdown || "");

    body.innerHTML = `
        <!-- Faixa de Resumo e Dispersão Angular -->
        <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid ${conflictColor}; border-left: 5px solid ${conflictColor}; border-radius: 8px; padding: 14px 18px; margin-bottom: 18px;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 8px;">
                <div style="font-size: 14px; font-weight: 800; color: #fff; display: flex; align-items: center; gap: 8px;">
                    <span>📐 Geometria de Apontamento &amp; Cobertura</span>
                    ${conflictBadge}
                </div>
                <div style="font-size: 12px; color: #94a3b8; font-family: monospace;">
                    Mastro: <strong style="color: #38bdf8;">${data.current_mast_m || 25}m</strong> | Canais: <strong style="color: #fff;">${data.total_channels || (data.clusters ? data.clusters.reduce((acc, c) => acc + (c.count || 0), 0) : 0)}</strong>
                </div>
            </div>
            <div style="font-size: 12px; color: #cbd5e1; line-height: 1.4;">
                ${escapeHtml(data.actionable_summary || "")}
            </div>
        </div>

        <!-- Clusters de Torres Identificados -->
        <div style="margin-bottom: 18px;">
            <h4 style="font-size: 13px; font-weight: 800; color: #fff; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 10px 0; display: flex; align-items: center; gap: 6px;">
                <i class="fas fa-project-diagram" style="color: #a855f7;"></i> Centros de Irradiação (Clusters de Azimute)
            </h4>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px;">
                ${clusters.map((cl, i) => {
                    const clColor = i === 0 ? "#38bdf8" : (i === 1 ? "#f59e0b" : "#ec4899");
                    return `
                    <div style="background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(255,255,255,0.08); border-top: 3px solid ${clColor}; border-radius: 8px; padding: 12px 14px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                            <strong style="color: ${clColor}; font-size: 13px;">${escapeHtml(cl.id)} • ${escapeHtml(cl.cardinal || 'Direção')}</strong>
                            <span class="badge" style="background: rgba(255,255,255,0.08); font-family: monospace; font-size: 11px; font-weight: 700; color: #fff;">Az ${cl.avg_azimuth}°</span>
                        </div>
                        <div style="font-size: 11px; color: #94a3b8; margin-bottom: 6px;">
                            Distância Média: <strong style="color: #e2e8f0;">${cl.avg_dist_km} km</strong> | Nível TBS Médio: <strong style="color: ${cl.avg_level_pct >= 50 ? '#10b981' : '#ef4444'};">${cl.avg_level_pct}%</strong>
                        </div>
                        <div style="font-size: 11px; color: #cbd5e1; font-weight: 600;">
                            Canais no Cluster: <span style="color: #fff;">${cl.channel_names.map(name => escapeHtml(name)).join(", ")}</span>
                        </div>
                    </div>
                    `;
                }).join("")}
            </div>
        </div>

        <!-- Parecer Completo da IA Gemini Pro -->
        <div style="background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(168, 85, 247, 0.35); border-radius: 10px; padding: 20px; box-shadow: inset 0 2px 8px rgba(0,0,0,0.4);">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                <i class="fas fa-certificate" style="color: #facc15; font-size: 16px;"></i>
                <h4 style="margin: 0; font-size: 14px; font-weight: 800; color: #fff;">Laudo Técnico de Engenharia de RF e Playbook de Campo</h4>
            </div>
            <div style="font-size: 12.5px; line-height: 1.6; color: #e2e8f0;">
                ${reportHtml}
            </div>
        </div>
    `;
}
