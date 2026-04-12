# vim-kb-for-pluto

Chrome extension bringing Vim key bindings to Julia's [Pluto](https://plutojl.org/) notebook editor.

## Install (unpacked)

1. Clone this repo.
2. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the repo root.
3. Open a Pluto notebook at `http://localhost:*`, `http://127.0.0.1:*`, or `https://localhost:*`. A `-- NORMAL --` badge appears when Vim mode is active.
4. Toggle on/off from the extension popup (reload the Pluto tab after toggling).

## Supported bindings

### Cell (Notebook) mode

Press `Esc` from a clean Normal mode (no pending operator/count) to leave the cell and enter Notebook mode. The active cell is outlined and the badge switches to `NOTEBOOK`.

- `j` / `k` — next / previous cell (arrow keys also work)
- `gg` / `G` — first / last cell
- `Enter` or `i` — focus the current cell (return to Normal mode inside it)
- `yy` — yank the current cell's source
- `p` / `P` — paste the yanked source into a new cell below / above
- `o` / `O` — insert a new cell below / above (best-effort via Pluto's buttons)
- `dd` — delete the current cell (best-effort)
- `Esc` — stays in Notebook mode

### Inside a cell

- **Modes:** Normal, Insert, Visual, Visual Line, Command, Replace.
- **Motions:** `h j k l`, `w b e`, `0 ^ $`, `gg G`, `f F t T` + `;`, counts (`5j`, `3w`, ...).
- **Operators:** `d`, `c`, `y` combined with motions; `dd cc yy`; `D C Y`; `x`.
- **Insert entry:** `i I a A o O`.
- **Visual:** `v`, `V`.
- **Paste:** `p P` (uses the unnamed register).
- **Undo:** `u` (delegates to CodeMirror's history).
- **Search:** `/pattern`, `n`, `N`.
- **Ex commands:** `:w` (runs the cell via Shift-Enter), `:<number>` (goto line), `:s/foo/bar/[g]`.

## Architecture

See `CLAUDE.md` for a short tour of the three execution contexts (service worker, isolated content script, page-world engine) and how state flows between them.

## License

MIT — see `LICENSE`.
