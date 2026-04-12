// Content script – detects Pluto notebooks and injects the Vim mode engine.
// Runs in an isolated world; the actual Vim logic lives in vim-mode.js which
// is injected into the page context so it can access CodeMirror EditorView
// instances on the DOM.

(function () {
  'use strict';

  function isPlutoPage() {
    return document.querySelector('pluto-notebook') !== null ||
           document.querySelector('pluto-editor') !== null;
  }

  function injectVimMode() {
    if (document.getElementById('pluto-vim-mode-script')) return;
    const script = document.createElement('script');
    script.id = 'pluto-vim-mode-script';
    script.src = chrome.runtime.getURL('vim-mode.js');
    (document.head || document.documentElement).appendChild(script);
  }

  function removeVimMode() {
    // Tell the page-level script to tear down
    window.dispatchEvent(new CustomEvent('pluto-vim-disable'));
  }

  function enableVimMode() {
    window.dispatchEvent(new CustomEvent('pluto-vim-enable'));
  }

  // Listen for state changes from the background worker / popup
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'vimStateChanged') {
      if (msg.enabled) {
        injectVimMode();
        enableVimMode();
      } else {
        removeVimMode();
      }
    }
  });

  // Wait for Pluto to finish rendering, then inject if enabled
  function boot() {
    if (!isPlutoPage()) return;

    chrome.runtime.sendMessage({ type: 'getState' }, (res) => {
      if (chrome.runtime.lastError) return;
      if (res && res.enabled) {
        injectVimMode();
      }
    });
  }

  // Pluto can take a moment to build the DOM – poll briefly, then rely on
  // MutationObserver for late-loading pages.
  if (document.readyState === 'complete') {
    boot();
  } else {
    window.addEventListener('load', boot);
  }

  // Fallback observer: if Pluto loads asynchronously, detect it appearing
  const observer = new MutationObserver(() => {
    if (isPlutoPage()) {
      observer.disconnect();
      boot();
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
