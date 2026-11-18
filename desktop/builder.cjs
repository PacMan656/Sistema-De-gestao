module.exports = {
  appId: 'br.com.patriti.desktop', productName: 'PatriTI',
  directories: { app: 'desktop/staging', output: 'release' },
  files: ['**/*', '!**/*.map'],
  extraMetadata: { main: 'main.cjs' },
  asar: true,
  compression: 'store',
  asarUnpack: ['server.mjs', 'node_modules/**', 'drizzle/**'],
  npmRebuild: false,
  win: { target: [{ target: 'portable', arch: ['x64'] }], signExecutable: false, icon: require('node:path').resolve(__dirname, '../public/icons/icon-512.png') },
  portable: { artifactName: 'PatriTI-1.0.0-Windows-x64.exe', requestExecutionLevel: 'user' },
};
