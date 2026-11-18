import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import path from 'node:path';
await build({ entryPoints: ['tests/firebaseApi.emulator.ts'], outfile: '.test-data/firebase-api/test.mjs', bundle: true, platform: 'node', format: 'esm', external: ['firebase/*', '@firebase/rules-unit-testing', 'pdfkit'], plugins: [{ name: 'emulator-client', setup(builder) {
  builder.onResolve({ filter: /^\.\/client\.ts$/ }, args => args.importer.includes(path.join('src', 'firebase')) ? { path: path.resolve('tests/firebaseClient.fixture.ts') } : undefined);
} }] });
const child = spawn(process.execPath, ['--test', '.test-data/firebase-api/test.mjs'], { stdio: 'inherit', env: process.env });
child.on('exit', code => { process.exitCode = code ?? 1; });
