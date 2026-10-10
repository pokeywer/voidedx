import { createHash } from 'node:crypto';
import { db, getAdminAuth } from './_admin.js';

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

    const bearer = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
    if (!bearer) return json(res, 401, { ok: false, message: 'Sign in to redeem this gift.' });

    let user;
    try {
        user = await getAdminAuth().verifyIdToken(bearer[1]);
    } catch {
        return json(res, 401, { ok: false, message: 'Your sign-in expired. Please sign in again.' });
    }
    if (user.firebase?.sign_in_provider === 'anonymous' || !user.email) {
        return json(res, 403, { ok: false, message: 'Use a signed-in account to redeem a coin gift.' });
    }

    const giftUid = String(req.body?.giftUid || '').trim().toLowerCase();
    if (!/^[a-f0-9]{48}$/.test(giftUid)) return json(res, 400, { ok: false, message: 'This gift link is not valid.' });

    const giftRef = db.collection('coinGifts').doc(createHash('sha256').update(giftUid).digest('hex'));
    const balanceRef = db.collection('creatorBalances').doc(user.uid);
    try {
        const result = await db.runTransaction(async transaction => {
            const giftSnapshot = await transaction.get(giftRef);
            if (!giftSnapshot.exists) return { error: 'missing' };
            const gift = giftSnapshot.data();
            if (gift.status !== 'open') return { error: 'closed' };
            const coins = Number(gift.coins);
            if (!Number.isSafeInteger(coins) || coins < 1 || coins > 100000) return { error: 'invalid' };

            const balanceSnapshot = await transaction.get(balanceRef);
            const balance = Math.max(0, Math.floor(Number(balanceSnapshot.data()?.coins) || 0));
            const now = Date.now();
            transaction.set(balanceRef, { coins: balance + coins, updatedAt: now }, { merge: true });
            transaction.update(giftRef, { status: 'claimed', claimedBy: user.uid, claimedAt: now });
            return { coins, balance: balance + coins };
        });

        if (result.error === 'missing') return json(res, 404, { ok: false, message: 'This gift link is not recognized.' });
        if (result.error === 'closed') return json(res, 409, { ok: false, message: 'This gift has already been claimed or was revoked.' });
        if (result.error === 'invalid') return json(res, 409, { ok: false, message: 'This gift cannot be redeemed.' });
        return json(res, 200, { ok: true, coins: result.coins, balance: result.balance });
    } catch (error) {
        console.error('Coin gift redemption failed:', error);
        return json(res, 500, { ok: false, message: 'The coin gift could not be redeemed.' });
    }
}
