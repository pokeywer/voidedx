// Vercel Serverless API - Short Clean Payload Delivery

// In-Memory Global Memory Store (Warm Instance Cache)
globalThis.vaultStore = globalThis.vaultStore || new Map();

export default function handler(req, res) {
    const { id } = req.query;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');

    // Save Vault Payload
    if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const parsed = JSON.parse(body);
                if (parsed.id && parsed.code) {
                    globalThis.vaultStore.set(parsed.id, parsed.code);
                    return res.status(200).json({ success: true, id: parsed.id });
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
        const scriptCode = globalThis.vaultStore.get(id);

        if (!scriptCode) {
            return res.status(404).send('print("VoidedX Error: Vault Expired or Not Found")');
        }

        // Returns your EXACT script untouched (e.g. Lance Hub v6.0)
        return res.status(200).send(scriptCode);
    } else {
        // Redirect browser visitors away to the SECURED page
        return res.redirect(`/vault?id=${id}`);
    }
}