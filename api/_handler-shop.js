import { db, getAdminAuth } from './_admin.js';

const CATALOG = [
    {
        id: 'extra_vault_slot',
        name: 'Extra Vault Slot',
        icon: 'fa-vault',
        price: 150,
        repeatable: true,
        description: 'Keep one more script vault in your account permanently.'
    },
    {
        id: 'gold_titles',
        name: 'Gold Vault Titles',
        icon: 'fa-wand-magic-sparkles',
        price: 75,
        repeatable: false,
        description: 'Give every vault title in your list a gold finish.'
    },
    {
        id: 'creator_badge',
        name: 'Creator Badge',
        icon: 'fa-award',
        price: 100,
        repeatable: false,
        description: 'Add a permanent gold creator badge beside your account name.'
    }
];

function json(res, status, body) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(status).json(body);
}

async function getAccount(req) {
    const match = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
    if (!match) return null;
    try {
        const user = await getAdminAuth().verifyIdToken(match[1]);
        if (user.firebase?.sign_in_provider === 'anonymous' || !user.email) return null;
        return user;
    } catch {
        return null;
    }
}

function publicEntitlements(data = {}) {
    return {
        extraVaultSlots: Math.max(0, Math.floor(Number(data.extraVaultSlots) || 0)),
        goldTitles: !!data.goldTitles,
        creatorBadge: !!data.creatorBadge
    };
}

export default async function handler(req, res) {
    if (!['GET', 'POST'].includes(req.method)) {
        res.setHeader('Allow', 'GET, POST');
        return json(res, 405, { ok: false, message: 'Method not allowed.' });
    }

    const user = await getAccount(req);
    if (!user && req.method === 'GET') {
        return json(res, 200, {
            ok: true,
            coins: 0,
            entitlements: { extraVaultSlots: 0, goldTitles: false, creatorBadge: false },
            catalog: CATALOG
        });
    }
    if (!user) return json(res, 401, { ok: false, message: 'Sign in with an account to use the coin shop.' });

    const balanceRef = db.collection('creatorBalances').doc(user.uid);
    const entitlementsRef = db.collection('creatorEntitlements').doc(user.uid);

    if (req.method === 'GET') {
        try {
            const [balanceSnap, entitlementsSnap] = await Promise.all([balanceRef.get(), entitlementsRef.get()]);
            return json(res, 200, {
                ok: true,
                coins: Math.max(0, Number(balanceSnap.data()?.coins) || 0),
                entitlements: publicEntitlements(entitlementsSnap.data()),
                catalog: CATALOG
            });
        } catch {
            return json(res, 500, { ok: false, message: 'Could not load the coin shop.' });
        }
    }

    const itemId = String(req.body?.itemId || '');
    const item = CATALOG.find(entry => entry.id === itemId);
    if (!item) return json(res, 400, { ok: false, message: 'Choose an item from the shop.' });

    try {
        const purchase = await db.runTransaction(async transaction => {
            const [balanceSnap, entitlementSnap] = await Promise.all([
                transaction.get(balanceRef),
                transaction.get(entitlementsRef)
            ]);
            const balance = Math.max(0, Number(balanceSnap.data()?.coins) || 0);
            const entitlements = publicEntitlements(entitlementSnap.data());

            if (!item.repeatable && entitlements[item.id === 'gold_titles' ? 'goldTitles' : 'creatorBadge']) {
                return { error: 'owned' };
            }
            if (balance < item.price) return { error: 'funds' };

            const nextEntitlements = { ...entitlements, updatedAt: Date.now() };
            if (item.id === 'extra_vault_slot') nextEntitlements.extraVaultSlots += 1;
            if (item.id === 'gold_titles') nextEntitlements.goldTitles = true;
            if (item.id === 'creator_badge') nextEntitlements.creatorBadge = true;

            transaction.set(balanceRef, { coins: balance - item.price, updatedAt: Date.now() }, { merge: true });
            transaction.set(entitlementsRef, nextEntitlements, { merge: true });
            return {
                coins: balance - item.price,
                entitlements: publicEntitlements(nextEntitlements)
            };
        });

        if (purchase.error === 'owned') return json(res, 409, { ok: false, message: 'You already own this item.' });
        if (purchase.error === 'funds') return json(res, 400, { ok: false, message: 'You do not have enough coins for this item.' });
        return json(res, 200, { ok: true, ...purchase });
    } catch (error) {
        console.error('Coin shop purchase failed:', error);
        return json(res, 500, { ok: false, message: 'The purchase could not be completed.' });
    }
}
