# Publicar o PatriTI no Firebase gratuito

O sistema compartilhado está em **https://sistema-gestao-26.web.app**. Use esse endereço em todos os computadores. Consulte [Uso em vários computadores](MULTICOMPUTADORES.md) para preservar os cadastros da edição anterior.

Esta edição usa Firebase Hosting, Authentication por senha e Cloud Firestore no plano Spark. Não usa Cloud Functions, Cloud Run ou Storage, nem ativa faturamento. As regras do Firestore autorizam cada acesso ao banco compartilhado.

## Preparar o projeto e ativar o primeiro TI

No projeto `sistema-gestao-26`, Hosting, Authentication por senha e o banco Firestore já foram configurados. A ativação do primeiro TI continua necessária enquanto o UID não estiver fixado nas regras.

Para uma instalação nova:

1. Crie um projeto no [Firebase Console](https://console.firebase.google.com/) e mantenha o plano **Spark**.
2. Registre um aplicativo Web. O Hosting fornece a configuração pública em `/__/firebase/init.json`; não copie chaves administrativas para o código.
3. Em **Authentication → Sign-in method**, habilite **Email/Password**. A interface pede código de setor e senha; os identificadores internos não são e-mails pessoais.
4. Em **Authentication → Users**, crie o usuário inicial **patriti-ti@patriti.invalid**, com senha de pelo menos 12 caracteres. Digite a senha diretamente no console e guarde-a no gerenciador da organização. Copie somente o **UID** para preparar as regras; não envie a senha no chat ou no terminal.
5. Crie o **Cloud Firestore** em modo de produção, com regras fechadas. Escolha a região conforme os requisitos da organização. O projeto atual usa São Paulo (`southamerica-east1`).

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

O preparo fixa o UID inicial nas regras geradas em `.firebase/` (ignorado pelo Git). As regras versionadas sem preparo não permitem bootstrap de administrador. Na primeira publicação, inclua as regras junto com o Hosting. Atualizações somente da interface podem publicar apenas `hosting` preservando as regras já preparadas.

Depois da ativação, entre com **TI** e a senha criada no console. Somente o UID escolhido pode concluir a configuração inicial. Cadastre os demais setores em **Setores e Acessos**, sem criar manualmente suas contas no console.

Ao redefinir uma senha de setor, o aplicativo troca sua identidade interna e bloqueia a anterior nas regras. As sessões antigas perdem acesso. Contas antigas ficam inativas para os registros e podem ser removidas do Authentication pelo administrador conforme a política de retenção. A alteração da senha do próprio TI exige a senha atual; a recuperação do TI exige o administrador do Firebase.

## Uso e limites

- Inventário, setores, movimentações e chamados recebem atualizações nas sessões autorizadas pelo Firestore. Mensagens também usam o banco compartilhado. Presença online de usuários não é simulada.
- É necessária conexão para autenticar e salvar. Não há cache persistente do Firestore nem mudança automática para um banco local ao perder conexão.
- Diagnóstico da rede interna e envio TCP direto à impressora pertencem à edição com servidor local. No Firebase, imprima os PDFs pelo navegador.
- O plano Spark tem cotas; monitore-as no console. Esta atualização não altera o plano para Blaze.
- Dados dos navegadores antigos e dos bancos locais Windows não são migrados automaticamente. Preserve cada origem conforme [MULTICOMPUTADORES.md](MULTICOMPUTADORES.md).
- Consulte [Segurança e providências para LGPD](SECURITY.md) e [Executável Windows](EXECUTAVEL.md).

Referências: [Firebase Hosting](https://firebase.google.com/docs/hosting), [Authentication](https://firebase.google.com/docs/auth/web/password-auth), [Atualizações do Firestore](https://firebase.google.com/docs/firestore/query-data/listen), [Regras](https://firebase.google.com/docs/firestore/security/get-started), [Cotas](https://firebase.google.com/docs/firestore/quotas).

## Endereço antigo do GitHub Pages

**https://pacman656.github.io/Sistema-De-gestao/** agora oferece o acesso ao sistema compartilhado e um botão para abrir o acervo local anterior. O banco local continua na mesma origem e no mesmo caminho; esta atualização não o apaga.

Para exportar cadastros existentes, abra **https://pacman656.github.io/Sistema-De-gestao/?local-backup=1** no mesmo computador, navegador e perfil usados antes. Entre como TI e use **Exportar backup**. O arquivo inclui hashes das senhas locais; guarde-o protegido. Não restaure um backup sobre outro para tentar somá-los, pois a restauração substitui os dados locais.

Cada navegador mantém seu próprio banco IndexedDB/PGlite. O controle de senha dessa edição é local. Limpar seus dados remove esse acervo; preserve os backups antes de qualquer limpeza.

O workflow **Publish shared gateway and local backups** publica o Pages a partir de `main`, com a origem GitHub Actions habilitada em **Settings → Pages**. Para verificar essa edição no desenvolvimento:

```sh
npm run build:pages
node scripts/check-pages.mjs
npm run preview:pages
```

Abra `http://127.0.0.1:4173/Sistema-De-gestao/`. Esse endereço tem um banco separado do Pages público, do Firebase e da edição Node.js.

## Servidor Node.js opcional

O servidor permanece disponível com `npm run build` e `npm start`, uma pasta persistente em `PATRITI_DATA_DIR` e acesso HTTPS. Os dispositivos devem acessar o mesmo servidor para compartilhar esse banco. Executar um servidor independente em cada computador cria bancos separados. Essa edição não roda no GitHub Pages.
