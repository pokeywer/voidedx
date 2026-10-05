import { db } from './_admin.js';

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

    if (!isExecutorRequest(req)) {
        const keyParam = key ? `&key=${encodeURIComponent(key)}` : '';
        return res.redirect(302, `/vault.html?id=${encodeURIComponent(id)}${keyParam}`);
    }

    try {
        const docSnap = await db.collection("vaults").doc(id).get();

        if (!docSnap.exists) {
            return res.status(404).send('-- Error: Vault ID not found in VoidedX Cloud');
        }

        const vaultData = docSnap.data();

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
    const keyPageUrl = `${origin}/key.html?id=${encodeURIComponent(id)}`;
    
    return `
local Players = game:GetService("Players")
local HttpService = game:GetService("HttpService")
local TweenService = game:GetService("TweenService")
local player = Players.LocalPlayer

local function getGuiParent()
    local ok, hui = pcall(function() return gethui() end)
    if ok and hui then return hui end
    local ok2, cg = pcall(function() return game:GetService("CoreGui") end)
    if ok2 and cg then return cg end
    return player:WaitForChild("PlayerGui")
end

local COL_BG = Color3.fromRGB(15, 18, 26)
local COL_CARD = Color3.fromRGB(22, 27, 38)
local COL_INPUT = Color3.fromRGB(29, 35, 49)
local COL_BORDER = Color3.fromRGB(45, 55, 75)
local COL_CYAN = Color3.fromRGB(6, 182, 212)
local COL_ACCENT = Color3.fromRGB(99, 102, 241)
local COL_TEXT = Color3.fromRGB(248, 250, 252)
local COL_MUTED = Color3.fromRGB(148, 163, 184)
local COL_RED = Color3.fromRGB(239, 68, 68)
local COL_GREEN = Color3.fromRGB(16, 185, 129)

local EASE_OUT = Enum.EasingStyle.Quint
local EASE_BACK = Enum.EasingStyle.Back

local screenGui = Instance.new("ScreenGui")
screenGui.Name = "VoidedXKeySystem"
screenGui.ResetOnSpawn = false
screenGui.IgnoreGuiInset = true
screenGui.DisplayOrder = 999
screenGui.Parent = getGuiParent()

local overlay = Instance.new("Frame")
overlay.Size = UDim2.fromScale(1, 1)
overlay.BackgroundColor3 = Color3.fromRGB(0, 0, 0)
overlay.BackgroundTransparency = 1
overlay.BorderSizePixel = 0
overlay.ZIndex = 1
overlay.Parent = screenGui
TweenService:Create(overlay, TweenInfo.new(0.35, EASE_OUT), { BackgroundTransparency = 0.5 }):Play()

local card = Instance.new("Frame")
card.AnchorPoint = Vector2.new(0.5, 0.5)
card.Position = UDim2.new(0.5, 0, 0.5, 0)
card.Size = UDim2.new(0, 340, 0, 0)
card.AutomaticSize = Enum.AutomaticSize.Y
card.BackgroundColor3 = COL_CARD
card.BorderSizePixel = 0
card.ZIndex = 2
card.Parent = screenGui

local cardCorner = Instance.new("UICorner")
cardCorner.CornerRadius = UDim.new(0, 14)
cardCorner.Parent = card

local cardStroke = Instance.new("UIStroke")
cardStroke.Color = COL_BORDER
cardStroke.Thickness = 1
cardStroke.Parent = card

local uiScale = Instance.new("UIScale")
uiScale.Scale = 0.85
uiScale.Parent = card
card.BackgroundTransparency = 1
cardStroke.Transparency = 1

TweenService:Create(uiScale, TweenInfo.new(0.35, EASE_BACK), { Scale = 1 }):Play()
TweenService:Create(card, TweenInfo.new(0.25, EASE_OUT), { BackgroundTransparency = 0 }):Play()
TweenService:Create(cardStroke, TweenInfo.new(0.25, EASE_OUT), { Transparency = 0 }):Play()

local accentBar = Instance.new("Frame")
accentBar.Size = UDim2.new(1, 0, 0, 3)
accentBar.BorderSizePixel = 0
accentBar.ZIndex = 3
accentBar.Parent = card

local accentCorner = Instance.new("UICorner")
accentCorner.CornerRadius = UDim.new(1, 0)
accentCorner.Parent = accentBar

local accentGradient = Instance.new("UIGradient")
accentGradient.Color = ColorSequence.new(COL_CYAN, COL_ACCENT)
accentGradient.Parent = accentBar

local padding = Instance.new("UIPadding")
padding.PaddingTop = UDim.new(0, 24)
padding.PaddingBottom = UDim.new(0, 20)
padding.PaddingLeft = UDim.new(0, 20)
padding.PaddingRight = UDim.new(0, 20)
padding.Parent = card

local layout = Instance.new("UIListLayout")
layout.Padding = UDim.new(0, 10)
layout.HorizontalAlignment = Enum.HorizontalAlignment.Center
layout.SortOrder = Enum.SortOrder.LayoutOrder
layout.Parent = card

local badge = Instance.new("Frame")
badge.Size = UDim2.new(0, 44, 0, 44)
badge.BackgroundColor3 = COL_CYAN
badge.BorderSizePixel = 0
badge.LayoutOrder = 1
badge.Parent = card

local badgeCorner = Instance.new("UICorner")
badgeCorner.CornerRadius = UDim.new(0, 10)
badgeCorner.Parent = badge

local badgeGradient = Instance.new("UIGradient")
badgeGradient.Rotation = 45
badgeGradient.Color = ColorSequence.new(COL_CYAN, COL_ACCENT)
badgeGradient.Parent = badge

local badgeIcon = Instance.new("TextLabel")
badgeIcon.Size = UDim2.fromScale(1, 1)
badgeIcon.BackgroundTransparency = 1
badgeIcon.Text = "🔑"
badgeIcon.TextSize = 20
badgeIcon.Font = Enum.Font.GothamBold
badgeIcon.TextColor3 = COL_TEXT
badgeIcon.Parent = badge

local title = Instance.new("TextLabel")
title.Size = UDim2.new(1, 0, 0, 22)
title.BackgroundTransparency = 1
title.Text = "VoidedX Key System"
title.TextColor3 = COL_TEXT
title.Font = Enum.Font.GothamBold
title.TextSize = 18
title.LayoutOrder = 2
title.Parent = card

local subtitle = Instance.new("TextLabel")
subtitle.Size = UDim2.new(1, 0, 0, 16)
subtitle.BackgroundTransparency = 1
subtitle.Text = "Enter your key to continue"
subtitle.TextColor3 = COL_MUTED
subtitle.Font = Enum.Font.Gotham
subtitle.TextSize = 13
subtitle.LayoutOrder = 3
subtitle.Parent = card

local inputBox = Instance.new("TextBox")
inputBox.Size = UDim2.new(1, 0, 0, 40)
inputBox.BackgroundColor3 = COL_INPUT
inputBox.TextColor3 = COL_TEXT
inputBox.PlaceholderText = "Enter key..."
inputBox.PlaceholderColor3 = COL_MUTED
inputBox.Text = ""
inputBox.ClearTextOnFocus = false
inputBox.Font = Enum.Font.Code
inputBox.TextSize = 13
inputBox.LayoutOrder = 4
inputBox.Parent = card

local inputCorner = Instance.new("UICorner")
inputCorner.CornerRadius = UDim.new(0, 8)
inputCorner.Parent = inputBox

local inputStroke = Instance.new("UIStroke")
inputStroke.Color = COL_BORDER
inputStroke.Thickness = 1
inputStroke.Parent = inputBox

local inputPad = Instance.new("UIPadding")
inputPad.PaddingLeft = UDim.new(0, 10)
inputPad.PaddingRight = UDim.new(0, 10)
inputPad.Parent = inputBox

inputBox.Focused:Connect(function()
    TweenService:Create(inputStroke, TweenInfo.new(0.2, EASE_OUT), { Color = COL_CYAN }):Play()
end)
inputBox.FocusLost:Connect(function()
    TweenService:Create(inputStroke, TweenInfo.new(0.2, EASE_OUT), { Color = COL_BORDER }):Play()
end)

local submitBtn = Instance.new("TextButton")
submitBtn.Size = UDim2.new(1, 0, 0, 40)
submitBtn.BackgroundColor3 = COL_CYAN
submitBtn.Text = "Submit Key"
submitBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
submitBtn.Font = Enum.Font.GothamBold
submitBtn.TextSize = 14
submitBtn.AutoButtonColor = false
submitBtn.LayoutOrder = 5
submitBtn.Parent = card

local btnCorner = Instance.new("UICorner")
btnCorner.CornerRadius = UDim.new(0, 8)
btnCorner.Parent = submitBtn

local btnGradient = Instance.new("UIGradient")
btnGradient.Rotation = 90
btnGradient.Color = ColorSequence.new(COL_CYAN, COL_ACCENT)
btnGradient.Parent = submitBtn

local btnScale = Instance.new("UIScale")
btnScale.Parent = submitBtn

submitBtn.MouseEnter:Connect(function()
    TweenService:Create(btnScale, TweenInfo.new(0.15, EASE_OUT), { Scale = 1.02 }):Play()
end)
submitBtn.MouseLeave:Connect(function()
    TweenService:Create(btnScale, TweenInfo.new(0.15, EASE_OUT), { Scale = 1 }):Play()
end)
submitBtn.MouseButton1Down:Connect(function()
    TweenService:Create(btnScale, TweenInfo.new(0.1, EASE_OUT), { Scale = 0.97 }):Play()
end)
submitBtn.MouseButton1Up:Connect(function()
    TweenService:Create(btnScale, TweenInfo.new(0.1, EASE_OUT), { Scale = 1.02 }):Play()
end)

local statusLabel = Instance.new("TextLabel")
statusLabel.Size = UDim2.new(1, 0, 0, 16)
statusLabel.BackgroundTransparency = 1
statusLabel.Text = ""
statusLabel.TextColor3 = COL_RED
statusLabel.Font = Enum.Font.Gotham
statusLabel.TextSize = 12
statusLabel.TextWrapped = true
statusLabel.LayoutOrder = 6
statusLabel.Parent = card

local getKeyBtn = Instance.new("TextButton")
getKeyBtn.Size = UDim2.new(1, 0, 0, 20)
getKeyBtn.BackgroundTransparency = 1
getKeyBtn.Text = "Get Key Link"
getKeyBtn.TextColor3 = COL_MUTED
getKeyBtn.Font = Enum.Font.Gotham
getKeyBtn.TextSize = 12
getKeyBtn.LayoutOrder = 7
getKeyBtn.Parent = card

local function setStatus(text, color)
    statusLabel.Text = text
    statusLabel.TextColor3 = color
end

local function shakeCard()
    local origPos = card.Position
    task.spawn(function()
        for i = 1, 3 do
            card.Position = origPos + UDim2.new(0, -5, 0, 0)
            task.wait(0.04)
            card.Position = origPos + UDim2.new(0, 5, 0, 0)
            task.wait(0.04)
        end
        card.Position = origPos
    end)
    cardStroke.Color = COL_RED
    TweenService:Create(cardStroke, TweenInfo.new(0.4, EASE_OUT), { Color = COL_BORDER }):Play()
end

getKeyBtn.MouseButton1Click:Connect(function()
    local copied = pcall(function() setclipboard(${luaString(keyPageUrl)}) end)
    if copied then
        setStatus("Link copied to clipboard!", COL_GREEN)
    else
        setStatus("Link: " .. ${luaString(keyPageUrl)}, COL_MUTED)
    end
end)

local verifying = false

local function attemptVerify()
    if verifying then return end
    local typedKey = inputBox.Text
    if typedKey == "" then
        setStatus("Please enter a key first.", COL_RED)
        shakeCard()
        return
    end

    verifying = true
    submitBtn.Text = "Verifying..."
    setStatus("", COL_MUTED)

    local ok, response = pcall(function()
        return game:HttpGet(
            "${verifyBase}?id=${encodeURIComponent(id)}" ..
            "&key=" .. HttpService:UrlEncode(typedKey) ..
            "&userId=" .. tostring(player.UserId) ..
            "&username=" .. HttpService:UrlEncode(player.Name)
        )
    end)

    verifying = false
    submitBtn.Text = "Submit Key"

    if not ok then
        setStatus("Connection error. Try again.", COL_RED)
        shakeCard()
        return
    end

    local decodeOk, result = pcall(function() return HttpService:JSONDecode(response) end)
    if not decodeOk or type(result) ~= "table" then
        setStatus("Invalid server response.", COL_RED)
        shakeCard()
        return
    end

    if not result.ok then
        setStatus(tostring(result.message or "Invalid key."), COL_RED)
        shakeCard()
        return
    end

    setStatus("Success! Loading...", COL_GREEN)
    submitBtn.BackgroundColor3 = COL_GREEN
    
    TweenService:Create(uiScale, TweenInfo.new(0.2, EASE_OUT), { Scale = 0.9 }):Play()
    TweenService:Create(card, TweenInfo.new(0.2, EASE_OUT), { BackgroundTransparency = 1 }):Play()
    TweenService:Create(overlay, TweenInfo.new(0.25, EASE_OUT), { BackgroundTransparency = 1 }):Play()
    task.wait(0.25)

    screenGui:Destroy()
    loadstring(result.code)()
end

submitBtn.MouseButton1Click:Connect(attemptVerify)
inputBox.FocusLost:Connect(function(enterPressed)
    if enterPressed then attemptVerify() end
end)
`.trim();
}
