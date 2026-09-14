// Vercel Serverless Function - Serves Unmodified Script Directly to Roblox Executors

// In-memory fallback map (Persists across warm serverless invocations)
globalThis.vaultStore = globalThis.vaultStore || new Map();

export default function handler(req, res) {
    const { id, code } = req.query;

    // CORS Headers for Roblox HttpGet execution
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');

    // Handle POST request to store script in server memory
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
        // Return exact raw, unmodified script to executor
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        const scriptCode = globalThis.vaultStore.get(id) || `--[ VoidedX Vault Payload ]--\nprint("VoidedX Vault Loaded: ${id}")`;
        return res.status(200).send(scriptCode);
    } else {
        // Redirect browser visitors away to the SECURED page
        return res.redirect(`/vault?id=${id}`);
    }
}