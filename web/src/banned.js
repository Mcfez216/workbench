// Functions that can't be used safely with untrusted input (or at all),
// underlined in C and C++ files, with why and what to use instead on hover.
// Settings → Editor turns it off.

import { ViewPlugin, Decoration, MatchDecorator, hoverTooltip } from '@codemirror/view';
import { h } from './ui.js';

export const BANNED = {
  gets: 'Reads a line with no limit: any long line overflows the buffer. Removed from C11. Use fgets(buf, sizeof buf, stdin).',
  strcpy: 'Copies without knowing the destination\'s size. Use snprintf(dst, sizeof dst, "%s", src).',
  strcat: 'Appends without knowing the destination\'s size. Build the string with snprintf.',
  sprintf: 'Formats into a buffer with no limit. Use snprintf(buf, sizeof buf, ...).',
  vsprintf: 'Like sprintf: no limit. Use vsnprintf.',
  strncpy: 'Leaves the result unterminated when the source is long. Use snprintf.',
  strtok: 'Keeps hidden state and writes into its input. strtok_r, or parse by hand.',
  atoi: 'Can\'t report errors (0 for "0" and for "hello") and overflow is undefined. Use strtol and check it.',
  atol: 'Can\'t report errors. Use strtol.',
  system: 'Runs a whole shell command line: any user text in it can run other commands. Avoid, or never pass input to it.',
  alloca: 'Allocates on the stack with no failure check: a big size overflows the stack.',
  tmpnam: 'Another program can create the file between getting the name and opening it. Use mkstemp.',
  mktemp: 'Same race as tmpnam. Use mkstemp.',
  rand: 'Predictable: fine for games, never for passwords, tokens or keys. Use getrandom() / /dev/urandom.',
};
const bannedRe = new RegExp(`\\b(${Object.keys(BANNED).join('|')})(?=\\s*\\()`, 'g');
const bannedMatcher = new MatchDecorator({ regexp: bannedRe, decoration: (m) => Decoration.mark({ class: 'cm-banned', attributes: { title: BANNED[m[1]] } }) });
const bannedMarks = ViewPlugin.fromClass(class {
  constructor(view) { this.deco = bannedMatcher.createDeco(view); }
  update(u) { this.deco = bannedMatcher.updateDeco(u, this.deco); }
}, { decorations: (v) => v.deco });
const bannedHover = hoverTooltip((view, pos) => {
  const line = view.state.doc.lineAt(pos);
  for (const m of line.text.matchAll(bannedRe)) {
    const from = line.from + m.index, to = from + m[1].length;
    if (pos >= from && pos <= to) {
      return { pos: from, end: to, above: true, create: () => { const d = document.createElement('div'); d.className = 'cm-banned-tip'; d.innerHTML = ''; d.append(h('b', {}, `${m[1]}: unsafe`), h('div', {}, BANNED[m[1]])); return { dom: d }; } };
    }
  }
  return null;
});
export const bannedFunctions = [bannedMarks, bannedHover];

