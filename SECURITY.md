# Segurança e privacidade

## Revisão de 18/11/2026

O histórico de três commits continha uma chave pública Google/Firebase em `firebase-applet-config.json`, do projeto anterior `ceti-ceepru-agro-scan`. Foram removidos o arquivo e as integrações antigas sem uso. Não foram detectados tokens GitHub, arquivos `.env` reais nem chaves privadas nesses commits pelos padrões examinados. Isso não equivale a uma auditoria completa, nem comprova ou descarta utilização indevida da chave.

**A chave antiga continua no histórico Git.** Remover um arquivo não revoga uma credencial. O administrador do projeto antigo deve revisar suas restrições de API e de origem no Google Cloud e substituir/revogar a chave se ela também autorizava serviços privados. Não foi reescrito o histórico nem alterado o projeto antigo, que pode atender outra aplicação.

O Firebase utiliza identificadores públicos no navegador. Nesta edição, eles vêm de `/__/firebase/init.json` do Hosting; não ficam gravados no repositório. A proteção dos registros depende da autenticação e das regras publicadas, não de esconder esses identificadores. Nunca inclua credenciais de conta de serviço, tokens administrativos ou senhas em variáveis `VITE_`, builds ou executáveis.

Uma consulta do CLI retornou sua sessão OAuth junto com o status. Essa sessão foi revogada no Google (resposta HTTP 200); será necessário autenticar o CLI novamente. O comando seguro em `scripts/firebase-safe.mjs` desativa o modo de depuração herdado e mascara credenciais nas saídas e nos logs locais. Os logs não são versionados.

## Controles implementados

- Firebase Authentication valida as senhas; contas sem perfil liberado pelo TI não leem registros.
- O primeiro administrador é vinculado a um UID específico definido pelo operador; não existe privilégio para o primeiro visitante ou cadastro público de TI.
- Firestore bloqueia por padrão coleções não autorizadas. Setores leem seu próprio inventário e chamados; alterações de patrimônio, senhas e setores são restritas ao TI.
- Redefinir a senha de um setor cria uma nova identidade e desativa a anterior nas regras. A senha anterior deixa de autorizar acesso aos registros, inclusive em sessões antigas.
- Documentos, nomes de portadores, observações internas e endereços de rede dos equipamentos ficam em coleção separada, restrita ao TI. Movimentações e inspeções também são restritas ao TI.
- Firestore usa cache apenas em memória nesta edição. Service workers guardam arquivos estáticos, sem APIs, PDFs ou respostas autenticadas.
- Cabeçalhos de segurança, CSP, bloqueio de enquadramento e remoção de fontes externas diminuem a superfície de exposição. A câmera permanece limitada à própria origem, sujeita à permissão do usuário.
- A edição Node registra somente o contexto e o código do erro, sem imprimir consultas SQL ou exceções brutas com dados pessoais. O código inicial fica em `data/.setup-token`, fora do Git.
- O executável usa sandbox, isolamento de contexto e integração Node desativada no conteúdo da janela. O servidor local escuta apenas em `127.0.0.1`.
- `npm run security:check` verifica arquivos versionados; `npm run security:build` examina também o build. A CI aplica as verificações antes da publicação. O detector usa padrões e pode não reconhecer todo tipo de credencial.

## Providências da organização para LGPD

Os controles técnicos não certificam conformidade integral. Antes de inserir dados reais, a organização deve definir controlador e canal de atendimento, finalidade e base legal, responsáveis por autorizar acessos, prazos de retenção e procedimento de resposta a incidentes. O aviso na interface precisa ser complementado pela política da organização.

Prefira matrícula funcional ao CPF quando suficiente. Não registre senhas, dados de saúde ou dados sensíveis em texto livre de chamados. Estabeleça procedimentos para atender pedidos de acesso, correção e eliminação quando cabíveis, com conferência de identidade. O administrador Firebase deve executar expurgos e correções necessários com análise das obrigações de conservação; a interface não faz expurgo automático do histórico.

Use contas Google administrativas individuais com MFA e acesso mínimo. Compartilhar a senha de um setor limita a identificação de quem realizou cada ação; para atribuição individual, adote contas individuais em uma evolução do sistema. Restrinja o acesso a arquivos locais, PDFs e backups e utilize criptografia de disco e de cópias de segurança conforme a política da organização.

No plano gratuito, monitore as cotas de Authentication, Firestore e Hosting. Nenhum faturamento, função paga ou serviço de Storage é habilitado pelos arquivos de publicação deste projeto. A região do banco e os termos aplicáveis ao tratamento de dados devem ser avaliados pela organização antes da criação.

Referências: [chaves Firebase](https://firebase.google.com/docs/projects/api-keys), [regras Firestore](https://firebase.google.com/docs/firestore/security/get-started), [guia de segurança da ANPD](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-sobre-seguranca-da-informacao-para-agentes-de-tratamento-de-pequeno-porte).

## Projeto publicado

O projeto `sistema-gestao-26` foi publicado em `https://sistema-gestao-26.web.app`. O faturamento foi verificado como desativado; o banco padr?o est? no n?vel gratuito, na regi?o `southamerica-east1`, com prote??o contra exclus?o. A chave p?blica foi limitada ?s APIs `identitytoolkit.googleapis.com`, `securetoken.googleapis.com` e `firestore.googleapis.com` e aos dom?nios `sistema-gestao-26.web.app` e `sistema-gestao-26.firebaseapp.com`. O site envia somente a origem como refer?ncia ?s APIs externas. Sair da edi??o Firebase recarrega a p?gina para limpar os dados mantidos em mem?ria.

A primeira publica??o manteve o bootstrap administrativo bloqueado. Para liberar o TI inicial, o usu?rio deve criar sua senha diretamente no Firebase Authentication e fornecer somente o UID ao operador, que republica as regras com esse UID espec?fico.
