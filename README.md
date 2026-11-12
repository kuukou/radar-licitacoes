# 📡 Radar de Licitações

**Consulte e filtre, em um só lugar, as licitações com propostas abertas em todo o Brasil.**

[![Atualizar licitações](https://github.com/kuukou/radar-licitacoes/actions/workflows/atualizar.yml/badge.svg)](https://github.com/kuukou/radar-licitacoes/actions/workflows/atualizar.yml)
![Fonte: PNCP](https://img.shields.io/badge/fonte-PNCP-12355b)
![Dados: CC BY 4.0](https://img.shields.io/badge/dados-CC%20BY%204.0-1f6feb)

🔗 **Acesse:** https://kuukou.github.io/radar-licitacoes

---

## Sumário

- [O que é](#o-que-é)
- [Funcionalidades](#funcionalidades)
- [Como usar o site](#como-usar-o-site)
- [Como funciona](#como-funciona)
- [Estrutura do repositório](#estrutura-do-repositório)
- [Instalação e configuração](#instalação-e-configuração)
- [Rodando localmente](#rodando-localmente)
- [Extensão para Chrome (opcional)](#extensão-para-chrome-opcional)
- [Solução de problemas](#solução-de-problemas)
- [Limitações conhecidas](#limitações-conhecidas)
- [Fonte dos dados e créditos](#fonte-dos-dados-e-créditos)

---

## O que é

O **Radar de Licitações** reúne as contratações públicas com **recebimento de propostas em aberto** publicadas no
[Portal Nacional de Contratações Públicas (PNCP)](https://pncp.gov.br), o portal oficial criado pela Lei nº 14.133/2021,
e permite pesquisar tudo com filtros rápidos, direto no navegador ou no celular.

Não precisa de cadastro, servidor nem banco de dados. O GitHub coleta os dados sozinho e o site é publicado gratuitamente pelo GitHub Pages.

## Funcionalidades

| Recurso | Descrição |
|---|---|
| 🔎 **Busca por palavras** | Procura no objeto, informações complementares, órgão, unidade e município, sem diferenciar acentos. Separe por vírgula para buscar **qualquer uma** (`cadeira, mesa, armário`). |
| 🚫 **Excluir palavras** | Remove resultados indesejados (`locação, serviço`). |
| 🗺️ **Local** | Filtro por UF e município, com sugestões automáticas. |
| 📋 **Modalidade** | Pregão eletrônico, dispensa, concorrência, credenciamento etc. |
| 💰 **Faixa de valor** | Valor estimado mínimo e máximo. |
| ⏰ **Prazo** | Mostra só o que encerra em até *X* dias. Prazos curtos ficam em destaque: vermelho para menos de 2 dias, laranja para menos de 7. |
| ↕️ **Ordenação** | Por prazo de encerramento, valor ou data de publicação. |
| ⭐ **Favoritas** | Marque licitações e filtre só as favoritas (ficam salvas no seu navegador). |
| 📤 **Exportar CSV** | Baixa o resultado filtrado em CSV compatível com Excel. |
| 🔗 **Links diretos** | Cada item leva ao edital no PNCP e ao sistema onde acontece a disputa. |
| 💾 **Memória** | Os últimos filtros usados ficam salvos no seu navegador. |

## Como usar o site

1. Acesse **https://kuukou.github.io/radar-licitacoes**.
2. No topo aparecem o total de licitações abertas e a data da última atualização.
3. Digite as palavras de interesse e ajuste os filtros. Os resultados atualizam na hora.
4. Clique no texto do objeto para expandir a descrição completa.
5. Use **Ver no PNCP ↗** para abrir o edital e **Sistema de origem ↗** para ir à plataforma da disputa.
6. Use **Exportar CSV** para levar a lista para uma planilha.

> ⚠️ O PNCP **divulga** as contratações. O envio de proposta, a sessão e os lances acontecem na plataforma indicada no edital (Compras.gov.br, BLL, Licitações-e, portais estaduais e municipais etc.). Sempre confira prazos e condições no edital oficial.

## Como funciona

```
            3x por dia (06h, 12h, 18h)
 ┌──────────────────────┐        ┌─────────────────────────┐
 │  GitHub Actions      │  API   │  PNCP — API de consulta │
 │  scripts/atualizar.py│ ─────► │  /v1/contratacoes/      │
 │                      │ ◄───── │        proposta         │
 └──────────┬───────────┘  JSON  └─────────────────────────┘
            │ grava e faz commit
            ▼
   data/licitacoes.json
            │ GitHub Pages publica
            ▼
 ┌──────────────────────┐
 │  Site (index.html)   │  filtros, ordenação e exportação
 │  roda no navegador   │  100% no lado do cliente
 └──────────────────────┘
```

1. **Coleta.** A Action [`Atualizar licitações`](.github/workflows/atualizar.yml) roda o script [`scripts/atualizar.py`](scripts/atualizar.py), que consulta o endpoint público `GET /v1/contratacoes/proposta` do PNCP **UF por UF**, com paginação, novas tentativas automáticas e até 8 requisições simultâneas.
2. **Validação.** Os registros são normalizados, deduplicados pelo número de controle PNCP e conferidos (a API às vezes ignora filtros). Licitações já encerradas são descartadas.
3. **Publicação.** O resultado vai para [`data/licitacoes.json`](data/licitacoes.json) com um commit automático, e o GitHub Pages publica a nova versão.
4. **Consulta.** O site carrega esse arquivo uma vez e faz todos os filtros no próprio navegador, por isso é instantâneo.

## Estrutura do repositório

```
radar-licitacoes/
├── index.html                    # Página do site
├── assets/
│   ├── css/app.css               # Estilos
│   └── js/app.js                 # Lógica: carga dos dados, filtros, tabela, CSV
├── data/
│   └── licitacoes.json           # Dados coletados (gerado automaticamente — não editar)
├── scripts/
│   └── atualizar.py              # Coletor do PNCP (Python puro, sem dependências)
├── extensao-chrome/              # Versão extensão, que consulta o PNCP ao vivo
├── .github/workflows/
│   └── atualizar.yml             # Agendamento da coleta
├── .nojekyll                     # Faz o GitHub Pages servir os arquivos como estão
└── README.md
```

## Instalação e configuração

Para criar sua própria cópia do Radar:

1. **Fork / cópia.** Faça um *fork* deste repositório ou crie um repositório **público** com estes arquivos.
2. **GitHub Pages.** Em **Settings → Pages**, escolha **Source:** *Deploy from a branch*, **Branch:** `main`, pasta `/ (root)`, e clique em **Save**.
3. **Permissões da Action.** Em **Settings → Actions → General → Workflow permissions**, marque **Read and write permissions**. Isso permite que a Action salve os dados.
4. **Primeira coleta.** Em **Actions → Atualizar licitações → Run workflow**. A coleta do Brasil inteiro leva cerca de 10 a 30 minutos.
5. **Pronto.** O site fica em `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO`.

### Mudar o horário das atualizações

Edite a linha `cron` em [`.github/workflows/atualizar.yml`](.github/workflows/atualizar.yml). O horário é em **UTC**, ou seja, Brasília + 3 horas:

```yaml
- cron: "17 9,15,21 * * *"   # 06h17, 12h17 e 18h17 em Brasília
```

> O GitHub pode atrasar execuções agendadas em alguns minutos e **pausa agendamentos de repositórios sem atividade por 60 dias**. Como a própria Action faz commits, isso normalmente não acontece.

## Rodando localmente

Requisitos: **Python 3.9+** (só a biblioteca padrão).

```bash
# 1. Coletar os dados (gera data/licitacoes.json)
python scripts/atualizar.py

# 2. Servir o site
python -m http.server 8000
# abra http://localhost:8000
```

> Abrir o `index.html` direto do disco (`file://`) não funciona, porque o navegador bloqueia a leitura do JSON. Use o servidor acima.

## Extensão para Chrome (opcional)

A pasta [`extensao-chrome/`](extensao-chrome/) tem uma versão em extensão que consulta o PNCP **ao vivo**, sem esperar a próxima coleta. É útil para ver publicações de poucos minutos atrás ou como reserva se a coleta automática falhar. Instruções em [`extensao-chrome/README.md`](extensao-chrome/README.md).

## Solução de problemas

| Sintoma | O que fazer |
|---|---|
| Site abre com "Os dados ainda não foram coletados" | Rode **Actions → Atualizar licitações → Run workflow** e aguarde ficar ✅. |
| Site mostra dados antigos | Aguarde 1 a 2 minutos após a Action terminar e recarregue com **Ctrl+F5**. |
| Action falhou ❌ na etapa *Coletar* | O PNCP às vezes fica instável. Rode de novo mais tarde. |
| Action falhou ❌ na etapa *Publicar dados* com erro 403 | Ative **Read and write permissions** (passo 3 da instalação). |
| Status mostra "X página(s) do PNCP falharam" | Parte dos dados não veio nessa coleta. A próxima execução normalmente completa. |
| Valor aparece como "sigiloso / n/d" | O órgão não informou o valor estimado (orçamento sigiloso é permitido por lei). |

## Limitações conhecidas

- **Cobertura.** O radar mostra o que está no PNCP. Órgãos que ainda publicam só em portais próprios podem não aparecer.
- **Atualização.** Os dados são atualizados 3 vezes por dia, não em tempo real. Para tempo real, use a extensão.
- **Qualidade da fonte.** Descrições, valores e municípios vêm como o órgão cadastrou e podem ter erros ou campos vazios.
- **Busca textual.** A busca é feita localmente sobre os campos coletados. O conteúdo dos PDFs dos editais não é pesquisado.

## Fonte dos dados e créditos

- Dados: **[Portal Nacional de Contratações Públicas — PNCP](https://pncp.gov.br)**, via [API de consulta pública](https://pncp.gov.br/api/consulta/swagger-ui/index.html), sob licença **[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.pt-br)**.
- Este projeto não tem vínculo com o Governo Federal. As informações são reproduzidas como publicadas na fonte oficial.
