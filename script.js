import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import {
    getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, signInAnonymously
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import {
    getFirestore, collection, doc, setDoc, addDoc, getDoc, getDocs, deleteDoc, updateDoc, query, where, serverTimestamp
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
    const openKeysystemBtn = document.getElementById('open-keysystem-btn');
    const keysystemStatusBadge = document.getElementById('keysystem-status-badge');
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
        if (currentUser && !currentUser.isAnonymous) {
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

    let lastUid = null;
    onAuthStateChanged(auth, user => {
        currentUser = user;
        const newUid = user ? user.uid : null;
        if (newUid !== lastUid) {
            // Identity changed (login / logout / new guest): clear the editor and the
            // vault list so nothing from the previous account stays on screen.
            resetEditor();
            vaultListContainer.innerHTML = '<div class="info-box"><p><i class="fa-solid fa-spinner fa-spin"></i> Loading vaults...</p></div>';
            updateVaultCount(0);
            lastUid = newUid;
        }
        if (user && !user.isAnonymous) {
            userDisplay.innerHTML = `<i class="fa-solid fa-user-check text-cyan"></i> ${user.email}`;
            authBtn.innerHTML = `<i class="fa-solid fa-right-from-bracket"></i> Logout`;
            loadUserVaults();
        } else if (user && user.isAnonymous) {
            // Real Firebase Auth session, just without an email — this UID is what
            // proves ownership of vaults created while "not logged in".
            userDisplay.innerHTML = `<i class="fa-solid fa-user"></i> Guest`;
            authBtn.innerHTML = `<i class="fa-solid fa-right-to-bracket"></i> Login`;
            loadUserVaults();
        } else {
            // No session at all yet — silently start one so this browser gets a
            // stable, unique UID instead of everyone sharing the literal "guest".
            signInAnonymously(auth).catch(() => {
                userDisplay.innerHTML = `<i class="fa-solid fa-user"></i> Guest`;
                authBtn.innerHTML = `<i class="fa-solid fa-right-to-bracket"></i> Login`;
                vaultListContainer.innerHTML = '<div class="info-box"><p>Log in to save and manage your script vaults cloud-wide.</p></div>';
                updateVaultCount(0);
            });
        }
    });

    // ---------------- Vault list ----------------

    async function loadUserVaults() {
        if (!currentUser) return;
        vaultListContainer.innerHTML = '<div class="info-box"><p><i class="fa-solid fa-spinner fa-spin"></i> Loading vaults...</p></div>';
        try {
            const uidAtStart = currentUser.uid;
            const q = query(collection(db, "vaults"), where("uid", "==", uidAtStart));
            const snapshot = await getDocs(q);
            if (!currentUser || currentUser.uid !== uidAtStart) return;
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
        editingIndicator.classList.remove('hidden');
        deleteBtn.classList.remove('hidden');

        const keyCount = Array.isArray(data.keys) ? data.keys.length : (data.requireKey && data.key ? 1 : 0);
        if (data.requireKey && keyCount > 0) {
            keysystemStatusBadge.textContent = `ON · ${keyCount} key${keyCount > 1 ? 's' : ''}`;
            keysystemStatusBadge.classList.remove('hidden');
            keysystemStatusBadge.classList.add('on');
        } else {
            keysystemStatusBadge.textContent = 'OFF';
            keysystemStatusBadge.classList.remove('on');
            keysystemStatusBadge.classList.add('hidden');
        }

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
        if (!currentUser) {
            showToast('Still starting your session — try again in a second.', 'info');
            return;
        }
        const code = sourceCode.value;

        clearFieldError(sourceCode, codeError);

        if (!code.trim()) {
            setFieldError(sourceCode, codeError, "Your vault can't be empty — paste a script before locking it.");
            shakeElement(sourceCode);
            sourceCode.focus();
            return;
        }

        const title = scriptTitle.value.trim() || 'Untitled Vault';
        const vaultId = activeVaultId.value || ('vx_' + Math.random().toString(36).substring(2, 10));

        let currentExecutions = 0;
        let existingKeyFields = {
            requireKey: false, guiMode: false, guiAppearance: null, publicKeyConfig: null, keys: [], key: '', keyGeneratedAt: null,
            ipLock: false, boundIp: null, bannedUsers: []
        };

        if (activeVaultId.value) {
            try {
                const docSnap = await getDoc(doc(db, "vaults", vaultId));
                if (docSnap.exists()) {
                    const existing = docSnap.data();
                    currentExecutions = existing.executions || 0;
                    // Key system settings are managed on the separate Key System Manager
                    // page — saving the script here just carries them forward untouched.
                    existingKeyFields = {
                        requireKey: !!existing.requireKey,
                        guiMode: !!existing.guiMode,
                        guiAppearance: existing.guiAppearance || null,
                        publicKeyConfig: existing.publicKeyConfig || null,
                        keys: Array.isArray(existing.keys) ? existing.keys : [],
                        key: existing.key || '',
                        keyGeneratedAt: existing.keyGeneratedAt || null,
                        ipLock: !!existing.ipLock,
                        boundIp: existing.boundIp || null,
                        bannedUsers: Array.isArray(existing.bannedUsers) ? existing.bannedUsers : []
                    };
                }
            } catch (e) {}
        }

        const payload = {
            id: vaultId,
            title: title,
            code: code,
            ...existingKeyFields,
            executions: currentExecutions,
            uid: currentUser.uid,
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

            const primaryKey = existingKeyFields.keys[0] || (existingKeyFields.key ? { key: existingKeyFields.key } : null);
            const keyParam = (!existingKeyFields.guiMode && existingKeyFields.requireKey && primaryKey) ? `&key=${encodeURIComponent(primaryKey.key)}` : '';
            const rawUrl = `${window.location.origin}/api/raw?id=${vaultId}${keyParam}`;
            const loadstringCmd = `loadstring(game:HttpGet("${rawUrl}"))()`;

            lsOutput.value = loadstringCmd;
            resultOverlay.classList.remove('hidden');

            if (existingKeyFields.requireKey) {
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
        keysystemStatusBadge.textContent = 'OFF';
        keysystemStatusBadge.classList.remove('on');
        keysystemStatusBadge.classList.add('hidden');
        editingIndicator.classList.add('hidden');
        deleteBtn.classList.add('hidden');
        resultOverlay.classList.add('hidden');
        getKeyRow.classList.add('hidden');
        if (execCountBadge) execCountBadge.classList.add('hidden');
        clearFieldError(sourceCode, codeError);
        clearFieldError(scriptTitle, titleError);
    }

    const claimVaultBtn = document.getElementById('claim-vault-btn');
    claimVaultBtn.addEventListener('click', async () => {
        if (!currentUser) return;
        const vid = (window.prompt('Enter the ID of your old vault (looks like vx_abc12345):') || '').trim();
        if (!vid) return;
        try {
            const ref = doc(db, "vaults", vid);
            const snap = await getDoc(ref);
            if (!snap.exists()) { showToast('No vault found with that ID.', 'error'); return; }
            const d = snap.data();
            if (d.uid === currentUser.uid) { showToast('That vault is already yours.', 'info'); return; }
            if (d.uid !== 'guest') { showToast('That vault belongs to another account.', 'error'); return; }
            await updateDoc(ref, { uid: currentUser.uid });
            showToast('Vault recovered — it is now tied to your account.', 'success');
            loadUserVaults();
        } catch (err) {
            showToast('Could not recover vault: ' + friendlyAuthError(err), 'error');
        }
    });

    newVaultBtn.addEventListener('click', () => {
        resetEditor();
        scriptTitle.focus();
        showToast('Ready for a new vault.', 'info', 2000);
    });

    openKeysystemBtn.addEventListener('click', () => {
        if (!activeVaultId.value) {
            showToast('Save this vault first, then you can manage its key system.', 'info');
            return;
        }
        window.location.href = `keysystem.html?id=${activeVaultId.value}`;
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

// ============================================================
// Share Your Ideas — sends feature requests to Firestore
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    const ideasBtn = document.getElementById('ideas-btn');
    const ideasModal = document.getElementById('ideas-modal');
    if (!ideasBtn || !ideasModal) return;

    const ideasCloseX = document.getElementById('ideas-close-x');
    const ideasCancelBtn = document.getElementById('ideas-cancel-btn');
    const ideasSubmitBtn = document.getElementById('ideas-submit-btn');
    const ideasSubmitLabel = document.getElementById('ideas-submit-label');
    const ideasName = document.getElementById('ideas-name');
    const ideasText = document.getElementById('ideas-text');
    const ideasError = document.getElementById('ideas-error');
    const ideasCount = document.getElementById('ideas-count');

    const IDEA_MIN = 10;
    const IDEA_MAX = 1000;

    const openIdeasModal = () => {
        ideasModal.classList.remove('hidden');
        clearFieldError(ideasText, ideasError);
        setTimeout(() => ideasText.focus(), 50);
    };

    const closeIdeasModal = () => {
        ideasModal.classList.add('hidden');
    };

    ideasBtn.addEventListener('click', openIdeasModal);
    ideasCloseX.addEventListener('click', closeIdeasModal);
    ideasCancelBtn.addEventListener('click', closeIdeasModal);
    ideasModal.addEventListener('click', (e) => {
        if (e.target === ideasModal) closeIdeasModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !ideasModal.classList.contains('hidden')) closeIdeasModal();
    });

    ideasText.addEventListener('input', () => {
        ideasCount.textContent = `${ideasText.value.length} / ${IDEA_MAX}`;
        clearFieldError(ideasText, ideasError);
    });

    ideasSubmitBtn.addEventListener('click', async () => {
        const idea = ideasText.value.trim();
        const name = ideasName.value.trim();

        if (idea.length < IDEA_MIN) {
            setFieldError(ideasText, ideasError, `Give us a bit more detail — at least ${IDEA_MIN} characters.`);
            shakeElement(ideasText);
            return;
        }
        clearFieldError(ideasText, ideasError);

        ideasSubmitBtn.disabled = true;
        ideasSubmitLabel.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> SENDING...';

        try {
            await addDoc(collection(db, 'feature_requests'), {
                name: name || 'Anonymous',
                idea: idea,
                uid: currentUser ? currentUser.uid : null,
                email: currentUser && currentUser.email ? currentUser.email : null,
                page: 'index',
                userAgent: navigator.userAgent,
                createdAt: serverTimestamp()
            });

            showToast('Thanks! Your idea was sent to the VoidedX team.', 'success');
            ideasText.value = '';
            ideasName.value = '';
            ideasCount.textContent = `0 / ${IDEA_MAX}`;
            closeIdeasModal();
        } catch (err) {
            showToast('Couldn\'t send your idea: ' + friendlyAuthError(err), 'error', 6000);
        } finally {
            ideasSubmitBtn.disabled = false;
            ideasSubmitLabel.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Idea';
        }
    });
});
