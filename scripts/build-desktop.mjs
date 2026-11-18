import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { build as viteBuild } from 'vite';

const root = path.resolve('desktop/staging');
fs.mkdirSync(root, { recursive: true });
await viteBuild({ build: { outDir: path.join(root, 'dist'), emptyOutDir: true } });
await build({ entryPoints: ['server.ts'], outfile: path.join(root, 'server.mjs'), bundle: true, platform: 'node', format: 'esm', target: 'node22', external: ['@electric-sql/pglite', 'pdfkit', 'vite'], banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" } });
fs.cpSync('drizzle', path.join(root, 'drizzle'), { recursive: true });
// Copy only the explicit runtime dependencies and their dependency graph.
// No .env, account configuration, source history or local database is packaged.
const copied = new Set();
function copyPackage(name, from = process.cwd()) {
  let current = from; let source;
  for (;;) { const candidate = path.join(current, 'node_modules', name); if (fs.existsSync(path.join(candidate, 'package.json'))) { source = candidate; break; } const parent = path.dirname(current); if (parent === current) throw new Error(`Missing runtime package ${name}`); current = parent; }
  const packageJson = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
  const destination = path.join(root, 'node_modules', name);
  if (copied.has(name)) return;
  copied.add(name);
  fs.cpSync(source, destination, { recursive: true, filter: file => !file.endsWith('.map') && !file.includes(path.sep + '.git' + path.sep) });
  for (const dependency of Object.keys(packageJson.dependencies || {})) copyPackage(dependency, source);
}
copyPackage('@electric-sql/pglite'); copyPackage('pdfkit');
fs.copyFileSync('desktop/main.cjs', path.join(root, 'main.cjs'));
const dependencies = Object.fromEntries(['@electric-sql/pglite', 'pdfkit'].map(name => [name, JSON.parse(fs.readFileSync(path.join(root, 'node_modules', name, 'package.json'), 'utf8')).version]));
fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'patriti-desktop', version: '1.0.0', description: 'Inventário de TI e helpdesk por setor', author: 'Equipe PatriTI', main: 'main.cjs', type: 'module', private: true, dependencies }));
console.log(`Desktop runtime prepared with ${copied.size} explicit dependency packages. Run npm run desktop:pack.`);
