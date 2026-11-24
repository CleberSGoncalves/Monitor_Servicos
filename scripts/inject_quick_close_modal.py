html_path = r'E:\desenvolvimento\Monitor_Esportes\docs\index.html'

with open(html_path, 'r', encoding='utf-8') as f:
    content = f.read()

quick_close_modal_html = """
  <!-- MODAL DE ENCERRAMENTO RÁPIDO DE OCORRÊNCIA (1-CLIQUE NO BANNER) -->
  <div class="modal-overlay" id="modal-quick-close-oco" style="display: none; align-items: center; justify-content: center; z-index: 10000;">
    <div class="modal-card" style="max-width: 540px; background: white; border-radius: 8px; box-shadow: 0 20px 40px rgba(0,0,0,0.3); overflow: hidden;">
      <div class="modal-header" style="background: #0078D4; color: white; padding: 14px 20px; display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 18px;">⚡</span>
          <h3 style="margin: 0; font-size: 15px; font-weight: 600; color: white;">Encerramento Rápido de Ocorrência</h3>
        </div>
        <button type="button" class="modal-close-btn" onclick="closeQuickCloseOcoModal()" style="color: white; font-size: 22px; cursor: pointer; background: transparent; border: none;">&times;</button>
      </div>
      <form id="form-quick-close-oco" onsubmit="submitQuickCloseOco(event)">
        <input type="hidden" id="quick-close-oco-id">
        <div class="modal-body" style="padding: 20px 24px;">
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
        <div class="modal-footer" style="padding: 12px 24px; background: #F8FAFC; border-top: 1px solid #E2E8F0; display: flex; justify-content: flex-end; gap: 10px;">
          <button type="button" class="sp-btn-cmd" onclick="closeQuickCloseOcoModal()">Cancelar</button>
          <button type="submit" class="sp-btn-new" style="background: #16A34A; border-color: #16A34A;"><span>✔</span> Concluir Ocorrência</button>
        </div>
      </form>
    </div>
  </div>
"""

target = '<div class="modal-overlay" id="modal-new-oco">'
if target in content and 'id="modal-quick-close-oco"' not in content:
    content = content.replace(target, quick_close_modal_html + '\n  ' + target, 1)
    print("Injetado modal-quick-close-oco antes de modal-new-oco com sucesso.")
    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(content)
    portal_web_path = r'E:\desenvolvimento\Monitor_Esportes\portal_web\index.html'
    with open(portal_web_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Ambos os arquivos atualizados com sucesso.")
else:
    print("Alvo não encontrado ou já injetado.")
