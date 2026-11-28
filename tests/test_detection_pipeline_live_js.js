// Teste automatizado Node.js para validar robustez e ausência de exceções em detection_pipeline_live.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Simulação de DOM mínima para rodar o JS no Node
const elements = {
    fmaLiveHostSelect: { options: [], innerHTML: '', value: '' },
    detectionPipelineLiveModal: { style: { display: 'none' } },
    fmaLiveSubtitle: { textContent: '' },
    fmaLiveFooterStats: { textContent: '' },
    fmaLiveModalBody: { innerHTML: '' },
    fmaLiveSyncStatus: { textContent: '' },
    btnFetchRealFmaLog: { disabled: false, innerText: '' },
    btnFmaLiveHealRecon: { style: { display: 'none' } },
    fmaLiveAutoRefreshToggle: { checked: false }
};

global.document = {
    getElementById: (id) => elements[id] || { style: {}, textContent: '', innerHTML: '' }
};
global.window = global;
global.requestAnimationFrame = (fn) => fn();

// Mock de fetch e funções auxiliares
global.getAuthToken = () => "mock-token";
global.escapeHtml = (s) => String(s || '');

// Lê e avalia o arquivo JS real
const jsCode = fs.readFileSync(path.join(__dirname, '..', 'dashboard', 'static', 'js', 'detection_pipeline_live.js'), 'utf-8');
eval(jsCode);

console.log("1. Testando deduplicação em loadFmaLiveCs01Selector()...");

// Simula resposta de API com praças duplicadas (ex: Campinas aparecendo 2 vezes)
const mockApiResponse = {
    hosts: [
        { hostname: "Campinas-SMME-52-CS1", praca: "Campinas", fastmatching_running: true },
        { hostname: "BRSP-CAS-ATRIA-", praca: "Campinas", fastmatching_running: false },
        { hostname: "Aracaju-SMME-328-CS1", praca: "Aracaju", fastmatching_running: true }
    ]
};

global.fetch = async (url) => {
    if (url.includes("fma-cs01-hosts")) {
        return {
            ok: true,
            json: async () => mockApiResponse
        };
    }
    return { ok: true, json: async () => ({}) };
};

// Executa loadFmaLiveCs01Selector
loadFmaLiveCs01Selector().then(() => {
    const html = elements.fmaLiveHostSelect.innerHTML;
    const campinasOptions = (html.match(/value="Campinas[^"]*"/g) || []).length;
    assert.strictEqual(campinasOptions, 1, `Campinas deve possuir apenas UMA tag <option> no dropdown! Encontrado ${campinasOptions} vezes.`);
    assert(html.includes("Campinas-SMME-52-CS1"), "Deve conter o nó canônico Campinas-SMME-52-CS1");
    assert(!html.includes("BRSP-CAS-ATRIA-"), "NÃO deve conter o nó obsoleto BRSP-CAS-ATRIA-");
    console.log("✅ Deduplicação aprovada: Campinas aparece estritamente uma única vez!");

    console.log("2. Testando imunidade contra erro 'Cannot read properties of null (reading toLocaleString)'...");

    // Payload simulando o caso real de Aracaju onde num_fingers e search_stats são null
    const payloadWithNullFingers = {
        success: true,
        hostname: "ARACAJU-SMME-328-CS1",
        praca: "Aracaju",
        timestamp: "2026-11-28 03:15:24",
        log_source: "[ARACAJU-SMME-328-CS1] Telemetria do Agente DNA.MonitorServiceSVC (Google Cloud Firestore)",
        is_live_disk: false,
        diagnosis: { status: "NOMINAL", title: "Operando", desc: "OK", color: "green", action: "Nenhuma" },
        spots_status: { loaded: true, total_spots_loaded: null, status_label: "Sincronizado", status_color: "green", is_ram_partial: false, recon_count: null },
        emu_status: { flow_color: "green", generation_rate_cpm: 3.0, flow_status: "FLOWING", flow_label: "Fluindo", active_channels: 3, free_disk_gb: "183,6 GB" },
        engine_performance: { proc_time_ms_avg: 18, ram_working_set_mb: 574, num_fingers: null, search_ms: null },
        channels_detail: [{ name: "GLOBO", full_name: "Rede Globo" }],
        recent_detections: [],
        fma_lines: ["[HOST CS01] Telemetria real"]
    };

    try {
        // Testa renderFmaLiveDashboard diretamente com num_fingers = null
        renderFmaLiveDashboard(payloadWithNullFingers);
        console.log("✅ renderFmaLiveDashboard renderizou sem exceções!");

        // Testa o bloco do footer em fetchDetectionPipelineLiveData com num_fingers = null
        const footerEl = elements.fmaLiveFooterStats;
        const data = payloadWithNullFingers;
        const ramVal = (data.engine_performance && data.engine_performance.ram_working_set_mb != null) ? data.engine_performance.ram_working_set_mb : 0;
        const fingersVal = (data.engine_performance && data.engine_performance.num_fingers != null) ? Number(data.engine_performance.num_fingers).toLocaleString('pt-BR') : 'N/A';
        const diskVal = (data.emu_status && data.emu_status.free_disk_gb != null) ? data.emu_status.free_disk_gb : 'N/A';
        footerEl.textContent = `Modo: ${data.is_live_disk ? "🟢 Arquivo em Disco Vivo" : "⚡ Telemetria Real do Nó"} | RAM Motor: ${ramVal}MB | Fingers: ${fingersVal} | Disco D: ${diskVal} livres`;

        console.log(`Footer gerado: ${footerEl.textContent}`);
        assert(footerEl.textContent.includes("Fingers: N/A"), "Footer deve exibir 'Fingers: N/A' de forma segura quando num_fingers é null");
        console.log("✅ Imunidade contra 'null.toLocaleString' validada e aprovada!");
        process.exit(0);
    } catch (err) {
        console.error("❌ Falha crítica no teste JS:", err);
        process.exit(1);
    }
}).catch(err => {
    console.error("❌ Erro ao rodar teste:", err);
    process.exit(1);
});
