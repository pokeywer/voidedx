import { db, FieldValue } from './_admin.js';

// Dates use UTC so all visitors see the same daily and monthly cutoffs.
export async function recordExecution(vaultRef, vaultId, rawTitle) {
    const now = new Date();
    const dayKey = now.toISOString().slice(0, 10);
    const monthKey = dayKey.slice(0, 7);
    const title = typeof rawTitle === 'string' && rawTitle.trim()
        ? rawTitle.trim().slice(0, 120)
        : 'Untitled Vault';

    const batch = db.batch();
    batch.update(vaultRef, { executions: FieldValue.increment(1) });
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
    await batch.commit();
}
