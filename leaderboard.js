import { db } from './_admin.js';

function json(res, status, body) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
    return res.status(status).json(body);
}

function rows(snapshot) {
    return snapshot.docs
        .map((doc) => {
            const data = doc.data();
            return {
                vaultId: String(data.vaultId || doc.id),
                title: typeof data.title === 'string' && data.title.trim() ? data.title.trim() : 'Untitled Vault',
                executions: Number(data.executions) || 0
            };
        })
        .filter((entry) => entry.executions > 0)
        .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return json(res, 405, { ok: false, message: 'Method not allowed.' });
    }

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const month = today.slice(0, 7);

    try {
        const [overallSnap, dailySnap, monthlySnap] = await Promise.all([
            db.collection('vaults')
                .where('executions', '>', 0)
                .orderBy('executions', 'desc')
                .limit(50)
                .get(),
            db.collection('leaderboardDaily').doc(today).collection('vaults')
                .where('executions', '>', 0)
                .orderBy('executions', 'desc')
                .limit(50)
                .get(),
            db.collection('leaderboardMonthly').doc(month).collection('vaults')
                .where('executions', '>', 0)
                .orderBy('executions', 'desc')
                .limit(50)
                .get()
        ]);

        return json(res, 200, {
            ok: true,
            today,
            month,
            timezone: 'UTC',
            rankings: {
                overall: rows(overallSnap),
                today: rows(dailySnap),
                month: rows(monthlySnap)
            }
        });
    } catch (err) {
        return json(res, 500, { ok: false, message: 'Could not load leaderboard.' });
    }
}
