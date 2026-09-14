// Vercel Serverless Function - Firebase Firestore Backend Integration
import { initializeApp } from 'https://gstatic.com';
import { getFirestore, doc, setDoc, getDoc } from 'https://gstatic.com';

// Your verified Firebase Project Configuration keys
const firebaseConfig = {
  apiKey: "AIzaSyAS_hzyKR2kxyeuieB1zOoJ9RC_1WDUEaw",
  authDomain: "voidedx-32039.firebaseapp.com",
  databaseURL: "https://voidedx-32039-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "voidedx-32039",
  storageBucket: "voidedx-32039.firebasestorage.app",
  messagingSenderId: "1034832539790",
  appId: "1:1034832539790:web:fd87641edbbd75d1e4d9df"
};

// Initialize Firebase SDK
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export default async function handler(req, res) {
  const { id } = req.query;

  // Set global CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle CORS preflight options request from executors/browsers
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 1. Save Payload to Permanent Firebase Firestore Database
  if (req.method === 'POST') {
    try {
      // Safely access body parsed automatically by Vercel
      const parsed = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

      if (parsed && parsed.id && parsed.code) {
        await setDoc(doc(db, "vaults", parsed.id), {
          code: parsed.code,
          title: parsed.title || "Untitled Vault",
          createdAt: Date.now()
        });
        return res.status(200).json({ success: true, id: parsed.id });
      }
      
      return res.status(400).json({ error: 'Invalid payload structural format' });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // 2. Read Payload from Database
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
