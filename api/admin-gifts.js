import { createHash, randomBytes } from 'node:crypto';
import { db } from './_admin.js';
import { hasAdminSession, sameOriginRequest } from './_adminSession.js';

function json(res, status, body) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(status).json(body);
}

function hashGiftUid(uid) {
    return createHash('sha256').update(uid).digest('hex');
}

export default async function handler(req, res) {
    if (!['GET', 'POST'].includes(req.method)) {
        res.setHeader('Allow', 'GET, POST');
        return json(res, 405, { ok: false, message: 'Method not allowed.' });
    }
    if (!hasAdminSession(req)) return json(res, 401, { ok: false, message: 'Sign in as an administrator first.' });
    if (req.method === 'POST' && !sameOriginRequest(req)) return json(res, 403, { ok: false, message: 'Request origin was rejected.' });

    const gifts = db.collection('coinGifts');
    try {
        if (req.method === 'GET') {
            const snapshot = await gifts.orderBy('createdAt', 'desc').limit(100).get();
            const items = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    coins: Math.max(0, Math.floor(Number(data.coins) || 0)),
                    note: String(data.note || ''),
                    status: String(data.status || 'open'),
                    createdAt: Number(data.createdAt) || 0,
                    claimedAt: Number(data.claimedAt) || 0
                };
            });
            return json(res, 200, { ok: true, gifts: items });
        }

        const body = req.body && typeof req.body === 'object' ? req.body : {};
        if (body.action === 'create') {
            const coins = Number(body.coins);
            const note = String(body.note || '').trim();
            if (!Number.isSafeInteger(coins) || coins < 1 || coins > 100000) {
                return json(res, 400, { ok: false, message: 'Gift amount must be between 1 and 100,000 coins.' });
            }
            if (note.length > 120) return json(res, 400, { ok: false, message: 'Gift note must be 120 characters or fewer.' });

            const giftUid = randomBytes(24).toString('hex');
            const docId = hashGiftUid(giftUid);
            const now = Date.now();
            await gifts.doc(docId).create({
                coins,
                note,
                status: 'open',
                createdAt: now,
                createdBy: String(process.env.ADMIN_USERNAME || 'admin').slice(0, 80)
            });

            const origin = new URL(String(req.headers.origin));
            const claimUrl = new URL('/gift.html', origin.origin);
            claimUrl.hash = 'uid=' + giftUid;
            return json(res, 201, {
                ok: true,
                giftUid,
                giftUrl: claimUrl.href,
                gift: { id: docId, coins, note, status: 'open', createdAt: now, claimedAt: 0 }
            });
        }

        if (body.action === 'revoke') {
            const giftId = String(body.giftId || '');
            if (!/^[a-f0-9]{64}$/.test(giftId)) return json(res, 400, { ok: false, message: 'Choose a valid gift.' });
            const ref = gifts.doc(giftId);
            const result = await db.runTransaction(async transaction => {
                const snapshot = await transaction.get(ref);
                if (!snapshot.exists) return 'missing';
                if (snapshot.data().status !== 'open') return 'closed';
                transaction.update(ref, { status: 'revoked', revokedAt: Date.now() });
                return 'revoked';
            });
            if (result === 'missing') return json(res, 404, { ok: false, message: 'That gift could not be found.' });
            if (result === 'closed') return json(res, 409, { ok: false, message: 'Only an unclaimed gift can be revoked.' });
            return json(res, 200, { ok: true });
        }

        return json(res, 400, { ok: false, message: 'Choose create or revoke.' });
    } catch (error) {
        console.error('Admin coin gift request failed:', error);
        return json(res, 500, { ok: false, message: 'The coin gift request could not be completed.' });
    }
}
