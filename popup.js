document.addEventListener('DOMContentLoaded', () => {
  // Upgrade & Activate Logic
  const upgradeBtn = document.getElementById('upgradeInlineBtn');
  if (upgradeBtn) {
    upgradeBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://buy.stripe.com/9B63cu9lbc03elTa3W6EU0e' });
    });
  }

  const activateBtn = document.getElementById('activateBtn');
  if (activateBtn) {
    activateBtn.addEventListener('click', async () => {
      const email = prompt("Enter your purchase email to activate Pro:");
      if (!email || !email.includes("@")) {
        alert("Please enter a valid email address.");
        return;
      }

      activateBtn.textContent = "Verifying...";
      activateBtn.disabled = true;

      // TODO: User must replace this URL after deploying to Netlify
      // Example: https://your-site-name.netlify.app/.netlify/functions/verify-license
      const NETLIFY_FUNCTION_URL = "REPLACE_WITH_YOUR_NETLIFY_FUNCTION_URL";

      try {
        if (NETLIFY_FUNCTION_URL.includes("REPLACE_WITH")) {
          // Fallback for testing before deployment (remove this in production if desired)
          console.warn("Netlify function URL not set. Using fallback soft-check.");
          setTimeout(() => {
            chrome.storage.local.set({ isPremium: true });
            alert("Pro License Activated! (Dev Mode)");
            window.close();
          }, 1000);
          return;
        }

        const response = await fetch(NETLIFY_FUNCTION_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email })
        });

        const data = await response.json();

        if (response.ok && data.valid) {
          chrome.storage.local.set({ isPremium: true });
          alert("Pro License Activated! Thank you for your support.");
          window.close();
        } else {
          alert(data.message || "License not found. Please check your email or purchase a license.");
          activateBtn.textContent = "Activate";
          activateBtn.disabled = false;
        }
      } catch (e) {
        console.error("Verification error:", e);
        alert("Network error verifying license. Please try again.");
        activateBtn.textContent = "Activate";
        activateBtn.disabled = false;
      }
    });
  }

  // 1. Tab Switching Logic
  const tabs = document.querySelectorAll('.tab-btn');
  const contents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;

      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));

      tab.classList.add('active');
      document.getElementById(`tab-${target}`).classList.add('active');
    });
  });

  // 2. Load saved settings
  chrome.storage.local.get(['geminiApiKey', 'instructions', 'trainingData', 'replyMode', 'charLimit', 'useEmojis', 'autoCap', 'geminiModel', 'usageCount', 'isPremium'], (result) => {
    const usageCount = result.usageCount || 0;
    const isPremium = result.isPremium || false;

    const trialBanner = document.getElementById('trialBanner');
    const trialText = document.getElementById('trialText');

    if (!isPremium) {
      trialBanner.classList.remove('hidden');
      trialText.textContent = `Trial: ${usageCount}/25 replies used`;
    } else {
      trialBanner.classList.add('hidden');
    }

    if (result.geminiApiKey) document.getElementById('apiKey').value = result.geminiApiKey;
    if (result.instructions) document.getElementById('instructions').value = result.instructions;
    if (result.trainingData) {
      document.getElementById('trainingData').value = result.trainingData;
      updateTrainingCount();
    }
    if (result.replyMode) document.getElementById('replyMode').value = result.replyMode;
    if (result.geminiModel) document.getElementById('geminiModel').value = result.geminiModel;

    if (result.charLimit) {
      document.getElementById('charLimit').value = result.charLimit;
      document.getElementById('charLimitVal').textContent = result.charLimit;
    }
    if (result.useEmojis !== undefined) document.getElementById('useEmojis').checked = result.useEmojis;
    if (result.autoCap !== undefined) document.getElementById('autoCap').checked = result.autoCap;
  });

  // Handle character limit range update
  document.getElementById('charLimit').addEventListener('input', (e) => {
    document.getElementById('charLimitVal').textContent = e.target.value;
  });

  // Handle Training Data Counter
  const trainingArea = document.getElementById('trainingData');
  const trainingCount = document.getElementById('trainingCount');

  function updateTrainingCount() {
    trainingCount.textContent = `${trainingArea.value.length.toLocaleString()} / 100,000`;
  }

  trainingArea.addEventListener('input', updateTrainingCount);

  // 3. Save settings
  document.getElementById('saveBtn').addEventListener('click', () => {
    const geminiApiKey = document.getElementById('apiKey').value;
    const instructions = document.getElementById('instructions').value;
    const trainingData = document.getElementById('trainingData').value;
    const replyMode = document.getElementById('replyMode').value;
    const geminiModel = document.getElementById('geminiModel').value;
    const charLimit = document.getElementById('charLimit').value;
    const useEmojis = document.getElementById('useEmojis').checked;
    const autoCap = document.getElementById('autoCap').checked;

    chrome.storage.local.set({
      geminiApiKey,
      instructions,
      trainingData,
      replyMode,
      geminiModel,
      charLimit,
      useEmojis,
      autoCap
    }, () => {
      const status = document.getElementById('status');
      status.textContent = 'Settings synchronized';
      setTimeout(() => { status.textContent = ''; }, 2000);
    });
  });

  // 4. Test Lab Logic
  document.getElementById('testBtn').addEventListener('click', async () => {
    const testInput = document.getElementById('testInput').value;
    if (!testInput) return;

    const outputBox = document.getElementById('testResult');
    const outputText = document.getElementById('testOutputText');
    const testBtn = document.getElementById('testBtn');

    testBtn.textContent = 'Generating...';
    testBtn.disabled = true;

    chrome.runtime.sendMessage({
      action: 'GENERATE_REPLY',
      tweetText: testInput
    }, (response) => {
      testBtn.textContent = 'Generate Preview';
      testBtn.disabled = false;
      outputBox.classList.remove('hidden');

      if (response && response.reply) {
        outputText.textContent = response.reply;
      } else {
        outputText.textContent = "Error: " + (response.error || "Unknown error");
      }
    });
  });

});
