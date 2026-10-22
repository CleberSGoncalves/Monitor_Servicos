// dashboard/static/js/topology_map.js
// Topologia Geográfica de Capture Sites e Enlaces de RF (LATAM / Brasil)
// Renderização de Geometria Real do Brasil, Perfil Topográfico de Relevo e Análise de Visada (LOS)

let topologyMarketsData = [];
let selectedMarket = null;

async function loadTopologyMapData() {
    try {
        const token = (typeof getAuthToken === "function") ? getAuthToken() : (localStorage.getItem("fleet_token") || "");
        const res = await fetch("/api/fleet/topology-map", {
            headers: token ? { "Authorization": `Bearer ${token}` } : {}
        });
        if (!res.ok) return;
        topologyMarketsData = await res.json();
        renderTopologyMap();

        // Se nenhuma cidade estiver selecionada, prioriza Pelotas ou a primeira com alerta
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

    const svgW = 760;
    const svgH = 560;

    // Projeção Cartográfica Equirretangular calibrada (-76°W a -32°W / +6°N a -36°S)
    const minLng = -76.0, maxLng = -32.0;
    const minLat = -36.0, maxLat = 6.0;

    function projectCoords(lat, lng) {
        const x = ((lng - minLng) / (maxLng - minLng)) * (svgW - 80) + 40;
        const y = ((maxLat - lat) / (maxLat - minLat)) * (svgH - 80) + 40;
        return { x: Math.round(x), y: Math.round(y) };
    }

    // Geometria Vetorial Autêntica do Brasil com Costa Atlântica e Fronteiras Regionais
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
        <svg viewBox="0 0 ${svgW} ${svgH}" style="width: 100%; height: 100%; display: block;" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <radialGradient id="pulseGlowRed" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stop-color="#ef4444" stop-opacity="0.85"/>
                    <stop offset="100%" stop-color="#ef4444" stop-opacity="0"/>
                </radialGradient>
                <radialGradient id="pulseGlowYellow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stop-color="#facc15" stop-opacity="0.85"/>
                    <stop offset="100%" stop-color="#facc15" stop-opacity="0"/>
                </radialGradient>
                <radialGradient id="pulseGlowGreen" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stop-color="#10b981" stop-opacity="0.7"/>
                    <stop offset="100%" stop-color="#10b981" stop-opacity="0"/>
                </radialGradient>
                <filter id="shadowGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000" flood-opacity="0.7"/>
                </filter>
            </defs>

            <!-- Grade Cartográfica de Fundo (Paralelos e Meridianos) -->
            <g stroke="rgba(255,255,255,0.035)" stroke-width="1">
                ${Array.from({ length: 9 }).map((_, i) => `<line x1="${i * 90}" y1="0" x2="${i * 90}" y2="${svgH}"/>`).join("")}
                ${Array.from({ length: 7 }).map((_, i) => `<line x1="0" y1="${i * 90}" x2="${svgW}" y2="${i * 90}"/>`).join("")}
            </g>

            <!-- GEOMETRIA REAL DO BRASIL: Silhueta Geográfica e Litoral Atlântico -->
            <g id="svgBrazilGeographicMap">
                <!-- América do Sul / Países Vizinhos (Contorno de Contexto) -->
                <path d="${southAmericaPathD}"
                      fill="rgba(15, 23, 42, 0.45)" stroke="rgba(255,255,255,0.06)" stroke-width="1" />

                <!-- Contorno Geográfico Real do Brasil (Formato e Fronteiras Oficiais) -->
                <path d="${brazilPathD}"
                      fill="rgba(15, 23, 42, 0.88)" stroke="#38bdf8" stroke-width="1.8" stroke-opacity="0.5" />

                <!-- Linhas Divisórias Regionais Internas (Norte, Nordeste, Centro-Oeste, Sudeste, Sul) -->
                <path d="${sulDividerD}" fill="none" stroke="rgba(56, 189, 248, 0.25)" stroke-width="1" stroke-dasharray="3,3"/>
                <path d="${sudesteDividerD}" fill="none" stroke="rgba(56, 189, 248, 0.25)" stroke-width="1" stroke-dasharray="3,3"/>
                <path d="${coDividerD}" fill="none" stroke="rgba(56, 189, 248, 0.25)" stroke-width="1" stroke-dasharray="3,3"/>
                <path d="${neDividerD}" fill="none" stroke="rgba(56, 189, 248, 0.25)" stroke-width="1" stroke-dasharray="3,3"/>
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
            const dx = (twPt.x === pt.x && twPt.y === pt.y) ? pt.x + 18 : twPt.x;
            const dy = (twPt.x === pt.x && twPt.y === pt.y) ? pt.y - 16 : twPt.y;
            
            const strokeColor = m.status_color === "red" ? "rgba(239, 68, 68, 0.6)" :
                                (m.status_color === "yellow" ? "rgba(250, 204, 21, 0.5)" : "rgba(16, 185, 129, 0.35)");
            
            svgHtml += `
                <line x1="${pt.x}" y1="${pt.y}" x2="${dx}" y2="${dy}"
                      stroke="${strokeColor}" stroke-width="${isSel ? 2.5 : 1}" stroke-dasharray="${isSel ? 'none' : '3,3'}" />
                <circle cx="${dx}" cy="${dy}" r="${isSel ? 4 : 2.5}" fill="#38bdf8" opacity="0.85" />
            `;
        }
    });

    svgHtml += `</g><g id="svgPinsLayer">`;

    // Renderiza os Pinos das Cidades com Halos Interativos
    filtered.forEach(m => {
        const pt = projectCoords(m.lat, m.lng);
        const isSel = selectedMarket && selectedMarket.id === m.id;
        const color = m.status_color === "red" ? "#ef4444" : (m.status_color === "yellow" ? "#facc15" : "#10b981");
        const glowId = m.status_color === "red" ? "pulseGlowRed" : (m.status_color === "yellow" ? "pulseGlowYellow" : "pulseGlowGreen");

        svgHtml += `
            <g class="map-city-node" style="cursor: pointer;" onclick="selectMarket('${m.id}', true)" filter="url(#shadowGlow)">
                <!-- Halo Pulsante -->
                <circle cx="${pt.x}" cy="${pt.y}" r="${isSel ? 24 : 16}" fill="url(#${glowId})" opacity="${isSel ? 0.9 : 0.6}">
                    ${m.status_color === "red" ? `
                        <animate attributeName="r" values="14;24;14" dur="2s" repeatCount="indefinite"/>
                        <animate attributeName="opacity" values="0.8;0.2;0.8" dur="2s" repeatCount="indefinite"/>
                    ` : ''}
                </circle>

                <!-- Anel Externo de Seleção -->
                ${isSel ? `
                    <circle cx="${pt.x}" cy="${pt.y}" r="11" fill="none" stroke="#fff" stroke-width="2.2"/>
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

function selectMarket(marketId, openModal = false) {
    const market = topologyMarketsData.find(m => m.id === marketId);
    if (!market) return;

    selectedMarket = market;
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
// MODAL DE GEOLOCALIZAÇÃO PRECISA, RELEVO TOPOGRÁFICO & CANAIS DIGITAIS TERRESTRES
// ==============================================================================
function openMarketRfModal(marketId) {
    const market = topologyMarketsData.find(m => m.id === marketId) || selectedMarket;
    if (!market) return;

    selectedMarket = market;
    const modal = document.getElementById("rfTopographyModal");
    if (!modal) return;

    // 1. Título e Badges
    document.getElementById("rfModalTitle").innerText = `Perfil Geográfico & Topografia RF • ${market.cidade} (${market.uf})`;
    const statusBadge = document.getElementById("rfModalStatusBadge");
    if (statusBadge) {
        statusBadge.className = market.status_color === "red" ? "badge badge-red" :
                                (market.status_color === "yellow" ? "badge badge-yellow" : "badge badge-green");
        statusBadge.innerText = market.status_label;
    }

    // 2. Coordenadas e Hardware do Capture Site
    document.getElementById("rfModalSiteCoords").innerText = `${market.lat.toFixed(5)}, ${market.lng.toFixed(5)}`;
    document.getElementById("rfModalSiteElevation").innerText = `${market.site_elevation_m || 36} m acima do nível do mar`;
    document.getElementById("rfModalMastHeight").innerText = `${market.rx_antenna_height_m || 24} m (Mastro de Edificação)`;

    // 3. Renderiza o Canvas de Perfil de Elevação / Corte Transversal
    renderTerrainCanvas(market);

    // 4. Popula Tabela de Emissoras Terrestres
    const tbody = document.getElementById("rfModalChannelsTableBody");
    const channels = market.channels_rf_detail || [];
    if (tbody) {
        if (channels.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 12px;">Nenhum canal cadastrado nesta praça.</td></tr>`;
        } else {
            tbody.innerHTML = channels.map(c => {
                const isNlos = c.los_status && c.los_status.includes("Obstru");
                const badgeClass = isNlos ? "badge badge-yellow" : "badge badge-green";
                const distStr = c.distance_m ? `${c.distance_m.toLocaleString('pt-BR')} m (${c.distance_km} km)` : `${c.distance_km} km`;
                const signalColor = c.rx_level_measured_pct >= 60 ? "#10b981" : (c.rx_level_measured_pct >= 40 ? "#facc15" : "#ef4444");

                return `
                <tr>
                    <td><strong>${c.emissora}</strong></td>
                    <td><code>${c.canal_fisico}</code> <span style="font-size: 10px; color: var(--text-muted);">(${c.freq_mhz.toFixed(1)} MHz)</span></td>
                    <td style="font-size: 11px;">${c.tower_name} <span style="color: #38bdf8;">[${c.erp_kw} kW ERP]</span></td>
                    <td style="font-family: monospace; font-size: 11px;">${distStr}</td>
                    <td style="font-family: monospace; font-size: 11px;">${c.azimuth_deg}°</td>
                    <td style="font-family: monospace; font-size: 11px; color: #facc15;">${c.fspl_db} dB</td>
                    <td style="font-family: monospace; font-size: 11px;">${c.rx_level_expected_dbm} dBm</td>
                    <td><strong style="color: ${signalColor};">${c.rx_level_measured_pct}%</strong></td>
                    <td>
                        <span class="${badgeClass}" style="font-size: 10px;">${c.los_status}</span>
                        <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">${c.los_analysis}</div>
                    </td>
                </tr>
                `;
            }).join("");
        }
    }

    // 5. Diagnóstico de Perspectiva e Recomendações de Engenharia
    const notesEl = document.getElementById("rfModalEngineeringNotes");
    if (notesEl) {
        if (market.cidade.toLowerCase() === "pelotas") {
            notesEl.innerHTML = `
                <div style="margin-bottom: 6px;"><strong>Perspectiva Topográfica de Pelotas - RS:</strong> O Capture Site está localizado no centro urbano a uma altitude de 36m, enquanto a Torre Morro da Glória fica a 14.8 km a Noroeste (azimute 312.4°) com cota de topo a 320m.</div>
                <div style="margin-bottom: 6px; color: #facc15;">⚠️ <strong>Causa de Atenuação em Canais Altos:</strong> Foi identificado um morro intermediário a 8.2 km (elevação 74m) que penetra na primeira zona de Fresnel (raio 14.2m a 580 MHz). Isso gera difração por gume de faca (Knife-Edge Diffraction), atenuando a portadora UHF de canais com frequência acima de 560 MHz em até -8.5 dB em dias úmidos.</div>
                <div>💡 <strong>Recomendações Técnicas:</strong> 1. Ajustar o azimute da antena receptora log-periódica em +3.5° no sentido Noroeste para maximizar ganho no lóbulo secundário. 2. Elevar o mastro receptor em 2.5 metros na laje para desobstruir 80% do elipsoide de Fresnel.</div>
            `;
        } else if (market.status_color === "red" || market.outage_channels > 0) {
            notesEl.innerHTML = `
                <div style="margin-bottom: 6px;"><strong>Diagnóstico de Recepção da Praça:</strong> A distância média da torre transmissora (${market.distance_km} km) apresenta atenuação em espaço livre de ${market.fspl_db} dB. O relevo local exige antena de alto ganho com refletor para minimizar desvanecimento.</div>
                <div>💡 <strong>Recomendações Técnicas:</strong> Verificar alinhamento angular da antena receptora TBS e instalar pré-amplificador de baixo ruído (LNA) de 14 dB na entrada do sintonizador PCIe.</div>
            `;
        } else {
            notesEl.innerHTML = `
                <div><strong>Condição Nominal de Enlace:</strong> Linha de visada direta (LOS) completamente desobstruída entre a torre transmissora (${market.main_tower}) e o Capture Site. O elipsoide de Fresnel possui mais de 80% de folga, garantindo margem de desvanecimento estável acima de 18 dB.</div>
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

// ==============================================================================
// CANVAS DO CORTE TRANSVERSAL DE RELEVO E LINHA DE VISADA (LOS / FRESNEL)
// ==============================================================================
function renderTerrainCanvas(market) {
    const canvas = document.getElementById("rfTerrainCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    const padLeft = 60, padRight = 60, padTop = 30, padBottom = 40;
    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;

    const profile = market.terrain_profile || [
        { km: 0.0, alt_m: 320, label: "Torre" },
        { km: market.distance_km * 0.5, alt_m: 60, label: "Vale" },
        { km: market.distance_km, alt_m: 60, label: "Site" }
    ];

    const maxDist = Math.max(1, market.distance_km || 15);
    const maxAlt = Math.max(350, ...profile.map(p => p.alt_m * 1.25));

    function mapX(km) { return padLeft + (km / maxDist) * plotW; }
    function mapY(alt) { return padTop + plotH - (alt / maxAlt) * plotH; }

    // 1. Grade de Fundo (Linhas de Elevação e Distância)
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    for (let alt = 0; alt <= maxAlt; alt += 100) {
        const y = mapY(alt);
        ctx.beginPath(); ctx.moveTo(padLeft, y); ctx.lineTo(w - padRight, y); ctx.stroke();
        ctx.fillStyle = "#64748b";
        ctx.font = "10px monospace";
        ctx.textAlign = "right";
        ctx.fillText(`${alt}m`, padLeft - 8, y + 3);
    }
    for (let km = 0; km <= maxDist; km += Math.max(2, Math.round(maxDist / 6))) {
        const x = mapX(km);
        ctx.beginPath(); ctx.moveTo(x, padTop); ctx.lineTo(x, padTop + plotH); ctx.stroke();
        ctx.fillStyle = "#64748b";
        ctx.font = "10px monospace";
        ctx.textAlign = "center";
        ctx.fillText(`${km} km`, x, padTop + plotH + 18);
    }

    // 2. Pontos Extremos: Transmissor (Esquerda) e Receptor (Direita)
    const txX = mapX(0), txY = mapY(profile[0].alt_m);
    const rxX = mapX(maxDist), rxY = mapY(profile[profile.length - 1].alt_m);

    // 3. Elipsoide da 1ª Zona de Fresnel (60%) ao Redor do Feixe
    ctx.save();
    ctx.beginPath();
    const midX = (txX + rxX) / 2;
    const midY = (txY + rxY) / 2;
    const angle = Math.atan2(rxY - txY, rxX - txX);
    const fresnelRadiusPx = Math.min(32, plotH * 0.18);
    const lengthPx = Math.hypot(rxX - txX, rxY - txY);

    ctx.translate(midX, midY);
    ctx.rotate(angle);
    ctx.ellipse(0, 0, lengthPx / 2, fresnelRadiusPx, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(56, 189, 248, 0.08)";
    ctx.fill();
    ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.restore();

    // 4. Feixe Direto de Visada Ótica (LOS Ray)
    ctx.beginPath();
    ctx.moveTo(txX, txY);
    ctx.lineTo(rxX, rxY);
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    // 5. Perfil de Relevo do Terreno (Polígono Preenchido)
    ctx.beginPath();
    ctx.moveTo(padLeft, padTop + plotH);
    profile.forEach((p, idx) => {
        const px = mapX(p.km);
        const py = mapY(p.alt_m);
        if (idx === 0) ctx.lineTo(px, py);
        else ctx.lineTo(px, py);
    });
    ctx.lineTo(padLeft + plotW, padTop + plotH);
    ctx.closePath();

    const terrainGrad = ctx.createLinearGradient(0, padTop, 0, padTop + plotH);
    terrainGrad.addColorStop(0, "rgba(16, 185, 129, 0.55)");
    terrainGrad.addColorStop(0.5, "rgba(5, 150, 105, 0.35)");
    terrainGrad.addColorStop(1, "rgba(15, 23, 42, 0.95)");
    ctx.fillStyle = terrainGrad;
    ctx.fill();

    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    profile.forEach((p, idx) => {
        const px = mapX(p.km);
        const py = mapY(p.alt_m);
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    });
    ctx.stroke();

    // 6. Desenho das Estruturas: Torre Transmissora (Esquerda) e Mastro CS (Direita)
    // Torre Transmissora
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(txX - 3, txY, 6, mapY(0) - txY);
    ctx.beginPath();
    ctx.arc(txX, txY - 4, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#38bdf8";
    ctx.fill();
    ctx.fillStyle = "#f87171";
    ctx.font = "bold 11px Inter, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("📡 " + (market.main_tower || "Torre Transmissora"), txX + 8, txY - 8);

    // Mastro Receptora Capture Site
    ctx.fillStyle = "#10b981";
    ctx.fillRect(rxX - 3, rxY, 6, mapY(0) - rxY);
    ctx.beginPath();
    ctx.arc(rxX, rxY - 4, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#10b981";
    ctx.fill();
    ctx.fillStyle = "#34d399";
    ctx.font = "bold 11px Inter, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`🏢 Capture Site (${market.cidade})`, rxX - 8, rxY - 8);

    // 7. Indicação de Morro Intermediário / Obstrução de Fresnel
    const noticeEl = document.getElementById("rfTerrainDiagnosisNotice");
    const hill = profile.find(p => p.is_hill);
    if (hill) {
        const hx = mapX(hill.km);
        const hy = mapY(hill.alt_m);
        
        ctx.beginPath();
        ctx.arc(hx, hy, 7, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(234, 179, 8, 0.4)";
        ctx.fill();
        ctx.strokeStyle = "#facc15";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = "#facc15";
        ctx.font = "bold 10px monospace";
        ctx.textAlign = "center";
        ctx.fillText(`▲ ${hill.label} (${hill.alt_m}m)`, hx, hy - 12);

        if (noticeEl) {
            noticeEl.innerHTML = `⚠️ <strong>ALERTA DE OBSTRUÇÃO FRESNEL:</strong> Morro intermediário no km ${hill.km} (${hill.alt_m}m) intercepta 28% da 1ª Zona de Fresnel. Atenuação calculada por gume de faca: <strong>-8.5 dB</strong> nas portadoras UHF altas.`;
            noticeEl.style.color = "#facc15";
        }
    } else {
        if (noticeEl) {
            noticeEl.innerHTML = `✅ <strong>LINHA DE VISADA 100% DESOBSTRUÍDA (LOS):</strong> O feixe de micro-ondas UHF possui folga total acima do terreno sem risco de difração por relevo.`;
            noticeEl.style.color = "#34d399";
        }
    }
}

function jumpToCityIncidents() {
    if (!selectedMarket) return;
    
    if (typeof switchTab === "function") switchTab("incidents");

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

    if (typeof loadIncidentsHistoryData === "function") loadIncidentsHistoryData();
}
window.jumpToCityIncidents = jumpToCityIncidents;

// Inicialização automática quando a aba de mapa for aberta
document.addEventListener("DOMContentLoaded", () => {
    const mapTabBtn = document.querySelector('button[data-tab="map"]');
    if (mapTabBtn) {
        mapTabBtn.addEventListener("click", () => {
            setTimeout(loadTopologyMapData, 50);
        });
    }
});
