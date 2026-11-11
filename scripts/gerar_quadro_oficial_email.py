import os
from playwright.sync_api import sync_playwright

html_content = """<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  }
  body {
    width: 1920px;
    height: 1080px;
    background: #090d16;
    color: #f1f5f9;
    padding: 28px 36px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  
  /* HEADER */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 18px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  }
  .header-left {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .logo-badge {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: linear-gradient(135deg, #0284c7, #0369a1);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 26px;
    box-shadow: 0 0 20px rgba(2, 132, 199, 0.4);
  }
  .header-title h1 {
    font-size: 24px;
    font-weight: 800;
    letter-spacing: -0.5px;
    color: #ffffff;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .header-title p {
    font-size: 13px;
    color: #94a3b8;
    margin-top: 3px;
    font-weight: 500;
  }
  .header-badges {
    display: flex;
    gap: 10px;
  }
  .badge-tag {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    padding: 6px 14px;
    border-radius: 20px;
    background: rgba(14, 165, 233, 0.15);
    color: #38bdf8;
    border: 1px solid rgba(56, 189, 248, 0.3);
  }
  .badge-tag.highlight {
    background: rgba(34, 197, 94, 0.15);
    color: #4ade80;
    border: 1px solid rgba(74, 222, 128, 0.3);
  }

  /* TABLE CONTAINER */
  .table-container {
    flex: 1;
    margin-top: 16px;
    display: flex;
    flex-direction: column;
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 14px;
    overflow: hidden;
  }

  .table-header {
    display: grid;
    grid-template-columns: 340px 380px 1fr 220px;
    background: #0f172a;
    padding: 14px 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    font-size: 12px;
    font-weight: 800;
    color: #cbd5e1;
    text-transform: uppercase;
    letter-spacing: 0.8px;
  }

  .table-body {
    display: flex;
    flex-direction: column;
    flex: 1;
    justify-content: space-between;
  }

  .table-row {
    display: grid;
    grid-template-columns: 340px 380px 1fr 220px;
    padding: 12px 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    align-items: center;
    background: rgba(15, 23, 42, 0.25);
  }
  .table-row:nth-child(even) {
    background: rgba(30, 41, 59, 0.25);
  }
  .table-row:last-child {
    border-bottom: none;
  }

  /* COLUNA 1: MONITORAMENTO */
  .col-mon {
    padding-right: 18px;
  }
  .pilar-title {
    font-size: 14px;
    font-weight: 800;
    color: #ffffff;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .pilar-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 800;
  }
  .pilar-1 .pilar-num { background: rgba(34, 197, 94, 0.2); color: #4ade80; border: 1px solid #22c55e; }
  .pilar-2 .pilar-num { background: rgba(234, 179, 8, 0.2); color: #facc15; border: 1px solid #eab308; }
  .pilar-3 .pilar-num { background: rgba(56, 189, 248, 0.2); color: #38bdf8; border: 1px solid #0284c7; }
  .pilar-4 .pilar-num { background: rgba(168, 85, 247, 0.2); color: #c084fc; border: 1px solid #9333ea; }
  .pilar-5 .pilar-num { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid #ef4444; }

  .log-box {
    margin-top: 6px;
    font-family: "Consolas", monospace;
    font-size: 11px;
    background: #020617;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    padding: 6px 10px;
    color: #cbd5e1;
    line-height: 1.35;
    word-break: break-all;
  }
  .log-highlight {
    color: #38bdf8;
    font-weight: 700;
  }

  /* COLUNA 2: CAUSA & IMPACTO */
  .col-causa {
    padding-right: 20px;
  }
  .causa-title {
    font-size: 13px;
    font-weight: 700;
    color: #f8fafc;
    margin-bottom: 4px;
  }
  .causa-desc {
    font-size: 11.5px;
    color: #94a3b8;
    line-height: 1.45;
  }
  .impact-badge {
    margin-top: 6px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 10.5px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 4px;
    background: rgba(239, 68, 68, 0.15);
    color: #fca5a5;
    border: 1px solid rgba(239, 68, 68, 0.3);
  }
  .impact-badge.warn {
    background: rgba(245, 158, 11, 0.15);
    color: #fde047;
    border: 1px solid rgba(245, 158, 11, 0.3);
  }

  /* COLUNA 3: HOW-TO */
  .col-howto {
    padding-right: 20px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .step-item {
    font-size: 11.5px;
    color: #cbd5e1;
    line-height: 1.35;
    display: flex;
    align-items: flex-start;
    gap: 6px;
  }
  .step-num {
    color: #38bdf8;
    font-weight: 800;
    font-size: 11.5px;
  }
  .step-cmd {
    font-family: "Consolas", monospace;
    font-size: 10.5px;
    background: #020617;
    padding: 1px 5px;
    border-radius: 3px;
    color: #fde047;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
  .step-path {
    font-family: "Consolas", monospace;
    font-size: 10.5px;
    color: #86efac;
  }

  /* COLUNA 4: AÇÕES */
  .col-action {
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: flex-start;
  }
  .btn-action {
    width: 100%;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 11.5px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: none;
    cursor: default;
    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
  }
  .btn-blue {
    background: linear-gradient(135deg, #0284c7, #0369a1);
    color: #ffffff;
    border: 1px solid #38bdf8;
  }
  .btn-amber {
    background: linear-gradient(135deg, #d97706, #b45309);
    color: #ffffff;
    border: 1px solid #f59e0b;
  }
  .btn-cyan {
    background: linear-gradient(135deg, #0891b2, #0e7490);
    color: #ffffff;
    border: 1px solid #22d3ee;
  }
  .btn-red {
    background: linear-gradient(135deg, #dc2626, #b91c1c);
    color: #ffffff;
    border: 1px solid #ef4444;
  }

  /* FOOTER */
  .footer {
    padding-top: 12px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11.5px;
    color: #64748b;
  }
  .footer-left {
    display: flex;
    gap: 20px;
  }
  .footer-item {
    display: flex;
    align-items: center;
    gap: 6px;
  }
</style>
</head>
<body>

  <!-- HEADER -->
  <div class="header">
    <div class="header-left">
      <div class="logo-badge">🎯</div>
      <div class="header-title">
        <h1>FastMatching (fma.log) — Matriz Oficial de Monitoramento & Playbook</h1>
        <p>Kantar IBOPE Media • Monitor_Servicos NOC LATAM • 5 Oportunidades Operacionais de Engenharia</p>
      </div>
    </div>
    <div class="header-badges">
      <div class="badge-tag highlight">Full HD 1080p Nativo</div>
      <div class="badge-tag">Padrão Oficial de Engenharia</div>
      <div class="badge-tag">Playbook NOC 24x7</div>
    </div>
  </div>

  <!-- TABELA DE 5 PILARES -->
  <div class="table-container">
    <div class="table-header">
      <div>1. Monitoramento fma.log</div>
      <div>2. Causa Raiz & Impacto Operacional</div>
      <div>3. Roteiro How-To Passo a Passo para o Técnico</div>
      <div>4. Ação Rápida no Painel</div>
    </div>

    <div class="table-body">
      
      <!-- PILAR 1 -->
      <div class="table-row pilar-1">
        <div class="col-mon">
          <div class="pilar-title">
            <span class="pilar-num">1</span>
            <span>Generación de Coincidencias</span>
          </div>
          <div class="log-box">
            <span class="log-highlight">NEW DETECTION</span> 17738882, ... <span style="color:#4ade80;">ProcTimeMs 1037</span>, Val...
          </div>
          <div style="font-size: 10.5px; color: #94a3b8; margin-top: 4px;">
            Limiar Normal: <strong style="color: #4ade80;">ProcTimeMs &lt; 2000ms</strong> | Alerta: &gt; 3000ms
          </div>
        </div>
        <div class="col-causa">
          <div class="causa-title">Matching Ativo & Tempo de Processamento</div>
          <div class="causa-desc">
            Constata em tempo real se a praça gera detecções válidas. Se o canal ao vivo passar horas sem emitir nenhum NEW DETECTION, a cadeia de captura/matching pode estar congelada.
          </div>
          <div class="impact-badge">Risco: Apagão silencioso de comprovações de comerciais</div>
        </div>
        <div class="col-howto">
          <div class="step-item"><span class="step-num">1.</span> <strong>[Sinal TS]</strong> Verificar no Atria se o canal emite pacotes TS sem perda ou congelamento.</div>
          <div class="step-item"><span class="step-num">2.</span> <strong>[Buffer EMU]</strong> Inspecionar <span class="step-path">D:\MediaDNA_V2\Data\emu</span> (blocos de 1 min gravados continuamente).</div>
          <div class="step-item"><span class="step-num">3.</span> <strong>[CPU/Antivírus]</strong> Se ProcTimeMs &gt; 2500ms, checar concorrência de CPU e exclusão do antivírus na pasta Data.</div>
          <div class="step-item"><span class="step-num">4.</span> <strong>[Reciclagem]</strong> Se congelado há &gt; 60m com TV ativa, reiniciar FastMachingSvc pelo painel.</div>
        </div>
        <div class="col-action">
          <button class="btn-action btn-blue"><span>🔄</span> Reiniciar FastMatchingSvc</button>
          <div style="font-size: 10px; color: #64748b; text-align: center; width: 100%;">Restaura pipeline TS / Matching</div>
        </div>
      </div>

      <!-- PILAR 2 -->
      <div class="table-row pilar-2">
        <div class="col-mon">
          <div class="pilar-title">
            <span class="pilar-num">2</span>
            <span>Candidatos con Retraso</span>
          </div>
          <div class="log-box">
            <span class="log-highlight" style="color: #facc15;">*WARNING* DELAYED CANDIDATE</span> 17957733, ... '2026-11-05T02:43:19'(UTC)...
          </div>
          <div style="font-size: 10.5px; color: #94a3b8; margin-top: 4px;">
            Alerta Preditivo Imediato: <strong style="color: #facc15;">Desvio UTC no Buffer</strong>
          </div>
        </div>
        <div class="col-causa">
          <div class="causa-title">Acúmulo de .EMU ou Descompasso de Buffer</div>
          <div class="causa-desc">
            Se um spot emitido às 02:43 UTC recém for processado às 00:38 UTC, há acúmulo de arquivos .EMU em disco ou atraso no buffer circular antes que se converta em reclamação do cliente.
          </div>
          <div class="impact-badge warn">Impacto: Descarte de spots por expiração da janela temporal</div>
        </div>
        <div class="col-howto">
          <div class="step-item"><span class="step-num">1.</span> <strong>[Relógio NTP]</strong> Executar <span class="step-cmd">w32tm /query /status</span> e validar se DNA.TimeSyncSVC está rodando (desvio &lt; 1s).</div>
          <div class="step-item"><span class="step-num">2.</span> <strong>[Fila em Disco]</strong> Conferir <span class="step-path">D:\MediaDNA_V2\Data\emu</span>. Se houver &gt; 5-10 arquivos, há lentidão de disco SSD.</div>
          <div class="step-item"><span class="step-num">3.</span> <strong>[Reset de Memória]</strong> Reiniciar FastMachingSvc pelo painel para limpar o buffer circular defasado.</div>
          <div class="step-item"><span class="step-num">4.</span> <strong>[Sinal de Captura]</strong> Conferir no Atria Capture se o tuner não sofreu rajada de pacotes após queda.</div>
        </div>
        <div class="col-action">
          <button class="btn-action btn-amber"><span>⚡</span> Resetar Buffers EMU</button>
          <div style="font-size: 10px; color: #64748b; text-align: center; width: 100%;">Ressincroniza janela circular UTC</div>
        </div>
      </div>

      <!-- PILAR 3 -->
      <div class="table-row pilar-3">
        <div class="col-mon">
          <div class="pilar-title">
            <span class="pilar-num">3</span>
            <span>Rendimiento del Escaneo (SearchStats)</span>
          </div>
          <div class="log-box">
            <span class="log-highlight" style="color: #38bdf8;">SearchStats V30:</span> 2 ccd packets searched with 120000ms content in <span style="color:#38bdf8;">87.95ms</span>. <span style="color:#86efac;">NumFingers=8442</span>
          </div>
          <div style="font-size: 10.5px; color: #94a3b8; margin-top: 4px;">
            Métricas: <strong style="color: #38bdf8;">search_ms &lt; 200ms</strong> | <strong>NumFingers &lt; 50.000</strong>
          </div>
        </div>
        <div class="col-causa">
          <div class="causa-title">Sobrecarga de Catálogo & Saturação de CPU</div>
          <div class="causa-desc">
            Monitora o tempo de busca e o volume de huellas carregadas (NumFingers). Picos anômalos no tempo de varredura indicam saturação de CPU, hardware degradado ou catálogo descalibrado.
          </div>
          <div class="impact-badge warn">Impacto: Gargalo de busca e atraso no processamento ao vivo</div>
        </div>
        <div class="col-howto">
          <div class="step-item"><span class="step-num">1.</span> <strong>[Auditoria CPU]</strong> Confirmar se DNA.DetectionSVC está parado (não deve concorrer com FastMatching).</div>
          <div class="step-item"><span class="step-num">2.</span> <strong>[Volume de Huellas]</strong> Se NumFingers &gt; 50.000, solicitar ao SGG purga de campanhas vencidas.</div>
          <div class="step-item"><span class="step-num">3.</span> <strong>[Exclusão Antivírus]</strong> Validar que Defender/Tanium não inspecionam o processo em tempo real.</div>
          <div class="step-item"><span class="step-num">4.</span> <strong>[Otimização]</strong> Reiniciar FastMachingSvc para reconstruir o índice de busca em RAM.</div>
        </div>
        <div class="col-action">
          <button class="btn-action btn-blue"><span>🔍</span> Otimizar Índice / Reciclar</button>
          <div style="font-size: 10px; color: #64748b; text-align: center; width: 100%;">Reconstrói árvore de huellas</div>
        </div>
      </div>

      <!-- PILAR 4 -->
      <div class="table-row pilar-4">
        <div class="col-mon">
          <div class="pilar-title">
            <span class="pilar-num">4</span>
            <span>Ciclo de Actualización del Catálogo</span>
          </div>
          <div class="log-box">
            <span class="log-highlight" style="color: #c084fc;">DNAConfigXmlProvider:</span> Loaded spots <span style="color:#c084fc;">'17957733,17957735'</span> (ConfigXml.xml)
          </div>
          <div style="font-size: 10.5px; color: #94a3b8; margin-top: 4px;">
            Métricas: <strong style="color: #c084fc;">Reload &lt; 24h</strong> | Ingestão em poucos segundos
          </div>
        </div>
        <div class="col-causa">
          <div class="causa-title">Ingestão de Novos Spots Comerciais (SGG)</div>
          <div class="causa-desc">
            Verifica se os novos spots enviados pela Kantar foram ingeridos com sucesso pelo motor e em quantos segundos concluiu a recarga. Se estagnado há &gt; 24h, comerciais novos não serão detectados.
          </div>
          <div class="impact-badge">Impacto: Omissão de comerciais novos por ausência no catálogo</div>
        </div>
        <div class="col-howto">
          <div class="step-item"><span class="step-num">1.</span> <strong>[Status do Serviço]</strong> Confirmar se DNA.ConfigMonitorSVC está em execução (é quem baixa do SGG).</div>
          <div class="step-item"><span class="step-num">2.</span> <strong>[Arquivo ConfigXml]</strong> Checar data e tamanho de <span class="step-path">D:\MediaDNA_V2\Data\Config\ConfigXml.xml</span>.</div>
          <div class="step-item"><span class="step-num">3.</span> <strong>[Forçar Sync SGG]</strong> Reiniciar DNA.ConfigMonitorSVC pelo painel para puxar spots pendentes.</div>
          <div class="step-item"><span class="step-num">4.</span> <strong>[Conexão WCF]</strong> Validar conectividade HTTPS/WCF com o servidor central de catálogo da Kantar.</div>
        </div>
        <div class="col-action">
          <button class="btn-action btn-cyan"><span>📥</span> Forçar Sync SGG (Config)</button>
          <div style="font-size: 10px; color: #64748b; text-align: center; width: 100%;">Dispara recarga de ConfigXml.xml</div>
        </div>
      </div>

      <!-- PILAR 5 -->
      <div class="table-row pilar-5">
        <div class="col-mon">
          <div class="pilar-title">
            <span class="pilar-num">5</span>
            <span>Consumo de Memoria (Anti-OOM)</span>
          </div>
          <div class="log-box">
            <span class="log-highlight" style="color: #f87171;">RAM usage.</span> Private Working Set: <span style="color:#f87171;">9534Mb</span> (Working Set: 1161Mb)
          </div>
          <div style="font-size: 10.5px; color: #94a3b8; margin-top: 4px;">
            Limiar Normal: <strong style="color: #4ade80;">&lt; 5.000 MB</strong> | Crítico: <strong style="color: #f87171;">&gt; 10.000 MB</strong>
          </div>
        </div>
        <div class="col-causa">
          <div class="causa-title">Retenção de Memória / Risco de Memory Leak</div>
          <div class="causa-desc">
            Detecção preventiva de vazamento de memória e fragmentação na biblioteca C++ antes que ocorra um crash silencioso ou fechamento inesperado por falta de memória (Out of Memory - OOM).
          </div>
          <div class="impact-badge">Impacto Crítico: Queda abrupta do serviço e perda total de detecção</div>
        </div>
        <div class="col-howto">
          <div class="step-item"><span class="step-num">1.</span> <strong>[Reciclagem Preventiva]</strong> Se Private Set &gt; 10.000 MB, reiniciar FastMachingSvc imediatamente.</div>
          <div class="step-item"><span class="step-num">2.</span> <strong>[Comando CMD]</strong> Executar <span class="step-cmd">net stop FastMachingSvc && net start FastMachingSvc</span> no prompt.</div>
          <div class="step-item"><span class="step-num">3.</span> <strong>[Validação Pós-Restart]</strong> Confirmar no fma.log que a memória Private Set retornou para &lt; 2.000 MB.</div>
          <div class="step-item"><span class="step-num">4.</span> <strong>[Limpeza de Disco]</strong> Verificar espaço livre na unidade D:\ e expurgar logs/dumps antigos em Data\logs.</div>
        </div>
        <div class="col-action">
          <button class="btn-action btn-red"><span>🚨</span> Reciclar Anti-Crash (OOM)</button>
          <div style="font-size: 10px; color: #64748b; text-align: center; width: 100%;">Desaloca memória da biblioteca C++</div>
        </div>
      </div>

    </div>
  </div>

  <!-- FOOTER -->
  <div class="footer">
    <div class="footer-left">
      <div class="footer-item"><span>📁</span> <strong>Arquivo Auditado:</strong> D:\\MediaDNA_V2\\Applications\\DTVCapture64\\FastMachingSvc\\fma.log</div>
      <div class="footer-item"><span>🛡️</span> <strong>Motor Canônico:</strong> FastMachingSvc.exe (Nativo C++ / Win64)</div>
      <div class="footer-item"><span>📡</span> <strong>Ingestão de Spots:</strong> D:\\MediaDNA_V2\\Data\\Config\\ConfigXml.xml</div>
    </div>
    <div>Sistema Monitor_Servicos LATAM • Monitoramento Automatizado de Incidentes P0/P1/P2</div>
  </div>

</body>
</html>
"""

html_path = "scripts/quadro_oficial_fma_log_email.html"
with open(html_path, "w", encoding="utf-8") as f:
    f.write(html_content)

print(f"HTML gerado em: {html_path}")

out_img1 = "quadro_oficial_fma_log_email.png"
out_img2 = "C:/Users/Cleber/.gemini/antigravity/brain/69a25dad-6420-47a9-86ae-6c86aeed62ba/quadro_oficial_fma_log_email.png"

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1920, "height": 1080}, device_scale_factor=2)
    page.goto(f"file:///{os.path.abspath(html_path)}")
    page.wait_for_timeout(1000)
    page.screenshot(path=out_img1)
    page.screenshot(path=out_img2)
    browser.close()

print(f"Imagem Full HD gerada em: {out_img1} e {out_img2}")
