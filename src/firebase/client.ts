import { getApps, initializeApp } from 'firebase/app';
import { browserSessionPersistence, getAuth, setPersistence } from 'firebase/auth';
import { getFirestore, memoryLocalCache, initializeFirestore } from 'firebase/firestore';

// Firebase Hosting supplies public project identifiers at runtime. No admin key,
// password or service-account credential belongs in this frontend or its build.
let ready: Promise<{ auth: ReturnType<typeof getAuth>; db: ReturnType<typeof getFirestore> }>;
export function firebaseClient() {
  return ready ??= (async () => {
    const response = await fetch('/__/firebase/init.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Publique esta edição no Firebase Hosting para configurar a conexão.');
    const config = await response.json();
    if (!config.projectId || !config.apiKey || !config.appId) throw new Error('Configuração pública do Firebase inválida.');
    const app = getApps().find((app) => app.name === '[DEFAULT]') || initializeApp(config);
    const auth = getAuth(app);
    await setPersistence(auth, browserSessionPersistence);
    await auth.authStateReady();
    const db = initializeFirestore(app, { localCache: memoryLocalCache() });
    return { auth, db };
  })();
}
