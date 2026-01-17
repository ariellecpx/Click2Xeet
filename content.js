console.log("Click2Xeet: Content script loaded");

const GE_ICON_HTML = `
<div style="width: 20px; height: 20px; background: linear-gradient(135deg, #1d9bf0, #8ecdf8); border-radius: 6px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(29, 155, 240, 0.3);">
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
  </svg>
</div>
`;// Branding: Spinner SVG
const LOADING_ICON_HTML = `
<div style="width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;">
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1d9bf0" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;">
    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
  </svg>
</div>
<style>
@keyframes spin { 100% { transform: rotate(360deg); } }
</style>
`;

function injectButton() {
    // X uses data-testid="toolBar" for the icon list (image, gif, poll, etc.)
    const toolbars = document.querySelectorAll('[data-testid="toolBar"]');

    if (toolbars.length === 0) {
        // Fallback: look for the compose area if toolbar isn't ready
        return;
    }

    toolbars.forEach(toolbar => {
        // Check if we already injected
        if (toolbar.querySelector('.click2xeet-btn')) return;

        console.log("Click2Xeet: Found toolbar, injecting button...");

        // Create container for our button
        const btnContainer = document.createElement('div');
        btnContainer.className = 'click2xeet-btn';
        btnContainer.setAttribute('role', 'button');
        btnContainer.setAttribute('tabindex', '0');
        btnContainer.title = "Click2Xeet: Generate AI Reply";

        // Style to match X icons
        btnContainer.style.cursor = 'pointer';
        btnContainer.style.padding = '8px';
        btnContainer.style.borderRadius = '999px';
        btnContainer.style.display = 'flex';
        btnContainer.style.alignItems = 'center';
        btnContainer.style.justifyContent = 'center';
        btnContainer.style.transition = 'background-color 0.2s';
        btnContainer.style.marginLeft = '4px';

        btnContainer.onmouseover = () => btnContainer.style.backgroundColor = 'rgba(29, 155, 240, 0.1)';
        btnContainer.onmouseout = () => btnContainer.style.backgroundColor = 'transparent';

        // Add icon
        btnContainer.innerHTML = GE_ICON_HTML;

        // X's toolbar is a flex container. We can insert it at the end of the first child (the icons group)
        const iconGroup = toolbar.querySelector('div'); // Usually the first div contains the icons
        if (iconGroup) {
            iconGroup.appendChild(btnContainer);
        } else {
            toolbar.appendChild(btnContainer);
        }

        // Click Handler
        btnContainer.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            console.log("Click2Xeet: Button clicked!");

            // 1. Find the tweet text context
            const tweetText = scrapeTweetContext(btnContainer);
            if (!tweetText) {
                console.warn("Click2Xeet: Could not find tweet context.");
                // We'll try to proceed with a generic "Reply to this" if possible, but context is better.
            }

            // 2. Visual feedback (Loading Spinner)
            const originalHTML = btnContainer.innerHTML;
            btnContainer.innerHTML = LOADING_ICON_HTML;
            btnContainer.style.pointerEvents = 'none'; // Prevent double clicks

            // 3. Request reply from background
            const timeoutId = setTimeout(() => {
                // Safety valve: reset if took too long
                if (btnContainer.innerHTML.includes('<svg')) return; // Already finished
                console.warn("Click2Xeet: Request timed out.");
                btnContainer.innerHTML = originalHTML;
                btnContainer.style.pointerEvents = 'auto';
                alert("Request timed out. Please check your internet connection or API key.");
            }, 15000); // 15 seconds

            chrome.runtime.sendMessage({
                action: 'GENERATE_REPLY',
                tweetText: tweetText || "a tweet (context missing)"
            }, (response) => {
                clearTimeout(timeoutId);
                console.log("Click2Xeet: Received response from background:", response);

                btnContainer.innerHTML = originalHTML;
                btnContainer.style.pointerEvents = 'auto'; // Re-enable clicks

                if (response && response.reply) {
                    console.log("Click2Xeet: AI generated a reply!");
                    pasteTextToEditor(btnContainer, response.reply);
                } else if (response && response.error) {
                    console.error("Click2Xeet Error:", response.error);
                    alert("Click2Xeet Error: " + response.error);
                } else {
                    // Fallback for empty/weird response
                    console.warn("Click2Xeet: Empty response received.");
                }
            });
        });
    });
}

function scrapeTweetContext(clickedElement) {
    // Logic: Look for the tweet text above the current reply box.

    // If in a modal:
    const modal = clickedElement.closest('[aria-modal="true"]');
    if (modal) {
        const texts = modal.querySelectorAll('[data-testid="tweetText"]');
        if (texts.length > 0) return texts[texts.length - 1].innerText;
    }

    // If inline in feed:
    const cell = clickedElement.closest('[data-testid="cellInnerDiv"]');
    if (cell) {
        // Search previous siblings for a tweet
        let prev = cell.previousElementSibling;
        while (prev) {
            const tweetText = prev.querySelector('[data-testid="tweetText"]');
            if (tweetText) return tweetText.innerText;
            prev = prev.previousElementSibling;
        }
    }

    // Ultimate fallback: get the first visible tweet text on screen
    const firstTweet = document.querySelector('[data-testid="tweetText"]');
    return firstTweet ? firstTweet.innerText : null;
}

function pasteTextToEditor(clickedElement, text) {
    console.log("Click2Xeet: Copying reply to clipboard...");

    // Find the editor near the toolbar
    const toolbar = clickedElement.closest('[data-testid="toolBar"]');
    let editor = null;

    if (toolbar) {
        const container = toolbar.closest('.css-175oi2r');
        if (container) {
            editor = container.querySelector('[data-testid^="tweetTextarea_0"]');
        }
    }

    // Fallback: find any visible editor
    if (!editor) {
        const editors = document.querySelectorAll('[data-testid^="tweetTextarea_0"]');
        editor = Array.from(editors).find(e => e.offsetParent !== null);
    }

    // Copy to clipboard (guaranteed to work)
    navigator.clipboard.writeText(text).then(() => {
        console.log("Click2Xeet: Reply copied to clipboard!");

        // Focus the editor so user can immediately paste
        if (editor) {
            editor.focus();
        }

        // Show a quick toast-style notification
        showToast("Reply copied! Press Cmd+V to paste ✓");
    });
}

// Simple toast notification
function showToast(message) {
    const existing = document.getElementById('click2xeet-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'click2xeet-toast';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #1d9bf0, #0a66c2);
        color: white;
        padding: 12px 24px;
        border-radius: 20px;
        font-size: 14px;
        font-weight: 500;
        z-index: 999999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        animation: slideUp 0.3s ease;
    `;

    // Add animation keyframes
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideUp {
            from { opacity: 0; transform: translateX(-50%) translateY(20px); }
            to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
    `;
    document.head.appendChild(style);
    document.body.appendChild(toast);

    // Auto-remove after 3 seconds
    setTimeout(() => toast.remove(), 3000);
}

// Watch for changes (X is a Single Page App)
const observer = new MutationObserver(() => {
    injectButton();
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});

// Initial load
setTimeout(injectButton, 2000);
console.log("Click2Xeet: Observer active");

