import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require('electron'), ['desktop/smoke.cjs'], { env, windowsHide: true, stdio: 'inherit' });
child.on('exit', code => { process.exitCode = code ?? 1; });
