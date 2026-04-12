// vim-mode.js — page-world Vim engine for Pluto's CodeMirror 6 cells.
//
// Runs in the page (not the isolated content-script world) so it can reach
// CodeMirror EditorView instances. It hooks keydown in the capture phase on
// `.cm-content` elements, maintains per-editor state, and dispatches edits
// through CM6's `view.dispatch({ changes, selection })` API when available,
// with a DOM/execCommand fallback when it isn't.

(function () {
  'use strict';

  if (window.__plutoVimLoaded) return;
  window.__plutoVimLoaded = true;

  // ---------- Modes ----------
  const MODE = {
    NORMAL: 'NORMAL',
    INSERT: 'INSERT',
    VISUAL: 'VISUAL',
    VISUAL_LINE: 'VISUAL_LINE',
    COMMAND: 'COMMAND',
    REPLACE: 'REPLACE',
  };

  // ---------- Per-editor state ----------
  const editorStates = new WeakMap();

  function getState(editor) {
    let s = editorStates.get(editor);
    if (!s) {
      s = {
        mode: MODE.NORMAL,
        pendingOp: null,     // 'd' | 'c' | 'y' | null
        pendingCount: '',    // digits accumulated, e.g. "12"
        pendingG: false,     // saw first 'g' of 'gg'
        pendingFind: null,   // { op: 'f'|'F'|'t'|'T' }
        lastFind: null,      // repeat with ; ,
        visualAnchor: null,  // anchor offset when entering visual
        registers: { '"': '' },
        searchLast: '',
      };
      editorStates.set(editor, s);
    }
    return s;
  }

  // ---------- CM6 view discovery ----------
  // CM6 doesn't expose a public way to get EditorView from DOM, but the
  // `.cm-content` element has a property path that holds it in practice. We
  // probe a few known spots and fall back gracefully.
  function getView(editorEl) {
    if (!editorEl) return null;
    if (editorEl.__plutoVimView) return editorEl.__plutoVimView;
    // Walk from cm-editor → children to find a node exposing cmView / view
    const nodes = [editorEl, ...editorEl.querySelectorAll('*')];
    for (const n of nodes) {
      if (n.cmView && n.cmView.view) {
        editorEl.__plutoVimView = n.cmView.view;
        return n.cmView.view;
      }
    }
    return null;
  }

  // ---------- Text access helpers ----------
  // All helpers take the cm-editor element; they use the CM6 view when
  // present, else fall back to Selection/execCommand on .cm-content.
  function getDoc(editorEl) {
    const view = getView(editorEl);
    if (view) return view.state.doc;
    return null;
  }

  function getCursor(editorEl) {
    const view = getView(editorEl);
    if (view) return view.state.selection.main.head;
    return 0;
  }

  function getSelRange(editorEl) {
    const view = getView(editorEl);
    if (view) {
      const s = view.state.selection.main;
      return { from: Math.min(s.anchor, s.head), to: Math.max(s.anchor, s.head) };
    }
    return { from: 0, to: 0 };
  }

  function setCursor(editorEl, pos) {
    const view = getView(editorEl);
    if (!view) return;
    const len = view.state.doc.length;
    const clamped = Math.max(0, Math.min(len, pos));
    view.dispatch({ selection: { anchor: clamped } });
  }

  function setSelection(editorEl, anchor, head) {
    const view = getView(editorEl);
    if (!view) return;
    const len = view.state.doc.length;
    view.dispatch({
      selection: {
        anchor: Math.max(0, Math.min(len, anchor)),
        head: Math.max(0, Math.min(len, head)),
      },
    });
  }

  function replaceRange(editorEl, from, to, insert) {
    const view = getView(editorEl);
    if (!view) return;
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + insert.length },
    });
  }

  function docLine(editorEl, pos) {
    const doc = getDoc(editorEl);
    if (!doc) return null;
    return doc.lineAt(pos);
  }

  // ---------- Motions: return a new cursor offset ----------
  function motionLeft(editorEl, pos, count) {
    const line = docLine(editorEl, pos);
    return Math.max(line.from, pos - count);
  }

  function motionRight(editorEl, pos, count) {
    const line = docLine(editorEl, pos);
    return Math.min(line.to, pos + count);
  }

  function motionUp(editorEl, pos, count) {
    const doc = getDoc(editorEl);
    const line = doc.lineAt(pos);
    const col = pos - line.from;
    const targetNo = Math.max(1, line.number - count);
    const target = doc.line(targetNo);
    return target.from + Math.min(col, target.length);
  }

  function motionDown(editorEl, pos, count) {
    const doc = getDoc(editorEl);
    const line = doc.lineAt(pos);
    const col = pos - line.from;
    const targetNo = Math.min(doc.lines, line.number + count);
    const target = doc.line(targetNo);
    return target.from + Math.min(col, target.length);
  }

  function motionLineStart(editorEl, pos) {
    return docLine(editorEl, pos).from;
  }
  function motionLineFirstNonBlank(editorEl, pos) {
    const line = docLine(editorEl, pos);
    const m = line.text.match(/^\s*/);
    return line.from + (m ? m[0].length : 0);
  }
  function motionLineEnd(editorEl, pos) {
    return docLine(editorEl, pos).to;
  }

  function motionDocStart() { return 0; }
  function motionDocEnd(editorEl) { return getDoc(editorEl).length; }
  function motionGotoLine(editorEl, lineNo) {
    const doc = getDoc(editorEl);
    const n = Math.max(1, Math.min(doc.lines, lineNo));
    return doc.line(n).from;
  }

  const WORD_RE = /[A-Za-z0-9_]/;
  function charClass(c) {
    if (!c || c === '\n') return 'nl';
    if (/\s/.test(c)) return 'ws';
    if (WORD_RE.test(c)) return 'w';
    return 'p';
  }

  function motionWordForward(editorEl, pos, count) {
    const doc = getDoc(editorEl);
    const text = doc.toString();
    let p = pos;
    for (let i = 0; i < count; i++) {
      const startClass = charClass(text[p]);
      while (p < text.length && charClass(text[p]) === startClass && startClass !== 'ws') p++;
      while (p < text.length && /\s/.test(text[p])) p++;
    }
    return p;
  }

  function motionWordBackward(editorEl, pos, count) {
    const doc = getDoc(editorEl);
    const text = doc.toString();
    let p = pos;
    for (let i = 0; i < count; i++) {
      if (p > 0) p--;
      while (p > 0 && /\s/.test(text[p])) p--;
      const endClass = charClass(text[p]);
      while (p > 0 && charClass(text[p - 1]) === endClass) p--;
    }
    return p;
  }

  function motionWordEnd(editorEl, pos, count) {
    const doc = getDoc(editorEl);
    const text = doc.toString();
    let p = pos;
    for (let i = 0; i < count; i++) {
      if (p < text.length) p++;
      while (p < text.length && /\s/.test(text[p])) p++;
      const startClass = charClass(text[p]);
      while (p < text.length - 1 && charClass(text[p + 1]) === startClass) p++;
    }
    return p;
  }

  function motionFindChar(editorEl, pos, ch, op, count) {
    const doc = getDoc(editorEl);
    const line = doc.lineAt(pos);
    const text = line.text;
    const colStart = pos - line.from;
    const forward = (op === 'f' || op === 't');
    let col = colStart;
    for (let i = 0; i < count; i++) {
      if (forward) {
        col = text.indexOf(ch, col + 1);
        if (col === -1) return pos;
      } else {
        col = text.lastIndexOf(ch, col - 1);
        if (col === -1) return pos;
      }
    }
    if (op === 't') col -= 1;
    else if (op === 'T') col += 1;
    return line.from + col;
  }

  // ---------- UI: mode indicator and editor classes ----------
  let indicatorEl = null;
  function ensureIndicator() {
    if (indicatorEl) return indicatorEl;
    indicatorEl = document.createElement('div');
    indicatorEl.className = 'pluto-vim-mode-indicator';
    indicatorEl.dataset.mode = MODE.NORMAL;
    indicatorEl.textContent = '-- NORMAL --';
    document.body.appendChild(indicatorEl);
    return indicatorEl;
  }

  function updateUI(editorEl, state) {
    const el = ensureIndicator();
    el.dataset.mode = state.mode;
    el.textContent = `-- ${state.mode.replace('_', ' ')} --`;

    editorEl.classList.add('pluto-vim-active');
    editorEl.classList.remove('vim-insert', 'vim-normal', 'vim-visual', 'vim-visual-line', 'vim-replace');
    const cls = {
      NORMAL: 'vim-normal',
      INSERT: 'vim-insert',
      VISUAL: 'vim-visual',
      VISUAL_LINE: 'vim-visual-line',
      COMMAND: 'vim-normal',
      REPLACE: 'vim-replace',
    }[state.mode];
    if (cls) editorEl.classList.add(cls);
  }

  function setMode(editorEl, state, mode) {
    state.mode = mode;
    if (mode !== MODE.VISUAL && mode !== MODE.VISUAL_LINE) state.visualAnchor = null;
    updateUI(editorEl, state);
  }

  // ---------- Operators ----------
  function resolveMotion(editorEl, state, key, count) {
    const pos = getCursor(editorEl);
    switch (key) {
      case 'h': return motionLeft(editorEl, pos, count);
      case 'l': return motionRight(editorEl, pos, count);
      case 'j': return motionDown(editorEl, pos, count);
      case 'k': return motionUp(editorEl, pos, count);
      case '0': return motionLineStart(editorEl, pos);
      case '^': return motionLineFirstNonBlank(editorEl, pos);
      case '$': return motionLineEnd(editorEl, pos);
      case 'w': return motionWordForward(editorEl, pos, count);
      case 'b': return motionWordBackward(editorEl, pos, count);
      case 'e': return motionWordEnd(editorEl, pos, count);
      case 'G': return motionDocEnd(editorEl);
      case 'gg': return motionDocStart();
      default: return null;
    }
  }

  function applyOperator(editorEl, state, op, from, to, linewise) {
    const doc = getDoc(editorEl);
    if (!doc) return;
    let a = Math.min(from, to);
    let b = Math.max(from, to);
    if (linewise) {
      const la = doc.lineAt(a);
      const lb = doc.lineAt(b);
      a = la.from;
      b = Math.min(doc.length, lb.to + 1); // include trailing newline
    }
    const text = doc.sliceString(a, b);
    state.registers['"'] = text;

    if (op === 'y') {
      setCursor(editorEl, from);
      return;
    }
    replaceRange(editorEl, a, b, '');
    if (op === 'c') setMode(editorEl, state, MODE.INSERT);
  }

  // ---------- Command mode (:...) ----------
  let cmdlineEl = null;
  function openCmdline(editorEl, state, prefix) {
    closeCmdline();
    cmdlineEl = document.createElement('div');
    cmdlineEl.className = 'pluto-vim-cmdline';
    const pre = document.createElement('span');
    pre.className = 'pluto-vim-cmdline-prefix';
    pre.textContent = prefix;
    const inp = document.createElement('input');
    inp.className = 'pluto-vim-cmdline-input';
    inp.type = 'text';
    cmdlineEl.appendChild(pre);
    cmdlineEl.appendChild(inp);
    document.body.appendChild(cmdlineEl);
    inp.focus();
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeCmdline();
        setMode(editorEl, state, MODE.NORMAL);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const value = inp.value;
        closeCmdline();
        if (prefix === ':') runExCommand(editorEl, state, value);
        else if (prefix === '/') runSearch(editorEl, state, value);
        setMode(editorEl, state, MODE.NORMAL);
      }
      e.stopPropagation();
    }, true);
  }

  function closeCmdline() {
    if (cmdlineEl && cmdlineEl.parentNode) cmdlineEl.parentNode.removeChild(cmdlineEl);
    cmdlineEl = null;
  }

  function runExCommand(editorEl, state, cmd) {
    cmd = cmd.trim();
    if (!cmd) return;
    if (cmd === 'w' || cmd === 'write') {
      // Pluto runs cells via Shift-Enter; dispatch that to the editor.
      const view = getView(editorEl);
      if (view) view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', shiftKey: true, bubbles: true, cancelable: true,
      }));
      return;
    }
    if (/^\d+$/.test(cmd)) {
      setCursor(editorEl, motionGotoLine(editorEl, parseInt(cmd, 10)));
      return;
    }
    // :s/foo/bar/ — substitute on current line
    const subM = cmd.match(/^s\/(.*?)\/(.*?)\/(g?)$/);
    if (subM) {
      const [, pat, repl, flags] = subM;
      const pos = getCursor(editorEl);
      const line = docLine(editorEl, pos);
      const re = new RegExp(pat, flags ? 'g' : '');
      const newText = line.text.replace(re, repl);
      replaceRange(editorEl, line.from, line.to, newText);
      return;
    }
  }

  function runSearch(editorEl, state, pattern) {
    if (!pattern) return;
    state.searchLast = pattern;
    jumpToSearch(editorEl, pattern, 1);
  }

  function jumpToSearch(editorEl, pattern, dir) {
    const doc = getDoc(editorEl);
    if (!doc) return;
    const text = doc.toString();
    const pos = getCursor(editorEl);
    let re;
    try { re = new RegExp(pattern, 'g'); } catch { return; }
    if (dir > 0) {
      re.lastIndex = pos + 1;
      const m = re.exec(text);
      if (m) setCursor(editorEl, m.index);
      else { re.lastIndex = 0; const m2 = re.exec(text); if (m2) setCursor(editorEl, m2.index); }
    } else {
      let last = -1;
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(text)) && m.index < pos) { last = m.index; if (m.index === re.lastIndex) re.lastIndex++; }
      if (last >= 0) setCursor(editorEl, last);
    }
  }

  // ---------- Key handler ----------
  function handleKey(editorEl, state, e) {
    // Let Insert mode pass through except for Escape.
    if (state.mode === MODE.INSERT) {
      if (e.key === 'Escape' || (e.ctrlKey && e.key === '[')) {
        e.preventDefault();
        e.stopPropagation();
        setMode(editorEl, state, MODE.NORMAL);
        const pos = getCursor(editorEl);
        const line = docLine(editorEl, pos);
        if (pos > line.from) setCursor(editorEl, pos - 1);
      }
      return;
    }

    if (state.mode === MODE.COMMAND) return; // handled by cmdline input

    // Pending f/F/t/T → consume the next printable char
    if (state.pendingFind) {
      if (e.key.length === 1) {
        e.preventDefault();
        e.stopPropagation();
        const { op, count } = state.pendingFind;
        const target = motionFindChar(editorEl, getCursor(editorEl), e.key, op, count);
        state.lastFind = { op, ch: e.key };
        if (state.pendingOp) {
          applyOperator(editorEl, state, state.pendingOp, getCursor(editorEl), target, false);
          state.pendingOp = null;
        } else {
          setCursor(editorEl, target);
        }
        state.pendingFind = null;
        state.pendingCount = '';
      } else if (e.key === 'Escape') {
        e.preventDefault();
        state.pendingFind = null;
      }
      return;
    }

    const key = e.key;

    // Count accumulation (but leading 0 in pendingCount == line start)
    if (/^[0-9]$/.test(key) && !(key === '0' && state.pendingCount === '')) {
      e.preventDefault();
      e.stopPropagation();
      state.pendingCount += key;
      return;
    }

    const count = state.pendingCount ? parseInt(state.pendingCount, 10) : 1;

    // Escape clears pending state
    if (key === 'Escape' || (e.ctrlKey && key === '[')) {
      e.preventDefault();
      e.stopPropagation();
      state.pendingOp = null;
      state.pendingCount = '';
      state.pendingG = false;
      if (state.mode === MODE.VISUAL || state.mode === MODE.VISUAL_LINE) {
        setMode(editorEl, state, MODE.NORMAL);
        setCursor(editorEl, getCursor(editorEl));
      }
      return;
    }

    // 'gg' handling
    if (state.pendingG) {
      state.pendingG = false;
      if (key === 'g') {
        e.preventDefault();
        e.stopPropagation();
        const target = state.pendingCount ? motionGotoLine(editorEl, count) : motionDocStart();
        if (state.pendingOp) {
          applyOperator(editorEl, state, state.pendingOp, getCursor(editorEl), target, true);
          state.pendingOp = null;
        } else {
          setCursor(editorEl, target);
        }
        state.pendingCount = '';
        return;
      }
    }
    if (key === 'g' && !state.pendingG) {
      e.preventDefault();
      e.stopPropagation();
      state.pendingG = true;
      return;
    }

    // f/F/t/T
    if (key === 'f' || key === 'F' || key === 't' || key === 'T') {
      e.preventDefault();
      e.stopPropagation();
      state.pendingFind = { op: key, count };
      return;
    }
    if (key === ';' && state.lastFind) {
      e.preventDefault();
      e.stopPropagation();
      setCursor(editorEl, motionFindChar(editorEl, getCursor(editorEl), state.lastFind.ch, state.lastFind.op, count));
      state.pendingCount = '';
      return;
    }

    // Operator-pending: dd / cc / yy
    if (state.pendingOp && key === state.pendingOp) {
      e.preventDefault();
      e.stopPropagation();
      const pos = getCursor(editorEl);
      const startLine = docLine(editorEl, pos);
      const endLineNo = Math.min(getDoc(editorEl).lines, startLine.number + count - 1);
      const endLine = getDoc(editorEl).line(endLineNo);
      applyOperator(editorEl, state, state.pendingOp, startLine.from, endLine.to, true);
      state.pendingOp = null;
      state.pendingCount = '';
      return;
    }

    // Motion that might be consumed by a pending operator
    const motionTarget = resolveMotion(editorEl, state, key, count);
    if (motionTarget !== null) {
      e.preventDefault();
      e.stopPropagation();
      if (state.pendingOp) {
        applyOperator(editorEl, state, state.pendingOp, getCursor(editorEl), motionTarget, false);
        state.pendingOp = null;
      } else if (state.mode === MODE.VISUAL || state.mode === MODE.VISUAL_LINE) {
        setSelection(editorEl, state.visualAnchor, motionTarget);
      } else {
        setCursor(editorEl, motionTarget);
      }
      state.pendingCount = '';
      return;
    }

    // Mode changes / commands
    switch (key) {
      case 'i':
        e.preventDefault(); e.stopPropagation();
        setMode(editorEl, state, MODE.INSERT);
        return;
      case 'I':
        e.preventDefault(); e.stopPropagation();
        setCursor(editorEl, motionLineFirstNonBlank(editorEl, getCursor(editorEl)));
        setMode(editorEl, state, MODE.INSERT);
        return;
      case 'a':
        e.preventDefault(); e.stopPropagation();
        setCursor(editorEl, motionRight(editorEl, getCursor(editorEl), 1));
        setMode(editorEl, state, MODE.INSERT);
        return;
      case 'A':
        e.preventDefault(); e.stopPropagation();
        setCursor(editorEl, motionLineEnd(editorEl, getCursor(editorEl)));
        setMode(editorEl, state, MODE.INSERT);
        return;
      case 'o': {
        e.preventDefault(); e.stopPropagation();
        const end = motionLineEnd(editorEl, getCursor(editorEl));
        replaceRange(editorEl, end, end, '\n');
        setMode(editorEl, state, MODE.INSERT);
        return;
      }
      case 'O': {
        e.preventDefault(); e.stopPropagation();
        const start = motionLineStart(editorEl, getCursor(editorEl));
        replaceRange(editorEl, start, start, '\n');
        setCursor(editorEl, start);
        setMode(editorEl, state, MODE.INSERT);
        return;
      }
      case 'x': {
        e.preventDefault(); e.stopPropagation();
        const pos = getCursor(editorEl);
        const end = Math.min(motionLineEnd(editorEl, pos), pos + count);
        state.registers['"'] = getDoc(editorEl).sliceString(pos, end);
        replaceRange(editorEl, pos, end, '');
        return;
      }
      case 'D': {
        e.preventDefault(); e.stopPropagation();
        const pos = getCursor(editorEl);
        applyOperator(editorEl, state, 'd', pos, motionLineEnd(editorEl, pos), false);
        return;
      }
      case 'C': {
        e.preventDefault(); e.stopPropagation();
        const pos = getCursor(editorEl);
        applyOperator(editorEl, state, 'c', pos, motionLineEnd(editorEl, pos), false);
        return;
      }
      case 'Y': {
        e.preventDefault(); e.stopPropagation();
        const line = docLine(editorEl, getCursor(editorEl));
        state.registers['"'] = line.text + '\n';
        return;
      }
      case 'd':
      case 'c':
      case 'y':
        e.preventDefault(); e.stopPropagation();
        if (state.mode === MODE.VISUAL || state.mode === MODE.VISUAL_LINE) {
          const { from, to } = getSelRange(editorEl);
          applyOperator(editorEl, state, key, from, to, state.mode === MODE.VISUAL_LINE);
          setMode(editorEl, state, key === 'c' ? MODE.INSERT : MODE.NORMAL);
        } else {
          state.pendingOp = key;
        }
        return;
      case 'p': {
        e.preventDefault(); e.stopPropagation();
        const text = state.registers['"'] || '';
        const pos = getCursor(editorEl);
        if (text.endsWith('\n')) {
          const end = motionLineEnd(editorEl, pos);
          replaceRange(editorEl, end, end, '\n' + text.slice(0, -1));
        } else {
          replaceRange(editorEl, pos + 1, pos + 1, text);
        }
        return;
      }
      case 'P': {
        e.preventDefault(); e.stopPropagation();
        const text = state.registers['"'] || '';
        const pos = getCursor(editorEl);
        if (text.endsWith('\n')) {
          const start = motionLineStart(editorEl, pos);
          replaceRange(editorEl, start, start, text);
        } else {
          replaceRange(editorEl, pos, pos, text);
        }
        return;
      }
      case 'u': {
        e.preventDefault(); e.stopPropagation();
        const view = getView(editorEl);
        if (view) view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'z', code: 'KeyZ', ctrlKey: true, bubbles: true, cancelable: true,
        }));
        return;
      }
      case 'v':
        e.preventDefault(); e.stopPropagation();
        state.visualAnchor = getCursor(editorEl);
        setMode(editorEl, state, MODE.VISUAL);
        return;
      case 'V': {
        e.preventDefault(); e.stopPropagation();
        const line = docLine(editorEl, getCursor(editorEl));
        state.visualAnchor = line.from;
        setSelection(editorEl, line.from, line.to);
        setMode(editorEl, state, MODE.VISUAL_LINE);
        return;
      }
      case ':':
        e.preventDefault(); e.stopPropagation();
        setMode(editorEl, state, MODE.COMMAND);
        openCmdline(editorEl, state, ':');
        return;
      case '/':
        e.preventDefault(); e.stopPropagation();
        setMode(editorEl, state, MODE.COMMAND);
        openCmdline(editorEl, state, '/');
        return;
      case 'n':
        e.preventDefault(); e.stopPropagation();
        if (state.searchLast) jumpToSearch(editorEl, state.searchLast, 1);
        return;
      case 'N':
        e.preventDefault(); e.stopPropagation();
        if (state.searchLast) jumpToSearch(editorEl, state.searchLast, -1);
        return;
    }

    // Default: block other printable keys in NORMAL to prevent typing.
    if (state.mode === MODE.NORMAL && key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  // ---------- Attach / detach ----------
  const attached = new WeakSet();
  const keydownListeners = new WeakMap();

  function attach(editorEl) {
    if (attached.has(editorEl)) return;
    attached.add(editorEl);
    const state = getState(editorEl);
    updateUI(editorEl, state);
    const listener = (e) => handleKey(editorEl, state, e);
    const content = editorEl.querySelector('.cm-content') || editorEl;
    content.addEventListener('keydown', listener, true);
    keydownListeners.set(editorEl, { listener, content });
  }

  function detach(editorEl) {
    const rec = keydownListeners.get(editorEl);
    if (rec) rec.content.removeEventListener('keydown', rec.listener, true);
    keydownListeners.delete(editorEl);
    attached.delete(editorEl);
    editorEl.classList.remove('pluto-vim-active', 'vim-normal', 'vim-insert', 'vim-visual', 'vim-visual-line', 'vim-replace');
  }

  function attachAll() {
    document.querySelectorAll('.cm-editor').forEach(attach);
  }

  function detachAll() {
    document.querySelectorAll('.cm-editor').forEach(detach);
    if (indicatorEl && indicatorEl.parentNode) indicatorEl.parentNode.removeChild(indicatorEl);
    indicatorEl = null;
    closeCmdline();
  }

  // ---------- Enable/disable lifecycle ----------
  let enabled = false;
  let observer = null;

  function enable() {
    if (enabled) return;
    enabled = true;
    attachAll();
    observer = new MutationObserver(() => attachAll());
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function disable() {
    if (!enabled) return;
    enabled = false;
    if (observer) { observer.disconnect(); observer = null; }
    detachAll();
  }

  window.addEventListener('pluto-vim-enable', enable);
  window.addEventListener('pluto-vim-disable', disable);

  // Auto-enable on load — content.js only injects when state is enabled.
  enable();
})();
