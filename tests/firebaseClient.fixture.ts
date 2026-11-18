import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
const app = initializeApp({ projectId: 'demo-patriti', apiKey: 'demo-key', appId: 'demo-app' });
const auth = getAuth(app); const db = getFirestore(app);
connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST!.split(':');
connectFirestoreEmulator(db, host, Number(port));
export async function firebaseClient() { await auth.authStateReady(); return { auth, db }; }
