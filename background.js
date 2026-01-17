chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        chrome.tabs.create({
            url: 'welcome.html'
        });
    }

    // Create Context Menu
    chrome.contextMenus.create({
        id: "click2xeet-rewrite",
        title: "Rewrite in my voice (Click2Xeet)",
        contexts: ["selection"]
    });
});

// Handle Context Menu click
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "click2xeet-rewrite") {
        chrome.tabs.sendMessage(tab.id, {
            action: "OPEN_REWRITE_MODAL",
            text: info.selectionText
        });
    }
});

// Message Handler - Only GENERATE_REPLY is used
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'GENERATE_REPLY') {
        generateReply(request.tweetText, sendResponse);
        return true;
    }
});

async function generateReply(tweetText, sendResponse) {
    try {
        // Get settings
        const data = await chrome.storage.local.get([
            'geminiApiKey', 'instructions', 'trainingData',
            'replyMode', 'charLimit', 'useEmojis', 'autoCap',
            'geminiModel', 'usageCount', 'isPremium'
        ]);

        const usageCount = data.usageCount || 0;
        const isPremium = data.isPremium || false;

        if (!isPremium && usageCount >= 25) {
            sendResponse({ error: 'Trial limit reached (25/25). Please upgrade to Click2Xeet Pro for lifetime access.' });
            return;
        }

        if (!data.geminiApiKey) {
            sendResponse({ error: 'Please set your Gemini API Key in the extension settings.' });
            return;
        }

        const apiKey = data.geminiApiKey;
        const model = data.geminiModel || "gemini-3-flash-preview";
        const customInstructions = data.instructions || "";
        const trainingData = data.trainingData || "";
        const mode = data.replyMode || "custom";
        const charLimit = parseInt(data.charLimit) || 280;
        const useEmojis = data.useEmojis !== false;
        const autoCap = data.autoCap !== false;

        // Mode logic
        let modeInstruction = "";
        if (mode === "funny") modeInstruction = "Be funny, witty, and slightly roasty if appropriate.";
        else if (mode === "brief") modeInstruction = "Keep it extremely short, under 5 words. Pure impact.";
        else if (mode === "agree") modeInstruction = "Agree with the tweet and add one insightful follow-up point.";
        else if (mode === "chaos") modeInstruction = "Be unpredictable, use slang, and maybe slightly confusing but high engagement.";
        else if (mode === "intellectual") modeInstruction = "Use sophisticated vocabulary (but keep it human) and provide a reasoned, detailed perspective.";

        // Construct the prompt
        const prompt = `
You are a social media assistant. Your goal is to reply to a tweet in the user's specific style.

USER'S PAST TWEETS (Learn the tone/style/rhythm from these):
${trainingData}

CONSTRAINTS:
- Target length: approximately ${charLimit} characters (absolute max ${charLimit}).
- EMOJIS: ${useEmojis ? "You may use emojis naturally." : "DO NOT USE ANY EMOJIS."}
- CAPITALIZATION: ${autoCap ? "Normal sentence casing." : "All lowercase, no exceptions."}

PRIMARY GOAL: 
${modeInstruction}
${customInstructions}

TASK:
Write a natural, high-quality reply to the following tweet. 
- Do not use hashtags unless the user history uses them.
- Do not use corporate speak.
- Maintain the user's typical punctuation style.
- Ensure the sentence is complete and not cut off.

Tweet to reply to: "${tweetText}"
Reply:`;

        // Call Gemini API with speed optimizations
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                generationConfig: {
                    maxOutputTokens: 1024, // Prevents cut-offs
                    temperature: 0.8
                }
            })
        });

        const result = await response.json();

        if (result.error) {
            sendResponse({ error: result.error.message || "API Error" });
        } else if (result.candidates && result.candidates[0].content) {
            const reply = result.candidates[0].content.parts[0].text;
            // Success: Increment usage
            if (!isPremium) {
                chrome.storage.local.set({ usageCount: usageCount + 1 });
            }
            sendResponse({ reply: reply.trim().replace(/^"|"$/g, '') }); // Remove surrounding quotes if model adds them
        } else {
            sendResponse({ error: "No response generated." });
        }

    } catch (err) {
        sendResponse({ error: err.message });
    }
}
