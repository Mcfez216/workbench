// Breakpoints in the editor's margin, and the line the debugger is paused
// on. Click left of a line number (or Ctrl+F8 on a line) to add or remove a
// breakpoint: a red dot. Breakpoints move with the text as you edit above
// them. The paused line is a yellow arrow with the line highlighted.
//
// No other app modules here: editor.js puts the extension in every file's
// editor, and debugger.js listens for changes.

import { StateField, StateEffect, RangeSet } from '@codemirror/state';
import { EditorView, gutter, GutterMarker, Decoration } from '@codemirror/view';

const toggle = StateEffect.define();          // { pos }
const replace = StateEffect.define();         // [line numbers]
const exec = StateEffect.define();            // line number, or null

class Dot extends GutterMarker {
  toDOM() { const d = document.createElement('span'); d.className = 'cm-bp-dot'; d.textContent = '●'; d.title = 'Breakpoint (click to remove)'; return d; }
}
class Arrow extends GutterMarker {
  toDOM() { const d = document.createElement('span'); d.className = 'cm-exec-arrow'; d.textContent = '▶'; d.title = 'The debugger is paused here'; return d; }
}
class Spacer extends GutterMarker {
  toDOM() { const d = document.createElement('span'); d.className = 'cm-bp-spacer'; d.textContent = '●'; return d; }
}
const dot = new Dot();
const spacer = new Spacer();
const arrow = new Arrow();

const bpField = StateField.define({
  create() { return RangeSet.empty; },
  update(set, tr) {
    set = set.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(toggle)) {
        const line = tr.state.doc.lineAt(e.value.pos);
        let has = false;
        set.between(line.from, line.from, () => { has = true; });
        set = has ? set.update({ filter: (from) => from !== line.from }) : set.update({ add: [dot.range(line.from)] });
      } else if (e.is(replace)) {
        const doc = tr.state.doc;
        set = RangeSet.of(e.value.filter((n) => n >= 1 && n <= doc.lines).map((n) => dot.range(doc.line(n).from)), true);
      }
    }
    return set;
  },
});

const execField = StateField.define({
  create() { return null; },
  update(v, tr) {
    for (const e of tr.effects) if (e.is(exec)) return e.value;
    return v && tr.docChanged ? null : v;
  },
});
const execLine = Decoration.line({ class: 'cm-execLine' });
const execDeco = EditorView.decorations.compute([execField], (state) => {
  const n = state.field(execField);
  if (!n || n > state.doc.lines) return Decoration.none;
  return Decoration.set([execLine.range(state.doc.line(n).from)]);
});

export function breakpointLines(state) {
  const out = [];
  const set = state.field(bpField, false);
  if (!set) return out;
  for (let it = set.iter(); it.value; it.next()) out.push(state.doc.lineAt(it.from).number);
  return out;
}

// The extension for one file's editor. onChange(lines) when breakpoints change
// (a click, or editing moved them).
export function breakpoints(onChange) {
  return [
    bpField, execField, execDeco,
    gutter({
      class: 'cm-bp-gutter',
      renderEmptyElements: true,      // every line has a spot to click (and a faint dot on hover)
      markers: (v) => {
        const n = v.state.field(execField);
        const set = v.state.field(bpField);
        if (!n || n > v.state.doc.lines) return set;
        return set.update({ add: [arrow.range(v.state.doc.line(n).from)], sort: true });
      },
      initialSpacer: () => spacer,
      domEventHandlers: {
        mousedown(view, block) { view.dispatch({ effects: toggle.of({ pos: block.from }) }); return true; },
      },
    }),
    EditorView.updateListener.of((u) => {
      const changed = u.transactions.some((t) => t.effects.some((e) => e.is(toggle)));
      const moved = u.docChanged && u.startState.field(bpField).size > 0;
      if ((changed || moved) && onChange) onChange(breakpointLines(u.state), changed);
    }),
  ];
}

export function toggleBreakpoint(view, pos = view.state.selection.main.head) { view.dispatch({ effects: toggle.of({ pos }) }); }
export function setBreakpointLines(view, lines) { view.dispatch({ effects: replace.of(lines || []) }); }
export function setExecLine(view, line) { view.dispatch({ effects: exec.of(line || null) }); }
