import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyBdAR4ARjHccTlxrmP9tzdYGJxo4MvETXw",
    authDomain: "voidedx-fe79f.firebaseapp.com",
    projectId: "voidedx-fe79f",
    storageBucket: "voidedx-fe79f.firebasestorage.app",
    messagingSenderId: "784635868195",
    appId: "1:784635868195:web:6e879214df4238bc2aad96"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);

export default async function handler(req, res) {
    const { id, key } = req.query;

    if (!id) {
        return res.status(400).send('-- Error: Missing Vault ID');
    }

    try {
        const docRef = doc(db, "vaults", id);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            return res.status(404).send('-- Error: Vault ID not found in VoidedX Cloud');
        }

        const vaultData = docSnap.data();

        // Key verification check
        if (vaultData.requireKey) {
            if (!key || key !== vaultData.key) {
                return res.status(403).send(`
-- [VOIDEDX SECURITY ALERT]
-- Key protection is enabled for this script.
-- Invalid or missing key parameter.
error("[VoidedX] Invalid Key Provided!", 2)
                `);
            }
        }

        // Return raw execution wrapper for Roblox Executors
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        return res.status(200).send(vaultData.code);
    } catch (err) {
        return res.status(500).send(`-- Error loading script: ${err.message}`);
    }
}