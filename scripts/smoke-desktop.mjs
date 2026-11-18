import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
if (process.argv.includes('--packaged')) env.PATRITI_SMOKE_ROOT = path.resolve('release/win-unpacked/resources/app.asar');
const child = spawn(require('electron'), ['desktop/smoke.cjs'], { env, windowsHide: true, stdio: 'inherit' });
child.on('exit', code => { process.exitCode = code ?? 1; });
