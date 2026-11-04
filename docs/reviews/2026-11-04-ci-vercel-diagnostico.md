# Diagnóstico de CI e Vercel — 04/11/2026

## Confirmado

- Projeto Vercel nexusclass, repositório EzekLobo/professor-pay-app, master. Dez deployments recentes consultados: seis READY e quatro ERROR. Os três mais recentes estão READY.
- Atual: commit61c827a, deployment dpl_HSz9LhDqvMSDT7SYKKGUqeQCLP43. Build concluído04/11 às11:44:37UTC (08:44:37SãoPaulo). Log confirma compilação, TypeScript e publicação concluídos.
- Quatro deployments ERROR (a0c723a,122aec0,c0f57c8,5fc3646) têm a mesma causa confirmada nos logs: src/components/shell.tsx(80,236), TS7006, parâmetro event implicitamente any. Deployment seguinte3107feb e dois posteriores concluídos; problema histórico resolvido.
- Os12 runs CI mais recentes retornam failure. Run41823336465 (61c827a): jobs web e api passaram; e2e falhou ao instalar browsers, sem executar testes. Log: Playwright1.57.0 não suporta chromium em ubuntu26.04-x64. Mesmo erro confirmado em41821785251,41259183478 e41247256293 (31/10). Workflow remoto e local usam ubuntu-latest nos jobs.
- Correção indicada: fixar runs-on do job e2e em ubuntu-24.04 (há dependências correspondentes na versão Playwright instalada), em vez de depender do avanço de ubuntu-latest. Depois publicar a alteração de workflow e confirmar um novo CI verde. Repetir run antigo usa workflow antigo e não aplica a correção.
- Logs runtime produção, filtro level:error, janela30min até04/11 11:55UTC: zero registros. Janela24h indisponível pela retenção do plano Hobby; não inferir ausência de falhas fora dos30min consultados.

## Fontes

- CI atual: https://github.com/EzekLobo/professor-pay-app/actions/runs/41823336465
- Deploy atual: https://vercel.com/ezeklobos-projects/nexusclass/HSz9LhDqvMSDT7SYKKGUqeQCLP43
- Exemplo de deploy com falha histórica: https://vercel.com/ezeklobos-projects/nexusclass/6KgTL5m5wVJa7gPXLRY7Qo9CwECM
- Workflow: .github/workflows/ci.yml. Consulta remota confirmou mesmo conteúdo.

## Limites e método

Investigação somente: nenhuma alteração de workflow/código/configuração remota, rerun ou deploy executado. Metadados via conector Vercel; build/runtime via CLI com scope explícito ezeklobos-projects porque conector negou acesso aos logs. CLI autenticada conseguiu ler os logs. Checkout local em ce592a2 com trabalho anterior não commitado; análise do estado publicado baseada nas fontes remotas, sem pull/reset.
