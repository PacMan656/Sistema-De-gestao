# Publicar no GitHub Pages

A edição local do PatriTI funciona inteiramente no navegador, sem hospedagem Node.js e sem mensalidade de servidor. O banco usa IndexedDB por meio do PGlite; a interface, os arquivos do banco e os PDFs são processados no dispositivo.

Endereço: **https://pacman656.github.io/Sistema-De-gestao/**

## Publicação

1. No GitHub, abra o repositório **PacMan656/Sistema-De-gestao → Settings → Pages**.
2. Em **Build and deployment → Source**, selecione **GitHub Actions**.
3. O workflow **Publish local edition to GitHub Pages** instala as dependências, verifica TypeScript, executa os testes, gera a edição local e publica `dist/`.
4. Quando o workflow terminar, abra o endereço acima. As próximas alterações enviadas a `main` atualizam a publicação automaticamente.

## Primeiro acesso

1. Abra o site no navegador em que pretende usar o inventário.
2. Aguarde a preparação do banco local. Na primeira visita, o download é maior por incluir o motor do banco.
3. Crie a senha do setor **TI**. No modo local não existe código de configuração de servidor.
4. Em **Setores e Acessos**, cadastre os setores e suas senhas.
5. Cadastre os equipamentos. Desktops e notebooks podem receber vários periféricos do mesmo setor.
6. Use **Exportar backup** periodicamente. Para recuperar os registros, escolha **Restaurar backup** e confirme a substituição dos dados.

O backup contém o inventário e os hashes das senhas locais. Guarde-o em um local de sua confiança. O backup não é enviado ao GitHub nem a outro servidor.

## Limitações da edição local

- Cada navegador/dispositivo tem seu próprio banco. Acessos criados em um computador não aparecem em outro.
- A validação de senha acontece localmente e não constitui autenticação protegida por servidor. Quem controla o dispositivo também pode acessar os dados armazenados nele.
- Limpar os dados do navegador remove o inventário. Reinstalar ou trocar de navegador exige restaurar um backup.
- O histórico de chamados e mensagens fica no navegador. Não há comunicação entre computadores ou setores em dispositivos diferentes.
- Diagnóstico TCP e envio direto de impressão por rede dependem de servidor. PDFs, etiquetas e impressão pelo navegador continuam disponíveis; WebUSB depende do navegador/dispositivo.
- Depois da primeira carga completa e da instalação do cache, os recursos locais podem funcionar offline. O navegador pode remover dados por política de armazenamento; mantenha backups externos.

## Conferir a edição local no computador

```sh
npm install
npm run build:pages
npm run preview:pages
```

Abra **http://127.0.0.1:4173/Sistema-De-gestao/**. Esse banco local é separado do banco do endereço público e do banco da versão Node.js.

## Versão com servidor (opcional)

O código do servidor permanece no repositório. Para usar dados centralizados e autenticação no servidor, execute `npm run build` e `npm start` com Node.js 24.12 ou superior, uma pasta persistente em `PATRITI_DATA_DIR` e acesso HTTPS. Essa versão não roda no GitHub Pages.

Referências: [GitHub Pages com Vite](https://vite.dev/guide/static-deploy.html#github-pages), [PGlite no navegador](https://pglite.dev/docs/), [armazenamento IndexedDB](https://pglite.dev/docs/filesystems).
