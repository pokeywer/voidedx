import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, getDoc, updateDoc, increment, runTransaction } from 'firebase/firestore';

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
    if (Array.isArray(vaultData.keys) && vaultData.keys.length > 0) return vaultData.keys;
    if (vaultData.key) {
        return [{
            id: 'k_legacy', key: vaultData.key, durationDays: null,
            keyGeneratedAt: vaultData.keyGeneratedAt || null,
            maxUsers: 1, maxUsersUnlimited: true, boundUsers: [], terminated: false
        }];
    }
    return [];
}

function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return forwarded.split(',')[0].trim();
    return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : 'unknown';
}

export default async function handler(req, res) {
    const { id, key, userId, username } = req.query;

    if (!id || !key) {
        return json(res, 400, { ok: false, message: 'Missing id or key.' });
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

        const uidStr = userId ? String(userId) : null;

        // Ban check — vault-wide, blocks a Roblox account from using ANY key here.
        if (uidStr) {
            const banned = (Array.isArray(vault.bannedUsers) ? vault.bannedUsers : [])
                .find(b => String(b.userId) === uidStr);
            if (banned && (banned.bannedUntil == null || banned.bannedUntil > Date.now())) {
                const untilMsg = banned.bannedUntil
                    ? `until ${new Date(banned.bannedUntil).toLocaleString()}`
                    : 'permanently';
                return json(res, 403, { ok: false, message: `You are banned from this vault ${untilMsg}.` });
            }
        }

        const keysList = getVaultKeys(vault);
        const matched = keysList.find(k => k.key === key);

        if (!matched) {
            return json(res, 403, { ok: false, message: 'Invalid key.' });
        }
        if (matched.terminated) {
            return json(res, 403, { ok: false, message: 'This key has been terminated by the owner.' });
        }
        if (matched.durationDays) {
            const expiresAt = (matched.keyGeneratedAt || 0) + matched.durationDays * 86400000;
            if (Date.now() > expiresAt) {
                return json(res, 403, { ok: false, message: 'This key has expired.' });
            }
        }

        // IP lock — vault-wide, atomic so two IPs can't both "win" the bind.
        if (vault.ipLock) {
            const clientIp = getClientIp(req);
            try {
                const ipResult = await runTransaction(db, async (tx) => {
                    const freshSnap = await tx.get(vaultRef);
                    if (!freshSnap.exists()) return { ok: true };
                    const freshData = freshSnap.data();
                    if (!freshData.boundIp) {
                        tx.update(vaultRef, { boundIp: clientIp });
                        return { ok: true };
                    }
                    return { ok: freshData.boundIp === clientIp };
                });
                if (!ipResult.ok) {
                    return json(res, 403, { ok: false, message: 'This key is locked to a different network/IP.' });
                }
            } catch (e) {}
        }

        // Execution counter (best-effort, non-blocking).
        try { await updateDoc(vaultRef, { executions: increment(1) }); } catch (e) {}

        // Per-key player limit, atomic so two people can't both slip past a full cap.
        if (uidStr) {
            const result = await runTransaction(db, async (tx) => {
                const freshSnap = await tx.get(vaultRef);
                if (!freshSnap.exists()) return { ok: true, code: vault.code };
                const freshData = freshSnap.data();
                const freshKeys = getVaultKeys(freshData);
                const idx = freshKeys.findIndex(k => k.key === key);
                if (idx === -1) return { ok: false, status: 403, message: 'Invalid key.' };

                const fk = freshKeys[idx];
                const boundUsers = Array.isArray(fk.boundUsers) ? fk.boundUsers : [];
                const existing = boundUsers.find(u => String(u.userId) === uidStr);

                if (existing) {
                    return { ok: true, code: freshData.code };
                }
                if (!fk.maxUsersUnlimited && boundUsers.length >= (fk.maxUsers || 1)) {
                    return {
                        ok: false, status: 403,
                        message: `This key is already in use by the maximum number of players (${fk.maxUsers || 1}). Ask the vault owner to reset or raise the limit.`
                    };
                }

                const updatedUsers = [...boundUsers, { userId: uidStr, username: username || 'Unknown', boundAt: Date.now() }];
                const updatedKeys = [...freshKeys];
                updatedKeys[idx] = { ...fk, boundUsers: updatedUsers };

                // Only write back through the modern `keys` array shape.
                if (Array.isArray(freshData.keys) && freshData.keys.length > 0) {
                    tx.update(vaultRef, { keys: updatedKeys });
                }
                return { ok: true, code: freshData.code };
            });

            if (!result.ok) {
                return json(res, result.status || 403, { ok: false, message: result.message });
            }
            return json(res, 200, { ok: true, code: result.code });
        }

        return json(res, 200, { ok: true, code: vault.code });
    } catch (err) {
        return json(res, 500, { ok: false, message: 'Server error: ' + err.message });
    }
}
