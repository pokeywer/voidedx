import { db, FieldValue, getAdminAuth } from './_admin.js';
import { hashClientIp } from './_executionStats.js';

function json(res, status, body) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(status).json(body);
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return json(res, 405, { ok: false, message: 'Method not allowed.' });
    }

    const match = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
    if (!match) return json(res, 401, { ok: false, message: 'Sign in to update network privacy.' });

    const id = String(req.body?.id || '');
    if (!/^[A-Za-z0-9_-]{1,150}$/.test(id)) {
        return json(res, 400, { ok: false, message: 'Invalid vault ID.' });
    }

    let user;
    try {
        user = await getAdminAuth().verifyIdToken(match[1]);
    } catch {
        return json(res, 401, { ok: false, message: 'Your sign-in expired. Please sign in again.' });
    }

    try {
        const vaultRef = db.collection('vaults').doc(id);
        const migrated = await db.runTransaction(async transaction => {
            const snapshot = await transaction.get(vaultRef);
            if (!snapshot.exists) return { error: 'not_found' };

            const vault = snapshot.data();
            if (vault.uid !== user.uid) return { error: 'forbidden' };
            if (typeof vault.boundIp !== 'string' || !vault.boundIp) return { migrated: false };

            const updates = { boundIp: FieldValue.delete() };
            if (vault.ipLock) {
                const boundIpHash = vault.boundIpHash || hashClientIp(vault.boundIp);
                if (!boundIpHash) return { error: 'privacy_unavailable' };
                updates.boundIpHash = boundIpHash;
            } else {
                updates.boundIpHash = FieldValue.delete();
                updates.boundIpCountry = FieldValue.delete();
            }
            transaction.update(vaultRef, updates);
            return { migrated: true };
        });

        if (migrated.error === 'not_found') return json(res, 404, { ok: false, message: 'Vault not found.' });
        if (migrated.error === 'forbidden') return json(res, 403, { ok: false, message: 'You can only update your own vault.' });
        if (migrated.error === 'privacy_unavailable') {
            return json(res, 503, { ok: false, message: 'Network privacy settings are temporarily unavailable.' });
        }
        return json(res, 200, { ok: true, migrated: !!migrated.migrated });
    } catch {
        return json(res, 500, { ok: false, message: 'Could not update network privacy settings.' });
    }
}
