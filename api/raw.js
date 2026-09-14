globalThis.vaultStore = globalThis.vaultStore || new Map();

export default function handler(req, res) {
    const { id } = req.query;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');

    if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const parsed = JSON.parse(body);
                if (parsed.id && parsed.code) {
                    globalThis.vaultStore.set(parsed.id, parsed.code);
                    return res.status(200).json({ success: true });
                }
            } catch (e) {}
            return res.status(400).json({ error: 'Invalid payload' });
        });
        return;
    }

    if (!id) {
        return res.status(400).send('--[ VoidedX Error: Missing Vault ID ]--');
    }

    const userAgent = (req.headers['user-agent'] || '').toLowerCase();
    const isRoblox = userAgent.includes('roblox') || 
                     userAgent.includes('synapse') || 
                     userAgent.includes('executor') || 
                     userAgent.includes('curl') ||
                     req.query.format === 'raw';

    if (isRoblox) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        const scriptCode = globalThis.vaultStore.get(id) || `--[ VoidedX Vault Payload ]--\nprint("VoidedX Vault Loaded: ${id}")`;
        return res.status(200).send(scriptCode);
    } else {
        return res.redirect(`/vault?id=${id}`);
    }
}