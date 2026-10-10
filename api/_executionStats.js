import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { db, FieldValue } from './_admin.js';

function getActiveUserHashSecret() {
    return [
        process.env.ACTIVE_USER_HASH_SECRET,
        process.env.ADMIN_SESSION_SECRET,
        process.env.FIREBASE_SERVICE_ACCOUNT
    ].find(secret => typeof secret === 'string' && Buffer.byteLength(secret) >= 32) || '';
}

function getIpHashSecret() {
    // Configure a stable 32+ byte IP_HASH_SECRET in production; fallbacks keep
    // existing deployments working when that dedicated secret is not set.
    return [
        process.env.IP_HASH_SECRET,
        process.env.ACTIVE_USER_HASH_SECRET,
        process.env.ADMIN_SESSION_SECRET,
        process.env.FIREBASE_SERVICE_ACCOUNT
    ].find(secret => typeof secret === 'string' && Buffer.byteLength(secret) >= 32) || '';
}

export function getClientIp(req) {
    const forwarded = String(req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const candidate = forwarded
        || String(req.headers['x-real-ip'] || '').trim()
        || String(req.socket?.remoteAddress || '').trim();
    if (!candidate || candidate.toLowerCase() === 'unknown') return null;

    let address = candidate.replace(/^"|"$/g, '');
    const bracketed = address.match(/^\[([^\]]+)\](?::\d+)?$/);
    if (bracketed) address = bracketed[1];
    if (address.toLowerCase().startsWith('::ffff:')) address = address.slice(7);

    if (isIP(address)) return address.toLowerCase();
    const ipv4WithPort = address.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
    if (ipv4WithPort && isIP(ipv4WithPort[1]) === 4) return ipv4WithPort[1];
    return null;
}

export function hashClientIp(rawIp) {
    const ip = typeof rawIp === 'string' ? rawIp.trim().toLowerCase() : '';
    const secret = getIpHashSecret();
    if (!ip || !secret) return null;
    return createHmac('sha256', secret).update(ip).digest('hex');
}

export function getCountryCode(req) {
    const code = String(req.headers['x-vercel-ip-country'] || '').trim().toUpperCase();
    return /^[A-Z]{2}$/.test(code) ? code : null;
}

// Dates use UTC so all visitors see the same daily and monthly cutoffs.
export async function recordExecution(vaultRef, vaultId, rawTitle, rawPlayerId = null) {
    const now = new Date();
    const dayKey = now.toISOString().slice(0, 10);
    const monthKey = dayKey.slice(0, 7);
    const title = typeof rawTitle === 'string' && rawTitle.trim()
        ? rawTitle.trim().slice(0, 120)
        : 'Untitled Vault';

    const batch = db.batch();
    // Any successful run exempts the vault from the unused-script cleanup timer.
    batch.update(vaultRef, { executions: FieldValue.increment(1), autoDeleteAt: null });
    batch.set(
        db.collection('leaderboardDaily').doc(dayKey).collection('vaults').doc(String(vaultId)),
        { vaultId: String(vaultId), title, executions: FieldValue.increment(1) },
        { merge: true }
    );
    batch.set(
        db.collection('leaderboardMonthly').doc(monthKey).collection('vaults').doc(String(vaultId)),
        { vaultId: String(vaultId), title, executions: FieldValue.increment(1) },
        { merge: true }
    );

    batch.set(
        db.collection('siteActivityDaily').doc(dayKey),
        { date: dayKey, executions: FieldValue.increment(1), updatedAt: now.getTime() },
        { merge: true }
    );

    // Keep a per-day unique player marker for an honest active-user estimate.
    // Only the server-side HMAC is stored; the submitted Roblox ID is discarded.
    const playerId = String(rawPlayerId || '').trim();
    const playerHashSecret = getActiveUserHashSecret();
    if (/^\d{1,20}$/.test(playerId) && playerHashSecret) {
        const playerHash = createHmac('sha256', playerHashSecret).update(playerId).digest('hex');
        batch.set(
            db.collection('activeUsersDaily').doc(dayKey).collection('players').doc(playerHash),
            { lastSeenAt: now.getTime() },
            { merge: true }
        );
    }
    await batch.commit();
}

// Lets a downloaded client wrapper report its Roblox ID without exposing it
// in the public launcher URL. Only a server-side HMAC is stored.
export async function recordActiveUser(rawPlayerId) {
    const playerId = String(rawPlayerId || '').trim();
    if (!/^\d{1,20}$/.test(playerId)) return false;

    const hashSecret = getActiveUserHashSecret();
    if (!hashSecret) return false;

    const now = new Date();
    const dayKey = now.toISOString().slice(0, 10);
    const playerHash = createHmac('sha256', hashSecret).update(playerId).digest('hex');
    await db.collection('activeUsersDaily').doc(dayKey).collection('players').doc(playerHash).set(
        { lastSeenAt: now.getTime() },
        { merge: true }
    );
    return true;
}
