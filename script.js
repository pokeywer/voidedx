// VoidedX Zero-Knowledge Crypto Vault Engine

document.addEventListener('DOMContentLoaded', async () => {
    // -------------------------------------------------------------
    // 1. HARDENED CLIENT-SIDE DEFENSES
    // -------------------------------------------------------------
    const lockoutScreen = document.getElementById('security-lockout');

    function triggerLockout() {
        if (lockoutScreen) lockoutScreen.classList.remove('hidden');
    }

    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('keydown', (e) => {
        if (
            e.key === 'F12' ||
            (e.ctrlKey && e.shiftKey && ['I', 'i', 'J', 'j', 'C', 'c'].includes(e.key)) ||
            (e.ctrlKey && ['U', 'u'].includes(e.key))
        ) {
            e.preventDefault();
            triggerLockout();
        }
    });

    // Console Purge
    const noop = () => {};
    window.console.log = noop;
    window.console.warn = noop;
    window.console.dir = noop;

    // Timing-based Debugger Detection Loop
    setInterval(() => {
        const start = performance.now();
        (function() {}['constructor']('debugger')());
        if (performance.now() - start > 150) {
            triggerLockout();
        }
    }, 1000);


    // -------------------------------------------------------------
    // 2. MOBILE DRAWER INTERACTION
    // -------------------------------------------------------------
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const closeSidebarBtn = document.getElementById('close-sidebar-btn');
    const sidebar = document.getElementById('sidebar');

    if (mobileMenuBtn && sidebar) {
        mobileMenuBtn.addEventListener('click', () => sidebar.classList.add('active'));
    }

    if (closeSidebarBtn && sidebar) {
        closeSidebarBtn.addEventListener('click', () => sidebar.classList.remove('active'));
    }


    // -------------------------------------------------------------
    // 3. CRYPTOGRAPHIC ENGINE (AES-256-GCM)
    // -------------------------------------------------------------
    async function generateKey() {
        return await crypto.subtle.generateKey(
            { name: "AES-GCM", length: 256 },
            true,
            ["encrypt", "decrypt"]
        );
    }

    async function exportKey(key) {
        const raw = await crypto.subtle.exportKey("raw", key);
        return btoa(String.fromCharCode(...new Uint8Array(raw)))
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    async function importKey(keyStr) {
        let base64 = keyStr.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) base64 += '=';
        const raw = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        return await crypto.subtle.importKey("raw", raw, "AES-GCM", true, ["decrypt"]);
    }

    async function encryptPayload(text, key) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(text);
        const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);

        const combined = new Uint8Array(iv.length + ciphertext.byteLength);
        combined.set(iv, 0);
        combined.set(new Uint8Array(ciphertext), iv.length);

        return btoa(String.fromCharCode(...combined))
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    async function decryptPayload(encryptedStr, key) {
        let base64 = encryptedStr.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) base64 += '=';
        const combined = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

        const iv = combined.slice(0, 12);
        const ciphertext = combined.slice(12);

        const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
        return new TextDecoder().decode(decrypted);
    }


    // -------------------------------------------------------------
    // 4. CREATION HUB (index.html)
    // -------------------------------------------------------------
    const lockVaultBtn = document.getElementById('lock-vault-btn');
    if (lockVaultBtn) {
        const sourceCode = document.getElementById('source-code');
        const scriptTitle = document.getElementById('script-title');
        const clearBtn = document.getElementById('clear-btn');
        const resultOverlay = document.getElementById('result-overlay');
        const vaultUrlOutput = document.getElementById('vault-url-output');
        const copyUrlBtn = document.getElementById('copy-url-btn');

        const chkBackup = document.getElementById('chk-backup');
        const chkStripComments = document.getElementById('chk-strip-comments');

        clearBtn.addEventListener('click', () => sourceCode.value = '');

        lockVaultBtn.addEventListener('click', async () => {
            let code = sourceCode.value;
            if (!code.trim()) return alert('Please enter code before locking.');

            if (chkStripComments.checked) {
                code = code.replace(/--\[\[[\s\S]*?\]\]/g, '').replace(/--.*$/gm, '');
            }

            const title = scriptTitle.value.trim() || 'Untitled Vault';
            const vaultId = 'vx_' + Math.random().toString(36).substring(2, 10);

            // Execute Client Encryption
            const key = await generateKey();
            const keyString = await exportKey(key);
            const cipherText = await encryptPayload(code, key);

            // Store Encrypted Blob
            const vaultRecord = { title, cipher: cipherText, created: Date.now() };
            localStorage.setItem(vaultId, JSON.stringify(vaultRecord));

            // Generate URL with Hash Key
            const vaultUrl = `${window.location.origin}/vault.html#${vaultId}:${keyString}`;
            vaultUrlOutput.value = vaultUrl;
            resultOverlay.classList.remove('hidden');

            if (sidebar) sidebar.classList.remove('active');

            // Trigger `.txt` Backup Download
            if (chkBackup.checked) {
                const backupTxt = 
`==================================================
VOIDEDX VAULT BACKUP FILE
==================================================
Title     : ${title}
Vault ID  : ${vaultId}
Key String: ${keyString}
Vault URL : ${vaultUrl}
Date      : ${new Date().toLocaleString()}
==================================================
RAW SOURCE CODE:
==================================================

${code}`;

                const blob = new Blob([backupTxt], { type: 'text/plain' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `${vaultId}_backup.txt`;
                a.click();
                URL.revokeObjectURL(a.href);
            }
        });

        copyUrlBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(vaultUrlOutput.value);
            copyUrlBtn.innerHTML = '<i class="fa-solid fa-check"></i> COPIED!';
            setTimeout(() => copyUrlBtn.innerHTML = '<i class="fa-solid fa-copy"></i> COPY LINK', 2000);
        });
    }


    // -------------------------------------------------------------
    // 5. DECRYPTION VIEWER PAGE (vault.html)
    // -------------------------------------------------------------
    const decryptedCodeArea = document.getElementById('decrypted-code');
    if (decryptedCodeArea) {
        const loadingBox = document.getElementById('loading-box');
        const errorBox = document.getElementById('error-box');
        const decryptedBox = document.getElementById('decrypted-box');
        const displayTitle = document.getElementById('display-title');
        const displayId = document.getElementById('display-id');
        const copyCodeBtn = document.getElementById('copy-code-btn');
        const saveTxtBtn = document.getElementById('save-txt-btn');
        const vaultStatusTag = document.getElementById('vault-status-tag');

        const hash = window.location.hash.substring(1);
        if (!hash || !hash.includes(':')) {
            loadingBox.classList.add('hidden');
            errorBox.classList.remove('hidden');
            return;
        }

        const [vaultId, keyString] = hash.split(':');
        const storedRecord = localStorage.getItem(vaultId);

        if (!storedRecord) {
            loadingBox.classList.add('hidden');
            errorBox.classList.remove('hidden');
            return;
        }

        try {
            const vaultObj = JSON.parse(storedRecord);
            const key = await importKey(keyString);
            const rawCode = await decryptPayload(vaultObj.cipher, key);

            loadingBox.classList.add('hidden');
            decryptedBox.classList.remove('hidden');
            vaultStatusTag.textContent = 'DECRYPTED';

            displayTitle.textContent = vaultObj.title;
            displayId.textContent = `ID: ${vaultId}`;
            decryptedCodeArea.value = rawCode;

            copyCodeBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(decryptedCodeArea.value);
                copyCodeBtn.innerHTML = '<i class="fa-solid fa-check"></i> COPIED!';
                setTimeout(() => copyCodeBtn.innerHTML = '<i class="fa-solid fa-copy"></i> COPY RAW', 2000);
            });

            saveTxtBtn.addEventListener('click', () => {
                const blob = new Blob([decryptedCodeArea.value], { type: 'text/plain' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `${vaultId}.txt`;
                a.click();
            });

        } catch (err) {
            loadingBox.classList.add('hidden');
            errorBox.classList.remove('hidden');
        }
    }
});