# Segurança

## Como relatar um problema

Encontrou uma falha de segurança? Use **Security → Report a vulnerability** na página do repositório (relato privado). Se essa opção não estiver disponível, abra uma *issue* descrevendo o problema **sem** publicar detalhes que permitam explorá-lo.

Inclua, se possível: o que acontece, como reproduzir e qual o impacto.

## Como o projeto se protege

**Site**
- Não há servidor, banco de dados, login ou cookies. Favoritas, buscas salvas e tema ficam só no navegador de cada pessoa (`localStorage`).
- Todo texto vindo do PNCP é tratado como não confiável: é escapado antes de ir para a página.
- Links cadastrados pelos órgãos só são aceitos se forem `http` ou `https`. Esquemas como `javascript:` e `data:` são descartados.
- Uma *Content Security Policy* restringe a página a scripts do próprio site, fontes do Google Fonts e conexões com `pncp.gov.br`. Não há scripts embutidos no HTML.
- A planilha exportada neutraliza células que o Excel interpretaria como fórmula (*CSV injection*).
- O site é servido somente por HTTPS (GitHub Pages, com HSTS).

**Coleta (GitHub Actions)**
- O *workflow* roda apenas por agendamento ou disparo manual; não processa *pull requests* nem dados de eventos externos.
- O token da execução tem só a permissão `contents: write`, necessária para gravar os dados.
- As *actions* usadas são fixadas pelo *hash* do commit, não por uma etiqueta que pode ser movida.
- O coletor usa apenas a biblioteca padrão do Python (nenhuma dependência externa) e só acessa a API pública do PNCP.
- Campos de texto têm tamanho máximo e os links são validados antes de serem gravados.

**Repositório**
- Não há senhas, chaves ou *tokens* no código nem no histórico.

## Limitações conhecidas

- O GitHub Pages não permite configurar cabeçalhos HTTP próprios. Por isso a política de conteúdo vai em uma *meta tag*, e não é possível impedir que o site seja exibido dentro de um *iframe* de terceiros.
- As fontes são carregadas do Google Fonts, que recebe o endereço IP de quem visita o site.
- Os dados são reproduzidos como publicados no PNCP. Confira sempre o edital oficial.
