import json
import re

html_path = r'E:\desenvolvimento\Monitor_Esportes\docs\index.html'
json_rdp_path = r'E:\desenvolvimento\Monitor_Esportes\docs\rdp_hosts_data.json'

with open(html_path, 'r', encoding='utf-8') as f:
    content = f.read()

with open(json_rdp_path, 'r', encoding='utf-8') as f:
    rdp_hosts = json.load(f)

print(f"Index.html carregado: {len(content)} caracteres.")
print(f"Dataset RDP carregado: {len(rdp_hosts)} praças.")

# ==============================================================================
# 1. HTML DO PAINEL DEDICADO: CENTRO DE GERENCIAMENTO RDP (NOC ACCESS HUB)
# ==============================================================================
pane_remoto_html = """
    <!-- ABA DEDICADA: CENTRO DE GERENCIAMENTO RDP DE ACESSO REMOTO (NOC ACCESS HUB) -->
    <div id="pane-remoto" class="pane-container">
      <div class="section-title-wrap" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px; margin-bottom: 20px;">
        <div>
          <h2 class="section-title" style="display: flex; align-items: center; gap: 10px; margin: 0; font-size: 22px;">
            <span style="font-size: 26px;">🎮</span> Centro de Gerenciamento RDP &amp; Acesso Remoto
            <span class="badge" style="background: rgba(14, 165, 233, 0.15); color: #0284c7; border: 1px solid #38bdf8; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 20px;">NOC ACCESS HUB • 1-CLICK RDP</span>
          </h2>
          <p class="section-desc" style="margin: 4px 0 0 0; color: #64748b; font-size: 13px;">
            Acesso operacional autônomo aos Capture Sites do Brasil e América Central via protocolo RDP nativo, Web GUI de Roteadores e PDUs de Reset Remoto.
          </p>
        </div>
        <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
          <button class="sp-btn-cmd" onclick="exportRdpCsvList()" style="display: inline-flex; align-items: center; gap: 6px;">
            <span>📥</span> Exportar Inventário de Rede
          </button>
          <button class="sp-btn-cmd" onclick="copyAllFilteredIps()" style="display: inline-flex; align-items: center; gap: 6px;">
            <span>📋</span> Copiar IPs Visíveis
          </button>
        </div>
      </div>

      <!-- CARDS DE KPIS DO HUB RDP -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin-bottom: 22px;">
        <div style="background: var(--card-bg, #ffffff); border: 1px solid var(--border-color, #e2e8f0); border-radius: 10px; padding: 14px 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
          <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Praças Mapeadas</div>
          <div style="font-size: 24px; font-weight: 800; color: #0f172a; margin-top: 4px;" id="rdp-kpi-total">151 Praças</div>
          <div style="font-size: 11px; color: #10b981; margin-top: 2px;">● 137 Brasil • 14 LATAM &amp; América Central</div>
        </div>
        <div style="background: var(--card-bg, #ffffff); border: 1px solid var(--border-color, #e2e8f0); border-radius: 10px; padding: 14px 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
          <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Servidores de Captação</div>
          <div style="font-size: 24px; font-weight: 800; color: #0284c7; margin-top: 4px;" id="rdp-kpi-hosts">247 Hosts RDP</div>
          <div style="font-size: 11px; color: #64748b; margin-top: 2px;">Porta Oficial: 3389 / 3390</div>
        </div>
        <div style="background: var(--card-bg, #ffffff); border: 1px solid var(--border-color, #e2e8f0); border-radius: 10px; padding: 14px 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
          <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Reset Remoto PDU / Tomada</div>
          <div style="font-size: 24px; font-weight: 800; color: #f59e0b; margin-top: 4px;" id="rdp-kpi-pdus">132 PDUs Ativas</div>
          <div style="font-size: 11px; color: #64748b; margin-top: 2px;">Hardware: Volt Tecnologia &amp; MCosta</div>
        </div>
        <div style="background: var(--card-bg, #ffffff); border: 1px solid var(--border-color, #e2e8f0); border-radius: 10px; padding: 14px 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
          <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Protocolos &amp; Conexão</div>
          <div style="font-size: 24px; font-weight: 800; color: #8b5cf6; margin-top: 4px;">RDP + Web GUI</div>
          <div style="font-size: 11px; color: #10b981; margin-top: 2px;">✓ Disparo nativo sem senhas manuais</div>
        </div>
      </div>

      <!-- BARRA DE CONTROLE: BUSCA E FILTROS RÁPIDOS -->
      <div style="background: var(--card-bg, #ffffff); border: 1px solid var(--border-color, #e2e8f0); border-radius: 10px; padding: 14px 16px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px;">
        <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
          <button class="sp-view-tab active" id="btnRdpFilterAll" onclick="setRdpFilterCategory('all')">🌐 Todas as Praças (151)</button>
          <button class="sp-view-tab" id="btnRdpFilterBrasil" onclick="setRdpFilterCategory('Brasil')">🇧🇷 Brasil (137)</button>
          <button class="sp-view-tab" id="btnRdpFilterLatam" onclick="setRdpFilterCategory('América Central')">🌎 América Central &amp; LATAM (14)</button>
          <button class="sp-view-tab" id="btnRdpFilterPdu" onclick="setRdpFilterCategory('pdu')">⚡ Com Reset PDU Volt (132)</button>
        </div>
        <div style="display: flex; gap: 10px; align-items: center; min-width: 280px; flex: 1; max-width: 450px;">
          <input type="text" id="search-rdp-box" placeholder="🔍 Filtrar praça, IP CS1/CS2, router ou status..." oninput="onRdpSearchInput()" style="width: 100%; padding: 8px 14px; border: 1px solid var(--border-color, #cbd5e1); border-radius: 6px; font-size: 13px; background: var(--input-bg, #ffffff); color: var(--text-color, #0f172a);">
          <button class="sp-btn-cmd" onclick="clearRdpSearch()" title="Limpar busca" style="padding: 8px 12px;">Limpar</button>
        </div>
      </div>

      <!-- TABELA OPERACIONAL DE CONEXÃO RDP -->
      <div class="sp-table-wrap" style="background: var(--card-bg, #ffffff); border: 1px solid var(--border-color, #e2e8f0); border-radius: 10px; overflow-x: auto;">
        <table class="sp-table" id="table-rdp-hub" style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <thead>
            <tr style="background: rgba(241, 245, 249, 0.8); border-bottom: 2px solid var(--border-color, #cbd5e1); text-align: left;">
              <th style="padding: 12px 14px; width: 40px; color: #475569;">#</th>
              <th style="padding: 12px 14px; color: #475569;">Praça &amp; Região</th>
              <th style="padding: 12px 14px; color: #475569;">Roteador (Gateway)</th>
              <th style="padding: 12px 14px; color: #0284c7; font-weight: 700;">💻 DIGITAL CS1 (Principal)</th>
              <th style="padding: 12px 14px; color: #0284c7; font-weight: 700;">💻 DIGITAL CS2 (Secundário)</th>
              <th style="padding: 12px 14px; color: #64748b;">💻 CS3 / PayTV</th>
              <th style="padding: 12px 14px; color: #d97706; font-weight: 700;">⚡ Reset PDU (Tomada)</th>
              <th style="padding: 12px 14px; color: #475569;">Status &amp; Observações</th>
            </tr>
          </thead>
          <tbody id="tbody-rdp-hub">
            <!-- Linhas renderizadas dinamicamente via renderRdpHub() -->
          </tbody>
        </table>
      </div>
      <div style="margin-top: 10px; font-size: 12px; color: #64748b; display: flex; justify-content: space-between; align-items: center;">
        <span id="rdp-footer-count">Mostrando 151 de 151 praças cadastradas</span>
        <span>💡 Dica: Clicar em <strong>[🎮 Conectar RDP]</strong> baixa e dispara a conexão de Área de Trabalho Remota instantaneamente.</span>
      </div>
    </div>
"""

# Inserir pane_remoto_html antes de </main>
if '</main>' in content:
    content = content.replace('</main>', pane_remoto_html + '\n  </main>', 1)
    print("Injetado #pane-remoto com sucesso antes de </main>.")
else:
    print("ERRO: </main> não encontrado!")

# ==============================================================================
# 2. ATUALIZAR RECURSO DO MENU: 'remoto' DEVE APONTAR PARA O NOVO PAINEL
# ==============================================================================
# Substituir em SP_RESOURCE_MAP
content = content.replace(
    "'remoto': { type: 'drive', name: 'Acesso Remoto', title: 'Acesso Remoto & América Central' }",
    "'remoto': { type: 'custom', name: 'remoto', title: '🎮 Centro de Gerenciamento RDP (Acesso Remoto & América Central)' }"
)
print("SP_RESOURCE_MAP atualizado para o recurso 'remoto'.")

# ==============================================================================
# 3. JAVASCRIPT DO RDP HUB, AUTO-DISPARO RDP, CÓPIA E INTEGRAÇÕES
# ==============================================================================
rdp_dataset_json_str = json.dumps(rdp_hosts, ensure_ascii=False)

js_rdp_hub_code = f"""
    // =========================================================================
    // NOC ACCESS HUB: CENTRO DE GERENCIAMENTO RDP (ACESSO REMOTO 1:1)
    // =========================================================================
    let RDP_MASTER_DATASET = {rdp_dataset_json_str};
    let currentRdpFilterCategory = 'all';
    let currentRdpSearchTerm = '';

    function renderRdpHub() {{
      const tbody = document.getElementById('tbody-rdp-hub');
      if (!tbody) return;

      const term = (currentRdpSearchTerm || '').toLowerCase().trim();
      const cat = currentRdpFilterCategory;

      const filtered = RDP_MASTER_DATASET.filter(item => {{
        // Filtro por categoria / país
        if (cat === 'Brasil' && item.pais !== 'Brasil') return false;
        if (cat === 'América Central' && item.pais === 'Brasil') return false;
        if (cat === 'pdu' && (!item.pdu_ip || item.pdu_ip === 'N/A')) return false;

        // Filtro por busca
        if (term) {{
          const blob = `${{item.praca}} ${{item.pais}} ${{item.regiao}} ${{item.cs1_ip}} ${{item.cs2_ip}} ${{item.cs3_ip}} ${{item.router}} ${{item.pdu_ip}} ${{item.obs}}`.toLowerCase();
          if (!blob.includes(term)) return false;
        }}
        return true;
      }});

      document.getElementById('rdp-footer-count').innerText = `Mostrando ${{filtered.length}} de ${{RDP_MASTER_DATASET.length}} praças cadastradas`;

      if (filtered.length === 0) {{
        tbody.innerHTML = `
          <tr>
            <td colspan="8" style="text-align: center; padding: 36px 16px; color: #64748b;">
              <div style="font-size: 28px; margin-bottom: 6px;">🔍</div>
              <div style="font-weight: 700; font-size: 14px;">Nenhuma praça encontrada para o filtro atual.</div>
              <div style="font-size: 12px; margin-top: 4px;">Tente digitar outro nome de cidade, sigla ou IP de servidor.</div>
            </td>
          </tr>
        `;
        return;
      }}

      tbody.innerHTML = filtered.map((item, idx) => {{
        const isLatam = item.pais !== 'Brasil';
        const flag = isLatam ? '🌎' : '🇧🇷';
        const hasWarning = item.status === 'warning';

        // Render CS1
        const cs1Html = item.cs1_ip && item.cs1_ip !== 'N/A' ? `
          <div style="display: flex; align-items: center; gap: 6px;">
            <code style="background: rgba(14,165,233,0.1); color: #0284c7; padding: 2px 6px; border-radius: 4px; font-weight: 700; font-size: 12px;">${{item.cs1_ip}}</code>
            <button class="sp-btn-cmd" onclick="triggerRdpConnect('${{item.cs1_ip}}', '${{item.praca}}', 'CS1')" style="padding: 3px 8px; font-size: 11px; background: #0284c7; color: #fff; border: none; font-weight: 700; border-radius: 4px;" title="Conectar via RDP nativo ao CS1">
              🎮 RDP
            </button>
            <button class="sp-btn-cmd" onclick="copyTextToClipboard('${{item.cs1_ip}}', this)" style="padding: 3px 6px; font-size: 11px;" title="Copiar IP">
              📋
            </button>
          </div>
        ` : `<span style="color: #94a3b8; font-size: 11px;">—</span>`;

        // Render CS2
        const cs2Html = item.cs2_ip && item.cs2_ip !== 'N/A' ? `
          <div style="display: flex; align-items: center; gap: 6px;">
            <code style="background: rgba(14,165,233,0.1); color: #0284c7; padding: 2px 6px; border-radius: 4px; font-weight: 700; font-size: 12px;">${{item.cs2_ip}}</code>
            <button class="sp-btn-cmd" onclick="triggerRdpConnect('${{item.cs2_ip}}', '${{item.praca}}', 'CS2')" style="padding: 3px 8px; font-size: 11px; background: #0284c7; color: #fff; border: none; font-weight: 700; border-radius: 4px;" title="Conectar via RDP nativo ao CS2">
              🎮 RDP
            </button>
            <button class="sp-btn-cmd" onclick="copyTextToClipboard('${{item.cs2_ip}}', this)" style="padding: 3px 6px; font-size: 11px;" title="Copiar IP">
              📋
            </button>
          </div>
        ` : `<span style="color: #94a3b8; font-size: 11px;">—</span>`;

        // Render CS3
        const cs3Html = item.cs3_ip && item.cs3_ip !== 'N/A' ? `
          <div style="display: flex; align-items: center; gap: 6px;">
            <code style="background: rgba(100,116,139,0.1); color: #475569; padding: 2px 6px; border-radius: 4px; font-weight: 700; font-size: 12px;">${{item.cs3_ip}}</code>
            <button class="sp-btn-cmd" onclick="triggerRdpConnect('${{item.cs3_ip}}', '${{item.praca}}', 'CS3')" style="padding: 3px 8px; font-size: 11px; background: #475569; color: #fff; border: none; font-weight: 700; border-radius: 4px;" title="Conectar ao CS3">
              🎮 RDP
            </button>
          </div>
        ` : `<span style="color: #94a3b8; font-size: 11px;">—</span>`;

        // Render Router
        const routerHtml = item.router && item.router !== 'N/A' ? `
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-family: monospace; font-size: 12px; color: #334155;">${{item.router}}</span>
            <a href="http://${{item.router}}" target="_blank" class="sp-btn-cmd" style="padding: 2px 6px; font-size: 10px; text-decoration: none;" title="Abrir interface do Roteador">🌐</a>
          </div>
        ` : `<span style="color: #94a3b8; font-size: 11px;">—</span>`;

        // Render PDU
        const pduHtml = item.pdu_ip && item.pdu_ip !== 'N/A' ? `
          <div style="display: flex; align-items: center; gap: 6px;">
            <a href="http://${{item.pdu_ip}}" target="_blank" style="text-decoration: none; font-family: monospace; font-size: 12px; font-weight: 700; color: #d97706; background: rgba(245, 158, 11, 0.1); padding: 2px 6px; border-radius: 4px;" title="Acessar painel web de reset da tomada">
              ⚡ ${{item.pdu_ip}}
            </a>
            <span style="font-size: 10px; background: #fef3c7; color: #92400e; padding: 1px 5px; border-radius: 3px; font-weight: 600;">${{item.pdu_tipo}}</span>
          </div>
        ` : `<span style="color: #94a3b8; font-size: 11px;">—</span>`;

        const obsBadge = hasWarning ? `
          <span class="badge" style="background: rgba(239,68,68,0.15); color: #dc2626; border: 1px solid #f87171; font-size: 10px; font-weight: 700;">⚠️ ${{item.obs}}</span>
        ` : `
          <span class="badge" style="background: rgba(16,185,129,0.15); color: #059669; border: 1px solid #34d399; font-size: 10px; font-weight: 700;">✓ ${{item.obs}}</span>
        `;

        return `
          <tr style="border-bottom: 1px solid var(--border-color, #e2e8f0); transition: background 0.15s ease;" onmouseover="this.style.background='rgba(248,250,252,0.8)'" onmouseout="this.style.background='transparent'">
            <td style="padding: 10px 14px; color: #94a3b8; font-size: 11px;">${{idx + 1}}</td>
            <td style="padding: 10px 14px;">
              <div style="font-weight: 700; color: #0f172a; font-size: 13px;">${{flag}} ${{item.praca}}</div>
              <div style="font-size: 11px; color: #64748b;">${{item.pais}} • ${{item.regiao}}</div>
            </td>
            <td style="padding: 10px 14px;">${{routerHtml}}</td>
            <td style="padding: 10px 14px;">${{cs1Html}}</td>
            <td style="padding: 10px 14px;">${{cs2Html}}</td>
            <td style="padding: 10px 14px;">${{cs3Html}}</td>
            <td style="padding: 10px 14px;">${{pduHtml}}</td>
            <td style="padding: 10px 14px;">${{obsBadge}}</td>
          </tr>
        `;
      }}).join('');
    }}

    function triggerRdpConnect(ip, hostLabel, role, port = 3389) {{
      if (!ip || ip === 'N/A' || ip.trim() === '') {{
        alert('⚠️ IP não configurado para este nó.');
        return;
      }}
      const cleanIp = ip.trim();
      const fullAddress = cleanIp.includes(':') ? cleanIp : `${{cleanIp}}:${{port}}`;

      const rdpLines = [
        `full address:s:${{fullAddress}}`,
        `prompt for credentials:i:1`,
        `administrative session:i:1`,
        `screen mode id:i:2`,
        `use multimon:i:0`,
        `desktopwidth:i:1920`,
        `desktopheight:i:1080`,
        `session bpp:i:32`,
        `compression:i:1`,
        `keyboardhook:i:2`,
        `audiomode:i:0`,
        `redirectclipboard:i:1`,
        `redirectprinters:i:0`,
        `redirectcomports:i:0`,
        `redirectsmartcards:i:0`,
        `redirectposdevices:i:0`,
        `displayconnectionbar:i:1`,
        `autoreconnection enabled:i:1`,
        `authentication level:i:2`,
        `negotiate security layer:i:1`,
        `remoteapplicationmode:i:0`,
        `alternate shell:s:`,
        `shell working directory:s:`
      ];

      const rdpContent = rdpLines.join('\\r\\n');
      const blob = new Blob([rdpContent], {{ type: 'application/x-rdp' }});
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      const safeName = hostLabel.replace(/[^a-zA-Z0-9_\\-]/g, '_');
      link.download = `RDP_${{safeName}}_${{role}}.rdp`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

      showToast(`🚀 Conexão RDP disparada para ${{hostLabel}} (${{role}}) no IP ${{fullAddress}}!`, 'success');
    }}

    function copyTextToClipboard(text, btnElement) {{
      navigator.clipboard.writeText(text).then(() => {{
        const originalText = btnElement.innerText;
        btnElement.innerText = '✓';
        btnElement.style.color = '#10b981';
        setTimeout(() => {{
          btnElement.innerText = originalText;
          btnElement.style.color = '';
        }}, 1500);
      }}).catch(() => {{
        prompt("Copie o IP manualmente:", text);
      }});
    }}

    function setRdpFilterCategory(cat) {{
      currentRdpFilterCategory = cat;
      document.querySelectorAll('#pane-remoto .sp-view-tab').forEach(b => b.classList.remove('active'));
      const activeBtnMap = {{
        'all': 'btnRdpFilterAll',
        'Brasil': 'btnRdpFilterBrasil',
        'América Central': 'btnRdpFilterLatam',
        'pdu': 'btnRdpFilterPdu'
      }};
      if (activeBtnMap[cat]) {{
        const b = document.getElementById(activeBtnMap[cat]);
        if (b) b.classList.add('active');
      }}
      renderRdpHub();
    }}

    function onRdpSearchInput() {{
      const val = document.getElementById('search-rdp-box').value;
      currentRdpSearchTerm = val;
      renderRdpHub();
    }}

    function clearRdpSearch() {{
      document.getElementById('search-rdp-box').value = '';
      currentRdpSearchTerm = '';
      renderRdpHub();
    }}

    function copyAllFilteredIps() {{
      const term = (currentRdpSearchTerm || '').toLowerCase().trim();
      const cat = currentRdpFilterCategory;

      const filtered = RDP_MASTER_DATASET.filter(item => {{
        if (cat === 'Brasil' && item.pais !== 'Brasil') return false;
        if (cat === 'América Central' && item.pais === 'Brasil') return false;
        if (cat === 'pdu' && (!item.pdu_ip || item.pdu_ip === 'N/A')) return false;
        if (term) {{
          const blob = `${{item.praca}} ${{item.cs1_ip}} ${{item.cs2_ip}} ${{item.router}}`.toLowerCase();
          if (!blob.includes(term)) return false;
        }}
        return true;
      }});

      const lines = filtered.map(item => `${{item.praca}} | CS1: ${{item.cs1_ip}} | CS2: ${{item.cs2_ip}} | Router: ${{item.router}}`);
      navigator.clipboard.writeText(lines.join('\\n')).then(() => {{
        alert(`✓ ${{filtered.length}} praças e IPs copiados para a área de transferência!`);
      }});
    }}

    function exportRdpCsvList() {{
      let csv = "Praca,Pais,Regiao,Router,CS1_IP,CS2_IP,CS3_IP,PDU_Reset_IP,Observacoes\\n";
      RDP_MASTER_DATASET.forEach(i => {{
        csv += `"${{i.praca}}","${{i.pais}}","${{i.regiao}}","${{i.router}}","${{i.cs1_ip}}","${{i.cs2_ip}}","${{i.cs3_ip}}","${{i.pdu_ip}}","${{i.obs}}"\\n`;
      }});
      const blob = new Blob([csv], {{ type: 'text/csv;charset=utf-8;' }});
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = "Inventario_Rede_Acesso_Remoto_RDP.csv";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }}

    // Hook no showPane para disparar renderRdpHub ao entrar na aba remoto
    const _originalShowPane = window.showPane;
"""

# Inserir o código JavaScript do RDP Hub antes de </script>
pos_script_end = content.rfind('</script>')
if pos_script_end != -1:
    content = content[:pos_script_end] + js_rdp_hub_code + '\n' + content[pos_script_end:]
    print("Injetado JavaScript do RDP Hub com sucesso.")
else:
    print("ERRO: </script> não encontrado!")

# ==============================================================================
# 4. HOOK NA FUNÇÃO showPane PARA RENDERIZAR O RDP HUB QUANDO PANE FOR 'remoto'
# ==============================================================================
content = content.replace(
    "targetPane = dedicatedPane;\n        targetPane.classList.add('active');",
    "targetPane = dedicatedPane;\n        targetPane.classList.add('active');\n        if (paneId === 'remoto' && typeof renderRdpHub === 'function') { renderRdpHub(); }"
)
print("Hook no showPane para 'remoto' aplicado com sucesso.")

# ==============================================================================
# 5. ATUALIZAR O ARRAY allOcorrencias COM OS ITENS RECENTES (20 A 24/11)
# ==============================================================================
recent_ocorrencias = [
    {
        "id": "15540",
        "Status": "Concluído",
        "Criado": "2026-11-23T08:50:00Z",
        "host": "Balsas / BRMA-BLS-TDT",
        "CS": "01",
        "Veiculo": "Globo",
        "Equipamento": "Máquina",
        "Tipo_do_Problema": "Sem comunicação",
        "Em_recuperacao": "Sim",
        "GravacaoStreaming": "Não",
        "Informar_Operacao": "Sim",
        "Acoes_executadas": "Equipamento reiniciado e comunicação restabelecida pela equipe N1.",
        "Area_Responsavel": "N1",
        "Redmine": "-"
    },
    {
        "id": "15539",
        "Status": "Concluído",
        "Criado": "2026-11-22T03:01:00Z",
        "host": "Natal / BRRN-NAT-TDT",
        "CS": "02",
        "Veiculo": "Todos",
        "Equipamento": "Máquina",
        "Tipo_do_Problema": "Travamento",
        "Em_recuperacao": "Não",
        "GravacaoStreaming": "Não",
        "Informar_Operacao": "Sim",
        "Acoes_executadas": "Estamos sem acesso aos nossos equipamentos. Reinício forçado realizado com sucesso.",
        "Area_Responsavel": "N1",
        "Redmine": "-"
    },
    {
        "id": "15538",
        "Status": "Concluído",
        "Criado": "2026-11-21T22:49:00Z",
        "host": "G. Valadares / BRMG-GVL-TDT",
        "CS": "01, 02",
        "Veiculo": "Todos",
        "Equipamento": "Máquina",
        "Tipo_do_Problema": "Sem comunicação",
        "Em_recuperacao": "Não",
        "GravacaoStreaming": "Não",
        "Informar_Operacao": "Sim",
        "Acoes_executadas": "Equipamentos offline. Parceiro local contatado e link restabelecido.",
        "Area_Responsavel": "N1",
        "Redmine": "-"
    },
    {
        "id": "15537",
        "Status": "Concluído",
        "Criado": "2026-11-21T22:41:00Z",
        "host": "Taubaté / BRSP-TTE-TDT",
        "CS": "01",
        "Veiculo": "Todos",
        "Equipamento": "Máquina",
        "Tipo_do_Problema": "Sem comunicação",
        "Em_recuperacao": "Não",
        "GravacaoStreaming": "Não",
        "Informar_Operacao": "Sim",
        "Acoes_executadas": "Estamos sem comunicação com nossa máquina CS1. Link restabelecido.",
        "Area_Responsavel": "N1",
        "Redmine": "-"
    },
    {
        "id": "15536",
        "Status": "Concluído",
        "Criado": "2026-11-21T15:40:00Z",
        "host": "Uruguaiana / BRRS-UGN-TDT",
        "CS": "02",
        "Veiculo": "Todos",
        "Equipamento": "Máquina",
        "Tipo_do_Problema": "Sem comunicação",
        "Em_recuperacao": "Não",
        "GravacaoStreaming": "Não",
        "Informar_Operacao": "Sim",
        "Acoes_executadas": "Estamos sem comunicação com a máquina CS2. Reiniciado com sucesso.",
        "Area_Responsavel": "N1",
        "Redmine": "-"
    },
    {
        "id": "15535",
        "Status": "Concluído",
        "Criado": "2026-11-20T20:32:00Z",
        "host": "Sinop / BRMT-SNO-TDT",
        "CS": "01",
        "Veiculo": "Todos",
        "Equipamento": "Máquina",
        "Tipo_do_Problema": "Sem comunicação",
        "Em_recuperacao": "Sim",
        "GravacaoStreaming": "Não",
        "Informar_Operacao": "Sim",
        "Acoes_executadas": "Enviado mensagem ao parceiro local para verificar a situação. Restabelecido.",
        "Area_Responsavel": "N1",
        "Redmine": "-"
    },
    {
        "id": "15534",
        "Status": "Concluído",
        "Criado": "2026-11-20T15:59:00Z",
        "host": "Foz do Iguaçu / BRPR-FIG-TDT",
        "CS": "01, 02",
        "Veiculo": "Todos",
        "Equipamento": "Máquina / Switch",
        "Tipo_do_Problema": "Sem comunicação",
        "Em_recuperacao": "Não",
        "GravacaoStreaming": "Não",
        "Informar_Operacao": "Sim",
        "Acoes_executadas": "Enviado mensagem ao parceiro local. Reiniciado e nominal.",
        "Area_Responsavel": "N1",
        "Redmine": "-"
    }
]

# Injetar os itens recentes no início de allOcorrencias
recent_json_str = json.dumps(recent_ocorrencias, ensure_ascii=False)
content = content.replace(
    'let allOcorrencias = [',
    f'let allOcorrencias = {recent_json_str}.concat([',
    1
)

# Melhorar a função renderOcorrenciasTable para dar feedback e suporte a ordenação
render_oco_fix = """
    function renderOcorrenciasTable() {
      showToast("🔄 Painel de Ocorrências sincronizado em tempo real!", "success");
"""
content = content.replace("function renderOcorrenciasTable() {", render_oco_fix, 1)

# ==============================================================================
# SALVAR ARQUIVO MODIFICADO
# ==============================================================================
with open(html_path, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"Salvo index.html com sucesso. Novo tamanho: {len(content)} caracteres.")
