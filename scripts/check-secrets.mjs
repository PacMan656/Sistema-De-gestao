import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const patterns = [
  ['Google API key', /AIza[0-9A-Za-z_-]{35}/g],
  ['Private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ['GitHub credential', /(?:gh[pousr]_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{30,})/g],
  ['AWS credential', /AKIA[0-9A-Z]{16}/g],
  ['OAuth refresh credential', /1\/\/[A-Za-z0-9_-]{45,}/g],
  ['OAuth access credential', /ya29\.[A-Za-z0-9._-]{45,}/g],
];
const findings = [];
function scan(file, content) {
  for (const [kind, pattern] of patterns) for (const hit of content.matchAll(pattern)) {
    findings.push({ file, kind, fingerprint: createHash('sha256').update(hit[0]).digest('hex').slice(0, 12) });
  }
}
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  if (/(^|\/)\.env(?!\.example$|\.firebase\.example$)|service[-_]?account.*\.json$|firebase-adminsdk|\.session-secret|\.setup-token|\.(pem|key)$/i.test(file)) findings.push({ file, kind: 'Sensitive filename' });
  if (!/\.(png|jpe?g|gif|ico|woff2?|pdf|zip|exe)$/.test(file) && file !== 'package-lock.json') scan(file, fs.readFileSync(file, 'utf8'));
}
if (process.argv.includes('--dist')) {
  for (const file of fs.readdirSync('dist', { recursive: true })) {
    const absolute = path.join('dist', file);
    if (fs.statSync(absolute).isFile() && /\.(js|json|html|webmanifest|txt)$/.test(file)) scan(absolute, fs.readFileSync(absolute, 'utf8'));
    if (/\.(env|pem|key|map)$|service[-_]?account|firebase-adminsdk/i.test(file)) findings.push({ file: absolute, kind: 'Sensitive build artifact' });
  }
}
if (findings.length) { console.error(JSON.stringify(findings, null, 2)); process.exit(1); }
console.log('Security check passed: no recognized credentials or sensitive files. This is a preventive check, not a complete security audit.');
