# Segurança

## Como relatar um problema

Encontrou uma falha de segurança? Use **Security → Report a vulnerability** na página do repositório (relato privado). Se essa opção não estiver disponível, abra uma *issue* descrevendo o problema **sem** publicar detalhes que permitam explorá-lo.

Inclua, se possível: o que acontece, como reproduzir e qual o impacto.

## Como o projeto se protege

**Site**
- Sem conta, nada é enviado a servidores: favoritas, buscas salvas e tema ficam só no navegador de cada pessoa (`localStorage`). Não há cookies de rastreamento.
- Todo texto vindo do PNCP é tratado como não confiável: é escapado antes de ir para a página.
- Links cadastrados pelos órgãos só são aceitos se forem `http` ou `https`. Esquemas como `javascript:` e `data:` são descartados.
- Uma *Content Security Policy* restringe a página a scripts do próprio site, fontes do Google Fonts e conexões com `pncp.gov.br` e com os serviços de login e banco do Firebase. Não há scripts embutidos no HTML nem carregados de outros domínios.
- A planilha exportada neutraliza células que o Excel interpretaria como fórmula (*CSV injection*).
- O site é servido somente por HTTPS (GitHub Pages, com HSTS).

**Conta (opcional, Firebase)**
- O login usa e-mail e senha pelo Firebase Authentication. As senhas nunca passam pelo código do site nem ficam ao alcance do mantenedor.
- Cada conta tem um único documento no banco, com favoritas e buscas salvas. As regras em [`firestore.rules`](firestore.rules) permitem que cada pessoa leia e altere **apenas o próprio documento**, limitam o formato e o tamanho do conteúdo e bloqueiam todo o resto.
- As mensagens de erro não revelam se um e-mail está cadastrado.
- Os dados recebidos da conta são conferidos (tipo e tamanho) antes de serem usados na página.
- O SDK do Firebase é empacotado a partir do pacote oficial e hospedado junto com o site, em versão fixa ([`assets/vendor/LEIA-ME.md`](assets/vendor/LEIA-ME.md)).
- Os dados em `assets/js/config.js` identificam o projeto e são públicos por natureza; não são segredos.
- O próprio usuário pode excluir a conta e os dados.

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
