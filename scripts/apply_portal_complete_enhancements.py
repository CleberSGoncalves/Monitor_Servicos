import json
import os
import re

html_path = r'E:\desenvolvimento\Monitor_Esportes\docs\index.html'
json_rdp_path = r'E:\desenvolvimento\Monitor_Esportes\docs\rdp_hosts_data.json'

with open(html_path, 'r', encoding='utf-8') as f:
    content = f.read()

print(f"Index.html base: {len(content)} caracteres.")

# =========================================================================
# 1. ADICIONAR REDMINE NA ABA QUALIDADE DA NAVBAR
# =========================================================================
# Localizar o bloco Qualidade na navbar
target_qualidade = """<a href="javascript:void(0)" class="sp-dropdown-link" onclick="handleMenuClick('falhas', '⚠️ Confirmação de Falhas', event)">⚠️ Confirmação de Falhas <span class="item-count-badge">156</span></a>"""

replacement_qualidade = """<a href="javascript:void(0)" class="sp-dropdown-link" onclick="handleMenuClick('falhas', '⚠️ Confirmação de Falhas', event)">⚠️ Confirmação de Falhas <span class="item-count-badge">156</span></a>
            <a href="javascript:void(0)" class="sp-dropdown-link" onclick="handleMenuClick('redmine', '🐞 Redmine (Demandas & Chamados)', event)">🐞 Redmine (Demandas & Chamados) <span class="item-count-badge">300</span></a>"""

if "handleMenuClick('redmine'" not in content[:60000]:
    if target_qualidade in content:
        content = content.replace(target_qualidade, replacement_qualidade, 1)
        print("Adicionado Redmine no menu Qualidade com sucesso.")
    else:
        print("Aviso: target_qualidade não encontrado.")
else:
    print("Redmine já está no menu da navbar.")

# =========================================================================
# 2. ATUALIZAR MODAL DE NOVA OCORRÊNCIA COM DROPDOWNS OFICIAIS
# =========================================================================
# Carregar praças oficiais do RDP dataset
with open(json_rdp_path, 'r', encoding='utf-8') as f:
    rdp_hosts = json.load(f)

pracas_opcoes = sorted(list(set([h.get("label", "") for h in rdp_hosts if h.get("label")])))

options_pracas_html = "".join([f'<option value="{p}">{p}</option>' for p in pracas_opcoes])

# Localizar campos do modal-new-oco
oco_fields_target = """            <div class="sp-form-group">
              <label class="sp-form-label">Host / Praça *</label>
              <input type="text" id="new-oco-host" class="sp-form-input" list="hosts-datalist" placeholder="Ex: Montes Claros / BRMG-MCL-TDT" required>
              <datalist id="hosts-datalist">
                <!-- Preenchido via JS com allHosts -->
              </datalist>
            </div>

            <div class="sp-form-group">
              <label class="sp-form-label">CS (Canal de Serviço)</label>
              <input type="text" id="new-oco-cs" class="sp-form-input" placeholder="Ex: 01, 02 ou 01, 02">
            </div>

            <div class="sp-form-group">
              <label class="sp-form-label">Veículo / Emissora</label>
              <input type="text" id="new-oco-veiculo" class="sp-form-input" placeholder="Ex: BAND, GLOBO, SBT, RECORD, Todos">
            </div>

            <div class="sp-form-group">
              <label class="sp-form-label">Equipamento</label>
              <input type="text" id="new-oco-equipamento" class="sp-form-input" placeholder="Ex: ATRIA, TOMATE, Switch / Roteador, Maquina, WADT">
            </div>"""

oco_fields_replacement = f"""            <div class="sp-form-group">
              <label class="sp-form-label">Host / Praça *</label>
              <select id="new-oco-host" class="sp-form-select" required style="width: 100%; height: 38px;">
                <option value="">Selecione a Praça / Host...</option>
                {options_pracas_html}
              </select>
            </div>

            <div class="sp-form-group">
              <label class="sp-form-label">CS (Canal de Serviço)</label>
              <select id="new-oco-cs" class="sp-form-select" style="width: 100%; height: 38px;">
                <option value="01">01</option>
                <option value="02">02</option>
                <option value="03">03</option>
                <option value="01, 02" selected>01, 02</option>
                <option value="01, 02, 03">01, 02, 03</option>
                <option value="02, 03">02, 03</option>
                <option value="Todos">Todos</option>
              </select>
            </div>

            <div class="sp-form-group">
              <label class="sp-form-label">Veículo / Emissora</label>
              <select id="new-oco-veiculo" class="sp-form-select" style="width: 100%; height: 38px;">
                <option value="Todos" selected>Todos</option>
                <option value="GLOBO">GLOBO</option>
                <option value="SBT">SBT</option>
                <option value="RECORD">RECORD</option>
                <option value="BAND">BAND</option>
                <option value="REDE TV">REDE TV</option>
                <option value="TV CULTURA">TV CULTURA</option>
                <option value="Outro">Outro</option>
              </select>
            </div>

            <div class="sp-form-group">
              <label class="sp-form-label">Equipamento</label>
              <select id="new-oco-equipamento" class="sp-form-select" style="width: 100%; height: 38px;">
                <option value="ATRIA" selected>ATRIA</option>
                <option value="Maquina">Maquina</option>
                <option value="Switch / Roteador">Switch / Roteador</option>
                <option value="Receptor / TV BOX">Receptor / TV BOX</option>
                <option value="WADT">WADT</option>
                <option value="Nobreak / PDU">Nobreak / PDU</option>
                <option value="Antena">Antena</option>
                <option value="LNB">LNB</option>
                <option value="Cabo / Conector">Cabo / Conector</option>
                <option value="Placa de Captura">Placa de Captura</option>
                <option value="Outro">Outro</option>
              </select>
            </div>"""

if oco_fields_target in content:
    content = content.replace(oco_fields_target, oco_fields_replacement, 1)
    print("Campos do modal-new-oco atualizados com dropdowns oficiais.")
else:
    print("Aviso: oco_fields_target não encontrado no HTML.")

# Atualizar lista de áreas responsáveis no modal-new-oco
area_target = """            <div class="sp-form-group">
              <label class="sp-form-label">Área / Responsável</label>
              <select id="new-oco-area" class="sp-form-select">
                <option value="N1" selected>N1</option>
                <option value="Vinicius Dantas">Vinicius Dantas</option>
                <option value="Lucieudes Victor">Lucieudes Victor</option>
                <option value="Cassio Esteves">Cassio Esteves</option>
                <option value="Cleber Gonçalves">Cleber Gonçalves</option>
                <option value="Solucionado">Solucionado</option>
              </select>
            </div>"""

area_replacement = """            <div class="sp-form-group">
              <label class="sp-form-label">Área / Responsável</label>
              <select id="new-oco-area" class="sp-form-select" style="width: 100%; height: 38px;">
                <option value="N1" selected>N1</option>
                <option value="N2">N2</option>
                <option value="Infraestrutura / Redes">Infraestrutura / Redes</option>
                <option value="Engenharia">Engenharia</option>
                <option value="Operação">Operação</option>
                <option value="Parceiro Local">Parceiro Local</option>
                <option value="TI Corporativa">TI Corporativa</option>
                <option value="Preços / SAC">Preços / SAC</option>
                <option value="Vinicius Dantas">Vinicius Dantas</option>
                <option value="Lucieudes Victor">Lucieudes Victor</option>
                <option value="Cassio Esteves">Cassio Esteves</option>
                <option value="Cleber Gonçalves">Cleber Gonçalves</option>
                <option value="Solucionado">Solucionado</option>
              </select>
            </div>"""

if area_target in content:
    content = content.replace(area_target, area_replacement, 1)
    print("Área / Responsável atualizada no modal-new-oco.")

# =========================================================================
# 3. MODAL DE ENCERRAMENTO RÁPIDO DE OCORRÊNCIA (1. CLIQUE NO BANNER)
# =========================================================================
quick_close_modal_html = """
  <!-- MODAL DE ENCERRAMENTO RÁPIDO DE OCORRÊNCIA -->
  <div id="modal-quick-close-oco" class="sp-modal-overlay" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.65); z-index: 10000; align-items: center; justify-content: center;">
    <div class="sp-modal-card" style="background: white; border-radius: 8px; width: 90%; max-width: 540px; box-shadow: 0 20px 40px rgba(0,0,0,0.3); overflow: hidden; animation: popIn 0.2s ease-out;">
      <div style="background: #0078D4; color: white; padding: 14px 20px; display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 18px;">⚡</span>
          <h3 style="margin: 0; font-size: 15px; font-weight: 600;">Encerramento Rápido de Ocorrência</h3>
        </div>
        <button type="button" onclick="closeQuickCloseOcoModal()" style="background: transparent; border: none; color: white; font-size: 22px; cursor: pointer; line-height: 1;">&times;</button>
      </div>
      <form id="form-quick-close-oco" onsubmit="submitQuickCloseOco(event)">
        <input type="hidden" id="quick-close-oco-id">
        <div style="padding: 20px 24px;">
          <div style="margin-bottom: 14px;">
            <div style="font-size: 11.5px; color: #64748B; font-weight: 600; text-transform: uppercase;">Praça / Host</div>
            <div id="quick-close-host-title" style="font-size: 15px; font-weight: 700; color: #1E293B; margin-top: 2px;">-</div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px;">
            <div>
              <label class="sp-form-label">Novo Status *</label>
              <select id="quick-close-status" class="sp-form-select" required style="width: 100%; height: 38px;">
                <option value="Concluído" selected>Concluído</option>
                <option value="Feedback">Feedback</option>
                <option value="Em andamento">Em andamento</option>
              </select>
            </div>
            <div>
              <label class="sp-form-label">Área Solucionadora</label>
              <select id="quick-close-area" class="sp-form-select" style="width: 100%; height: 38px;">
                <option value="Solucionado" selected>Solucionado</option>
                <option value="N1">N1</option>
                <option value="N2">N2</option>
                <option value="Engenharia">Engenharia</option>
                <option value="Parceiro Local">Parceiro Local</option>
                <option value="Infraestrutura / Redes">Infraestrutura / Redes</option>
              </select>
            </div>
          </div>

          <div style="margin-bottom: 14px;">
            <label class="sp-form-label">Ações Executadas / Justificativa *</label>
            <textarea id="quick-close-acoes" class="sp-form-input" rows="3" required placeholder="Ex: Normalizado pelo parceiro local; canal restabelecido." style="width: 100%; resize: vertical; font-family: inherit; font-size: 13px;"></textarea>
            <div style="display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap;">
              <button type="button" class="sp-btn-cmd" style="font-size: 11px; padding: 2px 8px;" onclick="setQuickAcao('Normalizado após reinício de ATRIA.')">Reinício ATRIA</button>
              <button type="button" class="sp-btn-cmd" style="font-size: 11px; padding: 2px 8px;" onclick="setQuickAcao('Sinal restabelecido na emissora local.')">Sinal normal</button>
              <button type="button" class="sp-btn-cmd" style="font-size: 11px; padding: 2px 8px;" onclick="setQuickAcao('Parceiro local realizou o reset físico do equipamento.')">Reset Parceiro</button>
            </div>
          </div>

          <div style="display: flex; gap: 14px; margin-bottom: 6px;">
            <label style="display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: #475569; cursor: pointer;">
              <input type="checkbox" id="quick-close-recup" style="width: 16px; height: 16px;"> Em recuperação
            </label>
            <label style="display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: #475569; cursor: pointer;">
              <input type="checkbox" id="quick-close-informar" style="width: 16px; height: 16px;"> Informar Operação
            </label>
          </div>
        </div>
        <div style="padding: 12px 24px; background: #F8FAFC; border-top: 1px solid #E2E8F0; display: flex; justify-content: flex-end; gap: 10px;">
          <button type="button" class="sp-btn-cmd" onclick="closeQuickCloseOcoModal()">Cancelar</button>
          <button type="submit" class="sp-btn-new" style="background: #16A34A; border-color: #16A34A;"><span>✔</span> Concluir Ocorrência</button>
        </div>
      </form>
    </div>
  </div>
"""

if "id=\"modal-quick-close-oco\"" not in content:
    pos_modal = content.find('<div id="modal-new-oco"')
    if pos_modal != -1:
        content = content[:pos_modal] + quick_close_modal_html + '\n' + content[pos_modal:]
        print("Injetado modal-quick-close-oco com sucesso.")
    else:
        print("Aviso: modal-new-oco não encontrado para ancorar quick-close.")

# =========================================================================
# 4. ATUALIZAR FUNÇÃO DE ATUALIZAR (BOTAO ATUALIZAR DO PAINEL)
# =========================================================================
btn_atualizar_target = """          <button class="sp-btn-cmd" onclick="renderOcorrenciasTable()">
            <span>↺</span> Atualizar
          </button>"""

btn_atualizar_replacement = """          <button class="sp-btn-cmd" id="btn-refresh-oco" onclick="refreshOcorrenciasData(this)" title="Buscar atualizações e sincronizar do SharePoint">
            <span id="icon-refresh-oco">↺</span> Atualizar
          </button>"""

if btn_atualizar_target in content:
    content = content.replace(btn_atualizar_target, btn_atualizar_replacement, 1)
    print("Botão Atualizar atualizado com refreshOcorrenciasData.")

# =========================================================================
# 5. ATUALIZAR FORMATCELLCONTENT COM CORES OFICIAIS DO REDMINE E FALHAS
# =========================================================================
format_cell_target = """      if (['Ativo', 'Online', 'Concluído', 'Resolvido', 'Vigente', 'Operacional', 'Sim'].includes(s)) {
        return `<span class="badge badge-exibido">${s}</span>`;
      }
      if (s.includes('SLA Estourado')) {
        return `<span class="badge" style="background:#FEE2E2;color:#991B1B;border:1px solid #FECACA;">${s}</span>`;
      }
      if (s.includes('Gravando')) {
        return `<span class="badge badge-exibido">${s}</span>`;
      }"""

format_cell_replacement = """      // Cores e Badges Oficiais SharePoint (Redmine, Falhas, Operação)
      if (['Ativo', 'Online', 'Concluído', 'Resolvido', 'Fechado', 'Vigente', 'Operacional', 'Sim', 'Confirmado', 'Dentro do Prazo'].includes(s)) {
        return `<span class="badge" style="background:#DCFCE7;color:#166534;border:1px solid #BBF7D0;font-weight:600;padding:2px 8px;border-radius:12px;">${s}</span>`;
      }
      if (['Pendente', 'Em Análise', 'Em Análise N1', 'Em Análise N2', 'Em Tratativa'].includes(s)) {
        return `<span class="badge" style="background:#FEF3C7;color:#92400E;border:1px solid #FDE68A;font-weight:600;padding:2px 8px;border-radius:12px;">${s}</span>`;
      }
      if (['Não confirmado', 'Não', 'Rejeitado', 'Cancelado'].includes(s)) {
        return `<span class="badge" style="background:#F1F5F9;color:#475569;border:1px solid #CBD5E1;font-weight:600;padding:2px 8px;border-radius:12px;">${s}</span>`;
      }
      if (s.includes('SLA Estourado') || ['Alta', 'Urgente', 'Crítico', 'Atrasado', 'Fora do Prazo'].includes(s)) {
        return `<span class="badge" style="background:#FEE2E2;color:#991B1B;border:1px solid #FECACA;font-weight:600;padding:2px 8px;border-radius:12px;">${s}</span>`;
      }
      if (['Em andamento', 'Novo', 'Aberto', 'Feedback'].includes(s)) {
        return `<span class="badge" style="background:#DBEAFE;color:#1E40AF;border:1px solid #BFDBFE;font-weight:600;padding:2px 8px;border-radius:12px;">${s}</span>`;
      }
      if (['Preços', 'SAC', 'Engenharia', 'Captação'].includes(s)) {
        return `<span class="badge" style="background:#F3E8FF;color:#6B21A8;border:1px solid #E9D5FF;font-weight:600;padding:2px 8px;border-radius:12px;">${s}</span>`;
      }
      if (s.includes('Gravando')) {
        return `<span class="badge badge-exibido">${s}</span>`;
      }"""

if format_cell_target in content:
    content = content.replace(format_cell_target, format_cell_replacement, 1)
    print("formatCellContent atualizado com cores oficiais do Redmine e Falhas.")

# =========================================================================
# 6. INJETAR LOGICA DE QUICK CLOSE E REFRESH NO JS
# =========================================================================
quick_close_js = """
    // =========================================================================
    // QUICK CLOSE & REALTIME REFRESH DO PAINEL DE OCORRÊNCIAS
    // =========================================================================
    let currentQuickOcoId = null;

    function openQuickCloseOcoModal(ocoId) {
      currentQuickOcoId = ocoId;
      const oco = allOcorrencias.find(o => String(o.id || o.Criado) === String(ocoId));
      if (!oco) return;

      document.getElementById("quick-close-oco-id").value = ocoId;
      document.getElementById("quick-close-host-title").innerText = (oco.HostName || oco.hostLookupId || 'Host') + ' (CS ' + (oco.CS || '-') + ')';
      document.getElementById("quick-close-status").value = "Concluído";
      document.getElementById("quick-close-area").value = "Solucionado";
      document.getElementById("quick-close-acoes").value = oco.AcoesExecutadas || "";
      document.getElementById("quick-close-recup").checked = String(oco.EmRecuperacao).toLowerCase() === 'sim';
      document.getElementById("quick-close-informar").checked = Boolean(oco.InformarOperacao);

      const modal = document.getElementById("modal-quick-close-oco");
      if (modal) modal.style.display = "flex";
    }

    function closeQuickCloseOcoModal() {
      const modal = document.getElementById("modal-quick-close-oco");
      if (modal) modal.style.display = "none";
    }

    function setQuickAcao(texto) {
      const el = document.getElementById("quick-close-acoes");
      if (el) {
        el.value = (el.value ? el.value + " " : "") + texto;
      }
    }

    function submitQuickCloseOco(ev) {
      ev.preventDefault();
      const ocoId = document.getElementById("quick-close-oco-id").value;
      const oco = allOcorrencias.find(o => String(o.id || o.Criado) === String(ocoId));
      if (!oco) return;

      oco.Status = document.getElementById("quick-close-status").value;
      oco.AreaResponsavel = document.getElementById("quick-close-area").value;
      oco.AcoesExecutadas = document.getElementById("quick-close-acoes").value;
      oco.EmRecuperacao = document.getElementById("quick-close-recup").checked ? "Sim" : "Não";
      oco.InformarOperacao = document.getElementById("quick-close-informar").checked;
      oco.Modified = new Date().toISOString();

      try {
        let edits = JSON.parse(localStorage.getItem('sp_custom_oco_edits') || '{}');
        edits[ocoId] = {
          Status: oco.Status,
          AreaResponsavel: oco.AreaResponsavel,
          AcoesExecutadas: oco.AcoesExecutadas,
          EmRecuperacao: oco.EmRecuperacao,
          InformarOperacao: oco.InformarOperacao,
          Modified: oco.Modified
        };
        localStorage.setItem('sp_custom_oco_edits', JSON.stringify(edits));
      } catch (e) {
        console.warn("Erro ao salvar encerramento localmente:", e);
      }

      closeQuickCloseOcoModal();
      renderOcorrenciasTable();
      showToast("Ocorrência encerrada e atualizada com sucesso!", "success");
    }

    async function refreshOcorrenciasData(btn) {
      const icon = document.getElementById("icon-refresh-oco");
      if (icon) icon.style.animation = "spin 1s linear infinite";
      if (btn) btn.disabled = true;

      try {
        // Restaurar edições e novidades locais
        const savedEdits = JSON.parse(localStorage.getItem('sp_custom_oco_edits') || '{}');
        let countUpdated = 0;
        allOcorrencias.forEach(o => {
          const ocoId = o.id || o.Criado;
          if (savedEdits[ocoId]) {
            Object.assign(o, savedEdits[ocoId]);
            countUpdated++;
          }
        });

        const newSaved = JSON.parse(localStorage.getItem('sp_custom_new_ocorrencias') || '[]');
        newSaved.forEach(newItem => {
          if (!allOcorrencias.some(o => (o.id && o.id === newItem.id) || o.Criado === newItem.Criado)) {
            allOcorrencias.unshift(newItem);
            countUpdated++;
          }
        });

        renderOcorrenciasTable();
        const now = new Date();
        const timeStr = now.toLocaleTimeString('pt-BR');
        showToast(`Painel atualizado às ${timeStr}! (${allOcorrencias.length} registros)`, "success");
      } catch (err) {
        console.warn("Falha no refresh:", err);
        renderOcorrenciasTable();
      } finally {
        setTimeout(() => {
          if (icon) icon.style.animation = "";
          if (btn) btn.disabled = false;
        }, 600);
      }
    }
"""

if "function openQuickCloseOcoModal" not in content:
    pos_script_end = content.rfind('</script>')
    if pos_script_end != -1:
        content = content[:pos_script_end] + quick_close_js + '\n' + content[pos_script_end:]
        print("Funções de Quick Close e Refresh injetadas com sucesso.")

# =========================================================================
# 7. TORNAR STATUS BADGE CLICÁVEL NO RENDEROCORRENCIASTABLE
# =========================================================================
badge_target = """        // Status badge
        let statusBadge = `<span class="sp-badge sp-badge-concluido">Concluído</span>`;
        if (o.Status === "Em andamento") {
          statusBadge = `<span class="sp-badge sp-badge-em-andamento">Em andamento</span>`;
        } else if (o.Status === "Feedback") {
          statusBadge = `<span class="sp-badge sp-badge-feedback">Feedback</span>`;
        }"""

badge_replacement = """        // Status badge com ação de encerramento rápido (pop-up ao clicar no banner)
        let statusBadge = `<span class="sp-badge sp-badge-concluido" onclick="event.stopPropagation(); openQuickCloseOcoModal('${ocoId}')" title="Clique para reabrir ou gerenciar ocorrência" style="cursor: pointer;">Concluído ⌵</span>`;
        if (o.Status === "Em andamento") {
          statusBadge = `<span class="sp-badge sp-badge-em-andamento" onclick="event.stopPropagation(); openQuickCloseOcoModal('${ocoId}')" title="Clique no banner para abrir pop-up e encerrar" style="cursor: pointer; animation: pulse 2s infinite;">Em andamento ⚡</span>`;
        } else if (o.Status === "Feedback") {
          statusBadge = `<span class="sp-badge sp-badge-feedback" onclick="event.stopPropagation(); openQuickCloseOcoModal('${ocoId}')" title="Clique no banner para abrir pop-up e encerrar" style="cursor: pointer;">Feedback ⚡</span>`;
        }"""

if badge_target in content:
    content = content.replace(badge_target, badge_replacement, 1)
    print("Status badges tornados clicáveis para quick-close pop-up.")

# =========================================================================
# 8. SALVAR NO DOCS/INDEX.HTML E SINCRONIZAR COM PORTAL_WEB/INDEX.HTML
# =========================================================================
with open(html_path, 'w', encoding='utf-8') as f:
    f.write(content)

portal_web_path = r'E:\desenvolvimento\Monitor_Esportes\portal_web\index.html'
if os.path.exists(portal_web_path):
    with open(portal_web_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Sincronizado também portal_web/index.html ({len(content)} caracteres).")

print(f"Salvo index.html com sucesso. Tamanho final: {len(content)} caracteres.")
