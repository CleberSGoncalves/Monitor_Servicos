import pdfplumber

pdf = pdfplumber.open(r"C:\Users\Cleber\.gemini\antigravity\brain\69a25dad-6420-47a9-86ae-6c86aeed62ba\Relatorio_Tecnico_Arquitetura_Fluxo_Dados_Seguranca_NOC.pdf")
print("Total pages:", len(pdf.pages))
for i, p in enumerate(pdf.pages):
    txt = p.extract_text() or ""
    lines = [l.strip() for l in txt.splitlines() if l.strip()]
    first_line = lines[0] if lines else "VAZIA"
    print(f"Página {i+1}: {len(txt)} caracteres | Início: {first_line[:60]}")
