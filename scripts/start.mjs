import { existsSync } from 'node:fs';
if (!existsSync(new URL('../dist/index.html', import.meta.url))) {
  console.error('Execute npm run build antes de iniciar a versão de produção.');
  process.exit(1);
}
process.env.NODE_ENV = 'production';
await import('../server.ts');
