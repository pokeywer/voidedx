import { db, FieldValue } from './_admin.js';
import crypto from 'node:crypto';

const SESSION_TTL_MS = 60 * 1000;

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
    if (forwarded) return String(forwarded).split(',')[0].trim();
    return req.socket?.remoteAddress || 'unknown';
}

function newSession() {
    return crypto.randomBytes(32).toString('base64url');
}

async function createSession({ vaultId, userId, username, ip }) {
    const token = newSession();
    const now = Date.now();
    await db.collection('sessions').doc(token).set({
        vaultId: String(vaultId), userId: String(userId || ''), username: String(username || 'Unknown').slice(0, 40),
        ip, createdAt: now, expiresAt: now + SESSION_TTL_MS, uses: 0, maxUses: 3
    });
    return { token, expiresAt: now + SESSION_TTL_MS };
}

export default async function handler(req, res) {
    const { id, key, userId, username } = req.query;

    if (!id) return json(res, 400, { ok: false, message: 'Missing vault id.' });

    try {
        const vaultRef = db.collection('vaults').doc(String(id));
        const vaultSnap = await vaultRef.get();
        if (!vaultSnap.exists) return json(res, 404, { ok: false, message: 'Vault not found.' });

        const vault = vaultSnap.data();
        const uidStr = userId != null ? String(userId) : '';

        if (vault.requireKey && !key) {
            return json(res, 403, { ok: false, message: 'Missing key.' });
        }

        if (uidStr) {
            const banned = (Array.isArray(vault.bannedUsers) ? vault.bannedUsers : [])
                .find(b => String(b.userId) === uidStr);
            if (banned && (banned.bannedUntil == null || banned.bannedUntil > Date.now())) {
                const untilMsg = banned.bannedUntil ? `until ${new Date(banned.bannedUntil).toLocaleString()}` : 'permanently';
                return json(res, 403, { ok: false, message: `You are banned from this vault ${untilMsg}.` });
            }
        }

        let matched = null;
        if (vault.requireKey) {
            const keysList = getVaultKeys(vault);
            matched = keysList.find(k => k.key === key);
            if (!matched) return json(res, 403, { ok: false, message: 'Invalid key.' });
            if (matched.terminated) return json(res, 403, { ok: false, message: 'This key has been terminated by the owner.' });
            if (matched.durationDays) {
                const expiresAt = (matched.keyGeneratedAt || 0) + matched.durationDays * 86400000;
                if (Date.now() > expiresAt) return json(res, 403, { ok: false, message: 'This key has expired.' });
            }
        }

        if (vault.ipLock && vault.requireKey) {
            const clientIp = getClientIp(req);
            try {
                const ipResult = await db.runTransaction(async tx => {
                    const freshSnap = await tx.get(vaultRef);
                    if (!freshSnap.exists) return { ok: true };
                    const freshData = freshSnap.data();
                    if (!freshData.boundIp) {
                        tx.update(vaultRef, { boundIp: clientIp });
                        return { ok: true };
                    }
                    return { ok: freshData.boundIp === clientIp };
                });
                if (!ipResult.ok) return json(res, 403, { ok: false, message: 'This key is locked to a different network/IP.' });
            } catch (e) {
                return json(res, 503, { ok: false, message: 'Could not validate the IP lock. Try again.' });
            }
        }

        if (vault.requireKey && uidStr) {
            const result = await db.runTransaction(async tx => {
                const freshSnap = await tx.get(vaultRef);
                if (!freshSnap.exists) return { ok: false, status: 404, message: 'Vault not found.' };
                const freshData = freshSnap.data();
                const freshKeys = getVaultKeys(freshData);
                const idx = freshKeys.findIndex(k => k.key === key);
                if (idx === -1) return { ok: false, status: 403, message: 'Invalid key.' };
                const fk = freshKeys[idx];
                const boundUsers = Array.isArray(fk.boundUsers) ? fk.boundUsers : [];
                const existing = boundUsers.find(u => String(u.userId) === uidStr);
                if (existing) return { ok: true };
                if (!fk.maxUsersUnlimited && boundUsers.length >= (fk.maxUsers || 1)) {
                    return { ok: false, status: 403, message: `This key is already in use by the maximum number of players (${fk.maxUsers || 1}). Ask the vault owner to reset or raise the limit.` };
                }
                const updatedUsers = [...boundUsers, { userId: uidStr, username: username || 'Unknown', boundAt: Date.now() }];
                const updatedKeys = [...freshKeys];
                updatedKeys[idx] = { ...fk, boundUsers: updatedUsers };
                if (Array.isArray(freshData.keys) && freshData.keys.length > 0) tx.update(vaultRef, { keys: updatedKeys });
                return { ok: true };
            });
            if (!result.ok) return json(res, result.status || 403, { ok: false, message: result.message });
        }

        try { await vaultRef.update({ executions: FieldValue.increment(1) }); } catch (e) {}

        const session = await createSession({
            vaultId: id,
            userId: uidStr || 'anonymous',
            username: username || 'Unknown',
            ip: getClientIp(req)
        });

        return json(res, 200, {
            ok: true,
            version: 2,
            session: session.token,
            expiresAt: session.expiresAt,
            message: 'Verified. Protected payload session created.'
        });
    } catch (err) {
        return json(res, 500, { ok: false, message: 'Server error.' });
    }
}
