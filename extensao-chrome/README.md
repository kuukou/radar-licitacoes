# Radar de Licitações — Extensão para Chrome

Versão do Radar que consulta a API do PNCP **ao vivo**, direto do navegador, sem depender da coleta automática do site.

## Quando usar

- Para ver licitações publicadas há poucos minutos (o site atualiza a cada 6 horas).
- Como reserva, se a coleta automática do site falhar.

Para o uso do dia a dia, prefira o site: https://kuukou.github.io/radar-licitacoes

## Instalação

1. Baixe esta pasta. A forma mais fácil é **Code → Download ZIP** na página do repositório e depois descompactar.
2. No Chrome, abra `chrome://extensions`.
3. Ative o **Modo do desenvolvedor**, no canto superior direito.
4. Clique em **Carregar sem compactação** e selecione a pasta `extensao-chrome`.
5. Fixe o ícone na barra. Ao clicar nele, o Radar abre em uma nova aba.

## Como usar

1. Em **Buscar no PNCP**, escolha a UF (ou *Todas*), a modalidade (opcional) e até quando as propostas podem encerrar.
2. Clique em **Buscar no PNCP** e acompanhe a barra de progresso. Dá para interromper a qualquer momento com **Parar**.
3. Use os filtros e a tabela como no site. A última busca fica salva e abre na hora da próxima vez.

> Buscar *Todas* as UFs pode levar alguns minutos. Para uma consulta rápida, escolha uma UF.

## Arquivos

| Arquivo | Função |
|---|---|
| `manifest.json` | Configuração da extensão (Manifest V3). Permissões: `storage`, `unlimitedStorage` e acesso a `pncp.gov.br`. |
| `bg.js` | Abre a página do app ao clicar no ícone. |
| `app.html` · `app.css` · `app.js` | Interface, consulta à API, filtros e exportação CSV. |

## Privacidade

A extensão só acessa `pncp.gov.br`. Buscas, favoritas e filtros ficam salvos apenas no seu navegador (`chrome.storage.local`).
