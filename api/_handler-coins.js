import { db, getAdminAuth } from './_admin.js';

function json(res, status, body) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(status).json(body);
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return json(res, 405, { ok: false, message: 'Method not allowed.' });
    }

    const authorization = String(req.headers.authorization || '');
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) return json(res, 401, { ok: false, message: 'Sign in to view your coins.' });

    try {
        const user = await getAdminAuth().verifyIdToken(match[1]);
        const [snapshot, entitlementSnapshot] = await Promise.all([
            db.collection('creatorBalances').doc(user.uid).get(),
            db.collection('creatorEntitlements').doc(user.uid).get()
        ]);
        const entitlements = entitlementSnapshot.data() || {};
        return json(res, 200, {
            ok: true,
            coins: Math.max(0, Math.floor(Number(snapshot.data()?.coins) || 0)),
            entitlements: {
                extraVaultSlots: Math.max(0, Math.floor(Number(entitlements.extraVaultSlots) || 0)),
                goldTitles: !!entitlements.goldTitles,
                creatorBadge: !!entitlements.creatorBadge
            }
        });
    } catch {
        return json(res, 401, { ok: false, message: 'Your sign-in expired. Please sign in again.' });
    }
}
