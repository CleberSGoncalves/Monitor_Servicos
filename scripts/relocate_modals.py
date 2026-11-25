from pathlib import Path

index_path = Path("dashboard/static/index.html")
content = index_path.read_text(encoding="utf-8")

start_marker = "<!-- MODAL DE PIPELINE LIVE (fma.log & FLUXO DE EMU) -->"
end_marker = 'onclick="closePipelineLiveGuideModal()"'

p1 = content.find(start_marker)
p_btn = content.find(end_marker, p1)
assert p1 != -1 and p_btn != -1, "Marcadores não encontrados"

# Procura o fechamento das duas divs após o botão
p2 = content.find("</div>\n      </div>", p_btn) + len("</div>\n      </div>")

extracted = content[p1:p2]

# Remove o bloco de onde estava
new_content = content[:p1] + content[p2:]

# Insere imediatamente antes de </body>
body_pos = new_content.rfind("</body>")
assert body_pos != -1, "</body> não encontrado"

final_content = new_content[:body_pos] + "\n\n" + extracted + "\n\n" + new_content[body_pos:]
index_path.write_text(final_content, encoding="utf-8")
print(f"Modais realocados com sucesso! Tamanho do bloco: {len(extracted)} caracteres.")
