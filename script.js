document.addEventListener('DOMContentLoaded', () => {
    const lockBtn = document.getElementById('lock-vault-btn');
    if (!lockBtn) return;

    const sourceCode = document.getElementById('source-code');
    const scriptTitle = document.getElementById('script-title');
    const resultOverlay = document.getElementById('result-overlay');
    const lsOutput = document.getElementById('ls-output');
    const copyBtn = document.getElementById('copy-out-btn');
    const chkBackup = document.getElementById('chk-backup');

    lockBtn.addEventListener('click', async () => {
        const code = sourceCode.value;
        if (!code.trim()) return alert('Please paste your script before locking.');

        const vaultId = 'vx_' + Math.random().toString(36).substring(2, 10);
        const title = scriptTitle.value.trim() || 'Untitled Vault';

        // Upload payload to server storage (Keeps loadstring URL ultra-short)
        try {
            await fetch('/api/raw', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: vaultId, code: code })
            });
        } catch (err) {
            alert('Failed to connect to Vault server. Try again.');
            return;
        }

        const rawUrl = `${window.location.origin}/api/raw?id=${vaultId}`;

        // SHORT & CLEAN LOADSTRING
        const loadstringCmd = `loadstring(game:HttpGet("${rawUrl}"))()`;

        lsOutput.value = loadstringCmd;
        resultOverlay.classList.remove('hidden');

        // Optional .txt local backup download
        if (chkBackup && chkBackup.checked) {
            const backupTxt = 
`==================================================
VOIDEDX ANTI-SKID VAULT BACKUP
==================================================
Title      : ${title}
Vault ID   : ${vaultId}
Loadstring : ${loadstringCmd}
==================================================
ORIGINAL SCRIPT (UNTOUCHED):
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

    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(lsOutput.value);
        copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> COPIED!';
        setTimeout(() => copyBtn.innerHTML = '<i class="fa-solid fa-copy"></i> COPY LOADSTRING', 2000);
    });
});