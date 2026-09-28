import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import {
    getFirestore, doc, getDoc, updateDoc
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

const firebaseConfig = {
    apiKey: "AIzaSyBdAR4ARjHccTlxrmP9tzdYGJxo4MvETXw",
    authDomain: "voidedx-fe79f.firebaseapp.com",
    projectId: "voidedx-fe79f",
    storageBucket: "voidedx-fe79f.firebasestorage.app",
    messagingSenderId: "784635868195",
    appId: "1:784635868195:web:6e879214df4238bc2aad96"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}

function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    const icons = { success: 'fa-circle-check', error: 'fa-circle-exclamation', info: 'fa-circle-info' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fa-solid ${icons[type]} toast-icon"></i><span>${message}</span><button class="toast-close" aria-label="Dismiss"><i class="fa-solid fa-xmark"></i></button>`;
    const remove = () => { toast.classList.add('leaving'); setTimeout(() => toast.remove(), 200); };
    toast.querySelector('.toast-close').addEventListener('click', remove);
    container.appendChild(toast);
    if (duration > 0) setTimeout(remove, duration);
}

function customConfirm({ title, message, confirmLabel = 'Confirm' }) {
    return new Promise(resolve => {
        const ok = window.confirm(`${title}\n\n${message}`);
        resolve(ok);
    });
}

function formatDuration(ms) {
    const totalMins = Math.floor(ms / 60000);
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
    return `${h}h ${m}m`;
}

function timeAgo(ts) {
    const diffMs = Date.now() - ts;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'moments ago';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

function generateRandomKey() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = 'VX-';
    for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
}

function isSafeUrl(url) {
    if (!url) return true;
    try {
        const parsed = new URL(url, window.location.origin);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const vaultId = urlParams.get('id');

    const ksLoading = document.getElementById('ks-loading');
    const ksError = document.getElementById('ks-error');
    const ksErrorText = document.getElementById('ks-error-text');
    const ksContent = document.getElementById('ks-content');
    const ksVaultTitle = document.getElementById('ks-vault-title');

    const chkKeySystem = document.getElementById('chk-key-system');
    const keySystemFields = document.getElementById('key-system-fields');
    const keysList = document.getElementById('keys-list');
    const keysCountBadge = document.getElementById('keys-count-badge');
    const addKeyBtn = document.getElementById('add-key-btn');
    const keyRowTemplate = document.getElementById('key-row-template');
    const chkGuiMode = document.getElementById('chk-gui-mode');
    const chkIpLock = document.getElementById('chk-ip-lock');
    const ipLockStatus = document.getElementById('ip-lock-status');
    const ipLockStatusText = document.getElementById('ip-lock-status-text');
    const resetIpBtn = document.getElementById('reset-ip-btn');
    const bannedUsersList = document.getElementById('banned-users-list');
    const bannedCountBadge = document.getElementById('banned-count-badge');
    const manualBanUserId = document.getElementById('manual-ban-userid');
    const manualBanDuration = document.getElementById('manual-ban-duration');
    const manualBanBtn = document.getElementById('manual-ban-btn');
    const keysystemStatus = document.getElementById('keysystem-status');
    const keysystemGetKeyOutput = document.getElementById('keysystem-get-key-output');
    const keysystemCopyKeyLinkBtn = document.getElementById('keysystem-copy-key-link-btn');
    const keysystemApplyBtn = document.getElementById('keysystem-apply-btn');

    if (!vaultId) {
        ksLoading.classList.add('hidden');
        ksErrorText.textContent = 'No vault ID was given in the link.';
        ksError.classList.remove('hidden');
        return;
    }

    // ---------------- Tabs ----------------
    document.querySelectorAll('.ks-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.ks-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.ks-tab-panel').forEach(p => p.classList.add('hidden'));
            tab.classList.add('active');
            document.querySelector(`.ks-tab-panel[data-panel="${tab.dataset.tab}"]`).classList.remove('hidden');
        });
    });

    // ---------------- Key list state ----------------
    let currentKeys = [];
    let currentBannedUsers = [];

    chkKeySystem.addEventListener('change', () => {
        keySystemFields.classList.toggle('hidden', !chkKeySystem.checked);
        updateKeysystemBadge();
    });

    function updateKeysystemBadge() {
        keysCountBadge.textContent = String(currentKeys.length);
        keysCountBadge.classList.toggle('hidden', currentKeys.length === 0);
    }

    function newKeyObject(label) {
        return {
            id: 'k_' + Math.random().toString(36).substring(2, 10),
            label: label || (currentKeys.length === 0 ? 'Main Key' : `Key ${currentKeys.length + 1}`),
            key: generateRandomKey(),
            priority: currentKeys.length + 1,
            durationDays: null,
            keyGeneratedAt: Date.now(),
            maxUsers: 1,
            maxUsersUnlimited: false,
            boundUsers: [],
            terminated: false,
            adGateUrl: '',
            visibility: 'public'
        };
    }

    function formatKeyStatus(k) {
        const parts = [];
        if (k.terminated) {
            parts.push('TERMINATED — this key no longer works until reactivated.');
        } else if (!k.durationDays) {
            parts.push('Permanent — never expires on its own.');
        } else if (!k.keyGeneratedAt) {
            parts.push(`Set to expire ${k.durationDays} day${k.durationDays > 1 ? 's' : ''} after you Apply.`);
        } else {
            const expiresAt = k.keyGeneratedAt + k.durationDays * 86400000;
            const msLeft = expiresAt - Date.now();
            parts.push(msLeft > 0 ? `Expires in ${formatDuration(msLeft)}.` : 'This key has expired.');
        }
        const boundCount = Array.isArray(k.boundUsers) ? k.boundUsers.length : 0;
        parts.push(k.maxUsersUnlimited
            ? `${boundCount} player${boundCount === 1 ? '' : 's'} used so far — unlimited allowed.`
            : `${boundCount} / ${k.maxUsers} player slot${k.maxUsers === 1 ? '' : 's'} used.`);
        return parts.join(' ');
    }

    function renderKeysList() {
        keysList.innerHTML = '';
        if (currentKeys.length === 0) {
            keysList.innerHTML = '<div class="info-box"><p>No keys yet — add one below.</p></div>';
            updateKeysystemBadge();
            return;
        }
        const sorted = [...currentKeys].sort((a, b) => (a.priority || 0) - (b.priority || 0));

        sorted.forEach(k => {
            const node = keyRowTemplate.content.firstElementChild.cloneNode(true);
            node.dataset.keyId = k.id;
            node.classList.toggle('key-card-terminated', !!k.terminated);

            node.querySelector('.key-priority-input').value = k.priority || 1;
            node.querySelector('.key-label-input').value = k.label;
            node.querySelector('.key-value-input').value = k.key;

            const durationSelect = node.querySelector('.key-duration-select');
            const durationCustom = node.querySelector('.key-duration-custom');
            const presetDays = [1, 3, 7, 14, 30];
            if (!k.durationDays) {
                durationSelect.value = 'permanent';
                durationCustom.classList.add('hidden');
            } else if (presetDays.includes(k.durationDays)) {
                durationSelect.value = String(k.durationDays);
                durationCustom.classList.add('hidden');
            } else {
                durationSelect.value = 'custom';
                durationCustom.value = k.durationDays;
                durationCustom.classList.remove('hidden');
            }

            node.querySelector('.key-maxusers-input').value = k.maxUsers || 1;
            node.querySelector('.key-maxusers-input').disabled = !!k.maxUsersUnlimited;
            node.querySelector('.key-unlimited-toggle').checked = !!k.maxUsersUnlimited;
            node.querySelector('.key-adgate-input').value = k.adGateUrl || '';
            node.querySelector('.key-visibility-select').value = k.visibility || 'public';
            node.querySelector('.key-card-status').textContent = formatKeyStatus(k);
            node.querySelector('.key-terminate-btn').innerHTML = k.terminated
                ? '<i class="fa-solid fa-rotate-left"></i>'
                : '<i class="fa-solid fa-ban"></i>';
            node.querySelector('.key-terminate-btn').title = k.terminated ? 'Reactivate' : 'Terminate';

            node.querySelector('.key-priority-input').addEventListener('change', (e) => {
                k.priority = parseInt(e.target.value, 10) || 1;
            });
            node.querySelector('.key-label-input').addEventListener('input', (e) => { k.label = e.target.value; });
            node.querySelector('.key-value-input').addEventListener('input', (e) => { k.key = e.target.value; });
            node.querySelector('.key-adgate-input').addEventListener('input', (e) => { k.adGateUrl = e.target.value.trim(); });
            node.querySelector('.key-visibility-select').addEventListener('change', (e) => { k.visibility = e.target.value; });

            durationSelect.addEventListener('change', (e) => {
                const val = e.target.value;
                if (val === 'permanent') {
                    k.durationDays = null;
                    durationCustom.classList.add('hidden');
                } else if (val === 'custom') {
                    durationCustom.classList.remove('hidden');
                    durationCustom.focus();
                    k.durationDays = parseInt(durationCustom.value, 10) || null;
                } else {
                    k.durationDays = parseInt(val, 10);
                    durationCustom.classList.add('hidden');
                }
                node.querySelector('.key-card-status').textContent = formatKeyStatus(k);
            });
            durationCustom.addEventListener('input', (e) => {
                k.durationDays = parseInt(e.target.value, 10) || null;
                node.querySelector('.key-card-status').textContent = formatKeyStatus(k);
            });

            node.querySelector('.key-maxusers-input').addEventListener('input', (e) => {
                k.maxUsers = Math.max(1, parseInt(e.target.value, 10) || 1);
                node.querySelector('.key-card-status').textContent = formatKeyStatus(k);
            });
            node.querySelector('.key-unlimited-toggle').addEventListener('change', (e) => {
                k.maxUsersUnlimited = e.target.checked;
                node.querySelector('.key-maxusers-input').disabled = k.maxUsersUnlimited;
                node.querySelector('.key-card-status').textContent = formatKeyStatus(k);
            });

            node.querySelector('.key-generate-btn').addEventListener('click', () => {
                k.key = generateRandomKey();
                node.querySelector('.key-value-input').value = k.key;
                showToast('Random key generated.', 'success', 2000);
            });
            node.querySelector('.key-extend-btn').addEventListener('click', () => {
                k.keyGeneratedAt = Date.now();
                node.querySelector('.key-card-status').textContent = formatKeyStatus(k);
                showToast('Timer restarted from now — click "Apply Changes" to confirm.', 'info', 3000);
            });
            node.querySelector('.key-regenerate-btn').addEventListener('click', async () => {
                const confirmed = await customConfirm({ title: 'Regenerate this key?', message: 'The old key stops working once you Apply.', confirmLabel: 'Regenerate' });
                if (!confirmed) return;
                k.key = generateRandomKey();
                k.keyGeneratedAt = Date.now();
                node.querySelector('.key-value-input').value = k.key;
                node.querySelector('.key-card-status').textContent = formatKeyStatus(k);
                showToast('New key generated — click "Apply Changes" to confirm it.', 'info', 3500);
            });
            node.querySelector('.key-terminate-btn').addEventListener('click', async () => {
                if (k.terminated) {
                    k.terminated = false;
                    renderKeysList();
                    showToast('Key reactivated — click "Apply Changes" to confirm.', 'info', 3000);
                    return;
                }
                const confirmed = await customConfirm({ title: 'Terminate this key?', message: `"${k.label || 'This key'}" stops working for everyone once you Apply.`, confirmLabel: 'Terminate' });
                if (!confirmed) return;
                k.terminated = true;
                renderKeysList();
                showToast('Key terminated — click "Apply Changes" to confirm.', 'info', 3500);
            });
            node.querySelector('.key-delete-btn').addEventListener('click', async () => {
                const confirmed = await customConfirm({ title: 'Delete this key?', message: `"${k.label || 'This key'}" will stop working once you Apply.`, confirmLabel: 'Delete' });
                if (!confirmed) return;
                currentKeys = currentKeys.filter(item => item.id !== k.id);
                renderKeysList();
                showToast('Key removed — click "Apply Changes" to confirm.', 'info', 3000);
            });

            renderKeyBoundUsers(node, k);
            keysList.appendChild(node);
        });
        updateKeysystemBadge();
    }

    function renderKeyBoundUsers(node, k) {
        const container = node.querySelector('.key-bound-users-list');
        const boundUsers = Array.isArray(k.boundUsers) ? k.boundUsers : [];
        if (boundUsers.length === 0) {
            container.innerHTML = '<div class="info-box"><p>No one has used this key yet.</p></div>';
            return;
        }
        container.innerHTML = '';
        boundUsers.forEach(u => {
            const row = document.createElement('div');
            row.className = 'manage-user-row';
            row.innerHTML = `
                <div class="manage-user-info">
                    <span class="manage-user-name"><i class="fa-solid fa-user text-cyan"></i> ${escapeHtml(u.username || 'Unknown')}</span>
                    <span class="manage-user-meta">UserId: ${escapeHtml(String(u.userId))} • ${escapeHtml(timeAgo(u.boundAt))}</span>
                </div>
                <div class="key-bound-user-actions">
                    <button class="btn-ghost kick-user-btn"><i class="fa-solid fa-user-slash"></i> Kick</button>
                    <button class="btn-danger ban-user-btn"><i class="fa-solid fa-gavel"></i> Ban</button>
                </div>
            `;
            row.querySelector('.kick-user-btn').addEventListener('click', () => {
                k.boundUsers = boundUsers.filter(item => String(item.userId) !== String(u.userId));
                renderKeysList();
                showToast('Removed — click "Apply Changes" to confirm.', 'info', 3000);
            });
            row.querySelector('.ban-user-btn').addEventListener('click', () => {
                manualBanUserId.value = String(u.userId);
                document.querySelector('.ks-tab[data-tab="security"]').click();
                manualBanUserId.scrollIntoView({ behavior: 'smooth', block: 'center' });
                manualBanUserId.focus();
                showToast(`Pick a duration and click Ban to block ${u.username || 'this user'}.`, 'info', 4000);
            });
            container.appendChild(row);
        });
    }

    addKeyBtn.addEventListener('click', () => {
        currentKeys.push(newKeyObject());
        renderKeysList();
    });

    // ---------------- Banned users ----------------
    function renderBannedUsersList() {
        bannedCountBadge.textContent = String(currentBannedUsers.length);
        bannedCountBadge.classList.toggle('hidden', currentBannedUsers.length === 0);
        if (currentBannedUsers.length === 0) {
            bannedUsersList.innerHTML = '<div class="info-box"><p>No one is banned from this vault.</p></div>';
            return;
        }
        bannedUsersList.innerHTML = '';
        currentBannedUsers.forEach(b => {
            const isExpired = b.bannedUntil && b.bannedUntil <= Date.now();
            const remaining = b.bannedUntil ? formatDuration(b.bannedUntil - Date.now()) : null;
            const row = document.createElement('div');
            row.className = 'manage-user-row';
            row.innerHTML = `
                <div class="manage-user-info">
                    <span class="manage-user-name"><i class="fa-solid fa-gavel text-red"></i> ${escapeHtml(b.username || 'Unknown')}</span>
                    <span class="manage-user-meta">UserId: ${escapeHtml(String(b.userId))} • ${isExpired ? 'Ban expired' : (b.bannedUntil ? `${escapeHtml(remaining)} left` : 'Permanent')}</span>
                </div>
                <button class="btn-ghost unban-btn"><i class="fa-solid fa-check"></i> Unban</button>
            `;
            row.querySelector('.unban-btn').addEventListener('click', () => unbanUser(b.userId));
            bannedUsersList.appendChild(row);
        });
    }

    async function unbanUser(userId) {
        try {
            currentBannedUsers = currentBannedUsers.filter(b => String(b.userId) !== String(userId));
            await updateDoc(doc(db, "vaults", vaultId), { bannedUsers: currentBannedUsers });
            renderBannedUsersList();
            showToast('User unbanned.', 'success');
        } catch (err) {
            showToast('Failed to unban: ' + err.message, 'error');
        }
    }

    manualBanBtn.addEventListener('click', async () => {
        const userId = manualBanUserId.value.trim();
        if (!userId) {
            showToast('Enter a Roblox UserId to ban.', 'error');
            manualBanUserId.focus();
            return;
        }
        const durationVal = manualBanDuration.value;
        const bannedUntil = durationVal === 'permanent' ? null : Date.now() + parseInt(durationVal, 10) * 86400000;

        const originalHtml = manualBanBtn.innerHTML;
        manualBanBtn.disabled = true;
        manualBanBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        try {
            currentBannedUsers = currentBannedUsers.filter(b => String(b.userId) !== userId);
            currentBannedUsers.push({ userId, username: 'Unknown', bannedAt: Date.now(), bannedUntil });
            await updateDoc(doc(db, "vaults", vaultId), { bannedUsers: currentBannedUsers });
            renderBannedUsersList();
            manualBanUserId.value = '';
            showToast('User banned.', 'success');
        } catch (err) {
            showToast('Failed to ban: ' + err.message, 'error');
        } finally {
            manualBanBtn.disabled = false;
            manualBanBtn.innerHTML = originalHtml;
        }
    });

    resetIpBtn.addEventListener('click', async () => {
        const confirmed = await customConfirm({ title: 'Reset the bound IP?', message: 'The next person to use this key will lock it to their IP instead.', confirmLabel: 'Reset IP' });
        if (!confirmed) return;
        try {
            await updateDoc(doc(db, "vaults", vaultId), { boundIp: null });
            showToast('Bound IP reset.', 'success');
            loadVault();
        } catch (err) {
            showToast('Failed to reset IP: ' + err.message, 'error');
        }
    });

    keysystemCopyKeyLinkBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(keysystemGetKeyOutput.value);
        keysystemCopyKeyLinkBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
        showToast('Get-Key link copied.', 'success', 2000);
        setTimeout(() => keysystemCopyKeyLinkBtn.innerHTML = '<i class="fa-solid fa-copy"></i> Copy', 2000);
    });

    // ---------------- Load / migrate vault data ----------------
    function keysFromVaultData(data) {
        if (Array.isArray(data.keys) && data.keys.length > 0) {
            return data.keys.map((k, i) => ({
                id: k.id || ('k_' + Math.random().toString(36).substring(2, 10)),
                label: k.label || 'Key',
                key: k.key || '',
                priority: k.priority || (i + 1),
                durationDays: k.durationDays != null ? k.durationDays : null,
                keyGeneratedAt: k.keyGeneratedAt || null,
                maxUsers: k.maxUsers || 1,
                maxUsersUnlimited: k.maxUsersUnlimited === true || k.maxUsers === 'unlimited',
                boundUsers: Array.isArray(k.boundUsers) ? k.boundUsers : [],
                terminated: !!k.terminated,
                adGateUrl: k.adGateUrl || '',
                visibility: k.visibility === 'private' ? 'private' : 'public'
            }));
        }
        if (data.requireKey && data.key) {
            return [{
                id: 'k_legacy', label: 'Main Key', key: data.key, priority: 1,
                durationDays: null, keyGeneratedAt: data.keyGeneratedAt || null,
                maxUsers: data.maxUsers || 1, maxUsersUnlimited: !data.accountBinding,
                boundUsers: Array.isArray(data.boundUsers) ? data.boundUsers : [],
                terminated: false, adGateUrl: '', visibility: 'public'
            }];
        }
        return [];
    }

    async function loadVault() {
        try {
            const snap = await getDoc(doc(db, "vaults", vaultId));
            if (!snap.exists()) {
                ksLoading.classList.add('hidden');
                ksErrorText.textContent = "This vault doesn't exist or may have been deleted.";
                ksError.classList.remove('hidden');
                return;
            }
            const data = snap.data();
            ksVaultTitle.textContent = data.title || 'Untitled Vault';

            chkKeySystem.checked = !!data.requireKey;
            keySystemFields.classList.toggle('hidden', !data.requireKey);
            currentKeys = keysFromVaultData(data);
            renderKeysList();

            chkGuiMode.checked = !!data.guiMode;
            chkIpLock.checked = !!data.ipLock;

            currentBannedUsers = Array.isArray(data.bannedUsers) ? data.bannedUsers : [];
            renderBannedUsersList();

            if (data.ipLock) {
                ipLockStatus.classList.remove('hidden');
                if (data.boundIp) {
                    ipLockStatusText.textContent = `Locked to IP: ${data.boundIp}`;
                    resetIpBtn.classList.remove('hidden');
                } else {
                    ipLockStatusText.textContent = 'Not bound to any IP yet — the next person to use this key locks it in.';
                    resetIpBtn.classList.add('hidden');
                }
            } else {
                ipLockStatus.classList.add('hidden');
                resetIpBtn.classList.add('hidden');
            }

            keysystemGetKeyOutput.value = `${window.location.origin}/key.html?id=${vaultId}`;
            keysystemStatus.innerHTML = (!data.requireKey || currentKeys.length === 0)
                ? '<i class="fa-solid fa-circle-info text-cyan"></i><p>Key system is currently off, or has no keys yet.</p>'
                : `<i class="fa-solid fa-circle-check text-success"></i><p>${currentKeys.length} key${currentKeys.length > 1 ? 's are' : ' is'} active. Visitors pick any working public key from the Get-Key link.</p>`;

            updateKeysystemBadge();
            ksLoading.classList.add('hidden');
            ksContent.classList.remove('hidden');
        } catch (err) {
            ksLoading.classList.add('hidden');
            ksErrorText.textContent = 'Something went wrong loading this vault: ' + err.message;
            ksError.classList.remove('hidden');
        }
    }

    keysystemApplyBtn.addEventListener('click', async () => {
        if (chkKeySystem.checked && currentKeys.length === 0) {
            showToast('Add at least one key, or turn the key system off.', 'error');
            return;
        }
        if (chkKeySystem.checked && currentKeys.some(k => !k.key.trim())) {
            showToast('One of your keys is empty — fill it in or delete that key.', 'error');
            return;
        }
        if (chkKeySystem.checked && currentKeys.some(k => !isSafeUrl(k.adGateUrl))) {
            showToast('One of your ad-gate links looks invalid — only http/https links are allowed.', 'error', 5000);
            return;
        }

        const requireKey = chkKeySystem.checked;
        const guiMode = requireKey && chkGuiMode.checked;
        const ipLock = requireKey && chkIpLock.checked;
        const keysPayload = requireKey ? currentKeys.map(k => ({
            id: k.id, label: k.label.trim() || 'Key', key: k.key.trim(),
            priority: k.priority || 1, durationDays: k.durationDays || null,
            keyGeneratedAt: k.keyGeneratedAt || Date.now(),
            maxUsers: Math.max(1, k.maxUsers || 1), maxUsersUnlimited: !!k.maxUsersUnlimited,
            boundUsers: Array.isArray(k.boundUsers) ? k.boundUsers : [],
            terminated: !!k.terminated, adGateUrl: k.adGateUrl || '',
            visibility: k.visibility === 'private' ? 'private' : 'public'
        })) : [];

        const originalHtml = keysystemApplyBtn.innerHTML;
        keysystemApplyBtn.disabled = true;
        keysystemApplyBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Applying...';

        try {
            const existingSnap = await getDoc(doc(db, "vaults", vaultId));
            const existing = existingSnap.exists() ? existingSnap.data() : {};
            const boundIp = ipLock ? (existing.boundIp || null) : null;
            const primaryKey = keysPayload[0] || null;

            await updateDoc(doc(db, "vaults", vaultId), {
                requireKey, guiMode, keys: keysPayload,
                key: primaryKey ? primaryKey.key : '',
                keyGeneratedAt: primaryKey ? primaryKey.keyGeneratedAt : null,
                ipLock, boundIp
            });

            showToast('Key settings updated!', 'success');
            await loadVault();
        } catch (err) {
            showToast('Failed to update key settings: ' + err.message, 'error', 6000);
        } finally {
            keysystemApplyBtn.disabled = false;
            keysystemApplyBtn.innerHTML = originalHtml;
        }
    });

    loadVault();
});
