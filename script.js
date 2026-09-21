import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import {
    getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import {
    getFirestore, collection, doc, setDoc, getDoc, getDocs, deleteDoc, updateDoc, query, where
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

// --- YOUR FIREBASE CONFIG HERE ---
const firebaseConfig = {
    apiKey: "AIzaSyBdAR4ARjHccTlxrmP9tzdYGJxo4MvETXw",
    authDomain: "voidedx-fe79f.firebaseapp.com",
    projectId: "voidedx-fe79f",
    storageBucket: "voidedx-fe79f.firebasestorage.app",
    messagingSenderId: "784635868195",
    appId: "1:784635868195:web:6e879214df4238bc2aad96"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let isSignUpMode = false;

// ============================================================
// Small reusable UI helpers (toasts, field errors, confirm modal)
// ============================================================

function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = { success: 'fa-circle-check', error: 'fa-circle-exclamation', info: 'fa-circle-info' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fa-solid ${icons[type] || icons.info} toast-icon"></i>
        <span>${message}</span>
        <button class="toast-close" aria-label="Dismiss"><i class="fa-solid fa-xmark"></i></button>
    `;

    const remove = () => {
        toast.classList.add('leaving');
        setTimeout(() => toast.remove(), 200);
    };

    toast.querySelector('.toast-close').addEventListener('click', remove);
    container.appendChild(toast);

    if (duration > 0) setTimeout(remove, duration);
}

function setFieldError(inputEl, errorEl, message) {
    if (inputEl) inputEl.classList.add('error');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
    }
}

function clearFieldError(inputEl, errorEl) {
    if (inputEl) inputEl.classList.remove('error');
    if (errorEl) {
        errorEl.textContent = '';
        errorEl.classList.add('hidden');
    }
}

function shakeElement(el) {
    if (!el) return;
    el.classList.remove('shake-error');
    // force reflow so the animation can restart if triggered repeatedly
    void el.offsetWidth;
    el.classList.add('shake-error');
    setTimeout(() => el.classList.remove('shake-error'), 450);
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Only allow http(s) links for ad-gate URLs — blocks javascript: URI injection
// and similar schemes from ever becoming a clickable href on the Get-Key page.
function isSafeUrl(url) {
    if (!url) return true; // empty is fine — it just means no ad-gate step
    try {
        const parsed = new URL(url, window.location.origin);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

// Translates raw Firebase Auth error codes into human, actionable copy.
function friendlyAuthError(err) {
    const code = err && err.code ? err.code : '';
    switch (code) {
        case 'auth/invalid-email':
            return "That email address doesn't look valid.";
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
            return 'Incorrect email or password. Double-check and try again.';
        case 'auth/email-already-in-use':
            return 'An account with this email already exists — try logging in instead.';
        case 'auth/weak-password':
            return 'That password is too weak — use at least 6 characters.';
        case 'auth/too-many-requests':
            return 'Too many attempts. Please wait a moment before trying again.';
        case 'auth/network-request-failed':
            return "Network error — check your connection and try again.";
        case 'auth/user-disabled':
            return 'This account has been disabled. Contact support if that seems wrong.';
        default:
            return (err && err.message ? err.message.replace(/^Firebase:\s*/i, '') : 'Something went wrong. Please try again.');
    }
}

// Simple promise-based replacement for window.confirm, styled to match the app.
function customConfirm({ title, message, confirmLabel = 'Delete' }) {
    return new Promise(resolve => {
        const modal = document.getElementById('confirm-modal');
        const titleEl = document.getElementById('confirm-title');
        const messageEl = document.getElementById('confirm-message');
        const okBtn = document.getElementById('confirm-ok-btn');
        const cancelBtn = document.getElementById('confirm-cancel-btn');

        titleEl.textContent = title;
        messageEl.textContent = message;
        okBtn.textContent = confirmLabel;
        modal.classList.remove('hidden');

        const cleanup = (result) => {
            modal.classList.add('hidden');
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
            modal.removeEventListener('click', onOverlayClick);
            resolve(result);
        };
        const onOk = () => cleanup(true);
        const onCancel = () => cleanup(false);
        const onOverlayClick = (e) => { if (e.target === modal) cleanup(false); };

        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        modal.addEventListener('click', onOverlayClick);
    });
}

// ============================================================
// Main app
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    const lockBtn = document.getElementById('lock-vault-btn');
    const newVaultBtn = document.getElementById('new-vault-btn');
    const deleteBtn = document.getElementById('delete-vault-btn');
    const sourceCode = document.getElementById('source-code');
    const codeError = document.getElementById('code-error');
    const lineNumbersEl = document.getElementById('line-numbers');
    const scriptTitle = document.getElementById('script-title');
    const titleError = document.getElementById('title-error');
    const resultOverlay = document.getElementById('result-overlay');
    const lsOutput = document.getElementById('ls-output');
    const copyBtn = document.getElementById('copy-out-btn');
    const getKeyRow = document.getElementById('get-key-row');
    const getKeyOutput = document.getElementById('get-key-output');
    const copyKeyLinkBtn = document.getElementById('copy-key-link-btn');
    const chkBackup = document.getElementById('chk-backup');
    const chkKeySystem = document.getElementById('chk-key-system');
    const keySystemFields = document.getElementById('key-system-fields');
    const keysList = document.getElementById('keys-list');
    const keysCountBadge = document.getElementById('keys-count-badge');
    const addKeyBtn = document.getElementById('add-key-btn');
    const keyRowTemplate = document.getElementById('key-row-template');
    const keysystemStatus = document.getElementById('keysystem-status');
    const keysystemGetKeyOutput = document.getElementById('keysystem-get-key-output');
    const keysystemCopyKeyLinkBtn = document.getElementById('keysystem-copy-key-link-btn');
    const openKeysystemBtn = document.getElementById('open-keysystem-btn');
    const keysystemStatusBadge = document.getElementById('keysystem-status-badge');
    const keysystemModal = document.getElementById('keysystem-modal');
    const keysystemCloseX = document.getElementById('keysystem-close-x');
    const keysystemCloseBtn = document.getElementById('keysystem-close-btn');
    const keysystemApplyBtn = document.getElementById('keysystem-apply-btn');
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
    const activeVaultId = document.getElementById('active-vault-id');
    const editingIndicator = document.getElementById('editing-indicator');
    const vaultListContainer = document.getElementById('vault-list');
    const vaultListToggle = document.getElementById('vault-list-toggle');
    const vaultListPanel = document.getElementById('vault-list-panel');
    const vaultListCount = document.getElementById('vault-list-count');
    const execCountBadge = document.getElementById('exec-count-badge');
    const execCountNum = document.getElementById('exec-count-num');
    const promoShareBtn = document.getElementById('promo-share-btn');

    if (promoShareBtn) {
        promoShareBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(window.location.origin);
            showToast('VoidedX link copied to clipboard!', 'success', 3000);
        });
    }

    // Vault list dropdown (starts expanded)
    vaultListPanel.classList.add('expanded');
    vaultListToggle.classList.add('expanded');
    vaultListToggle.addEventListener('click', () => {
        const isExpanded = vaultListPanel.classList.toggle('expanded');
        vaultListToggle.classList.toggle('expanded', isExpanded);
    });

    // Key System Toggle
    let currentKeys = []; // in-memory array of key objects for the vault being edited

    chkKeySystem.addEventListener('change', () => {
        keySystemFields.classList.toggle('hidden', !chkKeySystem.checked);
        updateKeysystemBadge();
    });

    function updateKeysystemBadge() {
        if (chkKeySystem.checked && currentKeys.length > 0) {
            const terminatedCount = currentKeys.filter(k => k.terminated).length;
            keysystemStatusBadge.textContent = terminatedCount > 0
                ? `ON · ${currentKeys.length} key${currentKeys.length > 1 ? 's' : ''} · ${terminatedCount} terminated`
                : `ON · ${currentKeys.length} key${currentKeys.length > 1 ? 's' : ''}`;
            keysystemStatusBadge.classList.remove('hidden');
            keysystemStatusBadge.classList.add('on');
        } else {
            keysystemStatusBadge.textContent = 'OFF';
            keysystemStatusBadge.classList.remove('on');
            keysystemStatusBadge.classList.add('hidden');
        }
        keysCountBadge.textContent = String(currentKeys.length);
        keysCountBadge.classList.toggle('hidden', currentKeys.length === 0);
    }

    function generateRandomKey() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let out = 'VX-';
        for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
        return out;
    }

    function newKeyObject(label) {
        return {
            id: 'k_' + Math.random().toString(36).substring(2, 10),
            label: label || (currentKeys.length === 0 ? 'Main Key' : `Key ${currentKeys.length + 1}`),
            key: generateRandomKey(),
            priority: currentKeys.length + 1,
            durationDays: null, // null = permanent
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
            parts.push(msLeft > 0
                ? `Expires in ${formatDuration(msLeft)}.`
                : 'This key has expired.');
        }
        const boundCount = Array.isArray(k.boundUsers) ? k.boundUsers.length : 0;
        parts.push(k.maxUsersUnlimited
            ? `${boundCount} player${boundCount === 1 ? '' : 's'} used so far — unlimited allowed.`
            : `${boundCount} / ${k.maxUsers} player slot${k.maxUsers === 1 ? '' : 's'} used.`);
        return parts.join(' ');
    }

    function reactivateKey(k) {
        k.terminated = false;
    }

    function renderKeysList() {
        keysList.innerHTML = '';
        if (currentKeys.length === 0) {
            keysList.innerHTML = '<div class="info-box"><p>No keys yet — add one below.</p></div>';
            updateKeysystemBadge();
            return;
        }
        // Show higher-priority (lower number) keys first, matching the public Get-Key page order.
        const sorted = [...currentKeys].sort((a, b) => (a.priority || 0) - (b.priority || 0));

        sorted.forEach(k => {
            const node = keyRowTemplate.content.firstElementChild.cloneNode(true);
            node.dataset.keyId = k.id;
            node.classList.toggle('key-card-terminated', !!k.terminated);

            node.querySelector('.key-priority-input').value = k.priority || 1;
            node.querySelector('.key-label-input').value = k.label;
            node.querySelector('.key-value-input').value = k.key;
            node.querySelector('.key-duration-select').value = k.durationDays ? 'custom-check' : 'permanent';
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
                ? '<i class="fa-solid fa-rotate-left"></i> Reactivate'
                : '<i class="fa-solid fa-ban"></i> Terminate';

            node.querySelector('.key-priority-input').addEventListener('change', (e) => {
                k.priority = parseInt(e.target.value, 10) || 1;
            });
            node.querySelector('.key-label-input').addEventListener('input', (e) => { k.label = e.target.value; });
            node.querySelector('.key-value-input').addEventListener('input', (e) => { k.key = e.target.value; });
            node.querySelector('.key-adgate-input').addEventListener('input', (e) => { k.adGateUrl = e.target.value.trim(); });
            node.querySelector('.key-visibility-select').addEventListener('change', (e) => { k.visibility = e.target.value; });

            node.querySelector('.key-duration-select').addEventListener('change', (e) => {
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
                const confirmed = await customConfirm({
                    title: 'Regenerate this key?',
                    message: 'The old key stops working once you Apply. This can\'t be undone.',
                    confirmLabel: 'Regenerate'
                });
                if (!confirmed) return;
                k.key = generateRandomKey();
                k.keyGeneratedAt = Date.now();
                node.querySelector('.key-value-input').value = k.key;
                node.querySelector('.key-card-status').textContent = formatKeyStatus(k);
                showToast('New key generated — click "Apply Changes" to confirm it.', 'info', 3500);
            });
            node.querySelector('.key-terminate-btn').addEventListener('click', async () => {
                if (k.terminated) {
                    reactivateKey(k);
                    renderKeysList();
                    showToast('Key reactivated — click "Apply Changes" to confirm.', 'info', 3000);
                    return;
                }
                const confirmed = await customConfirm({
                    title: 'Terminate this key?',
                    message: `"${k.label || 'This key'}" will immediately stop working for everyone once you Apply. You can reactivate it later.`,
                    confirmLabel: 'Terminate'
                });
                if (!confirmed) return;
                k.terminated = true;
                renderKeysList();
                showToast('Key terminated — click "Apply Changes" to confirm.', 'info', 3500);
            });
            node.querySelector('.key-delete-btn').addEventListener('click', async () => {
                const confirmed = await customConfirm({
                    title: 'Delete this key?',
                    message: `"${k.label || 'This key'}" will stop working once you Apply.`,
                    confirmLabel: 'Delete'
                });
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

    addKeyBtn.addEventListener('click', () => {
        currentKeys.push(newKeyObject());
        renderKeysList();
    });

    copyKeyLinkBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(getKeyOutput.value);
        copyKeyLinkBtn.innerHTML = '<i class="fa-solid fa-check"></i> COPIED!';
        showToast('Get-Key link copied — share this instead of the raw key.', 'success', 2500);
        setTimeout(() => copyKeyLinkBtn.innerHTML = '<i class="fa-solid fa-key"></i> COPY GET-KEY LINK', 2000);
    });

    keysystemCopyKeyLinkBtn.addEventListener('click', () => {
        if (!keysystemGetKeyOutput.value) return;
        navigator.clipboard.writeText(keysystemGetKeyOutput.value);
        keysystemCopyKeyLinkBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
        showToast('Get-Key link copied.', 'success', 2000);
        setTimeout(() => keysystemCopyKeyLinkBtn.innerHTML = '<i class="fa-solid fa-copy"></i> Copy', 2000);
    });

    // ---------------- Key System Manager modal ----------------

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
        // Legacy single-key vaults: migrate on the fly so old data keeps working.
        // Any old vault-level account-binding settings get folded into this one key.
        if (data.requireKey && data.key) {
            return [{
                id: 'k_legacy',
                label: 'Main Key',
                key: data.key,
                priority: 1,
                durationDays: null,
                keyGeneratedAt: data.keyGeneratedAt || null,
                maxUsers: data.maxUsers || 1,
                maxUsersUnlimited: !data.accountBinding,
                boundUsers: Array.isArray(data.boundUsers) ? data.boundUsers : [],
                terminated: false,
                adGateUrl: '',
                visibility: 'public'
            }];
        }
        return [];
    }

    async function refreshKeysystemStatus() {
        if (!activeVaultId.value) {
            keysystemStatus.innerHTML = '<i class="fa-solid fa-circle-info text-cyan"></i><p>This is a new, unsaved vault. Save it once first, then reopen this panel for a shareable Get-Key link and live status.</p>';
            keysystemGetKeyOutput.value = '';
            keysystemGetKeyOutput.placeholder = 'Save this vault to generate a link';
            ipLockStatus.classList.add('hidden');
            resetIpBtn.classList.add('hidden');
            currentBannedUsers = [];
            renderBannedUsersList();
            return;
        }
        keysystemGetKeyOutput.value = `${window.location.origin}/key.html?id=${activeVaultId.value}`;
        try {
            const snap = await getDoc(doc(db, "vaults", activeVaultId.value));
            if (!snap.exists()) {
                keysystemStatus.innerHTML = '<i class="fa-solid fa-triangle-exclamation text-red"></i><p>This vault no longer exists in the database.</p>';
                return;
            }
            const data = snap.data();

            // Keep the form in sync with what's actually saved.
            chkIpLock.checked = !!data.ipLock;
            currentKeys = keysFromVaultData(data);
            renderKeysList();

            currentBannedUsers = Array.isArray(data.bannedUsers) ? data.bannedUsers : [];
            renderBannedUsersList();

            // IP lock status
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

            if (!data.requireKey || currentKeys.length === 0) {
                keysystemStatus.innerHTML = '<i class="fa-solid fa-circle-info text-cyan"></i><p>Key system is currently off, or has no keys yet.</p>';
                return;
            }
            keysystemStatus.innerHTML = `<i class="fa-solid fa-circle-check text-success"></i><p>${currentKeys.length} key${currentKeys.length > 1 ? 's are' : ' is'} active. Each key card above shows its own status — visitors pick any working key from the Get-Key link below.</p>`;
        } catch (err) {
            keysystemStatus.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-red"></i><p>Couldn't load live status: ${escapeHtml(friendlyAuthError(err))}</p>`;
        }
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
                manualBanUserId.scrollIntoView({ behavior: 'smooth', block: 'center' });
                manualBanUserId.focus();
                showToast(`Pick a duration below and click Ban to block ${u.username || 'this user'}.`, 'info', 4000);
            });
            container.appendChild(row);
        });
    }

    let currentBannedUsers = [];

    function renderBannedUsersList() {
        bannedCountBadge.textContent = String(currentBannedUsers.length);
        bannedCountBadge.classList.toggle('hidden', currentBannedUsers.length === 0);
        if (currentBannedUsers.length === 0) {
            bannedUsersList.innerHTML = '<div class="info-box"><p>No one is banned from this vault.</p></div>';
            return;
        }
        bannedUsersList.innerHTML = '';
        currentBannedUsers.forEach(b => {
            const remaining = b.bannedUntil ? formatDuration(b.bannedUntil - Date.now()) : null;
            const isExpired = b.bannedUntil && b.bannedUntil <= Date.now();
            const row = document.createElement('div');
            row.className = 'manage-user-row';
            row.innerHTML = `
                <div class="manage-user-info">
                    <span class="manage-user-name"><i class="fa-solid fa-gavel text-red"></i> ${escapeHtml(b.username || 'Unknown')}</span>
                    <span class="manage-user-meta">UserId: ${escapeHtml(String(b.userId))} • ${
                        isExpired ? 'Ban expired' : (b.bannedUntil ? `${escapeHtml(remaining)} left` : 'Permanent')
                    }</span>
                </div>
                <button class="btn-ghost unban-btn"><i class="fa-solid fa-check"></i> Unban</button>
            `;
            row.querySelector('.unban-btn').addEventListener('click', () => unbanUser(b.userId));
            bannedUsersList.appendChild(row);
        });
    }

    async function unbanUser(userId) {
        if (!activeVaultId.value) return;
        try {
            currentBannedUsers = currentBannedUsers.filter(b => String(b.userId) !== String(userId));
            await updateDoc(doc(db, "vaults", activeVaultId.value), { bannedUsers: currentBannedUsers });
            renderBannedUsersList();
            showToast('User unbanned.', 'success');
        } catch (err) {
            showToast('Failed to unban: ' + friendlyAuthError(err), 'error');
        }
    }

    manualBanBtn.addEventListener('click', async () => {
        if (!activeVaultId.value) {
            showToast('Save this vault first, then you can ban accounts.', 'info');
            return;
        }
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
            await updateDoc(doc(db, "vaults", activeVaultId.value), { bannedUsers: currentBannedUsers });
            renderBannedUsersList();
            manualBanUserId.value = '';
            showToast('User banned.', 'success');
        } catch (err) {
            showToast('Failed to ban: ' + friendlyAuthError(err), 'error');
        } finally {
            manualBanBtn.disabled = false;
            manualBanBtn.innerHTML = originalHtml;
        }
    });

    resetIpBtn.addEventListener('click', async () => {
        if (!activeVaultId.value) return;
        const confirmed = await customConfirm({
            title: 'Reset the bound IP?',
            message: 'The next person to use this key will lock it to their IP instead.',
            confirmLabel: 'Reset IP'
        });
        if (!confirmed) return;
        try {
            await updateDoc(doc(db, "vaults", activeVaultId.value), { boundIp: null });
            showToast('Bound IP reset.', 'success');
            refreshKeysystemStatus();
        } catch (err) {
            showToast('Failed to reset IP: ' + friendlyAuthError(err), 'error');
        }
    });

    function timeAgo(ts) {
        const diffMs = Date.now() - ts;
        const mins = Math.floor(diffMs / 60000);
        if (mins < 1) return 'moments ago';
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        return `${Math.floor(hrs / 24)}d ago`;
    }

    function formatDuration(ms) {
        const totalMins = Math.floor(ms / 60000);
        const h = Math.floor(totalMins / 60);
        const m = totalMins % 60;
        return `${h}h ${m}m`;
    }

    openKeysystemBtn.addEventListener('click', () => {
        keysystemModal.classList.remove('hidden');
        renderKeysList();
        refreshKeysystemStatus();
    });

    function closeKeysystemModal() {
        keysystemModal.classList.add('hidden');
    }
    keysystemCloseX.addEventListener('click', closeKeysystemModal);
    keysystemCloseBtn.addEventListener('click', closeKeysystemModal);
    keysystemModal.addEventListener('click', (e) => { if (e.target === keysystemModal) closeKeysystemModal(); });

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
            priority: k.priority || 1,
            durationDays: k.durationDays || null,
            keyGeneratedAt: k.keyGeneratedAt || Date.now(),
            maxUsers: Math.max(1, k.maxUsers || 1),
            maxUsersUnlimited: !!k.maxUsersUnlimited,
            boundUsers: Array.isArray(k.boundUsers) ? k.boundUsers : [],
            terminated: !!k.terminated,
            adGateUrl: k.adGateUrl || '',
            visibility: k.visibility === 'private' ? 'private' : 'public'
        })) : [];

        updateKeysystemBadge();

        if (!activeVaultId.value) {
            // New/unsaved vault — just keep these values in the form for the next full Save.
            closeKeysystemModal();
            showToast('Key settings will apply when you save this vault.', 'info', 3000);
            return;
        }

        const originalHtml = keysystemApplyBtn.innerHTML;
        keysystemApplyBtn.disabled = true;
        keysystemApplyBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Applying...';

        try {
            const vaultId = activeVaultId.value;
            const existingSnap = await getDoc(doc(db, "vaults", vaultId));
            const existing = existingSnap.exists() ? existingSnap.data() : {};

            // Turning IP lock off clears the bound IP; leaving it on preserves it.
            const boundIp = ipLock ? (existing.boundIp || null) : null;
            const primaryKey = keysPayload[0] || null;

            await updateDoc(doc(db, "vaults", vaultId), {
                requireKey,
                guiMode,
                keys: keysPayload,
                key: primaryKey ? primaryKey.key : '',
                keyGeneratedAt: primaryKey ? primaryKey.keyGeneratedAt : null,
                ipLock, boundIp
            });

            // Reflect changes in the loadstring/get-key display without a full page reload.
            const keyParam = (!guiMode && primaryKey) ? `&key=${encodeURIComponent(primaryKey.key)}` : '';
            lsOutput.value = `loadstring(game:HttpGet("${window.location.origin}/api/raw?id=${vaultId}${keyParam}"))()`;
            if (requireKey) {
                getKeyOutput.value = `${window.location.origin}/key.html?id=${vaultId}`;
                getKeyRow.classList.remove('hidden');
            } else {
                getKeyRow.classList.add('hidden');
            }
            resultOverlay.classList.remove('hidden');

            showToast('Key settings updated!', 'success');
            await refreshKeysystemStatus();
            loadUserVaults();
        } catch (err) {
            showToast('Failed to update key settings: ' + friendlyAuthError(err), 'error', 6000);
        } finally {
            keysystemApplyBtn.disabled = false;
            keysystemApplyBtn.innerHTML = originalHtml;
        }
    });

    // Auth Elements
    const authBtn = document.getElementById('auth-btn');
    const userDisplay = document.getElementById('user-display');
    const authModal = document.getElementById('auth-modal');
    const authHeading = document.getElementById('auth-heading');
    const authSubheading = document.getElementById('auth-subheading');
    const authBanner = document.getElementById('auth-banner');
    const tabLogin = document.getElementById('tab-login');
    const tabSignup = document.getElementById('tab-signup');
    const authEmail = document.getElementById('auth-email');
    const emailError = document.getElementById('email-error');
    const authPassword = document.getElementById('auth-password');
    const passwordError = document.getElementById('password-error');
    const passwordHint = document.getElementById('password-hint');
    const togglePasswordBtn = document.getElementById('toggle-password-btn');
    const authSubmitBtn = document.getElementById('auth-submit-btn');
    const authSubmitLabel = document.getElementById('auth-submit-label');
    const authCloseBtn = document.getElementById('auth-close-btn');
    const authCloseX = document.getElementById('auth-close-x');

    // ---------------- Auth modal open/close ----------------

    function resetAuthForm() {
        authEmail.value = '';
        authPassword.value = '';
        clearFieldError(authEmail, emailError);
        clearFieldError(authPassword, passwordError);
        authBanner.classList.add('hidden');
        authPassword.type = 'password';
        togglePasswordBtn.innerHTML = '<i class="fa-solid fa-eye"></i>';
        setAuthLoading(false);
    }

    function openAuthModal() {
        resetAuthForm();
        authModal.classList.remove('hidden');
        authEmail.focus();
    }

    function closeAuthModal() {
        authModal.classList.add('hidden');
    }

    authBtn.addEventListener('click', () => {
        if (currentUser) {
            signOut(auth);
            showToast('Logged out.', 'info', 2500);
        } else {
            openAuthModal();
        }
    });

    authCloseBtn.addEventListener('click', closeAuthModal);
    authCloseX.addEventListener('click', closeAuthModal);
    authModal.addEventListener('click', (e) => { if (e.target === authModal) closeAuthModal(); });

    function setAuthMode(signUp) {
        isSignUpMode = signUp;
        tabLogin.classList.toggle('active', !signUp);
        tabSignup.classList.toggle('active', signUp);
        authSubmitLabel.textContent = signUp ? 'Sign Up' : 'Log In';
        authHeading.textContent = signUp ? 'Create your account' : 'Welcome back';
        authSubheading.textContent = signUp
            ? 'Sign up to start saving vaults to the cloud.'
            : 'Log in to sync your vaults to the cloud.';
        passwordHint.classList.toggle('hidden', !signUp);
        clearFieldError(authEmail, emailError);
        clearFieldError(authPassword, passwordError);
        authBanner.classList.add('hidden');
    }

    tabLogin.addEventListener('click', () => setAuthMode(false));
    tabSignup.addEventListener('click', () => setAuthMode(true));

    togglePasswordBtn.addEventListener('click', () => {
        const showing = authPassword.type === 'text';
        authPassword.type = showing ? 'password' : 'text';
        togglePasswordBtn.innerHTML = showing
            ? '<i class="fa-solid fa-eye"></i>'
            : '<i class="fa-solid fa-eye-slash"></i>';
    });

    authEmail.addEventListener('input', () => clearFieldError(authEmail, emailError));
    authPassword.addEventListener('input', () => clearFieldError(authPassword, passwordError));
    [authEmail, authPassword].forEach(el => {
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                authSubmitBtn.click();
            }
        });
    });

    function setAuthLoading(isLoading) {
        authSubmitBtn.disabled = isLoading;
        authCloseBtn.disabled = isLoading;
        authSubmitLabel.innerHTML = isLoading
            ? `<i class="fa-solid fa-spinner fa-spin"></i> ${isSignUpMode ? 'Creating account…' : 'Logging in…'}`
            : (isSignUpMode ? 'Sign Up' : 'Log In');
    }

    authSubmitBtn.addEventListener('click', async () => {
        const email = authEmail.value.trim();
        const password = authPassword.value;

        clearFieldError(authEmail, emailError);
        clearFieldError(authPassword, passwordError);
        authBanner.classList.add('hidden');

        let hasError = false;
        if (!email) {
            setFieldError(authEmail, emailError, 'Enter your email address.');
            hasError = true;
        } else if (!isValidEmail(email)) {
            setFieldError(authEmail, emailError, "That doesn't look like a valid email.");
            hasError = true;
        }

        if (!password) {
            setFieldError(authPassword, passwordError, 'Enter your password.');
            hasError = true;
        } else if (isSignUpMode && password.length < 6) {
            setFieldError(authPassword, passwordError, 'Password must be at least 6 characters.');
            hasError = true;
        }

        if (hasError) return;

        setAuthLoading(true);
        try {
            if (isSignUpMode) {
                await createUserWithEmailAndPassword(auth, email, password);
                showToast('Account created — you\'re logged in!', 'success');
            } else {
                await signInWithEmailAndPassword(auth, email, password);
                showToast('Welcome back!', 'success');
            }
            closeAuthModal();
        } catch (err) {
            authBanner.textContent = friendlyAuthError(err);
            authBanner.classList.remove('hidden');
            authBanner.className = 'auth-banner error';
        } finally {
            setAuthLoading(false);
        }
    });

    onAuthStateChanged(auth, user => {
        currentUser = user;
        if (user) {
            userDisplay.innerHTML = `<i class="fa-solid fa-user-check text-cyan"></i> ${user.email}`;
            authBtn.innerHTML = `<i class="fa-solid fa-right-from-bracket"></i> Logout`;
            loadUserVaults();
        } else {
            userDisplay.innerHTML = `<i class="fa-solid fa-user"></i> Guest`;
            authBtn.innerHTML = `<i class="fa-solid fa-right-to-bracket"></i> Login`;
            vaultListContainer.innerHTML = '<div class="info-box"><p>Log in to save and manage your script vaults cloud-wide.</p></div>';
            updateVaultCount(0);
        }
    });

    // ---------------- Vault list ----------------

    async function loadUserVaults() {
        if (!currentUser) return;
        vaultListContainer.innerHTML = '<div class="info-box"><p><i class="fa-solid fa-spinner fa-spin"></i> Loading vaults...</p></div>';
        try {
            const q = query(collection(db, "vaults"), where("uid", "==", currentUser.uid));
            const snapshot = await getDocs(q);
            vaultListContainer.innerHTML = '';
            updateVaultCount(snapshot.size);
            if (snapshot.empty) {
                vaultListContainer.innerHTML = '<div class="info-box"><p>No vaults found. Create one!</p></div>';
                return;
            }
            snapshot.forEach(docSnap => {
                const item = docSnap.data();
                const div = document.createElement('div');
                div.className = 'vault-item';
                const execs = item.executions || 0;
                const initial = (item.title || '?').trim().charAt(0).toUpperCase() || '?';
                div.innerHTML = `
                    <span class="vault-item-main">
                        <span class="vault-item-icon">${escapeHtml(initial)}</span>
                        <span class="vault-item-title">${escapeHtml(item.title)}</span>
                    </span>
                    <span class="vault-item-badge"><i class="fa-solid fa-play"></i> ${execs}</span>
                `;
                div.addEventListener('click', () => loadVaultIntoEditor(docSnap.id, item));
                vaultListContainer.appendChild(div);
            });
        } catch (err) {
            vaultListContainer.innerHTML = `<div class="info-box text-red"><p>Error loading vaults: ${escapeHtml(friendlyAuthError(err))}</p></div>`;
        }
    }

    function updateVaultCount(count) {
        if (!vaultListCount) return;
        vaultListCount.textContent = count;
        vaultListCount.classList.toggle('hidden', !count);
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }

    function loadVaultIntoEditor(id, data) {
        activeVaultId.value = id;
        scriptTitle.value = data.title || '';
        sourceCode.value = data.code || '';
        updateLineNumbers();
        clearFieldError(sourceCode, codeError);
        chkKeySystem.checked = !!data.requireKey;
        keySystemFields.classList.toggle('hidden', !data.requireKey);
        currentKeys = keysFromVaultData(data);
        renderKeysList();
        chkGuiMode.checked = !!data.guiMode;
        chkIpLock.checked = !!data.ipLock;
        currentBannedUsers = Array.isArray(data.bannedUsers) ? data.bannedUsers : [];
        renderBannedUsersList();
        updateKeysystemBadge();
        editingIndicator.classList.remove('hidden');
        deleteBtn.classList.remove('hidden');

        if (execCountBadge && execCountNum) {
            execCountNum.textContent = data.executions || 0;
            execCountBadge.classList.remove('hidden');
        }

        const keyParam = (!data.guiMode && data.requireKey && data.key) ? `&key=${encodeURIComponent(data.key)}` : '';
        const rawUrl = `${window.location.origin}/api/raw?id=${id}${keyParam}`;
        lsOutput.value = `loadstring(game:HttpGet("${rawUrl}"))()`;
        resultOverlay.classList.remove('hidden');

        if (data.requireKey) {
            getKeyOutput.value = `${window.location.origin}/key.html?id=${id}`;
            getKeyRow.classList.remove('hidden');
        } else {
            getKeyRow.classList.add('hidden');
        }
        showToast(`Loaded "${escapeHtml(data.title || 'Untitled Vault')}" into the editor.`, 'info', 2500);
    }

    // ---------------- Lock / Save Vault ----------------

    // ---------------- Line numbers gutter ----------------

    function updateLineNumbers() {
        const lineCount = sourceCode.value.split('\n').length;
        let out = '';
        for (let i = 1; i <= lineCount; i++) out += i + (i < lineCount ? '\n' : '');
        lineNumbersEl.textContent = out || '1';
    }

    sourceCode.addEventListener('input', updateLineNumbers);
    sourceCode.addEventListener('scroll', () => {
        lineNumbersEl.scrollTop = sourceCode.scrollTop;
    });
    updateLineNumbers();

    sourceCode.addEventListener('input', () => clearFieldError(sourceCode, codeError));

    let isSaving = false;

    lockBtn.addEventListener('click', async () => {
        if (isSaving) return;
        const code = sourceCode.value;

        clearFieldError(sourceCode, codeError);

        if (!code.trim()) {
            setFieldError(sourceCode, codeError, "Your vault can't be empty — paste a script before locking it.");
            shakeElement(sourceCode);
            sourceCode.focus();
            return;
        }

        if (chkKeySystem.checked && currentKeys.length === 0) {
            showToast('Key system is enabled but no keys were added — add one or turn it off.', 'error');
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

        const title = scriptTitle.value.trim() || 'Untitled Vault';
        const requireKey = chkKeySystem.checked;
        const guiMode = requireKey && chkGuiMode.checked;
        const ipLock = requireKey && chkIpLock.checked;
        const vaultId = activeVaultId.value || ('vx_' + Math.random().toString(36).substring(2, 10));

        let currentExecutions = 0;
        let boundIp = null;
        let bannedUsersToSave = [];
        let keysPayload = requireKey ? currentKeys.map(k => ({
            id: k.id, label: k.label.trim() || 'Key', key: k.key.trim(),
            priority: k.priority || 1,
            durationDays: k.durationDays || null,
            keyGeneratedAt: k.keyGeneratedAt || Date.now(),
            maxUsers: Math.max(1, k.maxUsers || 1),
            maxUsersUnlimited: !!k.maxUsersUnlimited,
            boundUsers: Array.isArray(k.boundUsers) ? k.boundUsers : [],
            terminated: !!k.terminated,
            adGateUrl: k.adGateUrl || '',
            visibility: k.visibility === 'private' ? 'private' : 'public'
        })) : [];

        if (activeVaultId.value) {
            try {
                const docSnap = await getDoc(doc(db, "vaults", vaultId));
                if (docSnap.exists()) {
                    const existing = docSnap.data();
                    currentExecutions = existing.executions || 0;
                    // Preserve live binding/ban state across unrelated resaves; only cleared
                    // when the owner explicitly turns IP lock off or uses the Reset button.
                    if (ipLock) boundIp = existing.boundIp || null;
                    bannedUsersToSave = Array.isArray(existing.bannedUsers) ? existing.bannedUsers : [];
                }
            } catch (e) {}
        }

        const primaryKey = keysPayload[0] || null;

        const payload = {
            id: vaultId,
            title: title,
            code: code,
            requireKey: requireKey,
            guiMode: guiMode,
            keys: keysPayload,
            key: primaryKey ? primaryKey.key : '',
            keyGeneratedAt: primaryKey ? primaryKey.keyGeneratedAt : null,
            ipLock: ipLock,
            boundIp: boundIp,
            bannedUsers: bannedUsersToSave,
            executions: currentExecutions,
            uid: currentUser ? currentUser.uid : 'guest',
            updatedAt: Date.now()
        };

        isSaving = true;
        const originalBtnHtml = lockBtn.innerHTML;
        lockBtn.disabled = true;
        lockBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> SAVING...';

        try {
            await setDoc(doc(db, "vaults", vaultId), payload);
            activeVaultId.value = vaultId;

            if (execCountBadge && execCountNum) {
                execCountNum.textContent = currentExecutions;
                execCountBadge.classList.remove('hidden');
            }

            const keyParam = (!guiMode && primaryKey) ? `&key=${encodeURIComponent(primaryKey.key)}` : '';
            const rawUrl = `${window.location.origin}/api/raw?id=${vaultId}${keyParam}`;
            const loadstringCmd = `loadstring(game:HttpGet("${rawUrl}"))()`;

            lsOutput.value = loadstringCmd;
            resultOverlay.classList.remove('hidden');

            if (requireKey) {
                getKeyOutput.value = `${window.location.origin}/key.html?id=${vaultId}`;
                getKeyRow.classList.remove('hidden');
            } else {
                getKeyRow.classList.add('hidden');
            }

            showToast('Vault saved and locked!', 'success');

            if (currentUser) {
                editingIndicator.classList.remove('hidden');
                deleteBtn.classList.remove('hidden');
                loadUserVaults();
            }

            if (chkBackup && chkBackup.checked) {
                const backupTxt = `==================================================\nVOIDEDX VAULT BACKUP\nTitle: ${title}\nVault ID: ${vaultId}\nKey Protection: ${requireKey ? 'Enabled (' + key + ')' : 'Disabled'}\nLoadstring: ${loadstringCmd}\n==================================================\n${code}`;
                const blob = new Blob([backupTxt], { type: 'text/plain' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `${vaultId}_backup.txt`;
                a.click();
                URL.revokeObjectURL(a.href);
            }
        } catch (err) {
            showToast('Failed to save vault: ' + friendlyAuthError(err), 'error', 6000);
        } finally {
            isSaving = false;
            lockBtn.disabled = false;
            lockBtn.innerHTML = originalBtnHtml;
        }
    });

    // ---------------- Delete Vault ----------------

    function resetEditor() {
        activeVaultId.value = '';
        scriptTitle.value = '';
        sourceCode.value = '';
        updateLineNumbers();
        chkKeySystem.checked = false;
        chkGuiMode.checked = false;
        currentKeys = [];
        renderKeysList();
        chkIpLock.checked = false;
        currentBannedUsers = [];
        renderBannedUsersList();
        updateKeysystemBadge();
        keySystemFields.classList.add('hidden');
        editingIndicator.classList.add('hidden');
        deleteBtn.classList.add('hidden');
        resultOverlay.classList.add('hidden');
        getKeyRow.classList.add('hidden');
        if (execCountBadge) execCountBadge.classList.add('hidden');
        clearFieldError(sourceCode, codeError);
        clearFieldError(scriptTitle, titleError);
    }

    newVaultBtn.addEventListener('click', () => {
        resetEditor();
        scriptTitle.focus();
        showToast('Ready for a new vault.', 'info', 2000);
    });

    deleteBtn.addEventListener('click', async () => {
        const id = activeVaultId.value;
        if (!id) return;

        const confirmed = await customConfirm({
            title: 'Delete this vault?',
            message: `"${scriptTitle.value || 'Untitled Vault'}" will be permanently deleted. This can't be undone.`,
            confirmLabel: 'Delete Vault'
        });
        if (!confirmed) return;

        const originalBtnHtml = deleteBtn.innerHTML;
        deleteBtn.disabled = true;
        deleteBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> DELETING...';

        try {
            await deleteDoc(doc(db, "vaults", id));
            resetEditor();
            showToast('Vault deleted.', 'info');
            loadUserVaults();
        } catch (err) {
            showToast('Failed to delete vault: ' + friendlyAuthError(err), 'error', 6000);
        } finally {
            deleteBtn.disabled = false;
            deleteBtn.innerHTML = originalBtnHtml;
        }
    });

    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(lsOutput.value);
        copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> COPIED!';
        showToast('Loadstring copied to clipboard.', 'success', 2000);
        setTimeout(() => copyBtn.innerHTML = '<i class="fa-solid fa-copy"></i> COPY LOADSTRING', 2000);
    });
});