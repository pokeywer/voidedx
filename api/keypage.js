import { db } from './_admin.js';

// Public data for key.html. Never returns private/terminated keys, and never
// returns a key's value until it is explicitly requested (keyId=...).
function json(res, status, body) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(status).json(body);
}

export default async function handler(req, res) {
    const { id, keyId } = req.query;
    if (!id) return json(res, 400, { ok: false, message: 'Missing vault id.' });
    try {
        const snap = await db.collection('vaults').doc(String(id)).get();
        if (!snap.exists) return json(res, 404, { ok: false, message: "This vault ID doesn't exist or may have been deleted." });
        const v = snap.data();
        let keys = Array.isArray(v.keys) && v.keys.length ? v.keys
            : (v.requireKey && v.key ? [{ id: 'k_legacy', label: 'Main Key', key: v.key, priority: 1, durationDays: null, keyGeneratedAt: v.keyGeneratedAt || null }] : []);

        if (!v.requireKey || keys.length === 0) return json(res, 200, { ok: true, requireKey: false, title: v.title || '' });

        const now = Date.now();
        const isLive = k => !k.terminated && k.visibility !== 'private' &&
            !(k.durationDays && k.keyGeneratedAt && now > k.keyGeneratedAt + k.durationDays * 86400000);
        const publicKeys = keys.filter(isLive).sort((a, b) => (a.priority || 0) - (b.priority || 0));

        if (keyId) {
            const k = publicKeys.find(x => x.id === keyId);
            if (!k) return json(res, 404, { ok: false, message: 'This key is unavailable or has expired.' });
            return json(res, 200, { ok: true, key: k.key });
        }

        return json(res, 200, {
            ok: true, requireKey: true, title: v.title || '',
            keys: publicKeys.map(k => ({
                id: k.id, label: k.label || 'Key', priority: k.priority || 0,
                durationDays: k.durationDays || null, keyGeneratedAt: k.keyGeneratedAt || null,
                adGateUrl: k.adGateUrl || ''
            })),
            hasPrivateOnly: publicKeys.length === 0
        });
    } catch (err) {
        return json(res, 500, { ok: false, message: 'Server error.' });
    }
}
