# Chrome Web Store listing copy

All fields the dashboard asks for, ready to paste.

---

## Name

Vim Keybindings for Pluto

## Summary (max 132 chars)

Vim-style keybindings for Julia's Pluto notebooks — motions, operators, visual mode, and cell-level navigation.

## Category

Developer Tools

## Language

English (en)

---

## Detailed description

Adds Vim-style modal editing to the CodeMirror cells in Julia's Pluto notebook (https://plutojl.org/). Works on any Pluto notebook served from localhost.

### Inside a cell
- Modes: Normal, Insert, Visual, Visual Line, Command, Replace
- Motions: h j k l, w b e, 0 ^ $, gg G, f F t T + ;, counts (5j, 3w, …)
- Operators: d, c, y combined with motions; dd cc yy; D C Y; x
- Insert entry: i I a A o O
- Visual: v, V
- Paste: p P (unnamed register)
- Undo: u (delegates to CodeMirror history)
- Search: /pattern, n, N
- Ex commands: :w (run cell), :<number> (goto line), :s/foo/bar/[g]

### Cell (notebook) mode
Press Esc from a clean Normal mode to leave the cell. The active cell is outlined and the mode badge turns orange.

- j / k (or arrow keys): next / previous cell
- gg / G: first / last cell
- Enter or i: re-focus the current cell
- yy, p / P: yank cell source and paste into a new cell
- o / O: insert cell below / above (uses Pluto's own buttons)
- dd: delete cell

### Notes

- The extension only activates on pages served from localhost (http://localhost:*, http://127.0.0.1:*, https://localhost:*), because that's where Pluto runs.
- No data leaves your browser. The only thing the extension stores is an on/off flag in chrome.storage.local.
- Source code: https://github.com/simoneSantoni/vim-kb-for-pluto
- Based on the public-domain Vim icon by Yuri Samoilov (https://commons.wikimedia.org/wiki/File:Icon-Vim.svg), recolored with the Julia brand palette from https://github.com/JuliaLang/julia-logo-graphics.

---

## Single-purpose description

This extension has one purpose: adding Vim-style keybindings to the cell editors in Julia's Pluto notebook when the notebook is served from localhost.

---

## Permission justifications

### storage
Used to remember whether Vim mode is enabled or disabled across sessions. A single boolean flag is stored via chrome.storage.local. Nothing else is persisted.

### Host permissions (http://localhost:*/*, http://127.0.0.1:*/*, https://localhost:*/*)
Pluto runs as a local Julia server on localhost. These match patterns are required to inject the Vim engine into Pluto's notebook pages. The extension does not request access to any remote host.

---

## Privacy practices

- **User data collected:** none.
- **Personal/sensitive data:** none.
- **Remote code:** none — all scripts ship in the package.
- **Data use disclosure:** does not sell, transfer, or share user data.
- **Privacy policy URL:** https://github.com/simoneSantoni/vim-kb-for-pluto/blob/main/store/PRIVACY.md

---

## Assets checklist

- `store/promo-tile-440x280.png` — small promo tile
- `icons/icon128.png` — store icon (reused from the extension)
- Screenshots (1280×800 or 640×400, at least one required): **TODO — capture from a live Pluto notebook.** Suggested shots:
  1. A Pluto cell in Normal mode with the bottom-left `-- NORMAL --` badge visible.
  2. Insert mode mid-typing (green badge).
  3. Notebook mode with an active cell outlined (orange badge).
  4. The toolbar popup showing the on/off toggle.

---

## Support

- Issues / bug reports: https://github.com/simoneSantoni/vim-kb-for-pluto/issues
- Support email: fill in before submission.
