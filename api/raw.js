// Vercel Serverless API Endpoint for Roblox Executors & Browser Shield

export default function handler(req, res) {
    const { id } = req.query;

    if (!id) {
        return res.status(400).send('--[ VoidedX Error: Missing Vault ID ]--');
    }

    const userAgent = req.headers['user-agent'] || '';
    const isRoblox = userAgent.includes('Roblox') || userAgent.includes('Synapse') || userAgent.includes('Executor');

    // CORS headers for Roblox HTTP requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    if (isRoblox || req.query.format === 'raw') {
        // Return raw executable Luau payload with Anti-Spy / Anti-Dump
        res.setHeader('Content-Type', 'text/plain');
        
        const antiSpyHeader = 
`--[[ Protected by VoidedX Security Engine ]]--
if not LUA_ENV then
    pcall(function()
        local g = getfenv and getfenv() or _ENV
        if g then
            -- Anti-Hook & Anti-Spy for Hydroxide/SimpleSpy
            if g.hookfunction or g.hookmetamethod then
                while true do end
            end
        end
    end)
end
`;
        return res.status(200).send(antiSpyHeader + `-- Vault Payload ID: ${id}\nprint("VoidedX Protected Script Executed Successfully")`);
    } else {
        // Redirect browser visitors to the locked vault view
        return res.redirect(`/vault?id=${id}`);
    }
}