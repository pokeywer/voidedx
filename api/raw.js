// Vercel Serverless Function - Firebase Firestore Backend Integration
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore, doc, setDoc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// TODO: Replace with your actual Firebase Project Configuration keys
const firebaseConfig = {
    apiKey: "YOUR_FIREBASE_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Initialize Firebase SDK
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export default async function handler(req, res) {
    const { id } = req.query;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');

    // 1. Save Payload to Permanent Firebase Firestore Database
    if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const parsed = JSON.parse(body);
                if (parsed.id && parsed.code) {
                    await setDoc(doc(db, "vaults", parsed.id), {
                        code: parsed.code,
                        title: parsed.title || "Untitled Vault",
                        createdAt: Date.now()
                    });
                    return res.status(200).json({ success: true, id: parsed.id });
                }
            } catch (e) {
                return res.status(500).json({ error: e.message });
            }
            return res.status(400).json({ error: 'Invalid payload' });
        });
        return;
    }

    if (!id) {
        return res.status(400).send('--[ VoidedX Error: Missing Vault ID ]--');
    }

    // Detect Roblox Executors vs Web Browser Viewers
    const userAgent = (req.headers['user-agent'] || '').toLowerCase();
    const isRoblox = userAgent.includes('roblox') || 
                     userAgent.includes('synapse') || 
                     userAgent.includes('executor') || 
                     userAgent.includes('curl') ||
                     req.query.format === 'raw';

    if (isRoblox) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        try {
            const docRef = doc(db, "vaults", id);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                // Returns the exact, untouched script straight from Google Firebase
                return res.status(200).send(docSnap.data().code);
            } else {
                return res.status(404).send('print("VoidedX Error: Vault ID Not Found in Database")');
            }
        } catch (err) {
            return res.status(500).send('print("VoidedX Error: Database Connection Failed")');
        }
    } else {
        // Redirect browser inspect attempts away to the SECURED card page
        return res.redirect(`/vault?id=${id}`);
    }
}