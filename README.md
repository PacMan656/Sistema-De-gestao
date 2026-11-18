# PatriTI

Inventário de TI e helpdesk corporativo com login por código do setor e senha, setores gerenciados pelo TI e aplicativo PWA.

Para colocar o sistema completo online, siga [Publicar o PatriTI](DEPLOY.md). A configuração inclui interface, login, API, chat e banco persistente em um serviço Node.js.

## Começar neste computador

Use Node.js 24.12 ou superior.

```sh
npm install
npm run dev
```

Abra **http://localhost:3000**. Sem `SQL_HOST`, o sistema cria automaticamente um banco PostgreSQL embarcado (PGlite), as tabelas e os departamentos iniciais. Não é necessário instalar PostgreSQL ou Docker.

O comando de desenvolvimento acompanha alterações no servidor e reinicia o backend automaticamente. Se já havia um servidor iniciado antes da atualização, encerre-o com `Ctrl+C` e execute `npm run dev` novamente.

No primeiro acesso, a tela solicita o **código de configuração exibido no terminal** e uma senha de pelo menos 12 caracteres para o setor **TI**. Depois dessa configuração, entre usando `TI` e a senha definida. O assistente não permite criar outro administrador após concluir o primeiro acesso.

Após entrar, abra **Setores e Acessos → Cadastrar setor**. Informe nome, código de acesso (por exemplo `COMPRAS`), localização, centro de custo opcional e senha. O setor já pode entrar com seu código e senha. Os setores iniciais RH, FIN e ADM precisam ter uma senha definida pelo TI antes de receber equipamentos. O TI também pode editar os setores, redefinir senhas e bloquear/liberar acessos. A senha do próprio TI é alterada pelo ícone de chave na barra superior, informando a senha atual.

As senhas são armazenadas como hashes scrypt com salt aleatório. Cookies HttpOnly restauram a sessão; tokens de acesso ficam na memória do aplicativo. As permissões são verificadas no servidor. Redefinir a senha ou bloquear o setor revoga suas sessões existentes, incluindo a conexão de chat. Encerrar a sessão também encerra as outras sessões do mesmo setor. Somente o TI pode gerenciar as senhas dos setores.

O acesso utiliza exclusivamente código do setor e senha. O setor consulta seus próprios equipamentos e chamados; o TI mantém a visão geral e o gerenciamento do inventário. E-mail e Google não são usados para entrar.

## Equipamentos e periféricos

Cada equipamento pertence a um setor cadastrado, e cada setor pode conter vários equipamentos. O TI escolhe o setor no cadastro do equipamento. Contas de setores podem consultar seu inventário, pesquisar patrimônios e abrir chamados, sem cadastrar ou alterar ativos.

No cadastro ou edição de um **Desktop** ou **Notebook**, selecione vários equipamentos e periféricos do mesmo setor. Também é possível abrir um monitor, impressora ou periférico e selecionar seu computador principal. Cada item mantém seu próprio patrimônio e número de série; um periférico fica vinculado a um computador por vez. Os vínculos aparecem nos detalhes e no inventário do setor.

Para transferir um equipamento vinculado para outro setor, desfaça primeiro o vínculo. Ao mudar o setor de um computador pelo cadastro, remova seus periféricos vinculados antes de salvar. Equipamentos associados nunca podem ficar em setores diferentes.

### Atualização de uma instalação existente

Pare o servidor, faça backup da pasta `data/` e inicie novamente. A migração local é automática e preserva os patrimônios e as senhas existentes. Para cada setor, a senha da conta ativa mais antiga passa a ser a senha do setor, dando preferência ao administrador de TI. As contas anteriores permanecem no banco para preservar o histórico. O TI pode definir uma nova senha do setor em **Setores e Acessos**. Setores sem conta anterior precisam ter seu acesso configurado pelo TI.

## Banco local e cópia de segurança

Os dados ficam em **`data/postgres/`**, e a chave de sessão em **`data/.session-secret`**. Esses arquivos não entram no controle de versão. Para fazer backup, **pare o servidor**, copie a pasta `data/` inteira e só então inicie o servidor novamente. Restaurar essa pasta restaura os cadastros e registros. Não inicie duas instâncias apontando para a mesma pasta de dados.

`PATRITI_DATA_DIR` permite escolher outra pasta. O banco fica no computador que executa o servidor: celulares e outros computadores acessam esse mesmo servidor pela rede.

## Instalar como aplicativo (PWA)

```sh
npm run build
npm start
```

Abra **http://localhost:3000** e use **Instalar aplicativo**, ou a opção de instalação do navegador. No iPhone/iPad, use Safari → Compartilhar → Adicionar à Tela de Início. Para acessar e instalar em outros dispositivos, publique o servidor em **HTTPS**. `localhost` no celular aponta para o próprio celular; utilize o endereço HTTPS do computador/servidor que hospeda o sistema.

A versão de produção inclui manifesto, ícones, service worker e atualização com confirmação pelo botão de recarregar. O service worker fica desativado durante o desenvolvimento. A interface se adapta a celular, tablet e desktop, com menu móvel, formulários em uma coluna e rolagem horizontal dentro das tabelas.

`npm run preview` também inicia o servidor completo de produção, com API e banco local. A aplicação depende desse servidor para autenticação; servir somente os arquivos de `dist/` não disponibiliza o login.

O aplicativo abre sua interface sem rede após a primeira visita à versão de produção. **Login, inventário, chamados e alterações precisam de conexão com o servidor**. Dados corporativos, credenciais, APIs e PDFs não são armazenados no cache offline. Em produção, cookies usam também a opção Secure.

Referências da implementação: [PWA e instalação](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps-chromium/get-started), [scrypt no Node.js](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback).

## PostgreSQL externo (opcional)

Para migrar futuramente, configure `SQL_HOST`, `SQL_PORT`, `SQL_USER`, `SQL_PASSWORD`, `SQL_DB_NAME` e uma `JWT_SECRET` aleatória com pelo menos 32 caracteres no arquivo `.env`. As tabelas de um banco externo não são alteradas automaticamente. O comando `npm run db:push` usa `SQL_ADMIN_USER` e `SQL_ADMIN_PASSWORD`; revise as alterações antes de aplicá-las. O primeiro administrador de um banco externo deve ser provisionado pelo responsável pelo banco. O assistente inicial na interface se destina ao banco local.

## Verificação

```sh
npm run lint
npm test
npm run build
```

Os testes de integração verificam cadastro de setores pelo TI, login por setor, restauração de sessão, isolamento dos inventários, vários equipamentos por setor, vínculos de periféricos, bloqueio de transferências inconsistentes, redefinição de senha e limites de tentativas. Também são verificados a migração das contas antigas, a persistência do banco e o cache offline do PWA.
