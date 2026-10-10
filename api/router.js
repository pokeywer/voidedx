import adminAuth from './_handler-admin-auth.js';
import adminDashboard from './_handler-admin-dashboard.js';
import announcements from './_handler-announcements.js';
import keyNetworkPrivacy from './_handler-key-network-privacy.js';
import keypage from './_handler-keypage.js';
import leaderboard from './_handler-leaderboard.js';
import linkvertiseConfig from './_handler-linkvertise-config.js';
import payload from './_handler-payload.js';
import raw from './_handler-raw.js';
import vaultinfo from './_handler-vaultinfo.js';
import verify from './_handler-verify.js';

const handlers = {
    'admin-auth': adminAuth,
    'admin-dashboard': adminDashboard,
    announcements,
    'key-network-privacy': keyNetworkPrivacy,
    keypage,
    leaderboard,
    'linkvertise-config': linkvertiseConfig,
    payload,
    raw,
    vaultinfo,
    verify
};

function json(res, status, body) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(status).json(body);
}

export default async function handler(req, res) {
    const endpoint = req.query?.endpoint;
    const name = typeof endpoint === 'string' ? endpoint : '';
    const routeHandler = handlers[name];
    if (!routeHandler) return json(res, 404, { ok: false, message: 'API endpoint not found.' });

    try {
        return await routeHandler(req, res);
    } catch (error) {
        console.error('Unhandled API route error:', name, error);
        return json(res, 500, { ok: false, message: 'The request could not be completed.' });
    }
}
