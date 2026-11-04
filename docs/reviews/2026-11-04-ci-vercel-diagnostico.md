# Diagnóstico de CI e Vercel — 04/11/2026

## Confirmado

- Projeto Vercel nexusclass, repositório EzekLobo/professor-pay-app, master. Dez deployments recentes consultados: seis READY e quatro ERROR. Os três mais recentes estão READY.
- Atual: commit61c827a, deployment dpl_HSz9LhDqvMSDT7SYKKGUqeQCLP43. Build concluído04/11 às11:44:37UTC (08:44:37SãoPaulo). Log confirma compilação, TypeScript e publicação concluídos.
- Quatro deployments ERROR (a0c723a,122aec0,c0f57c8,5fc3646) têm a mesma causa confirmada nos logs: src/components/shell.tsx(80,236), TS7006, parâmetro event implicitamente any. Deployment seguinte3107feb e dois posteriores concluídos; problema histórico resolvido.
- Os12 runs CI mais recentes retornam failure. Run41823336465 (61c827a): jobs web e api passaram; e2e falhou ao instalar browsers, sem executar testes. Log: Playwright1.57.0 não suporta chromium em ubuntu26.04-x64. Mesmo erro confirmado em41821785251,41259183478 e41247256293 (31/10). Workflow remoto e local usam ubuntu-latest nos jobs.
- Correção aplicada no branch de integração: fixar `runs-on` do job e2e em `ubuntu-24.04` (compatível com Playwright1.57), em vez de depender do avanço de ubuntu-latest. A confirmação remota exige novo push; repetir run antigo usa workflow antigo e não aplica a correção.
- Run pós-push `41833950911` no SHA `78a7b73`: jobs web e API passaram, instalação de Chromium passou em Ubuntu24.04. E2E executou87 testes:76 passaram; oito falharam por expectativas do demo fixas em outubro (quatro tentavam arrastar para uma competência anterior inexistente; quatro abriram competência sem a folha oficial). Corrigidos localmente com navegação dinâmica e seleção do próximo pagamento oficial no fuso São Paulo. Os oito casos afetados passaram localmente; `quality:web` passou (573 testes/83 arquivos e build27 rotas). Novo push/CI ainda pendentes.
- Deployment Vercel do SHA `78a7b73` ficou READY; log confirma clone desse commit, build Next/TypeScript e publicação das27 rotas. Smoke `HEAD` retornou HTTP200.
- Logs runtime produção, filtro level:error, janela30min até04/11 11:55UTC: zero registros. Janela24h indisponível pela retenção do plano Hobby; não inferir ausência de falhas fora dos30min consultados.

## Fontes

- CI histórico antes da correção do runner: https://github.com/EzekLobo/professor-pay-app/actions/runs/41823336465
- Primeiro CI após fix do runner (E2E revelou expectativas temporais frágeis): https://github.com/EzekLobo/professor-pay-app/actions/runs/41833950911
- Deployment Vercel READY para `78a7b73`: https://nexusclass-7clgroec5-ezeklobos-projects.vercel.app
- Deploy atual: https://vercel.com/ezeklobos-projects/nexusclass/HSz9LhDqvMSDT7SYKKGUqeQCLP43
- Exemplo de deploy com falha histórica: https://vercel.com/ezeklobos-projects/nexusclass/6KgTL5m5wVJa7gPXLRY7Qo9CwECM
- Workflow: .github/workflows/ci.yml. Consulta remota confirmou mesmo conteúdo.

## Limites e método

Diagnóstico e primeira correção de runner confirmados remotamente. Correção das expectativas temporais nos E2E passou localmente; novo SHA/CI/deploy aguardam push. Metadados/build/runtime consultados via CLI autenticado com scope explícito ezeklobos-projects após o conector Vercel devolver403. Checkout ce592a2 foi preservado em snapshot antes da integração. Runtime production errors só foi verificável em janela curta de30min; retenção Hobby não expõe24h.
