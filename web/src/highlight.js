// Syntax colours: one HighlightStyle for the editor (theme variables, so a
// theme switch recolours it without rebuilding anything), and the same
// mapping as CSS classes for code shown outside the editor (guides, mail).

import { HighlightStyle, StreamLanguage } from '@codemirror/language';
import { tags as t, tagHighlighter, highlightCode } from '@lezer/highlight';
import { parser as cppParser } from '@lezer/cpp';
import { rustLanguage } from '@codemirror/lang-rust';
const rustParser = rustLanguage.parser;
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { diff } from '@codemirror/legacy-modes/mode/diff';

const groups = [
  ['keyword', [t.keyword, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword, t.modifier, t.self]],
  ['type', [t.typeName, t.standard(t.typeName), t.className, t.namespace]],
  ['string', [t.string, t.special(t.string), t.character, t.regexp]],
  ['number', [t.number, t.integer, t.float, t.bool, t.null, t.atom]],
  ['comment', [t.comment, t.lineComment, t.blockComment, t.docComment]],
  ['meta', [t.processingInstruction, t.macroName, t.meta, t.annotation]],
  ['function', [t.function(t.variableName), t.function(t.propertyName), t.function(t.definition(t.variableName))]],
  ['variable', [t.variableName, t.propertyName, t.attributeName, t.definition(t.variableName)]],
  ['operator', [t.operator, t.derefOperator, t.arithmeticOperator, t.logicOperator, t.bitwiseOperator, t.compareOperator, t.updateOperator, t.definitionOperator]],
  ['punct', [t.punctuation, t.bracket, t.separator, t.paren, t.brace, t.squareBracket, t.angleBracket]],
  ['constant', [t.constant(t.variableName), t.escape, t.labelName]],
];
const cssVar = { keyword: 'syn-keyword', type: 'syn-type', string: 'syn-string', number: 'syn-number', comment: 'syn-comment', meta: 'syn-preproc',
  function: 'syn-function', variable: 'syn-variable', operator: 'syn-operator', punct: 'syn-punct', constant: 'syn-constant' };

export const editorHighlight = HighlightStyle.define([
  ...groups.map(([name, tags]) => ({ tag: tags, color: `var(--${cssVar[name]})` })),
  { tag: [t.heading, t.heading1, t.heading2, t.heading3, t.heading4], color: 'var(--syn-heading)' },
  { tag: [t.link, t.url], color: 'var(--syn-link)', textDecoration: 'underline' },
  { tag: t.strong, color: 'var(--accent)', fontWeight: 'bold' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.monospace, color: 'var(--inline-code)' },
  { tag: t.inserted, color: 'var(--diff-add-fg)' },
  { tag: t.deleted, color: 'var(--diff-del-fg)' },
  { tag: [t.changed, t.heading], color: 'var(--diff-meta)' },
  { tag: t.invalid, color: 'var(--error)' },
]);

const classHL = tagHighlighter(groups.map(([name, tags]) => ({ tag: tags, class: `tok-${name}` })));

const shellParser = StreamLanguage.define(shell).parser;
const diffParser = StreamLanguage.define(diff).parser;
const PARSERS = { rust: rustParser, rs: rustParser, c: cppParser, h: cppParser, cpp: cppParser, 'c++': cppParser, bash: shellParser, sh: shellParser, shell: shellParser, console: shellParser, diff: diffParser, patch: diffParser };

// Code -> HTML string with tok-* spans. Unknown languages come back escaped.
export function highlightToHtml(code, lang) {
  const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const parser = PARSERS[(lang || '').toLowerCase()];
  if (!parser) return escape(code);
  let html = '';
  try {
    highlightCode(code, parser.parse(code), classHL,
      (text, classes) => { html += classes ? `<span class="${classes}">${escape(text)}</span>` : escape(text); },
      () => { html += '\n'; });
  } catch (e) { return escape(code); }
  return html;
}
