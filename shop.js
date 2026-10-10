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
const statusBox = byId('shop-status');
const itemsBox = byId('shop-items');
const balanceLabel = byId('shop-balance');
let activeUser = null;
let coinBalance = 0;
let entitlements = { extraVaultSlots: 0, goldTitles: false, creatorBadge: false };
let catalog = [];
let shopRequestId = 0;

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

async function accountRequest(path, method, body, user = activeUser) {
    const token = await user.getIdToken();
    const response = await fetch(path, {
        method,
        cache: 'no-store',
        headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {})
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.message || 'The request could not be completed.');
    return data;
}

function setAccountView(user) {
    const signedIn = !!user && !user.isAnonymous && !!user.email;
    byId('shop-auth-form').classList.toggle('hidden', signedIn);
    byId('shop-signed-in').classList.toggle('hidden', !signedIn);
    byId('shop-signed-user').classList.toggle('hidden', !signedIn);
    byId('shop-account-email').textContent = signedIn ? user.email : '';
    byId('shop-signed-user').textContent = signedIn ? 'Signed in' : '';
    if (!signedIn) {
        balanceLabel.textContent = '—';
        coinBalance = 0;
        entitlements = { extraVaultSlots: 0, goldTitles: false, creatorBadge: false };
        renderShop();
    }
}

function isOwned(id) {
    if (id === 'gold_titles') return entitlements.goldTitles;
    if (id === 'creator_badge') return entitlements.creatorBadge;
    return false;
}

function renderShop() {
    itemsBox.replaceChildren();
    if (!catalog.length) {
        const empty = document.createElement('article');
        empty.className = 'economy-card shop-loading';
        empty.textContent = 'The shop is temporarily unavailable.';
        itemsBox.appendChild(empty);
        return;
    }
    catalog.forEach(item => {
        const card = document.createElement('article');
        card.className = 'economy-card shop-item';
        const icon = document.createElement('span');
        icon.className = 'shop-item-icon';
        const iconElement = document.createElement('i');
        iconElement.className = 'fa-solid ' + String(item.icon || 'fa-gift');
        icon.appendChild(iconElement);
        const copy = document.createElement('div');
        copy.className = 'shop-item-copy';
        const title = document.createElement('h3');
        title.textContent = String(item.name || 'Creator reward');
        const description = document.createElement('p');
        description.textContent = String(item.description || 'A permanent creator reward.');
        const owned = isOwned(item.id);
        if (item.id === 'extra_vault_slot' && entitlements.extraVaultSlots > 0) {
            const detail = document.createElement('small');
            detail.textContent = 'You own ' + entitlements.extraVaultSlots + ' extra slot' + (entitlements.extraVaultSlots === 1 ? '' : 's') + '.';
            copy.append(title, description, detail);
        } else {
            copy.append(title, description);
        }
        const action = document.createElement('button');
        action.type = 'button';
        action.className = owned ? 'btn-ghost shop-buy-btn owned' : activeUser ? 'btn-primary shop-buy-btn' : 'btn-ghost shop-buy-btn';
        action.dataset.itemId = String(item.id || '');
        action.disabled = !activeUser || owned || coinBalance < Number(item.price);
        action.innerHTML = owned
            ? '<i class="fa-solid fa-check"></i> Owned'
            : activeUser
                ? '<i class="fa-solid fa-coins"></i> ' + Number(item.price).toLocaleString() + ' coins'
                : '<i class="fa-solid fa-right-to-bracket"></i> Sign in to buy';
        action.addEventListener('click', () => buyItem(item, action));
        card.append(icon, copy, action);
        itemsBox.appendChild(card);
    });
}

async function loadShop(requestId) {
    const user = activeUser;
    try {
        const data = user
            ? await accountRequest('/api/shop', 'GET', null, user)
            : await fetch('/api/shop', { cache: 'no-store' }).then(async response => {
                const result = await response.json().catch(() => ({}));
                if (!response.ok || !result.ok) throw new Error(result.message || 'Could not load the shop.');
                return result;
            });
        if (requestId !== shopRequestId || activeUser?.uid !== user?.uid) return;
        coinBalance = Math.max(0, Number(data.coins) || 0);
        entitlements = data.entitlements || entitlements;
        catalog = Array.isArray(data.catalog) ? data.catalog : [];
        balanceLabel.textContent = coinBalance.toLocaleString();
        renderShop();
    } catch (error) {
        if (requestId !== shopRequestId || activeUser?.uid !== user?.uid) return;
        showStatus(error.message, 'error');
    }
}

async function buyItem(item, button) {
    const buyingUser = activeUser;
    button.disabled = true;
    button.dataset.originalHtml = button.innerHTML;
    button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Buying…';
    try {
        const data = await accountRequest('/api/shop', 'POST', { itemId: item.id }, buyingUser);
        if (activeUser?.uid !== buyingUser?.uid) return;
        coinBalance = Math.max(0, Number(data.coins) || 0);
        entitlements = data.entitlements || entitlements;
        balanceLabel.textContent = coinBalance.toLocaleString();
        showStatus(item.name + ' added to your account.', 'success');
        renderShop();
    } catch (error) {
        if (activeUser?.uid !== buyingUser?.uid) return;
        showStatus(error.message, 'error');
        await loadShop(shopRequestId);
    }
}

async function emailAction(createAccount) {
    const email = byId('shop-email').value.trim();
    const password = byId('shop-password').value;
    if (!email || !password) return showStatus('Enter your email and password first.', 'error');
    try {
        if (createAccount) await createUserWithEmailAndPassword(auth, email, password);
        else await signInWithEmailAndPassword(auth, email, password);
        byId('shop-password').value = '';
        statusBox.classList.add('hidden');
    } catch (error) { showStatus(authMessage(error), 'error'); }
}

byId('shop-login-btn').addEventListener('click', () => emailAction(false));
byId('shop-signup-btn').addEventListener('click', () => emailAction(true));
byId('shop-password').addEventListener('keydown', event => { if (event.key === 'Enter') emailAction(false); });
byId('shop-google-btn').addEventListener('click', async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); statusBox.classList.add('hidden'); }
    catch (error) { showStatus(authMessage(error), 'error'); }
});
byId('shop-signout-btn').addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, async user => {
    activeUser = user && !user.isAnonymous ? user : null;
    setAccountView(user);
    await loadShop(++shopRequestId);
});
