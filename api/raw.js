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
        return res.status(400).send('Error: Missing Vault ID');
    }

    // Real browser visitors get sent to the SECURED landing page instead of raw code.
    if (!isExecutorRequest(req)) {
        const keyParam = key ? `&key=${encodeURIComponent(key)}` : '';
        return res.redirect(302, `/vault.html?id=${encodeURIComponent(id)}${keyParam}`);
    }

    try {
        const docSnap = await db.collection("vaults").doc(id).get();

        if (!docSnap.exists) {
            return res.status(404).send('Error: Vault ID not found in VoidedX Cloud');
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
error("[VoidedX] Invalid Key Provided!", 2)
            `);
        }

        return res.status(200).send(buildKeyLoader(id, key, getOrigin(req)));
    } catch (err) {
        return res.status(500).send(`Error loading script: ${err.message}`);
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
local TweenService = game:GetService("TweenService")
local player = Players.LocalPlayer

local function getGuiParent()
    local ok, hui = pcall(function() return gethui() end)
    if ok and hui then return hui end
    local ok2, cg = pcall(function() return game:GetService("CoreGui") end)
    if ok2 and cg then return cg end
    return player:WaitForChild("PlayerGui")
end

local COL_BG = Color3.fromRGB(11, 13, 18)
local COL_INPUT = Color3.fromRGB(22, 26, 36)
local COL_BORDER = Color3.fromRGB(33, 38, 53)
local COL_CYAN = Color3.fromRGB(6, 182, 212)
local COL_ACCENT = Color3.fromRGB(99, 102, 241)
local COL_TEXT = Color3.fromRGB(248, 250, 252)
local COL_MUTED = Color3.fromRGB(100, 116, 139)
local COL_RED = Color3.fromRGB(239, 68, 68)
local COL_GREEN = Color3.fromRGB(16, 185, 129)

local EASE_OUT = Enum.EasingStyle.Quint
local EASE_BACK = Enum.EasingStyle.Back

local screenGui = Instance.new("ScreenGui")
screenGui.Name = "VoidedXKeySystem"
screenGui.ResetOnSpawn = false
screenGui.IgnoreGuiInset = true
screenGui.DisplayOrder = 999
screenGui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
screenGui.Parent = getGuiParent()

local overlay = Instance.new("Frame")
overlay.Size = UDim2.fromScale(1, 1)
overlay.BackgroundColor3 = Color3.fromRGB(0, 0, 0)
overlay.BackgroundTransparency = 1
overlay.BorderSizePixel = 0
overlay.ZIndex = 1
overlay.Parent = screenGui
TweenService:Create(overlay, TweenInfo.new(0.35, EASE_OUT), { BackgroundTransparency = 0.45 }):Play()

local card = Instance.new("Frame")
card.AnchorPoint = Vector2.new(0.5, 0.5)
card.Position = UDim2.new(0.5, 0, 0.5, 0)
card.Size = UDim2.new(0.86, 0, 0, 0)
card.AutomaticSize = Enum.AutomaticSize.Y
card.BackgroundColor3 = COL_BG
card.BorderSizePixel = 0
card.ZIndex = 2
card.Parent = screenGui

local cardConstraint = Instance.new("UISizeConstraint")
cardConstraint.MaxSize = Vector2.new(360, 10000)
cardConstraint.Parent = card

local cardCorner = Instance.new("UICorner")
cardCorner.CornerRadius = UDim.new(0, 16)
cardCorner.Parent = card

local cardStroke = Instance.new("UIStroke")
cardStroke.Color = COL_BORDER
cardStroke.Thickness = 1
cardStroke.Parent = card

local uiScale = Instance.new("UIScale")
uiScale.Scale = 0.82
uiScale.Parent = card
card.BackgroundTransparency = 1
cardStroke.Transparency = 1
TweenService:Create(uiScale, TweenInfo.new(0.4, EASE_BACK), { Scale = 1 }):Play()
TweenService:Create(card, TweenInfo.new(0.25, EASE_OUT), { BackgroundTransparency = 0 }):Play()
TweenService:Create(cardStroke, TweenInfo.new(0.3, EASE_OUT), { Transparency = 0 }):Play()

local accentBar = Instance.new("Frame")
accentBar.Size = UDim2.new(1, 0, 0, 4)
accentBar.BorderSizePixel = 0
accentBar.ZIndex = 3
accentBar.Parent = card
local accentCorner = Instance.new("UICorner")
accentCorner.CornerRadius = UDim.new(1, 0)
accentCorner.Parent = accentBar
local accentGradient = Instance.new("UIGradient")
accentGradient.Color = ColorSequence.new(COL_CYAN, COL_ACCENT)
accentGradient.Parent = accentBar
task.spawn(function()
    while accentBar.Parent do
        TweenService:Create(accentGradient, TweenInfo.new(2, Enum.EasingStyle.Sine), { Offset = Vector2.new(0.4, 0) }):Play()
        task.wait(2)
        TweenService:Create(accentGradient, TweenInfo.new(2, Enum.EasingStyle.Sine), { Offset = Vector2.new(-0.4, 0) }):Play()
        task.wait(2)
    end
end)

local content = Instance.new("Frame")
content.Size = UDim2.new(1, 0, 0, 0)
content.AutomaticSize = Enum.AutomaticSize.Y
content.BackgroundTransparency = 1
content.ZIndex = 2
content.Parent = card

local padding = Instance.new("UIPadding")
padding.PaddingTop = UDim.new(0, 26)
padding.PaddingBottom = UDim.new(0, 22)
padding.PaddingLeft = UDim.new(0, 22)
padding.PaddingRight = UDim.new(0, 22)
padding.Parent = content

local layout = Instance.new("UIListLayout")
layout.Padding = UDim.new(0, 12)
layout.HorizontalAlignment = Enum.HorizontalAlignment.Center
layout.SortOrder = Enum.SortOrder.LayoutOrder
layout.Parent = content

local badge = Instance.new("Frame")
badge.Size = UDim2.new(0, 48, 0, 48)
badge.BackgroundColor3 = COL_CYAN
badge.BorderSizePixel = 0
badge.LayoutOrder = 1
badge.Parent = content
local badgeCorner = Instance.new("UICorner")
badgeCorner.CornerRadius = UDim.new(0, 12)
badgeCorner.Parent = badge
local badgeGradient = Instance.new("UIGradient")
badgeGradient.Rotation = 45
badgeGradient.Color = ColorSequence.new(COL_CYAN, COL_ACCENT)
badgeGradient.Parent = badge
local badgeIcon = Instance.new("TextLabel")
badgeIcon.Size = UDim2.fromScale(1, 1)
badgeIcon.BackgroundTransparency = 1
badgeIcon.Text = "\\u{1F511}"
badgeIcon.TextScaled = true
badgeIcon.Font = Enum.Font.GothamBold
badgeIcon.Parent = badge

local title = Instance.new("TextLabel")
title.Size = UDim2.new(1, 0, 0, 24)
title.BackgroundTransparency = 1
title.Text = "VoidedX Key System"
title.TextColor3 = COL_TEXT
title.Font = Enum.Font.GothamBold
title.TextScaled = true
title.LayoutOrder = 2
title.Parent = content

local subtitle = Instance.new("TextLabel")
subtitle.Size = UDim2.new(1, 0, 0, 16)
subtitle.BackgroundTransparency = 1
subtitle.Text = "Enter your key to continue"
subtitle.TextColor3 = COL_MUTED
subtitle.Font = Enum.Font.Gotham
subtitle.TextScaled = true
subtitle.LayoutOrder = 3
subtitle.Parent = content

local inputBox = Instance.new("TextBox")
inputBox.Size = UDim2.new(1, 0, 0, 42)
inputBox.BackgroundColor3 = COL_INPUT
inputBox.TextColor3 = COL_CYAN
inputBox.PlaceholderText = "Enter key here..."
inputBox.PlaceholderColor3 = COL_MUTED
inputBox.Text = ""
inputBox.ClearTextOnFocus = false
inputBox.Font = Enum.Font.Code
inputBox.TextScaled = true
inputBox.LayoutOrder = 4
inputBox.Parent = content
local inputCorner = Instance.new("UICorner")
inputCorner.CornerRadius = UDim.new(0, 9)
inputCorner.Parent = inputBox
local inputStroke = Instance.new("UIStroke")
inputStroke.Color = COL_BORDER
inputStroke.Thickness = 1
inputStroke.Parent = inputBox
local inputPad = Instance.new("UIPadding")
inputPad.PaddingLeft = UDim.new(0, 12)
inputPad.PaddingRight = UDim.new(0, 12)
inputPad.Parent = inputBox

inputBox.Focused:Connect(function()
    TweenService:Create(inputStroke, TweenInfo.new(0.2, EASE_OUT), { Color = COL_CYAN, Thickness = 2 }):Play()
end)
inputBox.FocusLost:Connect(function()
    TweenService:Create(inputStroke, TweenInfo.new(0.2, EASE_OUT), { Color = COL_BORDER, Thickness = 1 }):Play()
end)

local submitBtn = Instance.new("TextButton")
submitBtn.Size = UDim2.new(1, 0, 0, 42)
submitBtn.BackgroundColor3 = COL_CYAN
submitBtn.Text = "Submit"
submitBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
submitBtn.Font = Enum.Font.GothamBold
submitBtn.TextScaled = true
submitBtn.AutoButtonColor = false
submitBtn.LayoutOrder = 5
submitBtn.Parent = content
local btnCorner = Instance.new("UICorner")
btnCorner.CornerRadius = UDim.new(0, 9)
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
statusLabel.TextScaled = true
statusLabel.TextTransparency = 1
statusLabel.LayoutOrder = 6
statusLabel.Parent = content

local getKeyBtn = Instance.new("TextButton")
getKeyBtn.Size = UDim2.new(1, 0, 0, 22)
getKeyBtn.BackgroundTransparency = 1
getKeyBtn.Text = "Need a key? Tap to copy the Get-Key link"
getKeyBtn.TextColor3 = COL_MUTED
getKeyBtn.Font = Enum.Font.Gotham
getKeyBtn.TextScaled = true
getKeyBtn.LayoutOrder = 7
getKeyBtn.Parent = content

local function setStatus(text, color)
    statusLabel.Text = text
    statusLabel.TextColor3 = color
    statusLabel.TextTransparency = 0
end

local function shakeCard()
    local originalPos = card.Position
    local seq = {
        UDim2.new(originalPos.X.Scale, originalPos.X.Offset - 8, originalPos.Y.Scale, originalPos.Y.Offset),
        UDim2.new(originalPos.X.Scale, originalPos.X.Offset + 8, originalPos.Y.Scale, originalPos.Y.Offset),
        UDim2.new(originalPos.X.Scale, originalPos.X.Offset - 5, originalPos.Y.Scale, originalPos.Y.Offset),
        originalPos
    }
    for _, pos in ipairs(seq) do
        TweenService:Create(card, TweenInfo.new(0.06, Enum.EasingStyle.Linear), { Position = pos }):Play()
        task.wait(0.06)
    end
    local flashColor = cardStroke.Color
    cardStroke.Color = COL_RED
    TweenService:Create(cardStroke, TweenInfo.new(0.4, EASE_OUT), { Color = COL_BORDER }):Play()
end

getKeyBtn.MouseButton1Click:Connect(function()
    local copied = pcall(function() setclipboard(${luaString(keyPageUrl)}) end)
    if copied then
        setStatus("Link copied! Paste it in your browser.", COL_GREEN)
    else
        setStatus("Get a key at: ${keyPageUrl}", COL_MUTED)
    end
end)

local verifying = false
local dotsRunning = false

local function animateDots(label, baseText)
    dotsRunning = true
    task.spawn(function()
        local dots = 0
        while dotsRunning do
            label.Text = baseText .. string.rep(".", dots % 4)
            dots += 1
            task.wait(0.35)
        end
    end)
end

local function attemptVerify()
    if verifying then return end
    local typedKey = inputBox.Text
    if typedKey == "" then
        setStatus("Enter a key first.", COL_RED)
        shakeCard()
        return
    end

    verifying = true
    setStatus("", COL_MUTED)
    animateDots(submitBtn, "Verifying")

    local ok, response = pcall(function()
        return game:HttpGet(
            "${verifyBase}?id=${encodeURIComponent(id)}" ..
            "&key=" .. HttpService:UrlEncode(typedKey) ..
            "&userId=" .. tostring(player.UserId) ..
            "&username=" .. HttpService:UrlEncode(player.Name)
        )
    end)

    dotsRunning = false
    verifying = false
    submitBtn.Text = "Submit"

    if not ok then
        setStatus("Couldn't reach the server. Try again.", COL_RED)
        shakeCard()
        return
    end

    local decodeOk, result = pcall(function() return HttpService:JSONDecode(response) end)
    if not decodeOk or type(result) ~= "table" then
        setStatus("Bad response from server.", COL_RED)
        shakeCard()
        return
    end

    if not result.ok then
        setStatus(tostring(result.message or "Invalid key."), COL_RED)
        shakeCard()
        return
    end

    setStatus("Key verified!", COL_GREEN)
    submitBtn.Text = "Success"
    submitBtn.BackgroundColor3 = COL_GREEN
    badgeGradient.Color = ColorSequence.new(COL_GREEN, COL_CYAN)
    TweenService:Create(uiScale, TweenInfo.new(0.15, EASE_OUT), { Scale = 1.04 }):Play()
    task.wait(0.15)
    TweenService:Create(uiScale, TweenInfo.new(0.25, EASE_OUT), { Scale = 0.9 }):Play()
    TweenService:Create(card, TweenInfo.new(0.25, EASE_OUT), { BackgroundTransparency = 1 }):Play()
    TweenService:Create(cardStroke, TweenInfo.new(0.25, EASE_OUT), { Transparency = 1 }):Play()
    TweenService:Create(overlay, TweenInfo.new(0.3, EASE_OUT), { BackgroundTransparency = 1 }):Play()
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
