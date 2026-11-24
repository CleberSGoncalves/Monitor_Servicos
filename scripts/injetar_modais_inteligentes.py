import json
import re

html_path = r'E:\desenvolvimento\Monitor_Esportes\docs\index.html'

with open(html_path, 'r', encoding='utf-8') as f:
    content = f.read()

print(f"Lendo index.html: {len(content)} caracteres.")

# ==============================================================================
# 1. HABILITAR CLIQUE NA LINHA DA TABELA PARA ABRIR O MODAL DE EDIÇÃO
# ==============================================================================
# Linha 4184: substitui a renderização do <tr> para incluir onclick e cursor
old_tr = 'return `<tr><td class="td-center" style="color: #64748B;">${idx + 1}</td>${cells}</tr>`;'
new_tr = """return `<tr style="cursor: pointer; transition: background 0.15s ease;" onclick="openEditListItemModal(${origIdx})" title="Clique para visualizar e editar as propriedades deste item" onmouseover="this.style.background='rgba(241, 245, 249, 0.7)'" onmouseout="this.style.background='transparent'"><td class="td-center" style="color: #64748B;">${idx + 1}</td>${cells}</tr>`;"""

if old_tr in content:
    content = content.replace(old_tr, new_tr, 1)
    print("Linha da tabela agora possui clique para edição (openEditListItemModal).")
else:
    print("AVISO: old_tr não encontrado diretamente!")

# ==============================================================================
# 2. IMPLEMENTAR RENDERIZAÇÃO INTELIGENTE DE CAMPOS (SELECT, DATETIME, TEXTAREA)
#    E AS FUNÇÕES openEditListItemModal E saveEditListItem
# ==============================================================================
# Lista das praças homologadas para popular dropdowns
pracas_lista = [
    "Altamira", "Anápolis", "Aracaju", "Araguaína", "Araxá", "Araçatuba", "Ariquemes", "Bagé", "Balsas",
    "Barreiras", "Bauru", "Belo Horizonte", "Belém", "Blumenau", "Boa Vista", "Brasília", "Cabo Frio",
    "Cachoeiro de Itapemirim", "Cacoal", "Campina Grande", "Campinas", "Campo Grande", "Campos", "Caruaru",
    "Cascavel", "Castanhal", "Catalão", "Caxias do Sul", "Chapecó", "Codó", "Colatina", "Coronel Fabriciano",
    "Corumbá", "Criciúma", "Cruz Alta", "Cruzeiro do Sul", "Cuiabá", "Curitiba", "Erechim", "Feira de Santana",
    "Floriano", "Florianópolis", "Foz do Iguaçu", "Franca", "G Valadares", "Goiânia", "Guarapuava", "Gurupi",
    "Imperatriz", "Itabuna", "Itacoatiara", "Itaituba", "Itapetininga", "Ituiutaba", "Itumbiara", "Jataí",
    "Ji-Paraná", "Joaçaba", "João Pessoa", "Juazeiro", "Juazeiro do Norte", "Juiz de Fora", "Linhares",
    "Londrina", "Luziânia", "Macapá", "Maceió", "Manaus", "Marabá", "Maringá", "Mogi das Cruzes", "Montes Claros",
    "Mossoró", "Natal", "Nova Friburgo", "Palmas", "Paragominas", "Paranavaí", "Parauapebas", "Parintins",
    "Passo Fundo", "Pelotas", "Ponta Grossa", "Ponta Porã", "Porangatú", "Porto Alegre", "Porto Velho",
    "Recife", "Redenção", "Resende", "Ribeirão Preto", "Rio Branco", "Rio de Janeiro", "Rio Grande", "Rio Verde",
    "Rondonópolis", "S.J dos Campos", "S.J. Rio Preto", "Salvador", "Santa Cruz do Sul", "Santa Maria", "Santa Rosa",
    "Santarém", "Santos", "Sinop", "Sorocaba", "São Carlos", "São Luís", "São Paulo", "Tangará da Serra",
    "Taubaté", "Teresina", "Uberaba", "Uberlândia", "Uruguaiana", "Varginha", "Vilhena", "Vitória", "Vitória da Conquista"
]

pracas_json = json.dumps(sorted(pracas_lista), ensure_ascii=False)

smart_form_js = f"""
    // =========================================================================
    // RENDERIZADOR INTELIGENTE DE CAMPOS & MODAL DE PROPRIEDADES DO ITEM (1:1 SHAREPOINT)
    // =========================================================================
    const OFICIAL_PRACAS = {pracas_json};
    const OFICIAL_EMISSORAS = ["Globo", "SBT", "Record TV", "Band", "Rede Vida", "TV Cultura", "TV Brasil", "Record News", "Todos", "Outra"];
    const OFICIAL_EQUIPAMENTOS = ["Máquina", "Switch / Roteador", "ATRIA", "Sintonizador / Placa", "Antena / Sinal RF", "Outros"];
    const OFICIAL_AREAS = ["Preços", "SAC", "N1", "N2", "Operação", "Engenharia", "Sistemas"];
    const OFICIAL_STATUS_RETORNO = ["Pendente", "Não confirmado", "Confirmado"];

    let editingListItemIndex = null;

    function buildSmartFieldHtml(colId, colTitle, currentValue = "") {{
      const titleLower = String(colTitle || colId).toLowerCase();
      const val = currentValue !== undefined && currentValue !== null ? String(currentValue).trim() : "";

      // 1. Data e Hora com Calendário Nativo
      if (titleLower.includes("data") || titleLower.includes("hora") || titleLower.includes("início") || titleLower.includes("fim") || titleLower.includes("solicitação")) {{
        // Formatar para datetime-local se for ISO string
        let dtVal = val;
        if (val && val.includes("T")) {{
          dtVal = val.substring(0, 16);
        }}
        return `
          <div class="sp-form-group">
            <label class="sp-form-label" style="display: flex; justify-content: space-between; align-items: center;">
              <span>${{colTitle}}</span>
              <button type="button" class="sp-btn-cmd" style="font-size: 10px; padding: 2px 6px;" onclick="setFieldNow(this, '${{colId}}')">Agora</button>
            </label>
            <input type="datetime-local" name="${{colId}}" class="sp-form-input list-dyn-input" value="${{dtVal}}">
          </div>
        `;
      }}

      // 2. Praça / Cidade
      if (titleLower.includes("praça") || titleLower.includes("praca") || titleLower.includes("cidade") || titleLower === "host" || titleLower.includes("host/praça")) {{
        const options = OFICIAL_PRACAS.map(p => `<option value="${{p}}" ${{val.toLowerCase().includes(p.toLowerCase()) ? "selected" : ""}}>${{p}}</option>`).join('');
        return `
          <div class="sp-form-group">
            <label class="sp-form-label">${{colTitle}} *</label>
            <select name="${{colId}}" class="sp-form-input list-dyn-input" style="width: 100%; height: 38px;">
              <option value="">-- Selecione a Praça --</option>
              ${{options}}
            </select>
          </div>
        `;
      }}

      // 3. Rede / Emissora / Veículo
      if (titleLower.includes("rede") || titleLower.includes("emissora") || titleLower.includes("veículo") || titleLower.includes("veiculo")) {{
        const options = OFICIAL_EMISSORAS.map(e => `<option value="${{e}}" ${{val.toLowerCase() === e.toLowerCase() ? "selected" : ""}}>${{e}}</option>`).join('');
        return `
          <div class="sp-form-group">
            <label class="sp-form-label">${{colTitle}} *</label>
            <select name="${{colId}}" class="sp-form-input list-dyn-input" style="width: 100%; height: 38px;">
              <option value="">-- Selecione a Emissora --</option>
              ${{options}}
            </select>
          </div>
        `;
      }}

      // 4. Equipamento
      if (titleLower.includes("equipamento")) {{
        const options = OFICIAL_EQUIPAMENTOS.map(eq => `<option value="${{eq}}" ${{val.toLowerCase() === eq.toLowerCase() ? "selected" : ""}}>${{eq}}</option>`).join('');
        return `
          <div class="sp-form-group">
            <label class="sp-form-label">${{colTitle}}</label>
            <select name="${{colId}}" class="sp-form-input list-dyn-input" style="width: 100%; height: 38px;">
              ${{options}}
            </select>
          </div>
        `;
      }}

      // 5. CS
      if (titleLower === "cs" || titleLower.includes("capture site")) {{
        const csOpts = ["01", "02", "03", "01, 02", "Todos"];
        const options = csOpts.map(c => `<option value="${{c}}" ${{val === c ? "selected" : ""}}>${{c}}</option>`).join('');
        return `
          <div class="sp-form-group">
            <label class="sp-form-label">${{colTitle}}</label>
            <select name="${{colId}}" class="sp-form-input list-dyn-input" style="width: 100%; height: 38px;">
              ${{options}}
            </select>
          </div>
        `;
      }}

      // 6. Área / Área Responsável
      if (titleLower.includes("área") || titleLower.includes("area") || titleLower.includes("responsável") || titleLower.includes("responsavel")) {{
        const options = OFICIAL_AREAS.map(a => `<option value="${{a}}" ${{val.toLowerCase().includes(a.toLowerCase()) ? "selected" : ""}}>${{a}}</option>`).join('');
        return `
          <div class="sp-form-group">
            <label class="sp-form-label">${{colTitle}}</label>
            <select name="${{colId}}" class="sp-form-input list-dyn-input" style="width: 100%; height: 38px;">
              ${{options}}
            </select>
          </div>
        `;
      }}

      // 7. Status do Retorno
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

      // 8. Falha presente até o momento / Booleano
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

      // 9. Textarea para indícios da ocorrência ou ações executadas
      if (titleLower.includes("indício") || titleLower.includes("indicio") || titleLower.includes("descri") || titleLower.includes("ação") || titleLower.includes("acao") || titleLower.includes("observa")) {{
        return `
          <div class="sp-form-group" style="grid-column: 1 / -1;">
            <label class="sp-form-label">${{colTitle}}</label>
            <textarea name="${{colId}}" class="sp-form-input list-dyn-input" rows="4" placeholder="Descreva os detalhes..." style="width: 100%; font-family: inherit; resize: vertical;">${{val}}</textarea>
          </div>
        `;
      }}

      // Padrão: Input de texto com valor
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

    // Abrir Modal de Edição de Propriedades ao clicar na linha da lista
    function openEditListItemModal(itemIndex) {{
      if (!currentRealListName) return;
      const listData = SP_MASTER_DATA.lists && SP_MASTER_DATA.lists[currentRealListName];
      if (!listData || !listData.items || !listData.items[itemIndex]) return;

      editingListItemIndex = itemIndex;
      const item = listData.items[itemIndex];

      document.getElementById("modal-new-list-title").innerHTML = `✏️ Propriedades do Item &mdash; ${{currentRealListTitle}}`;
      const container = document.getElementById("new-list-fields-container");
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

      // Ajusta o botão de salvar do modal
      const submitBtn = document.querySelector("#modal-new-list-item button[type='submit']");
      if (submitBtn) submitBtn.innerText = "💾 Salvar Alterações";

      document.getElementById("modal-new-list-item").style.display = "flex";
    }}
"""

# Inserir o código smart_form_js antes do fechamento de </script>
pos_script_end = content.rfind('</script>')
if pos_script_end != -1:
    content = content[:pos_script_end] + smart_form_js + '\n' + content[pos_script_end:]
    print("Injetado Smart Form & Edit List Modal com sucesso.")

# Atualizar a função saveNewListItem para suportar tanto Edição quanto Inclusão
old_save_code = """    function saveNewListItem(event) {
      event.preventDefault();
      if (!currentRealListName) return;
      const listData = SP_MASTER_DATA.lists && SP_MASTER_DATA.lists[currentRealListName];
      if (!listData) return;

      const inputs = document.querySelectorAll(".list-dyn-input");
      const newItem = {
        __id: 'item_' + Date.now(),
        Created: new Date().toISOString(),
        Modified: new Date().toISOString()
      };

      inputs.forEach(inp => {
        newItem[inp.name] = inp.value.trim();
      });

      if (!listData.items) listData.items = [];
      listData.items.unshift(newItem);"""

new_save_code = """    function saveNewListItem(event) {
      event.preventDefault();
      if (!currentRealListName) return;
      const listData = SP_MASTER_DATA.lists && SP_MASTER_DATA.lists[currentRealListName];
      if (!listData) return;

      const inputs = document.querySelectorAll(".list-dyn-input");

      // Checa se é Edição de Item existente ou Novo Item
      if (editingListItemIndex !== null && listData.items && listData.items[editingListItemIndex]) {
        const item = listData.items[editingListItemIndex];
        inputs.forEach(inp => {
          item[inp.name] = inp.value.trim();
        });
        item.Modified = new Date().toISOString();

        try {
          let edits = JSON.parse(localStorage.getItem('sp_custom_list_edits_' + currentRealListName) || '{}');
          edits[editingListItemIndex] = Object.assign({}, edits[editingListItemIndex] || {}, item);
          localStorage.setItem('sp_custom_list_edits_' + currentRealListName, JSON.stringify(edits));
        } catch (e) {
          console.warn("Erro ao salvar edição:", e);
        }

        editingListItemIndex = null;
        closeNewListItemModal();
        filterRealListTable();
        showToast(`✅ Item atualizado com sucesso na lista ${currentRealListTitle}!`, "success");
        return;
      }

      const newItem = {
        __id: 'item_' + Date.now(),
        Created: new Date().toISOString(),
        Modified: new Date().toISOString()
      };

      inputs.forEach(inp => {
        newItem[inp.name] = inp.value.trim();
      });

      if (!listData.items) listData.items = [];
      listData.items.unshift(newItem);"""

if old_save_code in content:
    content = content.replace(old_save_code, new_save_code, 1)
    print("saveNewListItem atualizado para suportar Edição e Inclusão perfeitamente.")
else:
    print("AVISO: old_save_code não encontrado diretamente.")

# Atualizar openNewListItemModal para resetar editingListItemIndex e usar buildSmartFieldHtml
old_open_new = """      renderCols.forEach(col => {
        const colId = col.name;
        const colTitle = col.displayName || col.name;
        const group = document.createElement("div");
        group.className = "sp-form-group";
        group.innerHTML = `
          <label class="sp-form-label">${colTitle}</label>
          <input type="text" name="${colId}" class="sp-form-input list-dyn-input" placeholder="Informe ${colTitle}...">
        `;
        container.appendChild(group);
      });"""

new_open_new = """      editingListItemIndex = null;
      container.style.display = "grid";
      container.style.gridTemplateColumns = "repeat(auto-fit, minmax(260px, 1fr))";
      container.style.gap = "14px";

      const submitBtn = document.querySelector("#modal-new-list-item button[type='submit']");
      if (submitBtn) submitBtn.innerText = "Salvar Registro";

      renderCols.forEach(col => {
        const colId = col.name;
        const colTitle = col.displayName || col.name;
        container.innerHTML += buildSmartFieldHtml(colId, colTitle, "");
      });"""

if old_open_new in content:
    content = content.replace(old_open_new, new_open_new, 1)
    print("openNewListItemModal atualizado com os campos inteligentes.")
else:
    print("AVISO: old_open_new não encontrado diretamente.")

# ==============================================================================
# SALVAR ARQUIVO MODIFICADO
# ==============================================================================
with open(html_path, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"Salvo index.html com sucesso. Novo tamanho: {len(content)} caracteres.")
