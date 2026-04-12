const checkbox = document.getElementById('enabled');

chrome.runtime.sendMessage({ type: 'getState' }, (res) => {
  checkbox.checked = !!(res && res.enabled);
});

checkbox.addEventListener('change', () => {
  chrome.runtime.sendMessage({ type: 'setState', enabled: checkbox.checked });
});
