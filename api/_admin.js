import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';





function init() {
    if (getApps().length) return getApps()[0];
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT env var is not set');
    const creds = JSON.parse(raw);
    if (creds.private_key) creds.private_key = creds.private_key.replace(/\\n/g, '\n');
    return initializeApp({ credential: cert(creds) });
}

export const db = getFirestore(init());
export { FieldValue };
