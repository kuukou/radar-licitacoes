# Bibliotecas de terceiros

## firebase.js

Pacote único com **só** as funções do Firebase que o site usa (login por e-mail/senha e leitura/gravação de um documento no Firestore). Fica hospedado junto com o site para que a página não precise carregar scripts de outros domínios.

- Origem: pacote oficial `firebase` do npm, versão **13.3.0**
- Entrada: [`firebase.entrada.js`](firebase.entrada.js)
- Empacotador: `esbuild` 0.28.2

Para gerar de novo (por exemplo, ao atualizar a versão):

```bash
mkdir /tmp/fb && cd /tmp/fb && npm init -y
npm install firebase@13.3.0 esbuild
cp <repositório>/assets/vendor/firebase.entrada.js entry.js
npx esbuild entry.js --bundle --format=esm --minify --target=es2020 --legal-comments=none --outfile=firebase.js
cp firebase.js <repositório>/assets/vendor/firebase.js
```

O SDK do Firebase é distribuído pelo Google sob a licença Apache 2.0.
