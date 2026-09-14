// Vercel Serverless Function - Firebase Firestore Backend Integration
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';

// Firebase Project Configuration keys.
// Prefer environment variables (set these in your Vercel project settings)
// so the keys aren't hardcoded in source control; falls back to the
// previous literal values only if the env vars are unset.
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyBdAR4ARjHccTlxrmP9tzdYGJxo4MvETXw",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "voidedx-fe79f.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "voidedx-fe79f",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "voidedx-fe79f.firebasestorage.app",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "784635868195",
  appId: process.env.FIREBASE_APP_ID || "1:784635868195:web:6e879214df4238bc2aad96"
};

// Initialize Firebase SDK once per lambda instance (avoids
// "Firebase App named '[DEFAULT]' already exists" on warm invocations).
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
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

      if (parsed && typeof parsed.id === 'string' && typeof parsed.code === 'string' && parsed.code.length > 0) {
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
