// Vercel Serverless Function - Serves Payload Directly to Roblox Executors

function decodePayload(str) {
    try {
        let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) base64 += '=';
        return decodeURIComponent(Array.from(atob(base64)).map(c => {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
    } catch (e) {
        return null;
    }
}

export default function handler(req, res) {
    const { id, key } = req.query;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');

    if (!id || !key) {
        return res.status(400).send('--[ VoidedX Error: Invalid or Missing Vault Key ]--');
    }

    const userAgent = (req.headers['user-agent'] || '').toLowerCase();
    const isRoblox = userAgent.includes('roblox') || 
                     userAgent.includes('synapse') || 
                     userAgent.includes('executor') || 
                     userAgent.includes('curl') ||
                     req.query.format === 'raw';

    if (isRoblox) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        const rawScript = decodePayload(key);
        
        if (!rawScript) {
            return res.status(400).send('print("VoidedX Error: Corrupted Payload Key")');
        }

        // Return exact original script (e.g. print("W") or Luraph obfuscated script)
        return res.status(200).send(rawScript);
    } else {
        // Redirect browser visitors away to the SECURED page
        return res.redirect(`/vault?id=${id}`);
    }
}