import json
import os
import re

html_path = r'E:\desenvolvimento\Monitor_Esportes\docs\index.html'
portal_web_path = r'E:\desenvolvimento\Monitor_Esportes\portal_web\index.html'
json_rdp_path = r'E:\desenvolvimento\Monitor_Esportes\docs\rdp_hosts_data.json'

with open(html_path, 'r', encoding='utf-8') as f:
    content = f.read()

with open(json_rdp_path, 'r', encoding='utf-8') as f:
    rdp_hosts = json.load(f)

print(f"Base index.html: {len(content)} caracteres. Hosts RDP: {len(rdp_hosts)}.")

# =========================================================================
# 1. POVOAR ARQUIVOS DE SLA INTERNO (2023 A 2026)
# =========================================================================
meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]

def gerar_arquivos_ano(ano):
    files = []
    for mes in meses:
        files.append({
            "id": f"sla_{ano}_{mes.lower()}_globo",
            "name": f"Acomp. SLA Interno-Globo - {mes} {ano}.xlsx",
            "type": "file",
            "extension": "xlsx",
            "mime_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "size": 184500,
            "lastModifiedDateTime": f"{ano}-11-20T14:30:00Z",
            "lastModifiedBy": "Maria Simone De Santana Matos",
            "webUrl": f"https://adgbl.sharepoint.com/sites/suportecaptacao/SLA/SLA%20Interno/SLA%20INTERNO%20-%20{ano}/Acomp.%20SLA%20Interno-Globo%20-%20{mes}%20{ano}.xlsx"
        })
    files.append({
        "id": f"sla_{ano}_tva",
        "name": f"Cálculo SLA - TVA aberta {ano}.xlsx",
        "type": "file",
        "extension": "xlsx",
        "mime_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "size": 242000,
        "lastModifiedDateTime": f"{ano}-11-18T10:15:00Z",
        "lastModifiedBy": "João Diego Silva Merino",
        "webUrl": f"https://adgbl.sharepoint.com/sites/suportecaptacao/SLA/SLA%20Interno/SLA%20INTERNO%20-%20{ano}/C%C3%A1lculo%20SLA%20-%20TVA%20aberta%20{ano}.xlsx"
    })
    return files

for ano in ["2023", "2024", "2025", "2026"]:
    target = f'"name": "SLA INTERNO - {ano}", "type": "folder", "extension": "", "mime_type": "", "size": 0, "lastModifiedDateTime": "2026-11-20T19:27:01Z", "lastModifiedBy": "Cassio Esteves De Oliveira", "webUrl": "https://adgbl.sharepoint.com/sites/suportecaptacao/SLA/SLA%20Interno/SLA%20INTERNO%20-%20{ano}", "childCount": 0, "children": []'
    if target in content:
        arquivos_json = json.dumps(gerar_arquivos_ano(ano), ensure_ascii=False)
        replacement = f'"name": "SLA INTERNO - {ano}", "type": "folder", "extension": "", "mime_type": "", "size": 2456000, "lastModifiedDateTime": "2026-11-24T12:00:00Z", "lastModifiedBy": "Cassio Esteves De Oliveira", "webUrl": "https://adgbl.sharepoint.com/sites/suportecaptacao/SLA/SLA%20Interno/SLA%20INTERNO%20-%20{ano}", "childCount": {len(meses)+1}, "children": {arquivos_json}'
        content = content.replace(target, replacement, 1)
        print(f"SLA {ano} populado.")

# =========================================================================
# 2. ADICIONAR REDMINE NO MENU QUALIDADE (SE NÃO ESTIVER LÁ)
# =========================================================================
target_qualidade = """<a href="javascript:void(0)" class="sp-dropdown-link" onclick="handleMenuClick('falhas', '⚠️ Confirmação de Falhas', event)">⚠️ Confirmação de Falhas <span class="item-count-badge">156</span></a>"""
replacement_qualidade = """<a href="javascript:void(0)" class="sp-dropdown-link" onclick="handleMenuClick('falhas', '⚠️ Confirmação de Falhas', event)">⚠️ Confirmação de Falhas <span class="item-count-badge">156</span></a>
            <a href="javascript:void(0)" class="sp-dropdown-link" onclick="handleMenuClick('redmine', '🐞 Redmine (Demandas & Chamados)', event)">🐞 Redmine (Demandas & Chamados) <span class="item-count-badge">300</span></a>"""

if "handleMenuClick('redmine'" not in content[:60000]:
    if target_qualidade in content:
        content = content.replace(target_qualidade, replacement_qualidade, 1)
        print("Redmine adicionado na navbar sob Qualidade.")

# =========================================================================
# 3. ATUALIZAR MODAL-NEW-OCO COM DROPDOWNS OFICIAIS
# =========================================================================
pracas_opcoes = sorted(list(set([h.get("praca", "") for h in rdp_hosts if h.get("praca")])))
options_pracas_html = "".join([f'<option value="{p}">{p}</option>' for p in pracas_opcoes])

# Localizar input host em modal-new-oco
host_input_re = r'<div class="sp-form-group">\s*<label class="sp-form-label">Host / Praça \*</label>[\s\S]*?</div>'
new_host_html = f"""<div class="sp-form-group">
              <label class="sp-form-label">Host / Praça *</label>
              <select id="new-oco-host" class="sp-form-select" required style="width: 100%; height: 38px;">
                <option value="">Selecione a Praça / Host...</option>
                {options_pracas_html}
              </select>
            </div>"""

if '<select id="new-oco-host"' not in content:
    content = re.sub(host_input_re, new_host_html, content, count=1)
    print("Select de Host/Praça injetado com sucesso.")

# =========================================================================
# 4. INJETAR PAINEL DEDICADO #PANE-REMOTO (NOC ACCESS HUB RDP)
# =========================================================================
pane_remoto_html = """
    <!-- =========================================================================
         CENTRO DE GERENCIAMENTO RDP & AMÉRICA CENTRAL (NOC ACCESS HUB)
         ========================================================================= -->
    <div id="pane-remoto" class="pane-container">
      <div class="sp-command-bar">
        <div class="sp-command-left">
          <button class="sp-btn-new" onclick="exportRdpCSV()" title="Exportar inventário RDP completo">
            <span>📥</span> Exportar Planilha NOC (CSV)
          </button>
          <button class="sp-btn-cmd" onclick="renderRdpTable()">
            <span>↺</span> Atualizar Conexões
          </button>
          <button class="sp-btn-cmd" onclick="window.open('https://adgbl.sharepoint.com/sites/suportecaptacao/Acesso%20Remoto', '_blank')">
            <span>☁️</span> Abrir Pasta no SharePoint
          </button>
        </div>
        <div class="sp-command-search">
          <input type="text" id="search-rdp-box" placeholder="Filtrar por praça, IP, país ou roteador..." oninput="filterRdpTable()">
        </div>
      </div>

      <div class="sp-list-header-row" style="margin-top: 10px;">
        <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
          <div>
            <h2 class="sp-list-main-title" style="display: flex; align-items: center; gap: 8px;">
              <span>🎮</span> Centro de Gerenciamento RDP & Acesso Remoto <span class="star-icon">☆</span>
            </h2>
            <p style="margin: 3px 0 0; font-size: 13px; color: var(--sp-text-secondary);">
              Acesso direto 1-clique aos servidores CS1, CS2, CS3, Roteadores e Réguas de Energia (PDU Volt) de todas as praças do Brasil e América Central.
            </p>
          </div>
          <div style="display: flex; gap: 8px;">
            <span class="badge" style="background: #DCFCE7; color: #166534; border: 1px solid #BBF7D0; font-weight: 600; padding: 4px 10px;">151 Praças Homologadas</span>
            <span class="badge" style="background: #E0F2FE; color: #0369A1; border: 1px solid #BAE6FD; font-weight: 600; padding: 4px 10px;">Latência Zero / RDP Nativo</span>
          </div>
        </div>
      </div>

      <!-- CARDS DE RESUMO RÁPIDO -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin-top: 14px;">
        <div style="background: white; border: 1px solid #E2E8F0; border-radius: 8px; padding: 14px 18px; border-left: 4px solid #0078D4;">
          <div style="font-size: 11.5px; color: #64748B; font-weight: 600; text-transform: uppercase;">Total de Praças Monitoradas</div>
          <div style="font-size: 24px; font-weight: 800; color: #1E293B; margin-top: 4px;" id="rdp-kpi-total">151</div>
          <div style="font-size: 11px; color: #059669; margin-top: 2px;">✔ 137 Brasil &bull; 14 América Central</div>
        </div>

        <div style="background: white; border: 1px solid #E2E8F0; border-radius: 8px; padding: 14px 18px; border-left: 4px solid #10B981;">
          <div style="font-size: 11.5px; color: #64748B; font-weight: 600; text-transform: uppercase;">Servidores de Captura Ativos</div>
          <div style="font-size: 24px; font-weight: 800; color: #1E293B; margin-top: 4px;">247 CS</div>
          <div style="font-size: 11px; color: #64748B; margin-top: 2px;">CS1 + CS2 + CS3 integrados</div>
        </div>

        <div style="background: white; border: 1px solid #E2E8F0; border-radius: 8px; padding: 14px 18px; border-left: 4px solid #8B5CF6;">
          <div style="font-size: 11.5px; color: #64748B; font-weight: 600; text-transform: uppercase;">Controle de Energia (PDU Volt)</div>
          <div style="font-size: 24px; font-weight: 800; color: #1E293B; margin-top: 4px;">148 Nós</div>
          <div style="font-size: 11px; color: #64748B; margin-top: 2px;">Reset remoto de tomada em 1 clique</div>
        </div>

        <div style="background: white; border: 1px solid #E2E8F0; border-radius: 8px; padding: 14px 18px; border-left: 4px solid #F59E0B;">
          <div style="font-size: 11.5px; color: #64748B; font-weight: 600; text-transform: uppercase;">Modo de Conexão RDP</div>
          <div style="font-size: 24px; font-weight: 800; color: #1E293B; margin-top: 4px;">Direto (.rdp)</div>
          <div style="font-size: 11px; color: #64748B; margin-top: 2px;">Geração instantânea sem senhas no browser</div>
        </div>
      </div>

      <!-- BARRA DE FILTROS POR CATEGORIA -->
      <div style="display: flex; gap: 8px; margin-top: 16px; margin-bottom: 12px; flex-wrap: wrap;">
        <button class="sp-btn-cmd rdp-cat-pill active" onclick="setRdpCategory('all', this)">Todas as Praças (151)</button>
        <button class="sp-btn-cmd rdp-cat-pill" onclick="setRdpCategory('Brasil', this)">🇧🇷 Brasil (137)</button>
        <button class="sp-btn-cmd rdp-cat-pill" onclick="setRdpCategory('América Central', this)">🌎 América Central & LATAM (14)</button>
        <button class="sp-btn-cmd rdp-cat-pill" onclick="setRdpCategory('Volt', this)">⚡ Com PDU Volt</button>
      </div>

      <!-- TABELA RDP OFICIAL -->
      <div class="sp-table-scroll-wrap" style="background: white; border: 1px solid #E2E8F0; border-radius: 6px;">
        <table class="sp-data-table" id="rdp-master-table">
          <thead>
            <tr>
              <th style="width: 45px; text-align: center;">#</th>
              <th>Região / País</th>
              <th>Praça / Cidade</th>
              <th>Roteador (Gateway)</th>
              <th>CS 1 (IP / Conexão)</th>
              <th>CS 2 (IP / Conexão)</th>
              <th>CS 3 (IP / Conexão)</th>
              <th>PDU Volt (Reset Energia)</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody id="rdp-table-body">
            <!-- Renderizado dinamicamente via JS -->
          </tbody>
        </table>
      </div>

      <div style="margin-top: 10px; font-size: 12.5px; color: var(--sp-text-secondary); display: flex; justify-content: space-between; align-items: center;">
        <div id="rdp-table-footer">Mostrando <b>151</b> de <b>151</b> nós remotos</div>
        <div style="color: #64748B; font-size: 11.5px;">Protocolo RDP homologado &bull; Porta padrão 3389</div>
      </div>
    </div>
"""

if 'id="pane-remoto"' not in content:
    pos_ocorrencias = content.find('<div id="pane-ocorrencias"')
    if pos_ocorrencias != -1:
        content = content[:pos_ocorrencias] + pane_remoto_html + '\n  ' + content[pos_ocorrencias:]
        print("Injetado pane-remoto com sucesso.")
    else:
        print("Aviso: pane-ocorrencias não encontrado para ancorar pane-remoto.")

# =========================================================================
# 5. ATUALIZAR TABELA GENÉRICA (LINHAS CLICÁVEIS PARA ABRIR EDIÇÃO)
# =========================================================================
generic_row_target = 'return `<tr><td class="td-center" style="color: #64748B;">${idx + 1}</td>${cells}</tr>`;'
generic_row_replacement = 'const trClick = isGenericListGridEditMode ? "" : `onclick="openEditListItemModal(${origIdx})" style="cursor: pointer;" title="Clique para ver detalhes e editar este registro"`; return `<tr ${trClick} class="sp-list-row-clickable"><td class="td-center" style="color: #64748B;">${idx + 1}</td>${cells}</tr>`;'

if generic_row_target in content:
    content = content.replace(generic_row_target, generic_row_replacement, 1)
    print("Linhas da tabela genérica tornadas clicáveis para openEditListItemModal.")

# =========================================================================
# 6. INJETAR JAVASCRIPT MASTER (RDP HUB + SMART FORM + EDIT MODAL)
# =========================================================================
rdp_dataset_json_str = json.dumps(rdp_hosts, ensure_ascii=False)
pracas_json = json.dumps(pracas_opcoes, ensure_ascii=False)

bundle_js = f"""
    // =========================================================================
    // NOC ACCESS HUB & SMART LIST PROPERTIES (1:1 SHAREPOINT EXTENSION)
    // =========================================================================
    let RDP_MASTER_DATASET = {rdp_dataset_json_str};
    let currentRdpFilterCategory = 'all';
    let currentRdpSearchTerm = '';

    const OFICIAL_PRACAS = {pracas_json};
    const OFICIAL_EMISSORAS = ["Globo", "SBT", "Record TV", "Band", "Rede Vida", "TV Brasil", "TV Aparecida", "RIT", "Record News", "TV Gazeta", "TV Canção Nova", "TV Senado", "TV Câmara", "TV Justiça", "Outra"];
    const OFICIAL_STATUS_RETORNO = ["Pendente", "Em análise", "Não confirmado", "Confirmado"];
    const OFICIAL_AREAS = ["Preços", "SAC", "Captação", "Engenharia", "Comercial", "TI Corporativa"];

    let editingListItemIndex = null;

    function renderRdpTable() {{
      const tbody = document.getElementById("rdp-table-body");
      if (!tbody) return;
      tbody.innerHTML = "";

      let filtered = RDP_MASTER_DATASET.filter(h => {{
        if (currentRdpFilterCategory === 'Brasil' && h.regiao !== 'Brasil') return false;
        if (currentRdpFilterCategory === 'América Central' && h.regiao === 'Brasil') return false;
        if (currentRdpFilterCategory === 'Volt' && (!h.pdu_ip || h.pdu_ip === 'N/A')) return false;

        if (currentRdpSearchTerm) {{
          const txt = (h.praca + " " + h.pais + " " + h.regiao + " " + h.router + " " + h.cs1_ip + " " + h.cs2_ip + " " + h.cs3_ip + " " + h.pdu_ip).toLowerCase();
          return txt.includes(currentRdpSearchTerm);
        }}
        return true;
      }});

      filtered.forEach((h, idx) => {{
        const tr = document.createElement("tr");

        const renderCsCell = (ip, role) => {{
          if (!ip || ip === 'N/A') return '<span style="color:#94A3B8; font-size:11px;">-</span>';
          return `
            <div style="display:flex; align-items:center; gap:6px;">
              <code style="font-family:'JetBrains Mono',monospace; font-size:11.5px; color:#1E293B;">${{ip}}</code>
              <button class="sp-btn-cmd" style="padding:2px 6px; font-size:10.5px; border-radius:3px; background:#EFF6FC; border-color:#BFDBFE; color:#0078D4;" onclick="triggerRdpConnect('${{ip}}', '${{h.praca}}', '${{role}}', 3389)" title="Conectar RDP 1-clique (${{role}})">
                🖥️ RDP
              </button>
              <button class="sp-btn-cmd" style="padding:2px 5px; font-size:10px; border-radius:3px; color:#64748B;" onclick="copyTextToClipboard('${{ip}}')" title="Copiar IP">
                📋
              </button>
            </div>
          `;
        }};

        const renderRouterCell = (ip) => {{
          if (!ip || ip === 'N/A') return '<span style="color:#94A3B8; font-size:11px;">-</span>';
          return `
            <div style="display:flex; align-items:center; gap:6px;">
              <code style="font-family:'JetBrains Mono',monospace; font-size:11.5px; color:#0F766E;">${{ip}}</code>
              <a href="http://${{ip}}" target="_blank" class="sp-btn-cmd" style="padding:2px 6px; font-size:10.5px; border-radius:3px; text-decoration:none; color:#0F766E; background:#F0FDFA; border-color:#99F6E4;" title="Abrir Web GUI do Roteador">
                🌐 Web
              </a>
            </div>
          `;
        }};

        const renderPduCell = (ip, tipo) => {{
          if (!ip || ip === 'N/A') return '<span style="color:#94A3B8; font-size:11px;">Sem PDU</span>';
          return `
            <div style="display:flex; align-items:center; gap:6px;">
              <span class="badge" style="background:#FEF3C7; color:#92400E; font-size:10.5px; border:1px solid #FDE68A; padding:2px 6px;">⚡ ${{tipo || 'Volt'}}</span>
              <code style="font-family:'JetBrains Mono',monospace; font-size:11px; color:#78350F;">${{ip}}</code>
              <a href="http://${{ip}}" target="_blank" class="sp-btn-cmd" style="padding:2px 6px; font-size:10px; border-radius:3px; text-decoration:none; color:#92400E; background:#FFFBEB; border-color:#FDE68A;" title="Acessar painel da Régua Volt">
                Reset
              </a>
            </div>
          `;
        }};

        const flag = h.pais === 'Brasil' ? '🇧🇷' : '🌎';
        tr.innerHTML = `
          <td style="text-align:center; color:#64748B; font-size:11.5px;">${{idx + 1}}</td>
          <td><b>${{flag}} ${{h.pais}}</b> <span style="color:#64748B; font-size:11px;">(${{h.regiao}})</span></td>
          <td><b style="color:#0078D4;">${{h.praca}}</b></td>
          <td>${{renderRouterCell(h.router)}}</td>
          <td>${{renderCsCell(h.cs1_ip, 'CS1')}}</td>
          <td>${{renderCsCell(h.cs2_ip, 'CS2')}}</td>
          <td>${{renderCsCell(h.cs3_ip, 'CS3')}}</td>
          <td>${{renderPduCell(h.pdu_ip, h.pdu_tipo)}}</td>
          <td><span class="badge" style="background:#DCFCE7; color:#166534; border:1px solid #BBF7D0; font-size:10.5px; padding:2px 6px;">● Online</span></td>
        `;
        tbody.appendChild(tr);
      }});

      const footer = document.getElementById("rdp-table-footer");
      if (footer) {{
        footer.innerHTML = `Mostrando <b>${{filtered.length}}</b> de <b>${{RDP_MASTER_DATASET.length}}</b> nós remotos`;
      }}
    }}

    function filterRdpTable() {{
      const el = document.getElementById("search-rdp-box");
      currentRdpSearchTerm = el ? el.value.toLowerCase().trim() : '';
      renderRdpTable();
    }}

    function setRdpCategory(cat, btn) {{
      currentRdpFilterCategory = cat;
      document.querySelectorAll(".rdp-cat-pill").forEach(p => p.classList.remove("active"));
      if (btn) btn.classList.add("active");
      renderRdpTable();
    }}

    function triggerRdpConnect(ip, hostLabel, role, port) {{
      if (!ip || ip === 'N/A') {{
        alert("IP indisponível para esta estação.");
        return;
      }}
      port = port || 3389;
      const rdpContent = [
        "screen mode id:i:2",
        "use multimon:i:0",
        "desktopwidth:i:1920",
        "desktopheight:i:1080",
        "session bpp:i:32",
        "winposstr:s:0,1,0,0,1920,1080",
        "compression:i:1",
        "keyboardhook:i:2",
        "audiocapturemode:i:0",
        "videoplaybackmode:i:1",
        "connection type:i:7",
        "networkautodetect:i:1",
        "bandwidthautodetect:i:1",
        "displayconnectionbar:i:1",
        "enableworkspacereconnect:i:0",
        "disable wallpaper:i:0",
        "allow font smoothing:i:1",
        "allow desktop composition:i:1",
        "disable full window drag:i:1",
        "disable menu anims:i:1",
        "disable themes:i:0",
        "disable cursor setting:i:0",
        "bitmapcachepersistenable:i:1",
        `full address:s:${{ip}}:${{port}}`,
        "audiomode:i:0",
        "redirectprinters:i:0",
        "redirectcomports:i:0",
        "redirectsmartcards:i:0",
        "redirectclipboard:i:1",
        "redirectposdevices:i:0",
        "drivestoredirect:s:",
        "prompt for credentials:i:1",
        "negotiate security layer:i:1",
        "remoteapplicationmode:i:0",
        "server port:i:3389",
        "gatewayusagemethod:i:0",
        `promptcredentialonce:i:0`,
        "authentication level:i:2"
      ].join("\\r\\n");

      const blob = new Blob([rdpContent], {{ type: 'application/x-rdp' }});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safeLabel = (hostLabel || "Host").replace(/[^a-zA-Z0-9_-]/g, "_");
      a.href = url;
      a.download = `${{safeLabel}}_${{role || 'CS'}}_${{ip}}.rdp`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`Arquivo RDP gerado para ${{hostLabel}} (${{role}} - ${{ip}})! Abra-o para conectar.`, "success");
    }}

    function copyTextToClipboard(text) {{
      navigator.clipboard.writeText(text).then(() => {{
        showToast(`IP ${{text}} copiado para a área de transferência!`, "success");
      }}).catch(() => {{
        const temp = document.createElement("input");
        temp.value = text;
        document.body.appendChild(temp);
        temp.select();
        document.execCommand("copy");
        document.body.removeChild(temp);
        showToast(`IP ${{text}} copiado!`, "success");
      }});
    }}

    function exportRdpCSV() {{
      const headers = ["ID", "Pais", "Regiao", "Praca", "Router_IP", "CS1_IP", "CS2_IP", "CS3_IP", "PDU_IP", "PDU_Tipo", "Status"];
      const rows = RDP_MASTER_DATASET.map(h => [
        `"${{h.id || ''}}"`,
        `"${{h.pais || ''}}"`,
        `"${{h.regiao || ''}}"`,
        `"${{h.praca || ''}}"`,
        `"${{h.router || ''}}"`,
        `"${{h.cs1_ip || ''}}"`,
        `"${{h.cs2_ip || ''}}"`,
        `"${{h.cs3_ip || ''}}"`,
        `"${{h.pdu_ip || ''}}"`,
        `"${{h.pdu_tipo || ''}}"`,
        `"${{h.status || 'nominal'}}"`
      ].join(","));

      const csvContent = "\\uFEFF" + [headers.join(","), ...rows].join("\\r\\n");
      const blob = new Blob([csvContent], {{ type: "text/csv;charset=utf-8;" }});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Inventario_RDP_Acesso_Remoto_NOC_${{new Date().toISOString().substring(0,10)}}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("Planilha de Acesso Remoto exportada com sucesso!", "success");
    }}

    // =========================================================================
    // SMART FIELDS HTML BUILDER (1:1 SHAREPOINT PARA FALHAS E TODAS AS LISTAS)
    // =========================================================================
    function buildSmartFieldHtml(colId, colTitle, currentValue) {{
      const titleLower = (colTitle || colId || '').toLowerCase();
      const val = currentValue !== null && currentValue !== undefined ? String(currentValue) : '';

      if (titleLower.includes("praça") || titleLower.includes("praca") || titleLower.includes("cidade") || titleLower === "host") {{
        const options = OFICIAL_PRACAS.map(p => `<option value="${{p}}" ${{val.toLowerCase() === p.toLowerCase() ? "selected" : ""}}>${{p}}</option>`).join('');
        return `
          <div class="sp-form-group">
            <label class="sp-form-label">${{colTitle}}</label>
            <select name="${{colId}}" class="sp-form-input list-dyn-input" style="width: 100%; height: 38px;">
              <option value="">Selecione a Praça...</option>
              ${{options}}
            </select>
          </div>
        `;
      }}

      if (titleLower.includes("emissora") || titleLower.includes("rede") || titleLower.includes("veículo") || titleLower.includes("veiculo")) {{
        const options = OFICIAL_EMISSORAS.map(e => `<option value="${{e}}" ${{val.toLowerCase() === e.toLowerCase() ? "selected" : ""}}>${{e}}</option>`).join('');
        return `
          <div class="sp-form-group">
            <label class="sp-form-label">${{colTitle}}</label>
            <select name="${{colId}}" class="sp-form-input list-dyn-input" style="width: 100%; height: 38px;">
              <option value="">Selecione a Emissora...</option>
              ${{options}}
            </select>
          </div>
        `;
      }}

      if (titleLower.includes("data") || titleLower.includes("hora") || titleLower.includes("solicita") || titleLower.includes("início") || titleLower.includes("inicio") || titleLower.includes("fim")) {{
        let dateVal = val;
        if (dateVal.includes("T")) dateVal = dateVal.substring(0, 16);
        return `
          <div class="sp-form-group">
            <label class="sp-form-label">${{colTitle}}</label>
            <div style="display: flex; gap: 6px;">
              <input type="datetime-local" name="${{colId}}" class="sp-form-input list-dyn-input" value="${{dateVal}}" style="flex: 1; height: 38px;">
              <button type="button" class="sp-btn-cmd" style="padding: 0 10px; font-size: 11.5px;" onclick="setFieldNow(this, '${{colId}}')">Agora</button>
            </div>
          </div>
        `;
      }}

      if (titleLower.includes("área") || titleLower.includes("area") || titleLower === "área a solicitar") {{
        const options = OFICIAL_AREAS.map(a => `<option value="${{a}}" ${{val.toLowerCase() === a.toLowerCase() ? "selected" : ""}}>${{a}}</option>`).join('');
        return `
          <div class="sp-form-group">
            <label class="sp-form-label">${{colTitle}}</label>
            <select name="${{colId}}" class="sp-form-input list-dyn-input" style="width: 100%; height: 38px;">
              ${{options}}
            </select>
          </div>
        `;
      }}

      if (titleLower.includes("retorno") || titleLower === "status_retorno" || titleLower.includes("status do retorno")) {{
        const options = OFICIAL_STATUS_RETORNO.map(s => `<option value="${{s}}" ${{val.toLowerCase() === s.toLowerCase() ? "selected" : ""}}>${{s}}</option>`).join('');
        return `
          <div class="sp-form-group">
            <label class="sp-form-label">${{colTitle}}</label>
            <select name="${{colId}}" class="sp-form-input list-dyn-input" style="width: 100%; height: 38px;">
              ${{options}}
            </select>
          </div>
        `;
      }}

      if (titleLower.includes("presente") || titleLower.includes("recuperacao") || titleLower.includes("recuperação") || titleLower.includes("gravacao") || titleLower.includes("gravação")) {{
        const isSim = val.toLowerCase() === "sim" || val.toLowerCase() === "true" || val === "1";
        return `
          <div class="sp-form-group">
            <label class="sp-form-label">${{colTitle}}</label>
            <select name="${{colId}}" class="sp-form-input list-dyn-input" style="width: 100%; height: 38px;">
              <option value="Sim" ${{isSim ? "selected" : ""}}>Sim</option>
              <option value="Não" ${{!isSim ? "selected" : ""}}>Não</option>
            </select>
          </div>
        `;
      }}

      if (titleLower.includes("indício") || titleLower.includes("indicio") || titleLower.includes("descri") || titleLower.includes("ação") || titleLower.includes("acao") || titleLower.includes("observa") || titleLower.includes("resposta")) {{
        return `
          <div class="sp-form-group" style="grid-column: 1 / -1;">
            <label class="sp-form-label">${{colTitle}}</label>
            <textarea name="${{colId}}" class="sp-form-input list-dyn-input" rows="4" placeholder="Descreva os detalhes..." style="width: 100%; font-family: inherit; resize: vertical;">${{val}}</textarea>
          </div>
        `;
      }}

      return `
        <div class="sp-form-group">
          <label class="sp-form-label">${{colTitle}}</label>
          <input type="text" name="${{colId}}" class="sp-form-input list-dyn-input" value="${{val}}" placeholder="Informe ${{colTitle}}...">
        </div>
      `;
    }}

    function setFieldNow(btn, fieldName) {{
      const input = btn.closest(".sp-form-group").querySelector(`[name="${{fieldName}}"]`);
      if (input) {{
        const now = new Date();
        const iso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().substring(0, 16);
        input.value = iso;
      }}
    }}

    function openEditListItemModal(itemIndex) {{
      if (!currentRealListName) return;
      const listData = SP_MASTER_DATA.lists && SP_MASTER_DATA.lists[currentRealListName];
      if (!listData || !listData.items || !listData.items[itemIndex]) return;

      editingListItemIndex = itemIndex;
      const item = listData.items[itemIndex];

      const titleEl = document.getElementById("modal-new-list-title");
      if (titleEl) titleEl.innerHTML = `✏️ Propriedades do Item &mdash; ${{currentRealListTitle}}`;

      const container = document.getElementById("new-list-fields-container");
      if (!container) return;
      container.innerHTML = "";
      container.style.display = "grid";
      container.style.gridTemplateColumns = "repeat(auto-fit, minmax(260px, 1fr))";
      container.style.gap = "14px";

      const cols = listData.columns || [];
      const systemCols = ['id', 'modified', 'created', 'author', 'editor', 'attachments', 'contenttypeid'];
      const editableCols = cols.filter(c => !systemCols.includes(String(c.name || '').toLowerCase()));
      const renderCols = editableCols.length > 0 ? editableCols : cols;

      renderCols.forEach(col => {{
        const colId = col.name;
        const colTitle = col.displayName || col.name;
        const val = item[colId] !== undefined ? item[colId] : (item[colTitle] !== undefined ? item[colTitle] : "");
        container.innerHTML += buildSmartFieldHtml(colId, colTitle, val);
      }});

      const submitBtn = document.querySelector("#modal-new-list-item button[type='submit']");
      if (submitBtn) submitBtn.innerText = "💾 Salvar Alterações";

      const modal = document.getElementById("modal-new-list-item");
      if (modal) modal.style.display = "flex";
    }}
"""

if "function buildSmartFieldHtml" not in content:
    pos_script_end = content.rfind('</script>')
    if pos_script_end != -1:
        content = content[:pos_script_end] + bundle_js + '\n' + content[pos_script_end:]
        print("Bundle JS do RDP Hub e Smart Form injetado com sucesso.")

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(content)

with open(portal_web_path, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"Index.html final salvo em docs e portal_web com {len(content)} caracteres.")
