import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import { 
    getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged 
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { 
    getFirestore, collection, doc, setDoc, getDoc, getDocs, deleteDoc, query, where 
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

// --- YOUR FIREBASE CONFIG HERE ---
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let isSignUpMode = false;

document.addEventListener('DOMContentLoaded', () => {
    const lockBtn = document.getElementById('lock-vault-btn');
    const deleteBtn = document.getElementById('delete-vault-btn');
    const sourceCode = document.getElementById('source-code');
    const scriptTitle = document.getElementById('script-title');
    const resultOverlay = document.getElementById('result-overlay');
    const lsOutput = document.getElementById('ls-output');
    const copyBtn = document.getElementById('copy-out-btn');
    const chkBackup = document.getElementById('chk-backup');
    const chkKeySystem = document.getElementById('chk-key-system');
    const scriptKey = document.getElementById('script-key');
    const activeVaultId = document.getElementById('active-vault-id');
    const editingIndicator = document.getElementById('editing-indicator');
    const vaultListContainer = document.getElementById('vault-list');

    // Auth Elements
    const authBtn = document.getElementById('auth-btn');
    const userDisplay = document.getElementById('user-display');
    const authModal = document.getElementById('auth-modal');
    const tabLogin = document.getElementById('tab-login');
    const tabSignup = document.getElementById('tab-signup');
    const authEmail = document.getElementById('auth-email');
    const authPassword = document.getElementById('auth-password');
    const authSubmitBtn = document.getElementById('auth-submit-btn');
    const authCloseBtn = document.getElementById('auth-close-btn');

    // Key System Toggle
    chkKeySystem.addEventListener('change', () => {
        scriptKey.classList.toggle('hidden', !chkKeySystem.checked);
    });

    // Auth Modal Logic
    authBtn.addEventListener('click', () => {
        if (currentUser) {
            signOut(auth);
        } else {
            authModal.classList.remove('hidden');
        }
    });

    authCloseBtn.addEventListener('click', () => authModal.classList.add('hidden'));

    tabLogin.addEventListener('click', () => {
        isSignUpMode = false;
        tabLogin.classList.add('active');
        tabSignup.classList.remove('active');
        authSubmitBtn.innerText = 'Log In';
    });

    tabSignup.addEventListener('click', () => {
        isSignUpMode = true;
        tabSignup.classList.add('active');
        tabLogin.classList.remove('active');
        authSubmitBtn.innerText = 'Sign Up';
    });

    authSubmitBtn.addEventListener('click', async () => {
        const email = authEmail.value.trim();
        const password = authPassword.value;
        if (!email || !password) return alert('Enter email & password');

        try {
            if (isSignUpMode) {
                await createUserWithEmailAndPassword(auth, email, password);
            } else {
                await signInWithEmailAndPassword(auth, email, password);
            }
            authModal.classList.add('hidden');
        } catch (err) {
            alert(err.message);
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
        }
    });

    // Load User Vaults
    async function loadUserVaults() {
        if (!currentUser) return;
        vaultListContainer.innerHTML = '<div class="info-box"><p>Loading vaults...</p></div>';
        try {
            const q = query(collection(db, "vaults"), where("uid", "==", currentUser.uid));
            const snapshot = await getDocs(q);
            vaultListContainer.innerHTML = '';
            if (snapshot.empty) {
                vaultListContainer.innerHTML = '<div class="info-box"><p>No vaults found. Create one!</p></div>';
                return;
            }
            snapshot.forEach(docSnap => {
                const item = docSnap.data();
                const div = document.createElement('div');
                div.className = 'vault-item';
                div.innerHTML = `<span class="vault-item-title">${item.title}</span><i class="fa-solid fa-chevron-right text-cyan"></i>`;
                div.addEventListener('click', () => loadVaultIntoEditor(docSnap.id, item));
                vaultListContainer.appendChild(div);
            });
        } catch (err) {
            vaultListContainer.innerHTML = `<div class="info-box text-red"><p>Error loading vaults: ${err.message}</p></div>`;
        }
    }

    function loadVaultIntoEditor(id, data) {
        activeVaultId.value = id;
        scriptTitle.value = data.title || '';
        sourceCode.value = data.code || '';
        chkKeySystem.checked = !!data.requireKey;
        scriptKey.value = data.key || '';
        scriptKey.classList.toggle('hidden', !data.requireKey);
        editingIndicator.classList.remove('hidden');
        deleteBtn.classList.remove('hidden');

        const keyParam = data.requireKey && data.key ? `&key=${encodeURIComponent(data.key)}` : '';
        const rawUrl = `${window.location.origin}/api/raw?id=${id}${keyParam}`;
        lsOutput.value = `loadstring(game:HttpGet("${rawUrl}"))()`;
        resultOverlay.classList.remove('hidden');
    }

    // Lock/Save Vault
    lockBtn.addEventListener('click', async () => {
        const code = sourceCode.value;
        if (!code.trim()) return alert('Please paste your script before locking.');

        const title = scriptTitle.value.trim() || 'Untitled Vault';
        const requireKey = chkKeySystem.checked;
        const key = scriptKey.value.trim();
        const vaultId = activeVaultId.value || ('vx_' + Math.random().toString(36).substring(2, 10));

        const payload = {
            id: vaultId,
            title: title,
            code: code,
            requireKey: requireKey,
            key: key,
            uid: currentUser ? currentUser.uid : 'guest',
            updatedAt: Date.now()
        };

        try {
            await setDoc(doc(db, "vaults", vaultId), payload);
            activeVaultId.value = vaultId;

            const keyParam = requireKey && key ? `&key=${encodeURIComponent(key)}` : '';
            const rawUrl = `${window.location.origin}/api/raw?id=${vaultId}${keyParam}`;
            const loadstringCmd = `loadstring(game:HttpGet("${rawUrl}"))()`;

            lsOutput.value = loadstringCmd;
            resultOverlay.classList.remove('hidden');

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
            alert('Failed to save to Firebase: ' + err.message);
        }
    });

    // Delete Vault
    deleteBtn.addEventListener('click', async () => {
        const id = activeVaultId.value;
        if (!id) return;
        if (!confirm('Are you sure you want to delete this vault?')) return;

        try {
            await deleteDoc(doc(db, "vaults", id));
            activeVaultId.value = '';
            scriptTitle.value = '';
            sourceCode.value = '';
            scriptKey.value = '';
            chkKeySystem.checked = false;
            scriptKey.classList.add('hidden');
            editingIndicator.classList.add('hidden');
            deleteBtn.classList.add('hidden');
            resultOverlay.classList.add('hidden');
            loadUserVaults();
        } catch (err) {
            alert('Failed to delete vault: ' + err.message);
        }
    });

    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(lsOutput.value);
        copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> COPIED!';
        setTimeout(() => copyBtn.innerHTML = '<i class="fa-solid fa-copy"></i> COPY LOADSTRING', 2000);
    });
});