# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Chrome extension (Manifest V3) that adds Vim-style keybindings to Julia's Pluto notebook editor cells (which are CodeMirror 6 instances).

## Loading & testing the extension

No build step — this is plain JS/CSS loaded directly by Chrome.

- Load: `chrome://extensions` → Developer mode → "Load unpacked" → select this repo.
- Test against a running Pluto server at `http://localhost:*`, `http://127.0.0.1:*`, or `https://localhost:*` (see `manifest.json` match patterns).
- After editing `background.js`, `content.js`, `vim-mode.js`, or `manifest.json`, reload the extension on `chrome://extensions` and hard-reload the Pluto tab.

## Architecture

Three execution contexts — know which one your code runs in, because they have different capabilities:

1. **`background.js` (service worker)** — owns persisted state in `chrome.storage.local` under the `vimEnabled` key. Responds to `getState` / `setState` messages and broadcasts `vimStateChanged` to all tabs on change. This is the single source of truth for enabled/disabled.

2. **`content.js` (content script, isolated world)** — detects Pluto pages by looking for `<pluto-notebook>` or `<pluto-editor>` elements. Cannot touch page-world CodeMirror `EditorView` instances directly, so it injects `vim-mode.js` into the page context via a `<script>` tag and communicates with it using `CustomEvent`s on `window` (`pluto-vim-enable`, `pluto-vim-disable`). Uses a `MutationObserver` fallback because Pluto builds its DOM asynchronously after `load`.

3. **`vim-mode.js` (page world, not yet committed)** — listed in `web_accessible_resources` and is where the actual Vim engine must live, because only page-world scripts can reach CodeMirror 6 `EditorView` instances attached to Pluto's DOM. Must respond to the `pluto-vim-enable` / `pluto-vim-disable` window events. Expected to drive the UI hooks already defined in `content.css`: the `.pluto-vim-mode-indicator` badge (with `data-mode` attribute: `NORMAL` / `INSERT` / `VISUAL` / `VISUAL_LINE` / `COMMAND` / `REPLACE`), per-editor classes `pluto-vim-active` + `vim-{normal,insert,visual,visual-line,replace}`, the `.pluto-vim-cmdline` command bar, and `.pluto-vim-search-match` highlights.

Also referenced by `manifest.json` but not yet in the repo: `popup/popup.html` (toolbar popup — should talk to the background worker via `getState`/`setState`) and `icons/icon{16,32,48,128}.png`.

## State flow

Popup or background → `chrome.storage.local` → broadcast `vimStateChanged` to all tabs → `content.js` injects/enables or disables → dispatches window event → page-world `vim-mode.js` attaches to or detaches from CodeMirror views.
