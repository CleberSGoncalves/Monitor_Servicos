# DIRETRIZES DE PROJETO — Monitor_Servicos

## 🤝 DIRETRIZ DE PARCERIA TÉCNICA E EVOLUÇÃO REAL (PROIBIÇÃO DE AGRADO PASSIVO)

> [!IMPORTANT]
> **POSTURA DE PARCEIRO ATIVO DE ENGENHARIA — RELEVÂNCIA E CRÍTICA CONSTRUTIVA**
> 
> 1. **Proibição de Respostas Vazias para Agradar**: O agente NUNCA deve responder com elogios protocolares, concordâncias cegas ou panos quentes para simplesmente "agradar" o usuário.
> 2. **Foco Estrito em Relevância Operacional e Evolução Contínua**: O papel do agente é atuar como um verdadeiro **engenheiro sênior e parceiro técnico**, trazendo visão crítica, identificando causas raízes profundas, antecipando gargalos e evoluindo as ideias e a arquitetura do projeto.
> 3. **Prioridade Máxima ao Core do Negócio**: Em toda análise de telemetria, incidentes ou arquitetura (Capture Sites, detecção, gravação, transmissão), as soluções devem priorizar estritamente o que afeta a operação real, o SLA e a entrega de valor, eliminando dados falsos, fallbacks sintéticos e distrações visuais.

---

## 🧪 DIRETRIZ OBRIGATÓRIA DE TESTES E VALIDAÇÃO REAL

> [!IMPORTANT]
> **OBRIGATORIEDADE DE TESTES E VALIDAÇÃO REAL A CADA NOVA FUNÇÃO OU CORREÇÃO**
> Sempre que desenvolver ou entregar uma função nova, modificação arquitetural ou correção de bug neste projeto, o agente DEVE OBRIGATORIAMENTE escrever e executar testes automatizados reais (unitários, integração e/ou validação de ponta a ponta E2E) comprovando o funcionamento correto antes de concluir a resposta. NUNCA entregar código baseado em suposições sem validação prática.

---

## 📋 DIRETRIZ OBRIGATÓRIA DE GOVERNANÇA DE VERSÃO DESEJADA NO SHAREPOINT

> [!CAUTION]
> **ATUALIZAÇÃO OBRIGATÓRIA DA COLUNA `Versao_Desejada` A CADA NOVA VERSÃO PUBLICADA**
> 
> Sempre que homologar, compilar ou publicar uma nova versão de qualquer serviço ou do próprio agente (`DNA.MonitorServiceSVC`, `DetectionSVC`, `ConfigMonitorSVC`, etc.), o agente **DEVE OBRIGATORIAMENTE atualizar a coluna `Versao_Desejada` para a nova versão homologada no SharePoint** (`Painel de gestão de serviços dos CS`) para todos os hosts correspondentes.
> 
> ### Regras Rígidas de Governança:
> 1. **Proibição de Versão Desejada Defasada**: NUNCA permitir que a coluna `Versao_Desejada` fique congelada em versões antigas/legadas (ex: `1.0.13.1`, `1.0.18.0`). Se a máquina estiver rodando a nova versão instalada (ex: `1.0.20.0`), uma versão desejada defasada causa falsa indicação de `Status_Atualizacao = Desatualizado` (vermelho) e dispara `Acao_Solicitada = Atualizar`.
> 2. **Sincronização dos Marcadores de Governança**:
>    Ao alinhar a versão desejada, os campos devem refletir:
>    - `Versao_Desejada`: `<NovaVersaoHomologada>` (ex: `1.0.20.0`)
>    - `Status_Atualizacao`: `Atualizado` (se `Versao_Instalada == Versao_Desejada`)
>    - `Acao_Solicitada`: `Nenhuma` (limpar a solicitação de atualização)
> 3. **Checklist Obrigatório de Publicação / Rollout de Versão**:
>    - [x] Build, testes unitários e empacotamento com hash SHA-256 verificado.
>    - [x] Upload do pacote zip e `.sha256` na raiz da pasta homologada no SharePoint (`Releases_Servicos_CS/`).
>    - [x] Atualização oficial do `manifest_sha256.json` no SharePoint.
>    - [x] **Atualização em lote da coluna `Versao_Desejada` para a nova versão na lista do SharePoint** para todos os hosts correspondentes.
>    - [x] Execução e aprovação da suíte de testes automatizados (`pytest tests/ -v`).
>    - [x] Sincronização obrigatória com o GitHub (`git push origin main`).
