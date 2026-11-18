# PatriTI para Windows

Arquivo gerado: `release/PatriTI-1.0.0-Windows-x64.exe` (Windows 10/11, 64 bits).

## Usar neste computador

1. Abra o executável. Não precisa instalar Node.js, PostgreSQL ou Docker.
2. No primeiro acesso, uma janela mostra o código de configuração. Use-o na tela de criação da senha do TI. Fechar e abrir novamente mostra o código enquanto não houver administrador criado.
3. Entre com `TI` e sua senha; cadastre os demais setores e equipamentos.

Os dados ficam em `%APPDATA%/PatriTI/data/`. Para copiar o banco, encerre o aplicativo e faça backup da pasta `data` inteira. Não inclua essa pasta ao distribuir o executável. A versão local não sincroniza com o Firebase automaticamente.

## Conectar à edição Firebase

Após publicar o novo projeto, crie `%APPDATA%/PatriTI/firebase-url.txt` contendo somente o endereço HTTPS do Hosting, por exemplo `https://ID-DO-PROJETO.web.app`. Reinicie o aplicativo. Ele abrirá a edição compartilhada, com autenticação e dados do Firebase. O arquivo aceita apenas domínios `web.app` ou `firebaseapp.com`, sem senhas, parâmetros ou caminhos extras.

Remover esse arquivo volta à edição local preservando o banco do computador. Dados do banco local e do navegador não são enviados para a nuvem por essa troca. A migração deve ser planejada pelo TI, com conferência dos registros e recriação dos acessos.

O executável não tem assinatura Authenticode de um editor; não foi fornecido certificado de assinatura. O processo de build gera `release/SHA256SUMS.txt` para conferir a integridade. Não desative proteções do Windows para distribuí-lo; em uso corporativo, assine e distribua pelo procedimento de software da organização.

## Gerar novamente

```sh
npm ci
npm run desktop:build
npm run desktop:smoke
npm run desktop:pack
```

O empacotamento inclui apenas o runtime preparado em `desktop/staging`: arquivos do aplicativo, migrações e dependências necessárias. Não inclui histórico Git, configurações locais, banco nem arquivos `.env`.
