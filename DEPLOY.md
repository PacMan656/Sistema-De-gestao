# Publicar o PatriTI completo

Código: [PacMan656/Sistema-De-gestao](https://github.com/PacMan656/Sistema-De-gestao).

O projeto utiliza um serviço Node.js que entrega a interface React, a API e o chat Socket.IO pelo mesmo endereço HTTPS. O banco embarcado precisa de armazenamento persistente. O GitHub Pages não executa esse servidor.

## Render

[Preparar publicação no Render](https://render.com/deploy?repo=https://github.com/PacMan656/Sistema-De-gestao)

O arquivo `render.yaml` configura um Web Service Node.js no plano **Starter**, com **uma instância** e um **disco persistente de 1 GB**. O serviço e o disco são pagos: revise os valores mostrados pelo Render antes de confirmar a criação. Não use um disco temporário para o banco.

1. Entre no Render e autorize o acesso ao repositório, se solicitado.
2. Abra o link acima ou crie um Blueprint apontando para este repositório.
3. Revise o serviço `patriti`, o plano e o disco, e confirme a implantação no painel.
4. Aguarde o build e a verificação de `/api/health`. O painel mostrará o endereço HTTPS atribuído ao serviço.
5. Abra esse endereço e configure a senha do setor **TI**, usando o **código de configuração inicial dos logs do serviço**. Nenhuma senha de acesso vem no repositório.
6. Em **Setores e Acessos**, cadastre/libere os setores. Depois, cadastre seus equipamentos.

Configuração aplicada pelo Blueprint:

| Item | Valor |
| --- | --- |
| Node.js | `24.22.1` |
| Build | `npm ci --include=dev && npm run build` |
| Inicialização | `npm start` |
| Verificação | `/api/health` |
| Pasta persistente | `/var/data/patriti` |
| Chave de sessão | `JWT_SECRET` gerada pelo Render |
| Proxy HTTPS | `TRUST_PROXY=1` |

As migrações e a criação das tabelas rodam na inicialização, quando o disco já está montado. As publicações automáticas ficam desativadas: depois de enviar alterações ao GitHub e conferir o workflow **Verify PatriTI**, faça **Manual Deploy → Deploy latest commit** no Render.

Os arquivos do banco local deste computador não são enviados ao GitHub nem copiados automaticamente para a hospedagem. A primeira implantação começa com um banco novo. Para transferir registros existentes, pare o servidor de origem e o de destino, faça backup e restaure o conteúdo completo da pasta de dados no disco persistente antes de reiniciar. Mantenha apenas uma instância usando esse banco.

## Outra hospedagem Node.js

Use Node.js `>=24.12 <25`, o mesmo build e `npm start`. Configure `NODE_ENV=production`, uma pasta persistente em `PATRITI_DATA_DIR`, uma `JWT_SECRET` aleatória de pelo menos 32 caracteres e a porta fornecida pela hospedagem em `PORT`. `SQL_HOST` deve ficar ausente para usar o banco embarcado.

O domínio deve oferecer HTTPS e suporte a WebSocket. Se houver exatamente um proxy confiável entre o público e o Node.js, configure `TRUST_PROXY=1`. Para um domínio personalizado, `APP_URL` pode indicar o endereço HTTPS público.

As funções de acesso remoto e impressão precisam que o servidor alcance os endereços dos equipamentos. Uma hospedagem na internet só acessa equipamentos da rede da empresa quando existe conectividade apropriada entre essas redes.

Referências: [Blueprints](https://render.com/docs/blueprint-spec), [discos persistentes](https://render.com/docs/disks), [versão do Node.js](https://render.com/docs/node-version).
