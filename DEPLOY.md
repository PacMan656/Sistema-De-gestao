# Publicar o PatriTI no Firebase gratuito

Esta edi??o usa Firebase Hosting, Authentication por senha e Cloud Firestore no plano Spark. N?o usa Cloud Functions, Cloud Run ou Storage, nem exige ativar faturamento. Os dados ficam compartilhados no projeto da organiza??o, com autoriza??o nas regras do Firestore.

## Preparar o projeto da organiza??o

1. Crie um projeto no [Firebase Console](https://console.firebase.google.com/) e mantenha o plano **Spark**. Informe o ID do projeto ao respons?vel pela publica??o. O projeto antigo n?o ser? reutilizado automaticamente.
2. Registre um aplicativo Web. O Firebase Hosting disponibiliza a configura??o p?blica em `/__/firebase/init.json`; n?o copie chaves administrativas para o c?digo.
3. Em **Authentication ? Sign-in method**, habilite **Email/Password**. A interface continua pedindo somente c?digo de setor e senha; os identificadores de conta internos n?o s?o e-mails pessoais.
4. Em **Authentication ? Users**, crie o usu?rio inicial **patriti-ti@patriti.invalid**. Digite a senha diretamente no console e guarde-a no gerenciador da organiza??o. Copie somente o **UID** desse usu?rio para preparar as regras; n?o envie a senha no chat ou no terminal.
5. Crie o banco **Cloud Firestore** em modo de produ??o, com regras fechadas. Escolha a regi?o ap?s avaliar os requisitos da organiza??o (por exemplo, S?o Paulo quando dispon?vel). O local do banco n?o pode ser alterado depois de criado.

## Preparar e publicar

Use Node.js conforme `.node-version` e Java 21 ou superior para os emuladores de teste.

```sh
npm ci
npm run firebase -- login
npm run firebase:prepare -- --project ID_DO_PROJETO --admin-uid UID_DO_TI
npm run lint
npm test
npm run test:rules
npm run test:firebase
npm run build:firebase
npm run security:build
npm run firebase -- deploy --project ID_DO_PROJETO --config .firebase.deploy.json --only hosting,firestore:rules
```

O preparo fixa o UID inicial nas regras geradas em `.firebase/` (ignorado pelo Git). As regras versionadas, sem preparo, n?o permitem bootstrap de administrador. N?o publique apenas o Hosting sem as regras.

Ap?s o deploy, abra **https://ID_DO_PROJETO.web.app**. Entre com **TI** e a senha criada no console. Somente o UID previamente escolhido consegue concluir a configura??o inicial. Depois, cadastre os setores em **Setores e Acessos**. N?o ? necess?rio criar manualmente os outros usu?rios no console.

Quando o TI redefine uma senha de setor, o aplicativo troca sua identidade interna e bloqueia a anterior nas regras. Contas antigas ficam inativas para os registros e podem ser removidas do Authentication pelo administrador conforme a pol?tica de reten??o. A senha do pr?prio TI ? alterada com a senha atual; a recupera??o de TI exige o administrador do Firebase.

## Uso e limita??es

- O modo Firebase precisa de conex?o para autenticar e salvar registros. N?o mant?m cache persistente do Firestore no dispositivo.
- Invent?rio, v?nculos, movimenta??es, PDFs, chamados e mensagens utilizam o banco compartilhado. Presen?a online de usu?rios n?o ? simulada.
- Diagn?stico de endere?os da rede interna e envio TCP direto ? impressora continuam pr?prios da edi??o de servidor local. A edi??o Firebase gera o PDF para impress?o pelo navegador.
- O plano Spark tem cotas. Monitore-as no console; quando forem atingidas, opera??es podem ficar indispon?veis. Este projeto n?o muda o plano para Blaze.
- Dados j? cadastrados no GitHub Pages ou no banco local do Windows n?o s?o migrados automaticamente. Preserve backups e planeje a migra??o com o TI.
- Confira [seguran?a e provid?ncias para LGPD](SECURITY.md) e [uso do execut?vel Windows](EXECUTAVEL.md) antes de inserir dados reais.

Refer?ncias: [Firebase Hosting](https://firebase.google.com/docs/hosting), [Authentication](https://firebase.google.com/docs/auth/web/password-auth), [regras de seguran?a](https://firebase.google.com/docs/firestore/security/get-started), [cotas do Firestore](https://firebase.google.com/docs/firestore/quotas).

---

## Edi??o local anterior: GitHub Pages

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
