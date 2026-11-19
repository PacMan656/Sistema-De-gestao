# PatriTI em vários computadores

Abra **https://sistema-gestao-26.web.app** em todos os computadores. Esse é o sistema com banco compartilhado no Firebase. Use o código e a senha de setor definidos pelo TI. Também é possível instalar o PWA nesse endereço; o executável Windows já distribuído abre esse mesmo sistema por padrão.

Não é necessário instalar um servidor ou criar um banco em cada computador. A edição Node.js e o modo local do executável têm bancos separados; não são a instalação compartilhada do Firebase.

## Ativação pelo TI

A primeira conta TI precisa ser criada pelo administrador no Firebase Console e seu UID fixado nas regras, conforme [DEPLOY.md](DEPLOY.md). Enquanto essa etapa estiver pendente, as regras permanecem fechadas. Nenhum visitante recebe privilégios automaticamente.

Após a ativação, o TI cadastra os setores e suas senhas uma única vez em **Setores e Acessos**. Um setor pode ter vários equipamentos e entrar em mais de um computador. O TI vê o conjunto; cada setor recebe somente seu inventário e seus chamados. Os vínculos entre computadores e periféricos continuam restritos ao mesmo setor.

As sessões recebem atualizações do banco central sem precisar recarregar a página. A faixa **Modo compartilhado** indica a conexão. Os dados só são apresentados como sincronizados após confirmação do servidor. Sem internet, não há troca automática para um banco local. Redefinir a senha ou bloquear um setor revoga o acesso das sessões antigas; sair de um computador não encerra as sessões dos outros.

Limpar os dados do navegador não apaga os registros já salvos no Firebase. Isso não substitui a política de backup e retenção do banco da organização.

## Preservar os cadastros espalhados nos computadores

Os cadastros antigos **não foram migrados**. Como existem em vários computadores, cada origem precisa ser preservada antes de consolidar os registros.

Em cada computador e navegador que recebeu cadastros:

1. Abra o [acervo local anterior](https://pacman656.github.io/Sistema-De-gestao/?local-backup=1), no mesmo perfil do navegador usado para cadastrar. A página mantém a origem e o caminho do banco anterior.
2. Entre com a senha TI daquela edição local e use **Exportar backup**.
3. Identifique o arquivo com computador, navegador e data. Guarde uma cópia protegida fora do navegador. O backup inclui hashes de senhas locais; não o publique nem envie senhas pelo chat.
4. Preserve o navegador e seu armazenamento até conferir a cópia e concluir a consolidação.

Se o inventário foi criado no servidor Node.js ou no modo local do executável, siga o procedimento de backup da pasta de dados dessa edição em [README.md](README.md) e [EXECUTAVEL.md](EXECUTAVEL.md); o link do Pages não acessa esses bancos.

Não restaure o backup de um computador sobre o de outro para tentar juntá-los: a restauração substitui o banco local. A consolidação exige revisar duplicidades de patrimônio/número de série, setores e vínculos antes da importação. Esta atualização não executa fusão ou importação dos backups e não substitui registros existentes.
