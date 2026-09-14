// Vercel Serverless Function - Stateless Permanent Payload Handler

function decompressScript(str) {
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
    const { id, data } = req.query;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');

    if (!id || !data) {
        return res.status(400).send('--[ VoidedX Error: Invalid or Missing Payload ]--');
    }

    const userAgent = (req.headers['user-agent'] || '').toLowerCase();
    const isRoblox = userAgent.includes('roblox') || 
                     userAgent.includes('synapse') || 
                     userAgent.includes('executor') || 
                     userAgent.includes('curl') ||
                     req.query.format === 'raw';

    if (isRoblox) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        const rawScript = decompressScript(data);

        if (!rawScript) {
            return res.status(400).send('print("VoidedX Error: Corrupted Payload Data")');
        }

        // Return exact unmodified script
        return res.status(200).send(rawScript);
    } else {
        // Redirect browser visitors away to the SECURED page
        return res.redirect(`/vault?id=${id}`);
    }
}