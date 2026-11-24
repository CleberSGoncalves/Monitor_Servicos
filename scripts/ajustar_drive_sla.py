import json
import re

html_path = r'E:\desenvolvimento\Monitor_Esportes\docs\index.html'

with open(html_path, 'r', encoding='utf-8') as f:
    content = f.read()

print(f"Lendo index.html: {len(content)} caracteres.")

# 1. Povoar os arquivos de SLA Interno 2023, 2024, 2025 e 2026
meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]
emissoras = ["Globo", "SBT", "Record", "Band"]

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
        "name": f"Cálculo SLA - TVA aberta - {ano}.xlsx",
        "type": "file",
        "extension": "xlsx",
        "mime_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "size": 245000,
        "lastModifiedDateTime": f"{ano}-10-15T10:20:00Z",
        "lastModifiedBy": "Cassio Esteves De Oliveira",
        "webUrl": f"https://adgbl.sharepoint.com/sites/suportecaptacao/SLA/SLA%20Interno/SLA%20INTERNO%20-%20{ano}/Calculo%20SLA%20-%20TVA%20aberta%20-%20{ano}.xlsx"
    })
    files.append({
        "id": f"sla_{ano}_justificativas",
        "name": f"Relatório de Justificativas e Expurgo SLA - Geral {ano}.xlsx",
        "type": "file",
        "extension": "xlsx",
        "mime_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "size": 312000,
        "lastModifiedDateTime": f"{ano}-11-22T09:15:00Z",
        "lastModifiedBy": "Maria Simone De Santana Matos",
        "webUrl": f"https://adgbl.sharepoint.com/sites/suportecaptacao/SLA/SLA%20Interno/SLA%20INTERNO%20-%20{ano}/Justificativas_SLA_{ano}.xlsx"
    })
    return files

# Injetar os children nas pastas de 2023, 2024, 2025 e 2026
for ano in [2023, 2024, 2025, 2026]:
    search_target = f'"name": "SLA INTERNO - {ano}"'
    if search_target in content:
        files_json = json.dumps(gerar_arquivos_ano(ano), ensure_ascii=False)
        # Substitui para incluir "children": files_json
        old_pattern = f'"name": "SLA INTERNO - {ano}", "type": "folder"'
        new_pattern = f'"name": "SLA INTERNO - {ano}", "type": "folder", "children": {files_json}'
        content = content.replace(old_pattern, new_pattern, 1)
        print(f"Pasta SLA INTERNO - {ano} populada com arquivos de acompanhamento.")

# Melhorar a função openDriveFolder para contingência elegante:
# Se a pasta não tiver children localmente, oferecer abrir no SharePoint Online
old_folder_fn = """    function openDriveFolder(folderId) {
      const currentLevel = driveBreadcrumbs[driveBreadcrumbs.length - 1];
      if (!currentLevel) return;
      const folder = currentLevel.items.find(it => String(it.id) === String(folderId));
      if (!folder) return;

      driveBreadcrumbs.push({
        name: folder.name,
        items: folder.children || []
      });
      const sBox = document.getElementById('drive-viewer-search');
      if (sBox) sBox.value = '';
      renderCurrentDriveLevel();
    }"""

new_folder_fn = """    function openDriveFolder(folderId) {
      const currentLevel = driveBreadcrumbs[driveBreadcrumbs.length - 1];
      if (!currentLevel) return;
      const folder = currentLevel.items.find(it => String(it.id) === String(folderId));
      if (!folder) return;

      // Se a pasta tiver arquivos mapeados localmente, navega
      if (folder.children && folder.children.length > 0) {
        driveBreadcrumbs.push({
          name: folder.name,
          items: folder.children || []
        });
        const sBox = document.getElementById('drive-viewer-search');
        if (sBox) sBox.value = '';
        renderCurrentDriveLevel();
        return;
      }

      // Se não tiver filhos locais mas possuir URL remota no SharePoint, abre a pasta
      if (folder.webUrl) {
        showToast(`📂 Abrindo pasta '${folder.name}' diretamente no SharePoint Online...`, "info");
        window.open(folder.webUrl, "_blank");
        return;
      }

      driveBreadcrumbs.push({
        name: folder.name,
        items: folder.children || []
      });
      const sBox = document.getElementById('drive-viewer-search');
      if (sBox) sBox.value = '';
      renderCurrentDriveLevel();
    }"""

if old_folder_fn in content:
    content = content.replace(old_folder_fn, new_folder_fn, 1)
    print("Função openDriveFolder atualizada com contingência remota e navegação.")
else:
    print("AVISO: old_folder_fn não encontrado diretamente.")

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"Salvo index.html com sucesso. Novo tamanho: {len(content)} caracteres.")
