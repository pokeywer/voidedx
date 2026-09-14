document.addEventListener('DOMContentLoaded', () => {
    const lockBtn = document.getElementById('lock-vault-btn');
    if (!lockBtn) return;

    const sourceCode = document.getElementById('source-code');
    const scriptTitle = document.getElementById('script-title');
    const resultOverlay = document.getElementById('result-overlay');
    const lsOutput = document.getElementById('ls-output');
    const copyBtn = document.getElementById('copy-out-btn');
    const chkBackup = document.getElementById('chk-backup');

    // LZ-String / Base64 Safe Compressor
    function compressScript(src) {
        return btoa(encodeURIComponent(src).replace(/%([0-9A-F]{2})/g, (match, p1) => {
            return String.fromCharCode('0x' + p1);
        })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    lockBtn.addEventListener('click', () => {
        const code = sourceCode.value;
        if (!code.trim()) return alert('Please paste your script before locking.');

        const vaultId = 'vx_' + Math.random().toString(36).substring(2, 10);
        const title = scriptTitle.value.trim() || 'Untitled Vault';

        // Compress source directly into parameter key
        const compressedKey = compressScript(code);
        const rawUrl = `${window.location.origin}/api/raw?id=${vaultId}&data=${compressedKey}`;

        // PERMANENT, NON-EXPIRING LOADSTRING
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