import { db, FieldValue } from './_admin.js';
import { randomBytes } from 'node:crypto';
import { decryptLinkvertiseToken } from './_linkvertise.js';

// Public endpoint behind key.html.
// - GET               -> vault info + public key settings (no key values, no private keys)
// - GET ?action=start  -> begins a timed hold when no Linkvertise gate is configured
// - POST ?action=verify -> verifies Linkvertise's one-time return hash, then starts the hold
// - GET ?action=claim  -> issues the current public key after the server-side hold
//
// The wait is enforced using a timestamp stored server-side when the hold starts.
// Nothing the browser sends is trusted for timing, so it can't be skipped by
// editing the page's JavaScript.
const WAIT_MS = 15000;
const PUBLIC_KEY_ID = 'k_public';

function json(res, status, body) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(status).json(body);
}

function randomKey() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = 'VX-';
    for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
}

export default async function handler(req, res) {
    const { id, action, token } = req.query;
    if (!id) return json(res, 400, { ok: false, message: 'Missing vault id.' });

    const vaultRef = db.collection('vaults').doc(String(id));

    try {
        if (action === 'start') {
            const snap = await vaultRef.get();
            if (!snap.exists) return json(res, 404, { ok: false, message: 'Vault not found.' });
            const v = snap.data();
            if (!v.requireKey || !v.publicKeyConfig || !v.publicKeyConfig.enabled) {
                return json(res, 400, { ok: false, message: 'This vault has no public key to get.' });
            }
            if (v.publicKeyConfig.adGateUrl) {
                return json(res, 403, { ok: false, message: 'Complete the Linkvertise link and return here before requesting a key.' });
            }
            const claimToken = randomBytes(32).toString('hex');
            await vaultRef.set({ pendingClaims: { [claimToken]: Date.now() } }, { merge: true });
            return json(res, 200, { ok: true, token: claimToken, waitMs: WAIT_MS });
        }

        if (action === 'verify') {
            if (req.method !== 'POST') {
                res.setHeader('Allow', 'POST');
                return json(res, 405, { ok: false, message: 'Method not allowed.' });
            }
            const snap = await vaultRef.get();
            if (!snap.exists) return json(res, 404, { ok: false, message: 'Vault not found.' });
            const v = snap.data();
            const cfg = v.publicKeyConfig;
            if (!v.requireKey || !cfg || !cfg.enabled || !cfg.adGateUrl) {
                return json(res, 400, { ok: false, message: 'This vault does not have a Linkvertise gate enabled.' });
            }

            const hash = String((req.body && req.body.hash) || '');
            if (!/^[a-f0-9]{64}$/i.test(hash)) {
                return json(res, 400, { ok: false, message: 'The Linkvertise return code is missing or invalid.' });
            }

            const credentialSnap = await db.collection('linkvertiseCredentials').doc(String(id)).get();
            if (!credentialSnap.exists) {
                return json(res, 403, { ok: false, message: 'The owner has not configured Linkvertise verification yet.' });
            }
            let linkvertiseToken;
            try {
                linkvertiseToken = decryptLinkvertiseToken(credentialSnap.data());
            } catch {
                return json(res, 503, { ok: false, message: 'Linkvertise verification is temporarily unavailable.' });
            }
            if (!linkvertiseToken) {
                return json(res, 503, { ok: false, message: 'Linkvertise verification is temporarily unavailable.' });
            }

            let verification;
            try {
                const verifyUrl = new URL('https://publisher.linkvertise.com/api/v1/anti_bypassing');
                verifyUrl.searchParams.set('token', linkvertiseToken);
                verifyUrl.searchParams.set('hash', hash);
                const response = await fetch(verifyUrl, { method: 'POST' });
                verification = response.ok ? (await response.text()).trim().toUpperCase() : '';
            } catch {
                return json(res, 502, { ok: false, message: 'Could not reach Linkvertise. Please return and try again.' });
            }

            if (verification !== 'TRUE') {
                return json(res, 403, { ok: false, message: 'Linkvertise did not confirm this visit. Finish the target link and return again.' });
            }

            const claimToken = randomBytes(32).toString('hex');
            await vaultRef.set({ pendingClaims: { [claimToken]: { startedAt: Date.now(), linkvertiseVerified: true } } }, { merge: true });
            return json(res, 200, { ok: true, token: claimToken, waitMs: WAIT_MS });
        }

        if (action === 'claim') {
            if (!token) return json(res, 400, { ok: false, message: 'Missing token.' });

            const result = await db.runTransaction(async (tx) => {
                const snap = await tx.get(vaultRef);
                if (!snap.exists) return { ok: false, status: 404, message: 'Vault not found.' };
                const v = snap.data();
                const cfg = v.publicKeyConfig;
                if (!v.requireKey || !cfg || !cfg.enabled) {
                    return { ok: false, status: 400, message: 'This vault has no public key to get.' };
                }
                const pendingClaim = v.pendingClaims && v.pendingClaims[token];
                const issuedAt = typeof pendingClaim === 'number' ? pendingClaim : pendingClaim && pendingClaim.startedAt;
                if (!issuedAt) {
                    return { ok: false, status: 400, message: 'That request expired or is invalid. Start again.' };
                }
                if (cfg && cfg.adGateUrl && !(pendingClaim && pendingClaim.linkvertiseVerified)) {
                    return { ok: false, status: 403, message: 'Complete the Linkvertise step before claiming this key.' };
                }
                if (Date.now() - issuedAt < WAIT_MS) {
                    return { ok: false, status: 425, message: "Please wait — the timer isn't done yet." };
                }

                const keys = Array.isArray(v.keys) ? v.keys : [];
                const idx = keys.findIndex(k => k.id === PUBLIC_KEY_ID);
                const now = Date.now();
                const isLive = k => k && !k.terminated &&
                    !(k.durationDays && k.keyGeneratedAt && now > k.keyGeneratedAt + k.durationDays * 86400000);

                let updatedKeys = keys;
                let activeKey;
                if (idx !== -1 && isLive(keys[idx])) {
                    activeKey = keys[idx];
                } else {
                    activeKey = {
                        id: PUBLIC_KEY_ID, label: cfg.label || 'Public Key', key: randomKey(),
                        priority: 0, durationDays: cfg.durationDays || null, keyGeneratedAt: now,
                        maxUsers: cfg.maxUsersUnlimited ? 1 : Math.max(1, cfg.maxUsers || 1),
                        maxUsersUnlimited: !!cfg.maxUsersUnlimited, boundUsers: [], terminated: false,
                        adGateUrl: cfg.adGateUrl || '', visibility: 'public', autoGenerated: true
                    };
                    updatedKeys = idx !== -1 ? keys.map((k, i) => i === idx ? activeKey : k) : [...keys, activeKey];
                }

                tx.update(vaultRef, {
                    keys: updatedKeys,
                    [`pendingClaims.${token}`]: FieldValue.delete()
                });

                return {
                    ok: true, key: activeKey.key,
                    expiresAt: activeKey.durationDays ? activeKey.keyGeneratedAt + activeKey.durationDays * 86400000 : null
                };
            });

            return json(res, result.status || 200, result);
        }

        // Default: plain info for the Get-Key page.
        const snap = await vaultRef.get();
        if (!snap.exists) return json(res, 404, { ok: false, message: "This vault ID doesn't exist or may have been deleted." });
        const v = snap.data();
        if (!v.requireKey) return json(res, 200, { ok: true, requireKey: false, title: v.title || '' });

        const cfg = v.publicKeyConfig;
        if (!cfg || !cfg.enabled) {
            return json(res, 200, { ok: true, requireKey: true, title: v.title || '', publicKey: null });
        }
        return json(res, 200, {
            ok: true, requireKey: true, title: v.title || '',
            publicKey: {
                label: cfg.label || 'Public Key',
                durationDays: cfg.durationDays || null,
                adGateUrl: cfg.adGateUrl || '',
                linkvertiseConfigured: (await db.collection('linkvertiseCredentials').doc(String(id)).get()).exists
            }
        });
    } catch (err) {
        return json(res, 500, { ok: false, message: 'Server error.' });
    }
}
