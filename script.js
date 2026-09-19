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
    const scriptKey = document.getElementById('script-key');
    const generateKeyBtn = document.getElementById('generate-key-btn');
    const chkKeyRotation = document.getElementById('chk-key-rotation');
    const keyRotationHoursSelect = document.getElementById('key-rotation-hours');
    const forceRegenerateBtn = document.getElementById('force-regenerate-btn');
    const keysystemStatus = document.getElementById('keysystem-status');
    const keysystemGetKeyOutput = document.getElementById('keysystem-get-key-output');
    const keysystemCopyKeyLinkBtn = document.getElementById('keysystem-copy-key-link-btn');
    const openKeysystemBtn = document.getElementById('open-keysystem-btn');
    const keysystemStatusBadge = document.getElementById('keysystem-status-badge');
    const keysystemModal = document.getElementById('keysystem-modal');
    const keysystemCloseX = document.getElementById('keysystem-close-x');
    const keysystemCloseBtn = document.getElementById('keysystem-close-btn');
    const keysystemApplyBtn = document.getElementById('keysystem-apply-btn');
    const extendKeyBtn = document.getElementById('extend-key-btn');
    const chkIpLock = document.getElementById('chk-ip-lock');
    const ipLockStatus = document.getElementById('ip-lock-status');
    const ipLockStatusText = document.getElementById('ip-lock-status-text');
    const resetIpBtn = document.getElementById('reset-ip-btn');
    const chkAccountBinding = document.getElementById('chk-account-binding');
    const accountBindingFields = document.getElementById('account-binding-fields');
    const maxUsersInput = document.getElementById('max-users-input');
    const boundUsersList = document.getElementById('bound-users-list');
    const resetUsersBtn = document.getElementById('reset-users-btn');
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
    chkKeySystem.addEventListener('change', () => {
        keySystemFields.classList.toggle('hidden', !chkKeySystem.checked);
        updateKeysystemBadge();
    });
    chkKeyRotation.addEventListener('change', updateKeysystemBadge);

    function updateKeysystemBadge() {
        if (chkKeySystem.checked) {
            keysystemStatusBadge.textContent = chkKeyRotation.checked
                ? `ON · ${keyRotationHoursSelect.value}h rotation`
                : 'ON';
            keysystemStatusBadge.classList.remove('hidden');
            keysystemStatusBadge.classList.add('on');
        } else {
            keysystemStatusBadge.textContent = 'OFF';
            keysystemStatusBadge.classList.remove('on');
            keysystemStatusBadge.classList.toggle('hidden', true);
        }
    }
    keyRotationHoursSelect.addEventListener('change', updateKeysystemBadge);
    chkAccountBinding.addEventListener('change', () => {
        accountBindingFields.classList.toggle('hidden', !chkAccountBinding.checked);
    });

    function generateRandomKey() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let out = 'VX-';
        for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
        return out;
    }

    generateKeyBtn.addEventListener('click', () => {
        scriptKey.value = generateRandomKey();
        scriptKey.classList.remove('error');
        showToast('Random key generated.', 'success', 2000);
    });

    forceRegenerateBtn.addEventListener('click', async () => {
        const confirmed = await customConfirm({
            title: 'Force regenerate this key?',
            message: 'The current key stops working immediately for anyone using it. Click "Apply Changes" after this to save it.',
            confirmLabel: 'Regenerate'
        });
        if (!confirmed) return;
        scriptKey.value = generateRandomKey();
        showToast('New key generated — click "Apply Changes" to confirm it.', 'info', 3500);
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

    async function refreshKeysystemStatus() {
        if (!activeVaultId.value) {
            keysystemStatus.innerHTML = '<i class="fa-solid fa-circle-info text-cyan"></i><p>This is a new, unsaved vault. Save it once first, then reopen this panel for a shareable Get-Key link and live status.</p>';
            keysystemGetKeyOutput.value = '';
            keysystemGetKeyOutput.placeholder = 'Save this vault to generate a link';
            ipLockStatus.classList.add('hidden');
            resetIpBtn.classList.add('hidden');
            boundUsersList.innerHTML = '';
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
            chkAccountBinding.checked = !!data.accountBinding;
            accountBindingFields.classList.toggle('hidden', !data.accountBinding);
            maxUsersInput.value = data.maxUsers || 1;

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

            // Bound accounts list
            renderBoundUsers(Array.isArray(data.boundUsers) ? data.boundUsers : []);

            if (!data.requireKey) {
                keysystemStatus.innerHTML = '<i class="fa-solid fa-circle-info text-cyan"></i><p>Key system is currently off for this vault.</p>';
                return;
            }
            const generatedAt = data.keyGeneratedAt || null;
            const hours = data.keyRotationHours || 24;
            let statusHtml = `<i class="fa-solid fa-circle-check text-success"></i><p>Current key set${generatedAt ? ' ' + timeAgo(generatedAt) : ''}.`;
            if (data.keyRotation && generatedAt) {
                const expiresAt = generatedAt + hours * 60 * 60 * 1000;
                const msLeft = expiresAt - Date.now();
                statusHtml += msLeft > 0
                    ? ` Rotates every ${hours}h — expires in ${formatDuration(msLeft)}.`
                    : ` This key has expired — it will refresh next time someone visits the Get-Key link.`;
            } else if (data.keyRotation) {
                statusHtml += ` Rotation is on but hasn't generated a timestamp yet — save or regenerate to start the clock.`;
            } else {
                statusHtml += ` Rotation is off, so it stays valid until you change it.`;
            }
            statusHtml += '</p>';
            keysystemStatus.innerHTML = statusHtml;
        } catch (err) {
            keysystemStatus.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-red"></i><p>Couldn't load live status: ${escapeHtml(friendlyAuthError(err))}</p>`;
        }
    }

    function renderBoundUsers(boundUsers) {
        if (!boundUsers.length) {
            boundUsersList.innerHTML = '<div class="info-box"><p>No accounts have used this key yet.</p></div>';
            return;
        }
        boundUsersList.innerHTML = '';
        boundUsers.forEach(u => {
            const row = document.createElement('div');
            row.className = 'manage-user-row';
            row.innerHTML = `
                <div class="manage-user-info">
                    <span class="manage-user-name"><i class="fa-solid fa-user text-cyan"></i> ${escapeHtml(u.username || 'Unknown')}</span>
                    <span class="manage-user-meta">UserId: ${escapeHtml(String(u.userId))} • ${escapeHtml(timeAgo(u.boundAt))}</span>
                </div>
                <button class="btn-danger kick-user-btn"><i class="fa-solid fa-user-slash"></i> Kick</button>
            `;
            row.querySelector('.kick-user-btn').addEventListener('click', () => kickBoundUser(u.userId));
            boundUsersList.appendChild(row);
        });
    }

    async function kickBoundUser(userId) {
        if (!activeVaultId.value) return;
        const confirmed = await customConfirm({
            title: 'Kick this account?',
            message: 'They will need to use the key again from scratch, and it only works if a slot is free.',
            confirmLabel: 'Kick'
        });
        if (!confirmed) return;
        try {
            const snap = await getDoc(doc(db, "vaults", activeVaultId.value));
            if (!snap.exists()) return;
            const data = snap.data();
            const updated = (Array.isArray(data.boundUsers) ? data.boundUsers : [])
                .filter(u => String(u.userId) !== String(userId));
            await updateDoc(doc(db, "vaults", activeVaultId.value), { boundUsers: updated });
            renderBoundUsers(updated);
            showToast('Account kicked — their slot is free again.', 'success');
        } catch (err) {
            showToast('Failed to kick account: ' + friendlyAuthError(err), 'error');
        }
    }

    resetUsersBtn.addEventListener('click', async () => {
        if (!activeVaultId.value) return;
        const confirmed = await customConfirm({
            title: 'Reset all bound accounts?',
            message: 'Everyone currently bound to this key gets removed. They can use the key again as if for the first time.',
            confirmLabel: 'Reset All'
        });
        if (!confirmed) return;
        try {
            await updateDoc(doc(db, "vaults", activeVaultId.value), { boundUsers: [] });
            renderBoundUsers([]);
            showToast('All bound accounts have been reset.', 'success');
        } catch (err) {
            showToast('Failed to reset accounts: ' + friendlyAuthError(err), 'error');
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

    extendKeyBtn.addEventListener('click', async () => {
        if (!activeVaultId.value) {
            showToast('Save this vault first, then you can extend its key.', 'info');
            return;
        }
        const originalHtml = extendKeyBtn.innerHTML;
        extendKeyBtn.disabled = true;
        extendKeyBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        try {
            await updateDoc(doc(db, "vaults", activeVaultId.value), { keyGeneratedAt: Date.now() });
            showToast('Expiry extended — same key, fresh timer.', 'success');
            refreshKeysystemStatus();
        } catch (err) {
            showToast('Failed to extend: ' + friendlyAuthError(err), 'error');
        } finally {
            extendKeyBtn.disabled = false;
            extendKeyBtn.innerHTML = originalHtml;
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
        refreshKeysystemStatus();
    });

    function closeKeysystemModal() {
        keysystemModal.classList.add('hidden');
    }
    keysystemCloseX.addEventListener('click', closeKeysystemModal);
    keysystemCloseBtn.addEventListener('click', closeKeysystemModal);
    keysystemModal.addEventListener('click', (e) => { if (e.target === keysystemModal) closeKeysystemModal(); });

    keysystemApplyBtn.addEventListener('click', async () => {
        if (chkKeySystem.checked && !scriptKey.value.trim()) {
            showToast('Enter or generate a key first.', 'error');
            scriptKey.focus();
            return;
        }

        const requireKey = chkKeySystem.checked;
        const key = scriptKey.value.trim();
        const keyRotation = requireKey && chkKeyRotation.checked;
        const keyRotationHours = parseInt(keyRotationHoursSelect.value, 10) || 24;
        const ipLock = requireKey && chkIpLock.checked;
        const accountBinding = requireKey && chkAccountBinding.checked;
        const maxUsers = Math.max(1, parseInt(maxUsersInput.value, 10) || 1);

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

            let keyGeneratedAt = existing.keyGeneratedAt || Date.now();
            const settingsChanged = existing.key !== key || !!existing.keyRotation !== keyRotation || (existing.keyRotationHours || 24) !== keyRotationHours;
            if (settingsChanged || !existing.keyGeneratedAt) {
                keyGeneratedAt = Date.now();
            }

            // Turning a binding feature OFF clears its stored state; turning it on or
            // leaving it on preserves whatever's already bound.
            const boundIp = ipLock ? (existing.boundIp || null) : null;
            const boundUsers = accountBinding ? (Array.isArray(existing.boundUsers) ? existing.boundUsers : []) : [];

            await updateDoc(doc(db, "vaults", vaultId), {
                requireKey, key, keyRotation, keyRotationHours,
                keyGeneratedAt: requireKey ? keyGeneratedAt : null,
                ipLock, boundIp,
                accountBinding, maxUsers, boundUsers
            });

            // Reflect changes in the loadstring/get-key display without a full page reload.
            const keyParam = requireKey && key ? `&key=${encodeURIComponent(key)}` : '';
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
        scriptKey.value = data.key || '';
        keySystemFields.classList.toggle('hidden', !data.requireKey);
        chkKeyRotation.checked = !!data.keyRotation;
        keyRotationHoursSelect.value = String(data.keyRotationHours || 24);
        chkIpLock.checked = !!data.ipLock;
        chkAccountBinding.checked = !!data.accountBinding;
        accountBindingFields.classList.toggle('hidden', !data.accountBinding);
        maxUsersInput.value = data.maxUsers || 1;
        updateKeysystemBadge();
        editingIndicator.classList.remove('hidden');
        deleteBtn.classList.remove('hidden');

        if (execCountBadge && execCountNum) {
            execCountNum.textContent = data.executions || 0;
            execCountBadge.classList.remove('hidden');
        }

        const keyParam = data.requireKey && data.key ? `&key=${encodeURIComponent(data.key)}` : '';
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

        if (chkKeySystem.checked && !scriptKey.value.trim()) {
            showToast('Key system is enabled but no key was set — add one or turn it off.', 'error');
            scriptKey.focus();
            return;
        }

        const title = scriptTitle.value.trim() || 'Untitled Vault';
        const requireKey = chkKeySystem.checked;
        const key = scriptKey.value.trim();
        const keyRotation = requireKey && chkKeyRotation.checked;
        const keyRotationHours = parseInt(keyRotationHoursSelect.value, 10) || 24;
        const ipLock = requireKey && chkIpLock.checked;
        const accountBinding = requireKey && chkAccountBinding.checked;
        const maxUsers = Math.max(1, parseInt(maxUsersInput.value, 10) || 1);
        const vaultId = activeVaultId.value || ('vx_' + Math.random().toString(36).substring(2, 10));

        let currentExecutions = 0;
        let keyGeneratedAt = Date.now();
        let boundIp = null;
        let boundUsers = [];
        if (activeVaultId.value) {
            try {
                const docSnap = await getDoc(doc(db, "vaults", vaultId));
                if (docSnap.exists()) {
                    const existing = docSnap.data();
                    currentExecutions = existing.executions || 0;
                    // Only reset the rotation timer if the key/rotation settings actually changed —
                    // otherwise re-saving unrelated edits (like the script code) shouldn't extend it.
                    const unchanged = existing.key === key && !!existing.keyRotation === keyRotation &&
                        (existing.keyRotationHours || 24) === keyRotationHours && existing.keyGeneratedAt;
                    if (unchanged) {
                        keyGeneratedAt = existing.keyGeneratedAt;
                    }
                    // Preserve live binding state across unrelated resaves; only cleared when the
                    // owner explicitly turns the feature off or uses the Reset buttons.
                    if (ipLock) boundIp = existing.boundIp || null;
                    if (accountBinding) boundUsers = Array.isArray(existing.boundUsers) ? existing.boundUsers : [];
                }
            } catch (e) {}
        }

        const payload = {
            id: vaultId,
            title: title,
            code: code,
            requireKey: requireKey,
            key: key,
            keyRotation: keyRotation,
            keyRotationHours: keyRotationHours,
            keyGeneratedAt: requireKey ? keyGeneratedAt : null,
            ipLock: ipLock,
            boundIp: boundIp,
            accountBinding: accountBinding,
            maxUsers: maxUsers,
            boundUsers: boundUsers,
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

            const keyParam = requireKey && key ? `&key=${encodeURIComponent(key)}` : '';
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
        scriptKey.value = '';
        chkKeySystem.checked = false;
        chkKeyRotation.checked = false;
        keyRotationHoursSelect.value = '24';
        chkIpLock.checked = false;
        chkAccountBinding.checked = false;
        accountBindingFields.classList.add('hidden');
        maxUsersInput.value = 1;
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