import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import {
    getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
    signInWithPopup, signOut, GoogleAuthProvider
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';

const firebaseConfig = {
    apiKey: 'AIzaSyBdAR4ARjHccTlxrmP9tzdYGJxo4MvETXw',
    authDomain: 'voidedx-fe79f.firebaseapp.com',
    projectId: 'voidedx-fe79f',
    storageBucket: 'voidedx-fe79f.firebasestorage.app',
    messagingSenderId: '784635868195',
    appId: '1:784635868195:web:6e879214df4238bc2aad96'
};
const auth = getAuth(initializeApp(firebaseConfig));
const byId = id => document.getElementById(id);
const giftUid = new URLSearchParams(location.hash.slice(1)).get('uid') || '';
const statusBox = byId('gift-status');
let activeUser = null;
let alreadyClaimed = false;

function showStatus(message, kind) {
    statusBox.textContent = message;
    statusBox.className = 'economy-status ' + kind;
    statusBox.classList.remove('hidden');
}

function authMessage(error) {
    const code = error && error.code;
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') return 'Email or password is incorrect.';
    if (code === 'auth/email-already-in-use') return 'That email already has an account. Sign in instead.';
    if (code === 'auth/weak-password') return 'Use a password with at least six characters.';
    if (code === 'auth/invalid-email') return 'Enter a valid email address.';
    if (code === 'auth/popup-closed-by-user') return 'Google sign-in was closed before it finished.';
    return error?.message || 'Sign-in could not be completed.';
}

function updateAccount(user) {
    const signedIn = !!user && !user.isAnonymous && !!user.email;
    byId('gift-auth-form').classList.toggle('hidden', signedIn);
    byId('gift-signed-in').classList.toggle('hidden', !signedIn);
    byId('gift-account-email').textContent = signedIn ? user.email : '';
    byId('gift-claim-btn').classList.toggle('hidden', !signedIn || alreadyClaimed || !/^[a-f0-9]{48}$/i.test(giftUid));
    byId('gift-account-message').textContent = signedIn
        ? 'Signed in as ' + user.email + '. The gift can only be claimed once.'
        : 'Sign in with your VoidedX account to claim the coins.';
}

async function emailAction(createAccount) {
    const email = byId('gift-email').value.trim();
    const password = byId('gift-password').value;
    if (!email || !password) return showStatus('Enter your email and password first.', 'error');
    try {
        if (createAccount) await createUserWithEmailAndPassword(auth, email, password);
        else await signInWithEmailAndPassword(auth, email, password);
        byId('gift-password').value = '';
        statusBox.classList.add('hidden');
    } catch (error) { showStatus(authMessage(error), 'error'); }
}

byId('gift-login-btn').addEventListener('click', () => emailAction(false));
byId('gift-signup-btn').addEventListener('click', () => emailAction(true));
byId('gift-password').addEventListener('keydown', event => { if (event.key === 'Enter') emailAction(false); });
byId('gift-google-btn').addEventListener('click', async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); statusBox.classList.add('hidden'); }
    catch (error) { showStatus(authMessage(error), 'error'); }
});
byId('gift-signout-btn').addEventListener('click', () => signOut(auth));

byId('gift-claim-btn').addEventListener('click', async event => {
    const button = event.currentTarget;
    const claimingUser = activeUser;
    button.disabled = true;
    button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Claiming…';
    try {
        const token = await claimingUser.getIdToken();
        const response = await fetch('/api/redeem-gift', {
            method: 'POST',
            cache: 'no-store',
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ giftUid })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.ok) throw new Error(data.message || 'The gift could not be claimed.');
        if (activeUser?.uid !== claimingUser?.uid) return;
        alreadyClaimed = true;
        byId('gift-heading').textContent = 'Gift claimed';
        showStatus(Number(data.coins).toLocaleString() + ' coins were added to your account. Your new balance is ' + Number(data.balance).toLocaleString() + '.', 'success');
        updateAccount(activeUser);
    } catch (error) {
        if (activeUser?.uid !== claimingUser?.uid) return;
        showStatus(error.message, 'error');
        button.disabled = false;
        button.innerHTML = '<i class="fa-solid fa-gift"></i> Claim coin gift';
    }
});

if (!/^[a-f0-9]{48}$/i.test(giftUid)) {
    byId('gift-heading').textContent = 'Gift link unavailable';
    byId('gift-account-message').textContent = 'This gift link is missing its UID or is not valid.';
    showStatus('Ask the person who sent this gift for a new link.', 'error');
}

onAuthStateChanged(auth, user => {
    activeUser = user && !user.isAnonymous && user.email ? user : null;
    updateAccount(user);
});
