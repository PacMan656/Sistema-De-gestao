const { app, BrowserWindow, dialog, utilityProcess, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
app.setName('PatriTI');
app.setPath('userData', path.join(app.getPath('appData'), 'PatriTI'));
let backend;
let window;
let quitting = false;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
  app.whenReady().then(async () => {
    const root = app.isPackaged ? __dirname : path.join(__dirname, 'staging');
    const data = path.join(app.getPath('userData'), 'data');
    fs.mkdirSync(data, { recursive: true });
    const config = path.join(app.getPath('userData'), 'firebase-url.txt');
    // An operator may point this executable at the deployed Firebase edition.
    // Only HTTPS Firebase Hosting URLs are allowed; no credentials are stored.
    let remote = fs.existsSync(config) ? fs.readFileSync(config, 'utf8').trim() : '';
    if (remote && !/^https:\/\/[a-z0-9-]+\.(web\.app|firebaseapp\.com)\/?$/.test(remote)) {
      dialog.showErrorBox('Configuração inválida', 'firebase-url.txt deve conter somente a URL HTTPS do Firebase Hosting.'); app.quit(); return;
    }
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    function show(url) {
      const origin = new URL(url).origin;
      window = new BrowserWindow({ width: 1280, height: 900, minWidth: 360, minHeight: 600, title: 'PatriTI', autoHideMenuBar: true, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, devTools: false } });
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      window.webContents.on('will-navigate', (event, destination) => { if (new URL(destination).origin !== origin) event.preventDefault(); });
      window.webContents.on('will-attach-webview', event => event.preventDefault());
      window.webContents.on('did-fail-load', (_event, code) => { if (code !== -3) dialog.showErrorBox('Falha ao carregar', 'Não foi possível abrir o PatriTI. Verifique a conexão ou reinicie o aplicativo.'); });
      void window.loadURL(url);
    }
    if (remote) { show(remote); return; }
    backend = utilityProcess.fork(path.join(root, 'server.mjs'), [], { env: { ...process.env, NODE_ENV: 'production', PATRITI_DESKTOP: '1', PATRITI_ROOT_DIR: root, PATRITI_DATA_DIR: data, HOST: '127.0.0.1', PORT: '0', SQL_HOST: '', JWT_SECRET: '', APP_URL: '', SETUP_TOKEN: '' }, stdio: 'pipe', serviceName: 'PatriTI local' });
    const timeout = setTimeout(() => { dialog.showErrorBox('Inicialização', 'O banco de dados não iniciou dentro do prazo. Reinicie o aplicativo.'); app.quit(); }, 90000);
    backend.once('message', async message => {
      if (message?.type !== 'ready') return;
      clearTimeout(timeout); show(`http://127.0.0.1:${message.port}`);
      if (message.setupToken) await dialog.showMessageBox(window, { type: 'info', title: 'Primeiro acesso ao PatriTI', message: 'Crie a senha do setor TI na tela inicial.', detail: `Código de configuração desta execução:\n${message.setupToken}\n\nOs dados desta edição ficam neste computador. Para usar o Firebase compartilhado, configure a URL conforme o guia do executável.`, buttons: ['Entendi'] });
    });
    backend.on('exit', code => { if (!quitting) { dialog.showErrorBox('Servidor encerrado', `O servidor local encerrou (${code}). Reinicie o aplicativo.`); app.quit(); } });
  }).catch(() => { dialog.showErrorBox('Falha ao iniciar', 'Não foi possível iniciar o PatriTI.'); app.quit(); });
}
app.on('window-all-closed', () => app.quit());
app.on('before-quit', event => {
  if (quitting || !backend) return;
  event.preventDefault(); quitting = true;
  backend.once('exit', () => app.quit());
  backend.postMessage('shutdown');
  setTimeout(() => { backend?.kill(); app.quit(); }, 10000).unref();
});
