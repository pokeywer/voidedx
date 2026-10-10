import { createHash, timingSafeEqual } from 'node:crypto';
import { db } from './_admin.js';
import { adminConfigReady, adminCookie, createAdminSession, hasAdminSession, sameOriginRequest } from './_adminSession.js';

function json(res, status, body) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.status(status).json(body);
}

function safeEqual(left, right) {
    const a = Buffer.from(String(left || ''));
    const b = Buffer.from(String(right || ''));
    return a.length === b.length && timingSafeEqual(a, b);
}

function requestIpKey(req) {
    const forwarded = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown');
    const ip = forwarded.split(',')[0].trim() || 'unknown';
    return createHash('sha256').update(ip).digest('hex');
}

async function getLockout(ref) {
    const snap = await ref.get();
    const blockedUntil = Number(snap.data()?.blockedUntil) || 0;
    return blockedUntil > Date.now() ? blockedUntil : 0;
}

async function recordFailedLogin(ref) {
    const now = Date.now();
    return db.runTransaction(async transaction => {
        const snap = await transaction.get(ref);
        const previous = snap.exists ? snap.data() : {};
        const windowStart = Number(previous.windowStart) || 0;
        const sameWindow = now - windowStart < 15 * 60 * 1000;
        const attempts = (sameWindow ? Number(previous.attempts) || 0 : 0) + 1;
        const blockedUntil = attempts >= 5 ? now + 15 * 60 * 1000 : 0;
        transaction.set(ref, { attempts, windowStart: sameWindow ? windowStart : now, blockedUntil, updatedAt: now });
        return blockedUntil;
    });
}

export default async function handler(req, res) {
    if (req.method === 'GET') {
        return json(res, 200, {
            ok: true,
            configured: adminConfigReady(),
            authenticated: hasAdminSession(req)
        });
    }

    if (req.method !== 'POST') {
        res.setHeader('Allow', 'GET, POST');
        return json(res, 405, { ok: false, message: 'Method not allowed.' });
    }
    if (!sameOriginRequest(req)) return json(res, 403, { ok: false, message: 'Request origin was rejected.' });

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    if (body.action === 'logout') {
        res.setHeader('Set-Cookie', adminCookie(req, '', 0));
        return json(res, 200, { ok: true });
    }
    if (body.action !== 'login') return json(res, 400, { ok: false, message: 'Choose a valid admin action.' });
    if (!adminConfigReady()) {
        return json(res, 503, { ok: false, message: 'Admin login is not configured on the server yet.' });
    }

    try {
        const attemptsRef = db.collection('adminLoginAttempts').doc(requestIpKey(req));
        const blockedUntil = await getLockout(attemptsRef);
        if (blockedUntil) {
            return json(res, 429, { ok: false, message: 'Too many failed attempts. Wait 15 minutes before trying again.' });
        }

        const credentialsMatch = safeEqual(body.username, process.env.ADMIN_USERNAME)
            && safeEqual(body.password, process.env.ADMIN_PASSWORD);
        if (!credentialsMatch) {
            const lockout = await recordFailedLogin(attemptsRef);
            return json(res, lockout ? 429 : 401, {
                ok: false,
                message: lockout ? 'Too many failed attempts. Wait 15 minutes before trying again.' : 'The username or password is incorrect.'
            });
        }

        await attemptsRef.delete();
        res.setHeader('Set-Cookie', adminCookie(req, createAdminSession()));
        return json(res, 200, { ok: true, authenticated: true });
    } catch (err) {
        console.error('Admin sign-in failed:', err);
        return json(res, 500, { ok: false, message: 'Could not sign in right now.' });
    }
}
