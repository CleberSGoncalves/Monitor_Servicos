import asyncio
import os
import sys
from pathlib import Path
from playwright.async_api import async_playwright

OUTPUT_DIR = Path(r"C:\Users\Cleber\.gemini\antigravity\brain\69a25dad-6420-47a9-86ae-6c86aeed62ba")
PDF_PATH = OUTPUT_DIR / "Relatorio_Tecnico_Arquitetura_Fluxo_Dados_Seguranca_NOC.pdf"
HTML_PATH = OUTPUT_DIR / "relatorio_tecnico_temp.html"

HTML_CONTENT = """<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Relatório Técnico de Arquitetura, Fluxo de Dados e Segurança</title>
  <style>
    @page {
      size: 210mm 297mm;
      margin: 0;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif;
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #1e293b;
      font-size: 9pt;
      line-height: 1.35;
    }
    
    /* PÁGINAS COM CONTROLE RÍGIDO DE ALTURA */
    .page {
      width: 210mm;
      height: 297mm;
      max-height: 297mm;
      padding: 14mm 18mm 12mm 18mm;
      position: relative;
      page-break-after: always;
      page-break-inside: avoid;
      break-after: page;
      break-inside: avoid;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
    }
    .page:last-of-type {
      page-break-after: auto;
      break-after: auto;
    }

    /* HEADER & FOOTER */
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #0284c7;
      padding-bottom: 6px;
      margin-bottom: 12px;
    }
    .header-title {
      font-size: 8.5pt;
      font-weight: 700;
      color: #0369a1;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .header-meta {
      font-size: 8pt;
      color: #64748b;
    }
    .page-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-top: 1px solid #e2e8f0;
      padding-top: 6px;
      margin-top: 8px;
      font-size: 8pt;
      color: #64748b;
    }

    /* CAPA */
    .cover-page {
      background: linear-gradient(135deg, #0b1329 0%, #0f172a 50%, #0284c7 100%);
      color: #ffffff;
      padding: 32mm 22mm 26mm 22mm;
      justify-content: space-between;
    }
    .cover-badge {
      display: inline-block;
      background: rgba(56, 189, 248, 0.2);
      border: 1px solid rgba(56, 189, 248, 0.5);
      color: #38bdf8;
      padding: 5px 12px;
      border-radius: 20px;
      font-size: 9pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .cover-title {
      font-size: 24pt;
      font-weight: 900;
      line-height: 1.2;
      margin: 18px 0 10px 0;
      color: #ffffff;
    }
    .cover-subtitle {
      font-size: 11pt;
      color: #cbd5e1;
      font-weight: 400;
      max-width: 95%;
      margin-bottom: 24px;
      line-height: 1.4;
    }
    .cover-meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      background: rgba(15, 23, 42, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.15);
      padding: 16px;
      border-radius: 10px;
      backdrop-filter: blur(5px);
    }
    .meta-item-label {
      font-size: 8pt;
      color: #94a3b8;
      text-transform: uppercase;
      font-weight: 700;
    }
    .meta-item-val {
      font-size: 9.5pt;
      color: #f8fafc;
      font-weight: 600;
      margin-top: 2px;
    }

    /* SEÇÕES DE CONTEÚDO */
    h1 {
      font-size: 15pt;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 8px 0;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 4px;
    }
    h2 {
      font-size: 11pt;
      font-weight: 700;
      color: #0284c7;
      margin: 10px 0 5px 0;
    }
    h3 {
      font-size: 9.5pt;
      font-weight: 700;
      color: #334155;
      margin: 8px 0 4px 0;
    }
    p {
      margin: 0 0 6px 0;
      color: #334155;
      text-align: justify;
    }
    ul, ol {
      margin: 0 0 8px 0;
      padding-left: 18px;
      color: #334155;
    }
    li {
      margin-bottom: 3px;
    }

    /* CARDS & BOXES */
    .card-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 8px 12px;
      margin-bottom: 8px;
    }
    .card-box-primary {
      background: #f0f9ff;
      border-left: 4px solid #0284c7;
    }
    .card-box-success {
      background: #f0fdf4;
      border-left: 4px solid #16a34a;
    }
    .card-box-warning {
      background: #fffbeb;
      border-left: 4px solid #d97706;
    }

    /* TABELAS */
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 8px;
      font-size: 8pt;
    }
    th {
      background: #0f172a;
      color: #ffffff;
      padding: 5px 8px;
      text-align: left;
      font-weight: 700;
    }
    td {
      padding: 5px 8px;
      border-bottom: 1px solid #e2e8f0;
      color: #334155;
    }
    tr:nth-child(even) td {
      background: #f8fafc;
    }

    /* BADGES */
    .badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 7.5pt;
      font-weight: 700;
      text-transform: uppercase;
    }
    .badge-green { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
    .badge-blue { background: #e0f2fe; color: #0369a1; border: 1px solid #7dd3fc; }
    .badge-purple { background: #f3e8ff; color: #6b21a8; border: 1px solid #d8b4fe; }
    .badge-orange { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }

    /* DIAGRAMAS SVG */
    .diagram-container {
      background: #0b1329;
      border: 1px solid #1e293b;
      border-radius: 8px;
      padding: 10px 12px;
      margin-bottom: 10px;
      text-align: center;
    }
  </style>
</head>
<body>

  <!-- PÁGINA 1: CAPA EXECUTIVA -->
  <div class="page cover-page">
    <div>
      <div class="cover-badge">Documento Técnico Oficial &bull; Engenharia &amp; NOC LATAM</div>
      <h1 class="cover-title">Arquitetura de Dados,<br>Monitoramento e Segurança</h1>
      <div class="cover-subtitle">
        Detalhamento integral do fluxo de telemetria dos Capture Sites, integração entre <strong>Monitor_Servicos</strong>, <strong>Monitor_Esportes</strong> e o <strong>Portal Google Sites</strong> no novo endereço corporativo, com blindagem de segurança zero risco externo.
      </div>
    </div>

    <div>
      <div class="cover-meta-grid">
        <div>
          <div class="meta-item-label">Responsável Técnico</div>
          <div class="meta-item-val">Cleber de Souza Gonçalves</div>
          <div style="font-size: 8pt; color: #94a3b8;">Coordenador de Suporte Técnico LATAM</div>
        </div>
        <div>
          <div class="meta-item-label">Área / Divisão</div>
          <div class="meta-item-val">Advertising Intelligence</div>
          <div style="font-size: 8pt; color: #94a3b8;">Kantar IBOPE Media</div>
        </div>
        <div>
          <div class="meta-item-label">Projetos Integrados</div>
          <div class="meta-item-val">Monitor_Servicos &bull; Monitor_Esportes</div>
          <div style="font-size: 8pt; color: #94a3b8;">Google Sites / Google Workspace</div>
        </div>
        <div>
          <div class="meta-item-label">Data &bull; Versão &bull; Status</div>
          <div class="meta-item-val">25/11/2026 &bull; v4.0.0 &bull; Homologado</div>
          <div style="font-size: 8pt; color: #4ade80;">100% Autônomo (Zero SharePoint)</div>
        </div>
      </div>
      <div style="margin-top: 18px; font-size: 7.5pt; color: #94a3b8; text-align: center;">
        Kantar IBOPE Media &bull; Av. Francisco Matarazzo, 1350 - São Paulo, SP &bull; Uso Interno e Confidencial
      </div>
    </div>
  </div>

  <!-- PÁGINA 2: SUMÁRIO EXECUTIVO E VISÃO GERAL DO ECOSSISTEMA -->
  <div class="page">
    <div>
      <div class="page-header">
        <span class="header-title">1. Visão Geral do Ecossistema &amp; Objetivos Estratégicos</span>
        <span class="header-meta">Monitor_Servicos &bull; Monitor_Esportes</span>
      </div>

      <h1>1. Sumário Executivo</h1>
      <p>
        Este documento descreve formalmente a arquitetura unificada de dados, a esteira de telemetria em tempo real e a política de segurança da informação adotadas no ecossistema de captura, fiscalização e monitoramento da <strong>Kantar IBOPE Media (Advertising Intelligence LATAM)</strong>.
      </p>
      <p>
        O ecossistema foi desenhado com o propósito central de prover <strong>alta disponibilidade contínua (24x7)</strong>, resposta automatizada a incidentes, acompanhamento da programação esportiva com IA e eliminação definitiva de dependências externas legadas (especialmente do SharePoint corporativo, que apresentava gargalos de rate limit HTTP 429 e indisponibilidade).
      </p>

      <h2>1.1. Pilares da Nova Arquitetura</h2>
      <div class="card-box card-box-primary">
        <strong>1. Autonomia Operacional Completa (Zero SharePoint Lock-in):</strong>
        Toda a persistência, acervo de relatórios esportivos, agendas, arquivos de Acesso Remoto (.RDP) e matrizes de permissões foram migrados para o repositório próprio e servidos diretamente pelo <strong>Google Workspace / Google Sites</strong> no novo endereço, tornando a operação 100% imune a paradas da Microsoft.
      </div>

      <div class="card-box card-box-success">
        <strong>2. Segurança da Informação Sem Riscos Externos:</strong>
        Arquitetura em <em>Reverse Polling</em> via <strong>Google Cloud Firestore</strong> e túneis criptografados Zero Trust. <u>Nenhuma porta de entrada (inbound) é exposta à internet pública</u> nos servidores locais ou Capture Sites, eliminando superfícies de ataque, varreduras externas ou invasões.
      </div>

      <div class="card-box card-box-warning">
        <strong>3. Unificação de Telemetria e Inteligência com IA:</strong>
        Conexão direta entre o monitoramento de infraestrutura (Capture Sites, receptores ISDB-Tb, Atria, FastMatching) no <strong>Monitor_Servicos</strong> e a auditoria de transmissões comerciais/esportivas no <strong>Monitor_Esportes</strong>, municiando o portal corporativo com métricas vivas e laudos periciais automáticos.
      </div>

      <h2>1.2. Mapeamento de Nós e Dimensão do Parque</h2>
      <table>
        <thead>
          <tr>
            <th>Componente / Esteira</th>
            <th>Escopo do Parque</th>
            <th>Função Principal</th>
            <th>Motor em Operação</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Capture Sites CS01</strong></td>
            <td>120 Praças (Brasil)</td>
            <td>Gravação de TV digital terrestre, RF e detecção de comerciais</td>
            <td>FastMatching C++ (30) / DetectionSVC (90)</td>
          </tr>
          <tr>
            <td><strong>Capture Sites CS02 / CS03</strong></td>
            <td>128 Hosts (Brasil / LATAM)</td>
            <td>Gravação redundante, rádio comercial e PayTV</td>
            <td>DTVCapture / MediaRecorderSVC</td>
          </tr>
          <tr>
            <td><strong>Monitor_Servicos (NOC)</strong></td>
            <td>Central NOC LATAM</td>
            <td>Cockpit de telemetria, orquestração remota e matriz SLA</td>
            <td>FastAPI + Cloud Firestore + Cache Memory</td>
          </tr>
          <tr>
            <td><strong>Monitor_Esportes</strong></td>
            <td>Transmissões Brasil/Mundo</td>
            <td>Auditoria esportiva, checagem CBF/ESPN/YouTube e laudos IA</td>
            <td>Gemini AI Grounding + Playwright + Webhook</td>
          </tr>
          <tr>
            <td><strong>Portal Google Sites</strong></td>
            <td>Operação &amp; Stakeholders</td>
            <td>Visualização unificada, escala, acervo PDF e links RDP</td>
            <td>Google Workspace (Novo Endereço Seguro)</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="page-footer">
      <span>Kantar IBOPE Media &bull; Advertising Intelligence</span>
      <span>Página 2 de 5</span>
    </div>
  </div>

  <!-- PÁGINA 3: FLUXO DE DADOS E DESENHO DE ARQUITETURA -->
  <div class="page">
    <div>
      <div class="page-header">
        <span class="header-title">2. Fluxo de Dados e Topologia Técnica</span>
        <span class="header-meta">Pipeline de Telemetria e Transmissão</span>
      </div>

      <h1>2. Fluxograma da Arquitetura de Dados</h1>
      <p>
        A figura abaixo demonstra o fluxo de ponta a ponta desde as antenas e receptores locais nos Capture Sites até a publicação automatizada no novo portal corporativo do Google Sites:
      </p>

      <!-- DIAGRAMA VETORIAL SVG ESTILIZADO -->
      <div class="diagram-container">
        <svg viewBox="0 0 850 400" width="100%" height="280" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="gradBlue" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#0284c7" />
              <stop offset="100%" stop-color="#0369a1" />
            </linearGradient>
            <linearGradient id="gradPurple" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#8b5cf6" />
              <stop offset="100%" stop-color="#6d28d9" />
            </linearGradient>
            <linearGradient id="gradGreen" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#10b981" />
              <stop offset="100%" stop-color="#059669" />
            </linearGradient>
            <linearGradient id="gradAmber" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#f59e0b" />
              <stop offset="100%" stop-color="#d97706" />
            </linearGradient>
          </defs>

          <!-- 1. CAMADA CAPTURE SITES (BORDA) -->
          <rect x="20" y="25" width="220" height="355" rx="8" fill="#0f172a" stroke="#334155" stroke-dasharray="4,4"/>
          <text x="35" y="48" fill="#94a3b8" font-size="10.5" font-weight="700">1. CAPTURE SITES (BORDA LATAM)</text>
          
          <rect x="35" y="60" width="190" height="65" rx="6" fill="#1e293b" stroke="#0ea5e9"/>
          <text x="45" y="80" fill="#38bdf8" font-size="9.5" font-weight="700">Sinais de TV e Rádio</text>
          <text x="45" y="95" fill="#cbd5e1" font-size="8.2">Antenas ISDB-Tb &bull; TBS Tuner</text>
          <text x="45" y="110" fill="#94a3b8" font-size="7.8">RF MER, BER, Força do Sinal</text>

          <rect x="35" y="135" width="190" height="75" rx="6" fill="#1e293b" stroke="#10b981"/>
          <text x="45" y="155" fill="#4ade80" font-size="9.5" font-weight="700">Atria Capture &amp; EMU Flow</text>
          <text x="45" y="170" fill="#cbd5e1" font-size="8.2">Gravação H.264 &bull; Arquivos .EMU</text>
          <text x="45" y="185" fill="#94a3b8" font-size="7.8">FastMatching (1m) / Legado (15m)</text>
          <text x="45" y="198" fill="#cbd5e1" font-size="7.8">D:\\MediaDNA_V2\\Data\\emu</text>

          <rect x="35" y="220" width="190" height="70" rx="6" fill="#1e293b" stroke="#8b5cf6"/>
          <text x="45" y="240" fill="#c084fc" font-size="9.5" font-weight="700">Agente de Telemetria</text>
          <text x="45" y="255" fill="#cbd5e1" font-size="8.2">DNA.MonitorServiceSVC (v1.0.21.5)</text>
          <text x="45" y="270" fill="#94a3b8" font-size="7.8">CPU, RAM, Disco, Health, fma.log</text>
          <text x="45" y="282" fill="#38bdf8" font-size="7.5">Polling Reverso (Outbound Only)</text>

          <rect x="35" y="300" width="190" height="55" rx="6" fill="#1e293b" stroke="#f59e0b"/>
          <text x="45" y="320" fill="#fbbf24" font-size="9" font-weight="700">Serviços Windows</text>
          <text x="45" y="335" fill="#cbd5e1" font-size="7.8">DetectionSVC &bull; FastMatching &bull; Config</text>

          <!-- CONEXÕES PONTO A PONTO SEGURAS -->
          <line x1="225" y1="255" x2="310" y2="255" stroke="#38bdf8" stroke-width="2" stroke-dasharray="5,5"/>
          <polygon points="310,255 302,250 302,260" fill="#38bdf8"/>
          <text x="235" y="245" fill="#38bdf8" font-size="7.5" font-weight="700">TLS 1.3 Seguro</text>

          <!-- 2. CAMADA DE TRANSPORTE E NUVEM -->
          <rect x="310" y="120" width="160" height="260" rx="8" fill="#0f172a" stroke="#0284c7"/>
          <text x="320" y="145" fill="#38bdf8" font-size="9.5" font-weight="700">2. MENSAGERIA &amp; NUVEM</text>
          
          <rect x="320" y="160" width="140" height="90" rx="6" fill="url(#gradBlue)"/>
          <text x="330" y="182" fill="#ffffff" font-size="9.5" font-weight="800">Google Cloud</text>
          <text x="330" y="197" fill="#ffffff" font-size="9" font-weight="700">Firestore NoSQL</text>
          <text x="330" y="215" fill="#e0f2fe" font-size="7.8">&bull; fleet_commands</text>
          <text x="330" y="228" fill="#e0f2fe" font-size="7.8">&bull; telemetria_hosts</text>
          <text x="330" y="240" fill="#bae6fd" font-size="7.2">Zero Portas Abertas</text>

          <rect x="320" y="260" width="140" height="105" rx="6" fill="#1e293b" stroke="#38bdf8"/>
          <text x="330" y="280" fill="#38bdf8" font-size="9" font-weight="700">Zero Trust Tunnel</text>
          <text x="330" y="296" fill="#cbd5e1" font-size="7.8">Isolamento Cloudflare</text>
          <text x="330" y="312" fill="#94a3b8" font-size="7.8">Túnel Seguro Localhost</text>
          <text x="330" y="328" fill="#4ade80" font-size="7.8">&bull; Portas 8092 / 9000</text>
          <text x="330" y="342" fill="#94a3b8" font-size="7.2">Sem IP Público</text>

          <!-- LINHAS PARA OS COCKPITS -->
          <line x1="460" y1="205" x2="520" y2="110" stroke="#38bdf8" stroke-width="2"/>
          <polygon points="520,110 511,113 516,121" fill="#38bdf8"/>

          <line x1="460" y1="290" x2="520" y2="290" stroke="#c084fc" stroke-width="2"/>
          <polygon points="520,290 512,285 512,295" fill="#c084fc"/>

          <!-- 3. CENTRAIS DE PROCESSAMENTO -->
          <rect x="520" y="30" width="150" height="160" rx="8" fill="#1e293b" stroke="#0ea5e9"/>
          <text x="530" y="52" fill="#38bdf8" font-size="9.5" font-weight="800">Monitor_Servicos (NOC)</text>
          <text x="530" y="68" fill="#cbd5e1" font-size="7.8">FastAPI &bull; Cache Memory</text>
          <text x="530" y="84" fill="#94a3b8" font-size="7.2">&bull; Cockpit 248 Hosts LATAM</text>
          <text x="530" y="98" fill="#94a3b8" font-size="7.2">&bull; FastMatching &amp; fma.log Live</text>
          <text x="530" y="112" fill="#94a3b8" font-size="7.2">&bull; Matriz de Risco SLA &amp; RF</text>
          <text x="530" y="126" fill="#94a3b8" font-size="7.2">&bull; Fiscalização Técnica com IA</text>
          <text x="530" y="140" fill="#94a3b8" font-size="7.2">&bull; Orquestrador Firestore</text>
          <text x="530" y="162" fill="#4ade80" font-size="7.8" font-weight="700">Porta 8092 (Localhost)</text>

          <rect x="520" y="205" width="150" height="175" rx="8" fill="#1e293b" stroke="#a855f7"/>
          <text x="530" y="225" fill="#c084fc" font-size="9.5" font-weight="800">Monitor_Esportes</text>
          <text x="530" y="240" fill="#cbd5e1" font-size="7.8">Auditoria Esportiva &amp; Streaming</text>
          <text x="530" y="256" fill="#94a3b8" font-size="7.2">&bull; Brasileirão, Copa, NBA, CazéTV</text>
          <text x="530" y="270" fill="#94a3b8" font-size="7.2">&bull; Gemini Grounding (CBF/ge/ESPN)</text>
          <text x="530" y="284" fill="#94a3b8" font-size="7.2">&bull; Laudo Pericial PDF (Pág 2)</text>
          <text x="530" y="298" fill="#94a3b8" font-size="7.2">&bull; Programação Hoje/Amanhã</text>
          <text x="530" y="312" fill="#94a3b8" font-size="7.2">&bull; Webhooks Google Chat</text>
          <text x="530" y="326" fill="#94a3b8" font-size="7.2">&bull; Sincronização JSON Autônoma</text>
          <text x="530" y="358" fill="#fbbf24" font-size="7.8" font-weight="700">Audit Engine Ativo</text>

          <!-- CONEXÃO PARA O GOOGLE SITES -->
          <line x1="670" y1="105" x2="710" y2="170" stroke="#10b981" stroke-width="2"/>
          <line x1="670" y1="280" x2="710" y2="220" stroke="#10b981" stroke-width="2"/>
          <polygon points="710,195 702,190 702,200" fill="#10b981"/>

          <!-- 4. NOVO ENDEREÇO GOOGLE SITES -->
          <rect x="710" y="60" width="125" height="290" rx="8" fill="url(#gradGreen)"/>
          <text x="720" y="85" fill="#ffffff" font-size="9.5" font-weight="900">PORTAL OFICIAL</text>
          <text x="720" y="100" fill="#ffffff" font-size="9.5" font-weight="900">GOOGLE SITES</text>
          <text x="720" y="115" fill="#dcfce7" font-size="7.2">Novo Endereço Seguro</text>

          <rect x="718" y="125" width="108" height="34" rx="4" fill="#ffffff"/>
          <text x="724" y="140" fill="#065f46" font-size="7.2" font-weight="700">Google Workspace</text>
          <text x="724" y="151" fill="#047857" font-size="6.5">SSO Autenticado</text>

          <rect x="718" y="166" width="108" height="40" rx="4" fill="rgba(0,0,0,0.2)"/>
          <text x="724" y="180" fill="#ffffff" font-size="7.2" font-weight="700">Relatórios Esportes</text>
          <text x="724" y="191" fill="#e2e8f0" font-size="6.5">Abertura PDF Rápida</text>
          <text x="724" y="200" fill="#e2e8f0" font-size="6.5">YouTube / NBA / Futebol</text>

          <rect x="718" y="213" width="108" height="38" rx="4" fill="rgba(0,0,0,0.2)"/>
          <text x="724" y="227" fill="#ffffff" font-size="7.2" font-weight="700">Central RDP</text>
          <text x="724" y="238" fill="#e2e8f0" font-size="6.5">Pastas e Arquivos .RDP</text>
          <text x="724" y="247" fill="#e2e8f0" font-size="6.5">Zero SharePoint Link</text>

          <rect x="718" y="258" width="108" height="38" rx="4" fill="rgba(0,0,0,0.2)"/>
          <text x="724" y="272" fill="#ffffff" font-size="7.2" font-weight="700">Programação Eventos</text>
          <text x="724" y="283" fill="#e2e8f0" font-size="6.5">Destaque Hoje/Amanhã</text>
          <text x="724" y="292" fill="#e2e8f0" font-size="6.5">Remoção em Massa</text>

          <text x="722" y="325" fill="#f0fdf4" font-size="7.2" font-weight="700">&bull; 100% Autônomo</text>
        </svg>
      </div>

      <h2>2.1. Como os Dados Chegam ao Dashboard e ao Google Sites</h2>
      <ol>
        <li>
          <strong>Captura e Corte na Borda:</strong> O Atria Capture recebe o sinal digital ou satélite e grava simultaneamente o vídeo H.264 e o áudio em blocos <code>.EMU</code> em <code>D:\\MediaDNA_V2\\Data\\emu</code>.
        </li>
        <li>
          <strong>Detecção Local:</strong> O motor (FastMatching ou DetectionSVC) consome os arquivos EMU e correlaciona as impressões digitais acústicas contra o catálogo de spots comerciais SGG.
        </li>
        <li>
          <strong>Telemetria e Ingestão:</strong> O agente de monitoramento coleta em tempo real o uso de hardware, status de serviços, recência de arquivos e linhas do <code>fma.log</code>, enviando para a coleção <code>fleet_commands</code> do Firestore e disponibilizando para o backend do Dashboard.
        </li>
        <li>
          <strong>Auditoria Esportiva:</strong> O <code>Monitor_Esportes</code> monitora os feeds de streaming (YouTube, CazéTV, Prime Video), audita os jogos com IA (Gemini Grounding) e gera laudos periciais em PDF com 2 páginas.
        </li>
        <li>
          <strong>Publicação no Google Sites:</strong> O portal no novo endereço consome os arquivos mestres locais e planilhas, disponibilizando visualização instantânea de relatórios, eventos do dia e acesso RDP direto aos operadores.
        </li>
      </ol>
    </div>

    <div class="page-footer">
      <span>Kantar IBOPE Media &bull; Advertising Intelligence</span>
      <span>Página 3 de 5</span>
    </div>
  </div>

  <!-- PÁGINA 4: MONITOR_ESPORTES E ALIMENTAÇÃO DO NOVO GOOGLE SITES -->
  <div class="page">
    <div>
      <div class="page-header">
        <span class="header-title">3. Monitor_Esportes &amp; Alimentação do Google Sites</span>
        <span class="header-meta">Integração Esportiva e Acervo Autônomo</span>
      </div>

      <h1>3. A Relação com o Monitor_Esportes e o Portal Web</h1>
      <p>
        O projeto <strong>Monitor_Esportes</strong> desempenha o papel de esteira automatizada de fiscalização de mídia esportiva e streaming. Ele atua de forma complementar ao <strong>Monitor_Servicos</strong>, alimentando o novo portal oficial do Google Sites com três fluxos fundamentais:
      </p>

      <h2>3.1. Relatórios de Auditoria de Jogos (YouTube, NBA e Futebol)</h2>
      <p>
        Para cada partida monitorada (CazéTV, Prime Video, Premiere, canais abertos e NBA), o sistema audita o sinal de ponta a ponta e produz um relatório pericial:
      </p>
      <ul>
        <li><strong>Página 1 (Laudo Operacional):</strong> Dados da partida, emissora, tempo de transmissão, início/fim de vídeo, conformidade de áudio e evidências com frames capturados em alta definição.</li>
        <li><strong>Página 2 (Auditoria Oficial com Gemini Grounding):</strong> <u>Obrigatória</u>. Pesquisa automatizada em tempo real via inteligência artificial conectada à internet, cruzando súmulas oficiais da CBF, ge.globo, Lance! e ESPN, comprovando horários e eliminando relatórios inconclusivos.</li>
        <li><strong>Abertura no Portal:</strong> No novo Google Sites, os relatórios possuem abertura rápida com duplo clique em visualizador integrado, sem redirecionamentos externos.</li>
      </ul>

      <h2>3.2. Programação de Eventos e Gestão de Calendário</h2>
      <p>
        A aba de <strong>Programação de Eventos</strong> no portal é sincronizada diretamente:
      </p>
      <ul>
        <li><strong>Destaque Cronológico Inteligente:</strong> Eventos agendados para <strong>HOJE</strong> recebem destaque verde vibrante; eventos de <strong>AMANHÃ</strong> recebem destaque azul informativo; e eventos de dias anteriores são sinalizados em vermelho suave para arquivamento.</li>
        <li><strong>Ordenação por Recência:</strong> Os jogos e transmissões mais recentes aparecem no topo da fila de monitoramento, facilitando a tomada de decisão dos operadores de plantão.</li>
        <li><strong>Remoção em Massa com Checkbox:</strong> Implementação de seleção múltipla (Check-All e individual) para exclusão e arquivamento de eventos finalizados com 1 clique.</li>
      </ul>

      <h2>3.3. Centro de Gerenciamento de Acesso Remoto (RDP Autônomo)</h2>
      <div class="card-box card-box-primary">
        <strong>Biblioteca Autônoma de Arquivos .RDP:</strong>
        Anteriormente, o suporte técnico dependia de links para a pasta de <em>Acesso Remoto</em> no SharePoint, o que gerava falhas constantes de permissão e bloqueios corporativos.<br><br>
        <strong>Como funciona agora:</strong> O novo endereço do portal no Google Workspace mantém a árvore completa de pastas locais por cidade/praça, filtros rápidos por país (Brasil, Argentina, Chile, Colômbia, Peru) e tipo de nó (CS01, CS02, CS03, PayTV), permitindo baixar o arquivo <code>.rdp</code> pré-configurado ou disparar a conexão instantaneamente com 1 clique, sem qualquer dependência da Microsoft.
      </div>
    </div>

    <div class="page-footer">
      <span>Kantar IBOPE Media &bull; Advertising Intelligence</span>
      <span>Página 4 de 5</span>
    </div>
  </div>

  <!-- PÁGINA 5: ARQUITETURA DE SEGURANÇA E ZERO RISCO EXTERNO -->
  <div class="page">
    <div>
      <div class="page-header">
        <span class="header-title">4. Matriz de Segurança da Informação &amp; Governança</span>
        <span class="header-meta">Zero Risco Externo &bull; Isolamento Total</span>
      </div>

      <h1>4. Segurança da Informação Sem Riscos Externos</h1>
      <p>
        A segurança cibernética e a preservação do perímetro de rede corporativo da Kantar IBOPE Media foram os princípios norteadores de todo o desenvolvimento. A arquitetura foi validada para garantir <strong>risco externo zero</strong>:
      </p>

      <h2>4.1. Pilares Rígidos de Blindagem e Defesa em Profundidade</h2>

      <div class="card-box card-box-success">
        <strong style="color: #166534; font-size: 9.5pt;">🛡️ 1. Zero Portas Abertas na Internet (No Inbound Ports)</strong>
        <p style="margin-top: 2px; font-size: 8.5pt;">
          Os servidores locais e os mais de 240 Capture Sites distribuídos <strong>não possuem portas abertas</strong> em seus roteadores/firewalls (inbound connections bloqueadas por padrão). Toda a comunicação é feita através de <strong>Reverse Polling (Outbound Only)</strong>: os agentes locais consultam periodicamente a nuvem via TLS 1.3 autenticado. Nenhuma entidade externa consegue conectar-se diretamente às máquinas de borda.
        </p>
      </div>

      <div class="card-box card-box-primary">
        <strong style="color: #0369a1; font-size: 9.5pt;">🔒 2. Autenticação e Credenciais por Service Account de Mínimo Privilégio</strong>
        <p style="margin-top: 2px; font-size: 8.5pt;">
          A comunicação com o Google Cloud Firestore utiliza chaves privadas criptografadas (Service Accounts) restritas estritamente à leitura e escrita da coleção <code>fleet_commands</code>. Nenhuma permissão de administração da nuvem é delegada aos endpoints. As credenciais locais residem em diretórios protegidos por ACLs do Windows (SYSTEM/Administradores).
        </p>
      </div>

      <div class="card-box card-box-warning">
        <strong style="color: #92400e; font-size: 9.5pt;">🚫 3. Eliminação Total de Riscos do SharePoint Legado</strong>
        <p style="margin-top: 2px; font-size: 8.5pt;">
          O SharePoint legado apresentava sérios riscos: dependência de tokens da Microsoft Graph API sujeitos a <em>throttling</em> (HTTP 429), travamento por colisão de usuários e URLs públicas indevidas. O novo portal no Google Workspace opera com <strong>RBAC (Role-Based Access Control) nativo</strong> baseado na conta corporativa <code>@ibope.com</code>, com divisão estrita entre Administradores, Operadores e Leitores.
        </p>
      </div>

      <h2>4.2. Matriz de Controles de Segurança</h2>
      <table>
        <thead>
          <tr>
            <th>Vetor de Risco Potencial</th>
            <th>Mecanismo de Mitigação Implementado</th>
            <th>Nível de Risco Residual</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Varredura de Portas / Invasão WAN</td>
            <td>Bloqueio de Inbound + Cloudflare Zero Trust Tunnel</td>
            <td><span class="badge badge-green">NULO (Sem portas expostas)</span></td>
          </tr>
          <tr>
            <td>Interceptação de Dados em Trânsito</td>
            <td>Criptografia ponta a ponta TLS 1.2 / TLS 1.3 mandatória</td>
            <td><span class="badge badge-green">NULO (Cifrado militar)</span></td>
          </tr>
          <tr>
            <td>Vazamento de Comandos Remotos</td>
            <td>Assinatura digital de batch e auditoria estruturada por host</td>
            <td><span class="badge badge-green">MITIGADO (Auditoria 100%)</span></td>
          </tr>
          <tr>
            <td>Acesso Não Autorizado a Laudos</td>
            <td>Autenticação SSO Google Workspace (@ibope.com)</td>
            <td><span class="badge badge-green">CONTROLADO (IAM Corporativo)</span></td>
          </tr>
          <tr>
            <td>Indisponibilidade de Nuvem Externa</td>
            <td>Cache resiliente em memória RAM e contingência local autônoma</td>
            <td><span class="badge badge-blue">RESILIENTE (Air-Gap Ready)</span></td>
          </tr>
        </tbody>
      </table>

      <h2>5. Conclusão e Prontidão Operacional</h2>
      <p style="font-size: 8.5pt;">
        O ecossistema composto por <strong>Monitor_Servicos</strong>, <strong>Monitor_Esportes</strong> e o <strong>Portal Oficial no Google Sites</strong> encontra-se em estado <strong>100% Homologado e Operacional</strong>. Ele une alta velocidade de resposta, diagnóstico automatizado por Inteligência Artificial e a mais alta conformidade com as diretrizes globais de Segurança da Informação da Kantar.
      </p>
    </div>

    <div class="page-footer">
      <span>Kantar IBOPE Media &bull; Advertising Intelligence</span>
      <span>Página 5 de 5</span>
    </div>
  </div>

</body>
</html>
"""

async def generate_pdf():
    print(f"1. Gravando arquivo HTML temporário em: {HTML_PATH}")
    with open(HTML_PATH, "w", encoding="utf-8") as f:
        f.write(HTML_CONTENT)

    print("2. Iniciando motor Chromium headless via Playwright...")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        print(f"3. Renderizando documento: file:///{HTML_PATH}")
        await page.goto(f"file:///{HTML_PATH}", wait_until="networkidle")
        await page.wait_for_timeout(1000)

        print(f"4. Gerando PDF oficial em alta fidelidade: {PDF_PATH}")
        await page.pdf(
            path=str(PDF_PATH),
            format="A4",
            print_background=True,
            prefer_css_page_size=True,
            display_header_footer=False
        )

        await browser.close()
        print(f"5. SUCESSO! PDF gerado perfeitamente com {os.path.getsize(PDF_PATH)} bytes.")

if __name__ == "__main__":
    asyncio.run(generate_pdf())
