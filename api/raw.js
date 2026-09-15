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
        return res.status(400).send('-- [VoidedX Error]: Missing Vault ID parameter');
    }

    try {
        const docRef = doc(db, "vaults", id);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            return res.status(404).send('-- [VoidedX Error]: Vault not found or has been deleted');
        }

        const data = docSnap.data();

        // Check key system validation
        if (data.requireKey) {
            if (!key || key !== data.key) {
                return res.status(401).send(`-- [VoidedX Security]: Key validation failed. Required: ?key=YOUR_KEY`);
            }
        }

        // Return plain text Lua script output for game:HttpGet
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.status(200).send(data.code || '');
    } catch (err) {
        return res.status(500).send(`-- [VoidedX Internal Error]: ${err.message}`);
    }
}