import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyBdAR4ARjHccTlxrmP9tzdYGJxo4MvETXw",
    authDomain: "voidedx-fe79f.firebaseapp.com",
    projectId: "voidedx-fe79f",
    storageBucket: "voidedx-fe79f.firebasestorage.app",
    messagingSenderId: "784635868195",
    appId: "1:784635868195:web:6e879214df4238bc2aad96"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);

function isExecutorRequest(req) {
    const ua = (req.headers['user-agent'] || '').toLowerCase();
    if (req.query.format === 'raw') return true;
    return ua.includes('roblox') ||
           ua.includes('synapse') ||
           ua.includes('executor') ||
           ua.includes('script-ware') ||
           ua.includes('krnl') ||
           ua.includes('fluxus') ||
           ua.includes('electron') ||
           ua.includes('curl') ||
           ua === '';
}

export default async function handler(req, res) {
    const { id, key } = req.query;

    if (!id) {
        return res.status(400).send('-- Error: Missing Vault ID');
    }

    // Real browser visitors get sent to the SECURED landing page instead of raw code.
    if (!isExecutorRequest(req)) {
        const keyParam = key ? `&key=${encodeURIComponent(key)}` : '';
        return res.redirect(302, `/vault.html?id=${encodeURIComponent(id)}${keyParam}`);
    }

    try {
        const docRef = doc(db, "vaults", id);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            return res.status(404).send('-- Error: Vault ID not found in VoidedX Cloud');
        }

        const vaultData = docSnap.data();

        // GUI Mode: no key in the URL at all — send an in-game popup instead that
        // asks the player to type their key, then verifies it via /api/verify.
        if (vaultData.requireKey && vaultData.guiMode) {
            res.setHeader('Content-Type', 'text/plain');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            return res.status(200).send(buildGuiLoader(id, getOrigin(req)));
        }

        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

        if (!vaultData.requireKey) {
            return res.status(200).send(vaultData.code);
        }

        // Key-in-URL mode: fast-fail on an obviously missing key, otherwise hand off
        // to a loader that identifies the player and asks /api/verify to do the real
        // checking (key match, expiry, termination, bans, IP lock, player limits).
        if (!key) {
            return res.status(403).send(`
-- [VOIDEDX SECURITY ALERT]
-- Key protection is enabled for this script.
-- Invalid or missing key parameter.
error("[VoidedX] Invalid Key Provided!", 2)
            `);
        }

        return res.status(200).send(buildKeyLoader(id, key, getOrigin(req)));
    } catch (err) {
        return res.status(500).send(`-- Error loading script: ${err.message}`);
    }
}

function buildKeyLoader(id, key, origin) {
    const verifyBase = `${origin}/api/verify`;
    return `
local Players = game:GetService("Players")
local HttpService = game:GetService("HttpService")
local player = Players.LocalPlayer

local ok, response = pcall(function()
    return game:HttpGet(
        "${verifyBase}?id=${encodeURIComponent(id)}" ..
        "&key=" .. HttpService:UrlEncode(${luaString(key)}) ..
        "&userId=" .. tostring(player.UserId) ..
        "&username=" .. HttpService:UrlEncode(player.Name)
    )
end)

if not ok then
    return error("[VoidedX] Could not reach the verification server. Try again.", 0)
end

local decodeOk, result = pcall(function() return HttpService:JSONDecode(response) end)
if not decodeOk or type(result) ~= "table" then
    return error("[VoidedX] Verification server returned a bad response.", 0)
end

if not result.ok then
    return error("[VoidedX] " .. tostring(result.message or "Access denied."), 0)
end

loadstring(result.code)()
`.trim();
}

function luaString(str) {
    const escaped = String(str).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}"`;
}

function getOrigin(req) {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    return `${proto}://${host}`;
}

function buildGuiLoader(id, origin) {
    const verifyBase = `${origin}/api/verify`;
    const keyPageUrl = `${origin}/key.html?id=${id}`;
    return `
local Players = game:GetService("Players")
local HttpService = game:GetService("HttpService")
local player = Players.LocalPlayer

local function getGuiParent()
    local ok, hui = pcall(function() return gethui() end)
    if ok and hui then return hui end
    local ok2, cg = pcall(function() return game:GetService("CoreGui") end)
    if ok2 and cg then return cg end
    return player:WaitForChild("PlayerGui")
end

local screenGui = Instance.new("ScreenGui")
screenGui.Name = "VoidedXKeySystem"
screenGui.ResetOnSpawn = false
screenGui.IgnoreGuiInset = true
screenGui.DisplayOrder = 999
screenGui.Parent = getGuiParent()

local frame = Instance.new("Frame")
frame.AnchorPoint = Vector2.new(0.5, 0.5)
frame.Position = UDim2.new(0.5, 0, 0.5, 0)
frame.Size = UDim2.new(0.85, 0, 0, 250)
frame.BackgroundColor3 = Color3.fromRGB(11, 13, 18)
frame.BorderSizePixel = 0
frame.Parent = screenGui

local sizeConstraint = Instance.new("UISizeConstraint")
sizeConstraint.MaxSize = Vector2.new(360, 280)
sizeConstraint.Parent = frame

local corner = Instance.new("UICorner")
corner.CornerRadius = UDim.new(0, 12)
corner.Parent = frame

local stroke = Instance.new("UIStroke")
stroke.Color = Color3.fromRGB(33, 38, 53)
stroke.Thickness = 1
stroke.Parent = frame

local padding = Instance.new("UIPadding")
padding.PaddingTop = UDim.new(0, 20)
padding.PaddingBottom = UDim.new(0, 20)
padding.PaddingLeft = UDim.new(0, 20)
padding.PaddingRight = UDim.new(0, 20)
padding.Parent = frame

local layout = Instance.new("UIListLayout")
layout.Padding = UDim.new(0, 10)
layout.HorizontalAlignment = Enum.HorizontalAlignment.Center
layout.SortOrder = Enum.SortOrder.LayoutOrder
layout.Parent = frame

local title = Instance.new("TextLabel")
title.Size = UDim2.new(1, 0, 0, 24)
title.BackgroundTransparency = 1
title.Text = "VoidedX Key System"
title.TextColor3 = Color3.fromRGB(248, 250, 252)
title.Font = Enum.Font.GothamBold
title.TextScaled = true
title.LayoutOrder = 1
title.Parent = frame

local subtitle = Instance.new("TextLabel")
subtitle.Size = UDim2.new(1, 0, 0, 16)
subtitle.BackgroundTransparency = 1
subtitle.Text = "Enter your key to continue"
subtitle.TextColor3 = Color3.fromRGB(100, 116, 139)
subtitle.Font = Enum.Font.Gotham
subtitle.TextScaled = true
subtitle.LayoutOrder = 2
subtitle.Parent = frame

local inputBox = Instance.new("TextBox")
inputBox.Size = UDim2.new(1, 0, 0, 40)
inputBox.BackgroundColor3 = Color3.fromRGB(22, 26, 36)
inputBox.TextColor3 = Color3.fromRGB(6, 182, 212)
inputBox.PlaceholderText = "Enter key here..."
inputBox.PlaceholderColor3 = Color3.fromRGB(100, 116, 139)
inputBox.Text = ""
inputBox.ClearTextOnFocus = false
inputBox.Font = Enum.Font.Code
inputBox.TextScaled = true
inputBox.LayoutOrder = 3
inputBox.Parent = frame

local inputCorner = Instance.new("UICorner")
inputCorner.CornerRadius = UDim.new(0, 8)
inputCorner.Parent = inputBox

local inputPad = Instance.new("UIPadding")
inputPad.PaddingLeft = UDim.new(0, 10)
inputPad.PaddingRight = UDim.new(0, 10)
inputPad.Parent = inputBox

local submitBtn = Instance.new("TextButton")
submitBtn.Size = UDim2.new(1, 0, 0, 40)
submitBtn.BackgroundColor3 = Color3.fromRGB(6, 182, 212)
submitBtn.Text = "Submit"
submitBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
submitBtn.Font = Enum.Font.GothamBold
submitBtn.TextScaled = true
submitBtn.AutoButtonColor = true
submitBtn.LayoutOrder = 4
submitBtn.Parent = frame

local btnCorner = Instance.new("UICorner")
btnCorner.CornerRadius = UDim.new(0, 8)
btnCorner.Parent = submitBtn

local statusLabel = Instance.new("TextLabel")
statusLabel.Size = UDim2.new(1, 0, 0, 18)
statusLabel.BackgroundTransparency = 1
statusLabel.Text = ""
statusLabel.TextColor3 = Color3.fromRGB(239, 68, 68)
statusLabel.Font = Enum.Font.Gotham
statusLabel.TextScaled = true
statusLabel.LayoutOrder = 5
statusLabel.Parent = frame

local getKeyBtn = Instance.new("TextButton")
getKeyBtn.Size = UDim2.new(1, 0, 0, 24)
getKeyBtn.BackgroundTransparency = 1
getKeyBtn.Text = "Need a key? Click to copy the Get-Key link"
getKeyBtn.TextColor3 = Color3.fromRGB(100, 116, 139)
getKeyBtn.Font = Enum.Font.Gotham
getKeyBtn.TextScaled = true
getKeyBtn.LayoutOrder = 6
getKeyBtn.Parent = frame

getKeyBtn.MouseButton1Click:Connect(function()
    local copied = pcall(function() setclipboard(${luaString(keyPageUrl)}) end)
    if copied then
        statusLabel.TextColor3 = Color3.fromRGB(16, 185, 129)
        statusLabel.Text = "Link copied! Paste it in your browser."
    else
        statusLabel.TextColor3 = Color3.fromRGB(239, 68, 68)
        statusLabel.Text = "Get a key at: ${keyPageUrl}"
    end
end)

local verifying = false

local function attemptVerify()
    if verifying then return end
    local typedKey = inputBox.Text
    if typedKey == "" then
        statusLabel.TextColor3 = Color3.fromRGB(239, 68, 68)
        statusLabel.Text = "Enter a key first."
        return
    end

    verifying = true
    statusLabel.TextColor3 = Color3.fromRGB(100, 116, 139)
    statusLabel.Text = "Checking..."
    submitBtn.Text = "Checking..."

    local ok, response = pcall(function()
        return game:HttpGet(
            "${verifyBase}?id=${encodeURIComponent(id)}" ..
            "&key=" .. HttpService:UrlEncode(typedKey) ..
            "&userId=" .. tostring(player.UserId) ..
            "&username=" .. HttpService:UrlEncode(player.Name)
        )
    end)

    verifying = false
    submitBtn.Text = "Submit"

    if not ok then
        statusLabel.TextColor3 = Color3.fromRGB(239, 68, 68)
        statusLabel.Text = "Couldn't reach the server. Try again."
        return
    end

    local decodeOk, result = pcall(function() return HttpService:JSONDecode(response) end)
    if not decodeOk or type(result) ~= "table" then
        statusLabel.TextColor3 = Color3.fromRGB(239, 68, 68)
        statusLabel.Text = "Bad response from server."
        return
    end

    if not result.ok then
        statusLabel.TextColor3 = Color3.fromRGB(239, 68, 68)
        statusLabel.Text = tostring(result.message or "Invalid key.")
        return
    end

    screenGui:Destroy()
    loadstring(result.code)()
end

submitBtn.MouseButton1Click:Connect(attemptVerify)
inputBox.FocusLost:Connect(function(enterPressed)
    if enterPressed then attemptVerify() end
end)
`.trim();
}