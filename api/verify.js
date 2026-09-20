import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, getDoc, updateDoc } from 'firebase/firestore';

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

function json(res, status, body) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.status(status).json(body);
}

function getVaultKeys(vaultData) {
    if (Array.isArray(vaultData.keys) && vaultData.keys.length > 0) {
        return vaultData.keys;
    }
    if (vaultData.key) {
        return [{
            key: vaultData.key,
            rotation: !!vaultData.keyRotation,
            rotationHours: vaultData.keyRotationHours || 24,
            keyGeneratedAt: vaultData.keyGeneratedAt || null
        }];
    }
    return [];
}

export default async function handler(req, res) {
    const { id, key, userId, username } = req.query;

    if (!id || !userId) {
        return json(res, 400, { ok: false, message: 'Missing id or userId.' });
    }

    try {
        const vaultRef = doc(db, 'vaults', id);
        const vaultSnap = await getDoc(vaultRef);

        if (!vaultSnap.exists()) {
            return json(res, 404, { ok: false, message: 'Vault not found.' });
        }

        const vault = vaultSnap.data();

        if (!vault.requireKey) {
            return json(res, 200, { ok: true, code: vault.code });
        }

        // Re-check the key here too — this endpoint is public on its own, and this
        // also naturally enforces rotation: an old loader with a stale baked-in key
        // will fail here once that specific key has rotated.
        const keysList = getVaultKeys(vault);
        const matched = keysList.find(k => k.key === key);
        if (!key || !matched) {
            return json(res, 403, { ok: false, message: 'Invalid or expired key.' });
        }
        const rotationMs = (matched.rotationHours || 24) * 60 * 60 * 1000;
        const expired = matched.rotation && matched.keyGeneratedAt &&
            (Date.now() - matched.keyGeneratedAt > rotationMs);
        if (expired) {
            return json(res, 403, { ok: false, message: 'This key has expired. Get a fresh one from the Get-Key link.' });
        }

        if (!vault.accountBinding) {
            return json(res, 200, { ok: true, code: vault.code });
        }

        const maxUsers = Number.isFinite(vault.maxUsers) && vault.maxUsers > 0 ? vault.maxUsers : 1;
        const boundUsers = Array.isArray(vault.boundUsers) ? vault.boundUsers : [];
        const uidStr = String(userId);
        const existing = boundUsers.find(u => String(u.userId) === uidStr);

        if (existing) {
            return json(res, 200, { ok: true, code: vault.code });
        }

        if (boundUsers.length >= maxUsers) {
            return json(res, 403, {
                ok: false,
                message: `This key is already in use by the maximum number of accounts (${maxUsers}). Ask the vault owner to reset or raise the limit.`
            });
        }

        const updatedUsers = [
            ...boundUsers,
            { userId: uidStr, username: username || 'Unknown', boundAt: Date.now() }
        ];
        await updateDoc(vaultRef, { boundUsers: updatedUsers });

        return json(res, 200, { ok: true, code: vault.code });
    } catch (err) {
        return json(res, 500, { ok: false, message: 'Server error: ' + err.message });
    }
}
