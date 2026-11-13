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
- [Login e sincronização (opcional)](#login-e-sincronização-opcional)
- [Extensão para Chrome (opcional)](#extensão-para-chrome-opcional)
- [Solução de problemas](#solução-de-problemas)
- [Limitações conhecidas](#limitações-conhecidas)
- [Segurança e privacidade](#segurança-e-privacidade)
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
| 🗺️ **Estados e municípios** | Marque um ou mais estados. O campo de município sugere só cidades dos estados marcados. |
| 📋 **Modalidade, valor e prazo** | Pregão, dispensa, concorrência etc.; faixa de valor estimado; "encerra em até *X* dias". |
| 🆕 **Novas desde a última visita** | Selo "Nova" e atalho para ver só o que apareceu desde a sua visita anterior. |
| 🔖 **Buscas salvas** | Guarde um conjunto de filtros com nome e reabra com um clique. |
| 🔗 **Link da busca** | Os filtros ficam no endereço da página: copie e envie a busca pronta para alguém. |
| 📡 **Radar** | Cada ponto é uma licitação que encerra em até 7 dias. Passe o mouse ou toque para ver; "Ver na lista" leva até ela. |
| 📦 **Itens da licitação** | Ao abrir um cartão, o site busca no PNCP o que está sendo comprado (descrição, quantidade e valor unitário). |
| 📅 **Prazo na agenda** | Baixa um evento `.ics` com o encerramento e lembretes, para Google Agenda, Outlook ou celular. |
| ⭐ **Favoritas** | Marque licitações e filtre só as favoritas. |
| 📤 **Baixar planilha** | Exporta o resultado filtrado em CSV compatível com Excel. |
| 🌙 **Modo escuro** | Troca de tema animada; a escolha fica salva. |
| 👤 **Conta (opcional)** | Com login por e-mail e senha, favoritas e buscas salvas acompanham a pessoa em qualquer aparelho. |

> Sem conta, favoritas, buscas salvas, tema e a marcação de "novas" ficam guardados **no navegador de cada pessoa** (`localStorage`): cada visitante tem a sua própria lista. Com o [login ativado](#login-e-sincronização-opcional), favoritas e buscas salvas passam a ficar na conta.

## Como usar o site

1. Acesse **https://kuukou.github.io/radar-licitacoes**.
2. Digite o que você vende no campo de busca. Os resultados atualizam na hora.
3. Use os atalhos (Novas, Encerra em 7 dias, Pregão eletrônico, Dispensa, Favoritas) ou abra **Filtros** para estados, município, modalidade, valor e prazo.
4. Os filtros ativos aparecem acima da lista. Clique no ✕ de um deles para removê-lo.
5. Clique em uma licitação para ver detalhes, itens e o botão de agenda.
6. Use **Abrir edital** para ir ao PNCP e **Onde enviar proposta** para ir à plataforma da disputa.
7. Gostou da busca? **Salvar esta busca** guarda para depois; **Copiar link da busca** gera um endereço para compartilhar.

> ⚠️ O PNCP **divulga** as contratações. O envio de proposta, a sessão e os lances acontecem na plataforma indicada no edital (Compras.gov.br, BLL, Licitações-e, portais estaduais e municipais etc.). Sempre confira prazos e condições no edital oficial.

## Como funciona

```
        6x por dia (a cada 3 horas, das 6h às 21h)
 ┌──────────────────────┐        ┌─────────────────────────┐
 │  GitHub Actions      │  API   │  PNCP — API de consulta │
 │  scripts/atualizar.py│ ─────► │  /v1/contratacoes/      │
 │                      │ ◄───── │        proposta         │
 └──────────┬───────────┘  JSON  └─────────────────────────┘
            │ grava e faz commit
            ▼
   data/indice.json  +  data/uf/<UF>.json
            │ GitHub Pages publica
            ▼
 ┌──────────────────────┐
 │  Site (index.html)   │  filtros, ordenação e exportação
 │  roda no navegador   │  100% no lado do cliente
 └──────────────────────┘
```

1. **Coleta incremental.** A Action [`Atualizar licitações`](.github/workflows/atualizar.yml) roda [`scripts/atualizar.py`](scripts/atualizar.py), que consulta o endpoint público `GET /v1/contratacoes/proposta` do PNCP estado por estado. A API é lenta e instável (são cerca de 700 páginas para o Brasil todo), então o coletor:
   - aproveita o que já foi baixado em execuções anteriores;
   - começa pelos estados há mais tempo sem uma varredura completa;
   - só substitui um estado por inteiro quando todas as páginas dele vieram; se faltou alguma, soma o que veio ao que já existia;
   - faz 3 requisições simultâneas, com novas tentativas e espera crescente em caso de erro;
   - para ao atingir o limite de tempo (150 minutos), grava o que tem e continua na próxima execução.
2. **Arquivos por estado.** Cada estado vira um arquivo em `data/uf/`. O `data/indice.json` guarda os totais, os pontos do radar e o diagnóstico da última coleta (`falhas`, `erros`, `duracao_seg`).
3. **Publicação.** A Action faz um commit com os dados e o GitHub Pages publica a nova versão.
4. **Consulta.** O site lê o índice, carrega só os estados necessários (todos, ou apenas os que você marcou) e filtra tudo no navegador. Os itens de cada licitação são buscados direto no PNCP quando o cartão é aberto.

## Estrutura do repositório

```
radar-licitacoes/
├── index.html                    # Página do site
├── privacidade.html              # Política de Privacidade
├── firestore.rules               # Regras do banco (cada conta só acessa os próprios dados)
├── assets/
│   ├── css/app.css               # Estilos (tema claro e escuro)
│   ├── js/app.js                 # Lógica: carga dos dados, filtros, lista, radar, agenda, CSV
│   ├── js/tema.js                # Aplica o tema salvo antes de a página aparecer
│   ├── js/config.js              # Dados do projeto Firebase (vazio = site sem login)
│   ├── js/conta.js               # Login e sincronização de favoritas e buscas
│   ├── vendor/firebase.js        # SDK do Firebase empacotado (só o que o site usa)
│   └── img/og.png                # Imagem de prévia ao compartilhar o link
├── data/                         # Gerado automaticamente — não editar
│   ├── indice.json               # Totais por estado, pontos do radar, diagnóstico da coleta
│   └── uf/<UF>.json              # Licitações abertas de cada estado
├── scripts/
│   └── atualizar.py              # Coletor do PNCP (Python puro, sem dependências)
├── extensao-chrome/              # Versão extensão, que consulta o PNCP ao vivo
├── .github/workflows/
│   └── atualizar.yml             # Agendamento da coleta
├── .nojekyll                     # Faz o GitHub Pages servir os arquivos como estão
├── SECURITY.md                   # Política de segurança
└── README.md
```

## Instalação e configuração

Para criar sua própria cópia do Radar:

1. **Fork / cópia.** Faça um *fork* deste repositório ou crie um repositório **público** com estes arquivos.
2. **GitHub Pages.** Em **Settings → Pages**, escolha **Source:** *Deploy from a branch*, **Branch:** `main`, pasta `/ (root)`, e clique em **Save**.
3. **Permissões da Action.** Em **Settings → Actions → General → Workflow permissions**, marque **Read and write permissions**. Isso permite que a Action salve os dados.
4. **Primeira coleta.** Em **Actions → Atualizar licitações → Run workflow**. A varredura do Brasil inteiro leva de 1 a 3 horas, porque a API do PNCP é lenta. Se não der tempo, a execução seguinte continua de onde parou.
5. **Pronto.** O site fica em `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO`.

### Mudar o horário das atualizações

Edite a linha `cron` em [`.github/workflows/atualizar.yml`](.github/workflows/atualizar.yml). O horário é em **UTC**, ou seja, Brasília + 3 horas:

```yaml
- cron: "17 0,9,12,15,18,21 * * *"   # 06h17, 09h17, 12h17, 15h17, 18h17 e 21h17 em Brasília
```

> O GitHub pode atrasar execuções agendadas em alguns minutos e **pausa agendamentos de repositórios sem atividade por 60 dias**. Como a própria Action faz commits, isso normalmente não acontece.

## Rodando localmente

Requisitos: **Python 3.9+** (só a biblioteca padrão).

```bash
# 1. Coletar os dados (gera data/indice.json e data/uf/*.json)
python scripts/atualizar.py                       # Brasil inteiro (demora)
python scripts/atualizar.py --ufs SP,MG --limite 20   # só alguns estados, por até 20 minutos

# 2. Servir o site
python -m http.server 8000
# abra http://localhost:8000
```

> Abrir o `index.html` direto do disco (`file://`) não funciona, porque o navegador bloqueia a leitura do JSON. Use o servidor acima.

## Login e sincronização (opcional)

O site funciona sem login. Para que favoritas e buscas salvas acompanhem cada pessoa em qualquer aparelho, ative o login com o [Firebase](https://firebase.google.com) (plano gratuito, sem cartão):

1. Em https://console.firebase.google.com, crie um projeto (sem Google Analytics).
2. **Authentication → Método de login → E-mail/senha**: ative.
3. **Firestore Database → Criar banco de dados**: local `southamerica-east1`, modo produção.
4. **Firestore → Regras**: substitua o conteúdo pelo do arquivo [`firestore.rules`](firestore.rules) e publique.
5. **Configurações do projeto → Seus aplicativos → Web (`</>`)**: registre um app e copie o `firebaseConfig`.
6. Cole os dados em [`assets/js/config.js`](assets/js/config.js), no lugar de `null`.
7. Recomendado: em **Google Cloud Console → APIs e serviços → Credenciais**, restrinja a chave do navegador ao endereço do site (`https://SEU-USUARIO.github.io/*`).

Como funciona:

- O botão **Entrar** só aparece quando `config.js` está preenchido. Sem isso, o SDK do Firebase nem é carregado.
- No primeiro login em um navegador, o que já estava marcado ali é somado ao que está na conta. Depois, a conta é a referência.
- Ao sair, os dados continuam na conta e são removidos do navegador (pensando em computadores compartilhados).
- **Minha conta → Excluir minha conta** apaga o e-mail e os dados na hora.
- O SDK fica hospedado junto com o site ([`assets/vendor/`](assets/vendor/LEIA-ME.md)), então a página não carrega scripts de outros domínios.

> Ao ativar o login, você passa a tratar dados pessoais (o e-mail de quem se cadastra). O site já traz uma [Política de Privacidade](privacidade.html) e a exclusão de conta; revise o texto e o contato antes de divulgar.

## Extensão para Chrome (opcional)

A pasta [`extensao-chrome/`](extensao-chrome/) tem uma versão em extensão que consulta o PNCP **ao vivo**, sem esperar a próxima coleta. É útil para ver publicações de poucos minutos atrás ou como reserva se a coleta automática falhar. Instruções em [`extensao-chrome/README.md`](extensao-chrome/README.md).

## Solução de problemas

| Sintoma | O que fazer |
|---|---|
| Site abre com "Os dados ainda estão sendo coletados" | Rode **Actions → Atualizar licitações → Run workflow** e aguarde ficar ✅. |
| Site mostra dados antigos | Aguarde 1 a 2 minutos após a Action terminar e recarregue com **Ctrl+F5**. |
| Um estado aparece com poucas licitações | A varredura dele ainda não foi concluída. As próximas execuções completam. |
| Action falhou ❌ na etapa *Coletar* | O PNCP às vezes fica fora do ar. A próxima execução agendada tenta de novo. |
| Action falhou ❌ na etapa *Publicar dados* com erro 403 | Ative **Read and write permissions** (passo 3 da instalação). |
| Quero saber por que faltaram páginas | Abra `data/indice.json`: os campos `falhas` e `erros` mostram quantas páginas faltaram e o motivo (`HTTP 500`, `TimeoutError` etc.). |
| "Não foi possível carregar os itens agora" | O PNCP não respondeu a tempo. Os itens estão no edital. |
| Valor aparece como "não divulgado" ou "simbólico" | O órgão não informou o valor estimado (orçamento sigiloso é permitido por lei) ou cadastrou um valor fictício, como R$ 1. |
| Ao usar **Re-run jobs**, a coleta roda com código antigo | *Re-run* repete a execução antiga. Use sempre **Run workflow** para rodar a versão atual. |

## Limitações conhecidas

- **Cobertura.** O radar mostra o que está no PNCP. Órgãos que ainda publicam só em portais próprios podem não aparecer.
- **Atualização.** A coleta roda 6 vezes por dia (a cada 3 horas, das 6h às 21h). Como a varredura completa é demorada, uma licitação nova pode levar algumas horas para aparecer. Para tempo real, use a extensão.
- **Sincronização só com conta.** Sem login, favoritas e buscas salvas ficam em um único navegador. Com login, a sincronização acontece ao abrir o site e a cada mudança, não em tempo real entre abas abertas.
- **Qualidade da fonte.** Descrições, valores e municípios vêm como o órgão cadastrou e podem ter erros ou campos vazios.
- **Busca textual.** A busca é feita localmente sobre os campos coletados. O conteúdo dos PDFs dos editais não é pesquisado.

## Segurança e privacidade

- **Sem rastreamento.** O site não tem cookies de rastreamento nem ferramentas de análise. Sem conta, tudo fica no navegador do visitante.
- **Conta com o mínimo de dados.** O login pede só e-mail e senha. As regras do banco ([`firestore.rules`](firestore.rules)) garantem que cada conta só leia e altere os próprios dados, e a conta pode ser excluída pelo próprio usuário.
- **Dados externos tratados como não confiáveis.** Textos do PNCP são escapados, links só são aceitos em `http`/`https` e a planilha exportada é protegida contra fórmulas maliciosas.
- **Política de conteúdo (CSP).** A página só executa scripts do próprio site e só se conecta ao `pncp.gov.br` e aos serviços de login e banco do Firebase.
- **Coleta com privilégio mínimo.** A Action tem apenas permissão de escrita no conteúdo do repositório, usa *actions* fixadas por *hash* e nenhum pacote de terceiros.

Detalhes e como relatar um problema: [`SECURITY.md`](SECURITY.md).

## Fonte dos dados e créditos

- Dados: **[Portal Nacional de Contratações Públicas — PNCP](https://pncp.gov.br)**, via [API de consulta pública](https://pncp.gov.br/api/consulta/swagger-ui/index.html), sob licença **[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.pt-br)**.
- Este projeto não tem vínculo com o Governo Federal. As informações são reproduzidas como publicadas na fonte oficial.
