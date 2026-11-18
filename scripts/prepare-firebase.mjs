import fs from 'node:fs';
const args = process.argv.slice(2);
const value = (flag) => args[args.indexOf(flag) + 1];
const project = args.includes('--project') ? value('--project') : '';
const uid = args.includes('--admin-uid') ? value('--admin-uid') : '';
if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project) || !/^[A-Za-z0-9_-]{20,128}$/.test(uid)) {
  console.error('Uso: npm run firebase:prepare -- --project ID_DO_PROJETO --admin-uid UID_DO_TI\nCrie primeiro o usuário patriti-ti@patriti.invalid no Firebase Authentication. Nunca informe a senha neste comando.');
  process.exit(1);
}
fs.mkdirSync('.firebase', { recursive: true });
const rules = fs.readFileSync('firestore.rules', 'utf8').replace('BOOTSTRAP_TI_UID_NOT_CONFIGURED', uid);
fs.writeFileSync('.firebase/firestore.deploy.rules', rules);
const config = JSON.parse(fs.readFileSync('firebase.json', 'utf8'));
config.hosting.public = '../dist'; config.firestore.rules = 'firestore.deploy.rules';
fs.writeFileSync('.firebase/deploy.json', JSON.stringify(config, null, 2));
fs.writeFileSync('.firebase/project.json', JSON.stringify({ project, adminUid: uid }));
console.log(`Preparado para ${project}. O UID inicial foi fixado nas regras locais ignoradas pelo Git.\nDepois de npm run build:firebase, publique com:\nnpm run firebase -- deploy --project ${project} --config .firebase/deploy.json --only hosting,firestore:rules`);
