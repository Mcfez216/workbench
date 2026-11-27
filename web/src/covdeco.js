// Coverage in the editor: lines that ran get a green mark in the margin,
// lines that never ran a red one and a faint red background, with the count
// on hover. No app modules here: editor.js puts it in every C/C++ editor,
// coverage.js fills it in.

import { StateField, StateEffect, RangeSet } from '@codemirror/state';
import { EditorView, Decoration, gutter, GutterMarker } from '@codemirror/view';

const setCov = StateEffect.define();   // { lines: { n: count } } or null

class Mark extends GutterMarker {
  constructor(count) { super(); this.count = count; }
  eq(o) { return o.count === this.count; }
  toDOM() {
    const d = document.createElement('span');
    d.className = this.count > 0 ? 'cm-cov-hit' : 'cm-cov-miss';
    d.textContent = this.count > 0 ? (this.count > 999 ? '1k+' : String(this.count)) : '0';
    d.title = this.count > 0 ? `ran ${this.count} time${this.count === 1 ? '' : 's'}` : 'never ran';
    return d;
  }
}

const covField = StateField.define({
  create() { return null; },
  update(v, tr) {
    for (const e of tr.effects) if (e.is(setCov)) return e.value;
    return v && tr.docChanged ? null : v;   // an edit makes the counts stale
  },
});
const missLine = Decoration.line({ class: 'cm-cov-missLine' });
const covDeco = EditorView.decorations.compute([covField], (state) => {
  const c = state.field(covField);
  if (!c) return Decoration.none;
  const r = [];
  for (const [n, count] of Object.entries(c.lines).map(([k, v]) => [+k, v]).sort((a, b) => a[0] - b[0])) {
    if (count === 0 && n <= state.doc.lines) r.push(missLine.range(state.doc.line(n).from));
  }
  return Decoration.set(r);
});

export const coverageExtension = [
  covField, covDeco,
  gutter({
    class: 'cm-cov-gutter',
    markers: (v) => {
      const c = v.state.field(covField);
      if (!c) return RangeSet.empty;
      const doc = v.state.doc;
      const marks = Object.entries(c.lines).map(([k, count]) => [+k, count]).filter(([n]) => n <= doc.lines).sort((a, b) => a[0] - b[0]);
      return RangeSet.of(marks.map(([n, count]) => new Mark(count).range(doc.line(n).from)));
    },
  }),
];

export function showCoverage(view, lines) { view.dispatch({ effects: setCov.of(lines ? { lines } : null) }); }
