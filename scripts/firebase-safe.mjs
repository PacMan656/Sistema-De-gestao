import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
if (args.includes('login:list') || args.includes('--debug')) throw new Error('Use consultas sem credenciais e sem logs de depuração.');
fs.mkdirSync('.firebase', { recursive: true });
const redact = text => text
  .replace(/(?:1\/\/[A-Za-z0-9_-]+|ya29\.[A-Za-z0-9._-]+|AIza[0-9A-Za-z_-]{35}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/g, '[REDACTED]')
  .replace(/((?:access_token|refresh_token|id_token|password|apiKey|token)["']?\s*[:=]\s*["']?)[^\s,"'}&]+/gi, '$1[REDACTED]');
const child = spawn(process.execPath, ['node_modules/firebase-tools/lib/bin/firebase.js', ...args], {
  env: { ...process.env, DEBUG: '', FIREBASE_DEBUG_PATH: path.resolve('.firebase/cli-debug.log') },
  stdio: ['inherit', 'pipe', 'pipe'],
});
for (const stream of [child.stdout, child.stderr]) {
  let buffer = '';
  stream.on('data', chunk => {
    buffer += chunk.toString(); let end;
    while ((end = buffer.indexOf('\n')) >= 0) { process.stdout.write(redact(buffer.slice(0, end + 1))); buffer = buffer.slice(end + 1); }
  });
  stream.on('end', () => { if (buffer) process.stdout.write(redact(buffer)); });
}
child.on('close', code => {
  for (const directory of ['.', '.firebase']) for (const file of fs.readdirSync(directory)) {
    if (/^(firebase-debug(?:\.\d+)?|cli-debug)\.log$/.test(file)) {
      const target = path.join(directory, file); fs.writeFileSync(target, redact(fs.readFileSync(target, 'utf8')));
    }
  }
  process.exitCode = code ?? 1;
});
