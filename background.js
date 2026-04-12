// Service worker for Vim Keybindings for Pluto
// Manages the enabled/disabled state and communicates with content scripts.

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ vimEnabled: true });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'getState') {
    chrome.storage.local.get('vimEnabled', (result) => {
      sendResponse({ enabled: result.vimEnabled !== false });
    });
    return true; // async response
  }

  if (message.type === 'setState') {
    chrome.storage.local.set({ vimEnabled: message.enabled }, () => {
      // Broadcast to all tabs so active Pluto pages update immediately
      chrome.tabs.query({}, (tabs) => {
        for (const tab of tabs) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'vimStateChanged',
            enabled: message.enabled,
          }).catch(() => {});
        }
      });
      sendResponse({ enabled: message.enabled });
    });
    return true;
  }
});
