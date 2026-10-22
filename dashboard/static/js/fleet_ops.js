// static/js/fleet_ops.js - Gestão de Frotas e Deploy Canário

async function triggerCanaryFromDashboard() {
    const targetVer = document.getElementById("canaryTargetVersion").value || "1.0.14.0";
    if (!confirm(`Deseja disparar o Deploy Canário com 5 praças piloto para validar a versão ${targetVer}?\n\nSe houver qualquer erro em uma praça, o Rollback de Emergência será acionado automaticamente.`)) return;

    const logBox = document.getElementById("canaryLogOutput");
    logBox.innerText = `[${new Date().toLocaleTimeString()}] Disparando Pipeline Canário para 5 praças na versão ${targetVer}...\nMonitorando telemetria em segundo plano...`;

    try {
        const resp = await fetch("/api/fleet/action", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${authToken}`
            },
            body: JSON.stringify({
                action_type: "canary_deploy",
                host: "Canary_Pilots",
                target_version: targetVer
            })
        });
        const data = await resp.json();
        if (resp.ok) {
            logBox.innerText += `\n[${new Date().toLocaleTimeString()}] ✅ ${data.message}`;
            alert("Pipeline Canário iniciado com sucesso! Acompanhe o progresso das 5 máquinas na Visão Geral.");
            loadAllData();
        } else {
            logBox.innerText += `\n[${new Date().toLocaleTimeString()}] ❌ Erro: ${data.detail}`;
        }
    } catch {
        logBox.innerText += `\n[${new Date().toLocaleTimeString()}] ❌ Falha de comunicação com o servidor.`;
    }
}

async function triggerPromoteFleetFromDashboard() {
    const targetVer = document.getElementById("canaryTargetVersion").value || "1.0.14.0";
    if (!confirm(`ATENÇÃO: Deseja promover a versão ${targetVer} para TODAS as 22 máquinas da frota?\n\nCertifique-se de que a validação Canário foi concluída com sucesso.`)) return;

    const logBox = document.getElementById("canaryLogOutput");
    logBox.innerText += `\n[${new Date().toLocaleTimeString()}] Promovendo versão ${targetVer} para a frota completa...`;

    try {
        const resp = await fetch("/api/fleet/action", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${authToken}`
            },
            body: JSON.stringify({
                action_type: "promote_fleet",
                host: "All_Fleet",
                target_version: targetVer
            })
        });
        const data = await resp.json();
        if (resp.ok) {
            logBox.innerText += `\n[${new Date().toLocaleTimeString()}] 🚀 ${data.message}`;
            alert("Rollout geral da frota disparado com sucesso!");
            loadAllData();
        } else {
            logBox.innerText += `\n[${new Date().toLocaleTimeString()}] ❌ Erro: ${data.detail}`;
        }
    } catch {
        logBox.innerText += `\n[${new Date().toLocaleTimeString()}] ❌ Falha de comunicação com o servidor.`;
    }
}
