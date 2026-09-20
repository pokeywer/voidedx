import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, getDoc, updateDoc, increment } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyBdAR4ARjHccTlxrmP9tzdYGJxo4MvETXw",
    authDomain: "voidedx-fe79f.firebaseapp.com",
    projectId: "voidedx-fe79f",
    storageBucket: "voidedx-fe79f.firebasestorage.app",
    messagingSenderId: "784635868195",
    appId: "1:784635868195:web:6e879214df4238bc2aad96"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);

function isExecutorRequest(req) {
    const ua = (req.headers['user-agent'] || '').toLowerCase();
    if (req.query.format === 'raw') return true;
    return ua.includes('roblox') ||
           ua.includes('synapse') ||
           ua.includes('executor') ||
           ua.includes('script-ware') ||
           ua.includes('krnl') ||
           ua.includes('fluxus') ||
           ua.includes('electron') ||
           ua.includes('curl') ||
           ua === '';
}

export default async function handler(req, res) {
    const { id, key } = req.query;

    if (!id) {
        return res.status(400).send('-- Error: Missing Vault ID');
    }

    // Real browser visitors get sent to the SECURED landing page instead of raw code.
    if (!isExecutorRequest(req)) {
        const keyParam = key ? `&key=${encodeURIComponent(key)}` : '';
        return res.redirect(302, `/vault.html?id=${encodeURIComponent(id)}${keyParam}`);
    }

    try {
        const docRef = doc(db, "vaults", id);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            return res.status(404).send('-- Error: Vault ID not found in VoidedX Cloud');
        }

        const vaultData = docSnap.data();

        // Multi-key support, with a fallback that migrates legacy single-key vaults on the fly.
        const keysList = getVaultKeys(vaultData);

        // Key verification check
        if (vaultData.requireKey) {
            if (!key) {
                return res.status(403).send(`
-- [VOIDEDX SECURITY ALERT]
-- Key protection is enabled for this script.
-- Invalid or missing key parameter.
error("[VoidedX] Invalid Key Provided!", 2)
                `);
            }

            const matched = keysList.find(k => k.key === key);
            if (!matched) {
                return res.status(403).send(`
-- [VOIDEDX SECURITY ALERT]
-- Key protection is enabled for this script.
-- Invalid or missing key parameter.
error("[VoidedX] Invalid Key Provided!", 2)
                `);
            }

            const rotationMs = (matched.rotationHours || 24) * 60 * 60 * 1000;
            const expired = matched.rotation && matched.keyGeneratedAt &&
                (Date.now() - matched.keyGeneratedAt > rotationMs);

            if (expired) {
                return res.status(403).send(`
-- [VOIDEDX SECURITY ALERT]
-- This key has expired (rotates every ${matched.rotationHours || 24}h).
-- Get the current key at: ${getOrigin(req)}/key.html?id=${id}
error("[VoidedX] Key expired! Get a new one at ${getOrigin(req)}/key.html?id=${id}", 2)
                `);
            }
        }

        // IP lock: bind to the first IP that uses this key, reject others.
        if (vaultData.requireKey && vaultData.ipLock) {
            const clientIp = getClientIp(req);
            if (!vaultData.boundIp) {
                try {
                    await updateDoc(docRef, { boundIp: clientIp });
                } catch (e) {}
            } else if (vaultData.boundIp !== clientIp) {
                return res.status(403).send(`
-- [VOIDEDX SECURITY ALERT]
-- This key is locked to a different network/IP.
-- Ask the vault owner to reset the IP lock if this is a mistake.
error("[VoidedX] This key is locked to another IP address!", 2)
                `);
            }
        }

        // Increment execution counter in Firestore
        try {
            await updateDoc(docRef, {
                executions: increment(1)
            });
        } catch (e) {
            // Non-blocking fail silently for counter update
        }

        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

        // Account binding: don't hand over the real code directly — send a small loader
        // that identifies the Roblox account and asks /api/verify to bind/check it first.
        if (vaultData.requireKey && vaultData.accountBinding) {
            const verifyBase = `${getOrigin(req)}/api/verify`;
            const loader = `
local Players = game:GetService("Players")
local HttpService = game:GetService("HttpService")
local player = Players.LocalPlayer

local ok, response = pcall(function()
    return game:HttpGet(
        "${verifyBase}?id=${encodeURIComponent(id)}" ..
        "&key=" .. HttpService:UrlEncode(${luaString(key || '')}) ..
        "&userId=" .. tostring(player.UserId) ..
        "&username=" .. HttpService:UrlEncode(player.Name)
    )
end)

if not ok then
    return error("[VoidedX] Could not reach the verification server. Try again.", 0)
end

local decodeOk, result = pcall(function() return HttpService:JSONDecode(response) end)
if not decodeOk or type(result) ~= "table" then
    return error("[VoidedX] Verification server returned a bad response.", 0)
end

if not result.ok then
    return error("[VoidedX] " .. tostring(result.message or "Access denied."), 0)
end

loadstring(result.code)()
`.trim();
            return res.status(200).send(loader);
        }

        // Return raw execution wrapper for Roblox Executors
        return res.status(200).send(vaultData.code);
    } catch (err) {
        return res.status(500).send(`-- Error loading script: ${err.message}`);
    }
}

function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return forwarded.split(',')[0].trim();
    return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : 'unknown';
}

function getVaultKeys(vaultData) {
    if (Array.isArray(vaultData.keys) && vaultData.keys.length > 0) {
        return vaultData.keys;
    }
    // Legacy single-key vaults that haven't been resaved under the new system yet.
    if (vaultData.key) {
        return [{
            key: vaultData.key,
            rotation: !!vaultData.keyRotation,
            rotationHours: vaultData.keyRotationHours || 24,
            keyGeneratedAt: vaultData.keyGeneratedAt || null
        }];
    }
    return [];
}

function luaString(str) {
    const escaped = String(str).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}"`;
}

function getOrigin(req) {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    return `${proto}://${host}`;
}