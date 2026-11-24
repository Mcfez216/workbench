// Obsidian-flavoured Markdown for the guides: callouts (foldable), [[wiki
// links]], task boxes, syntax-coloured code with buttons, `_code/...` links.
// Raw HTML in notes is shown as text, not run.

import MarkdownIt from 'markdown-it';
import { highlightToHtml } from './highlight.js';
import { esc } from './ui.js';

export function slug(s) {
  return String(s).toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-');
}

const md = new MarkdownIt({ html: false, linkify: true, typographer: false, highlight: (code, lang) => highlightToHtml(code, lang) });

// ---- callouts: "> [!kind]± Title" turns a blockquote into a box
md.core.ruler.after('block', 'callouts', (state) => {
  const toks = state.tokens;
  for (let i = 0; i < toks.length; i++) {
    if (toks[i].type !== 'blockquote_open') continue;
    const p = toks[i + 1], inline = toks[i + 2];
    if (!p || p.type !== 'paragraph_open' || !inline || inline.type !== 'inline') continue;
    const m = inline.content.match(/^\[!([A-Za-z-]+)\]([+-]?)[ \t]*(.*)(?:\n|$)/);
    if (!m) continue;
    const open = toks[i];
    open.type = 'callout_open';
    open.meta = { kind: m[1].toLowerCase(), fold: m[2], title: m[3] };
    inline.content = inline.content.slice(m[0].length);
    if (!inline.content.trim()) toks.splice(i + 1, 3);       // title-only first paragraph
    let depth = 0;
    for (let j = i + 1; j < toks.length; j++) {
      if (toks[j].type === 'blockquote_open' || toks[j].type === 'callout_open') depth++;
      else if (toks[j].type === 'blockquote_close') {
        if (depth === 0) { toks[j].type = 'callout_close'; toks[j].meta = open.meta; break; }
        depth--;
      }
    }
  }
});
const CALLOUT_NAMES = { holocron: 'Holocron', question: 'Question', abstract: 'Summary', example: 'Example', tip: 'Tip', warning: 'Warning', info: 'Info', note: 'Note', danger: 'Danger', bug: 'Bug', success: 'Done', todo: 'To do', boss: 'Boss fight', sith: 'Dark side', rank: 'Rank', failure: 'Debrief' };
md.renderer.rules.callout_open = (toks, i, opts, env) => {
  const { kind, fold, title } = toks[i].meta;
  const t = title ? md.renderInline(title, env) : esc(CALLOUT_NAMES[kind] || kind);
  const icon = { holocron: '◆', question: '?', warning: '!', tip: '*', example: '»', abstract: '≡', info: 'i', boss: '‼', sith: '☼', rank: '★', failure: '×' }[kind] || '•';
  if (fold) return `<details class="callout" data-callout="${esc(kind)}"${fold === '+' ? ' open' : ''}><summary class="callout-title"><span class="callout-icon" aria-hidden="true">${icon}</span><span>${t}</span></summary><div class="callout-body">`;
  return `<div class="callout" data-callout="${esc(kind)}"><div class="callout-title"><span class="callout-icon" aria-hidden="true">${icon}</span><span>${t}</span></div><div class="callout-body">`;
};
md.renderer.rules.callout_close = (toks, i) => (toks[i].meta.fold ? '</div></details>' : '</div></div>');

// ---- [[Note]], [[Note|text]], [[Note#Heading]], ![[embed]] (shown as a link)
md.inline.ruler.before('link', 'wikilink', (state, silent) => {
  const s = state.src, pos = state.pos;
  const bang = s[pos] === '!' ? 1 : 0;
  if (s.charCodeAt(pos + bang) !== 0x5b || s.charCodeAt(pos + bang + 1) !== 0x5b) return false;
  const end = s.indexOf(']]', pos + bang + 2);
  if (end < 0) return false;
  const inner = s.slice(pos + bang + 2, end);
  if (!inner || inner.includes('\n')) return false;
  if (!silent) {
    // Obsidian writes [[note\|label]] inside tables, where a bare | would end the cell
    const [target, alias] = inner.replace(/\\\|/g, '|').split('|');
    const [note, heading] = target.split('#');
    const t = state.push('wikilink', '', 0);
    t.meta = { note: note.trim(), heading: (heading || '').trim(), text: (alias || (heading && !note ? heading : target)).trim() };
  }
  state.pos = end + 2;
  return true;
});
md.renderer.rules.wikilink = (toks, i) => {
  const { note, heading, text } = toks[i].meta;
  return `<a href="#" class="wikilink" data-note="${esc(note)}" data-heading="${esc(heading)}">${esc(text)}</a>`;
};

// ---- headings get ids so [[Note#Heading]] can scroll to them
md.core.ruler.push('heading_ids', (state) => {
  const toks = state.tokens;
  for (let i = 0; i < toks.length; i++) if (toks[i].type === 'heading_open') toks[i].attrSet('id', slug(toks[i + 1].content));
});

// ---- - [ ] / - [x] task boxes (shown, not clickable: the vault is the record)
md.core.ruler.push('tasks', (state) => {
  const toks = state.tokens;
  for (let i = 2; i < toks.length; i++) {
    const t = toks[i];
    if (t.type !== 'inline' || toks[i - 1].type !== 'paragraph_open' || toks[i - 2].type !== 'list_item_open') continue;
    const first = t.children[0];
    const m = first && first.type === 'text' && first.content.match(/^\[([ xX])\] /);
    if (!m) continue;
    first.content = first.content.slice(4);
    const box = new state.Token('html_inline', '', 0);
    box.content = `<span class="task${m[1] === ' ' ? '' : ' done'}" aria-hidden="true">[${m[1] === ' ' ? ' ' : 'x'}]</span> `;
    t.children.unshift(box);
    toks[i - 2].attrJoin('class', 'task-item');
  }
});

// ---- `_code/...` paths open the file; other inline code is plain
md.renderer.rules.code_inline = (toks, i) => {
  const c = toks[i].content;
  if (/^_code\/[^\s]+$/.test(c)) return `<a href="#" class="codelink" data-code="${esc(c)}"><code>${esc(c)}</code></a>`;
  return `<code>${esc(c)}</code>`;
};

// ---- code blocks get Copy / Paste into terminal / Try in sandbox
const SHELL = new Set(['bash', 'sh', 'shell', 'console', 'zsh']);
md.renderer.rules.fence = (toks, i, opts, env) => {
  const t = toks[i];
  const lang = (t.info || '').trim().split(/\s+/)[0].toLowerCase();
  const n = env.blocks.push({ code: t.content, lang }) - 1;
  const btns = [`<button type="button" data-act="copy" data-i="${n}">Copy</button>`];
  if (SHELL.has(lang)) btns.push(`<button type="button" data-act="paste" data-i="${n}" title="Puts the commands at your terminal prompt (with _code/ meaning your workspace copy). Read them, then press Enter.">Paste into terminal</button>`);
  if (['cpp', 'c++', 'cxx', 'c'].includes(lang) && /\bint\s+main\s*\(/.test(t.content)) btns.push(`<button type="button" data-act="sandbox" data-i="${n}" title="Open this program in the ${lang === 'c' ? 'C' : 'C++'} sandbox">Try in sandbox</button>`);
  const body = opts.highlight(t.content, lang) || esc(t.content);
  return `<div class="codeblock" data-lang="${esc(lang)}"><div class="code-tools"><span class="code-lang">${esc(lang || 'text')}</span>${btns.join('')}</div><pre><code>${body}</code></pre></div>`;
};

// ---- links to the web open outside the app
md.renderer.rules.link_open = (toks, i, opts, env, self) => {
  const href = toks[i].attrGet('href') || '';
  if (/^https?:/i.test(href)) { toks[i].attrSet('target', '_blank'); toks[i].attrSet('rel', 'noopener noreferrer'); toks[i].attrJoin('class', 'external'); }
  return self.renderToken(toks, i, opts);
};

export function renderMarkdown(src) {
  let text = src.replace(/^---\n[\s\S]*?\n---\n?/, '');           // frontmatter
  const fm = (src.match(/^---\n([\s\S]*?)\n---/) || [])[1] || '';
  const env = { blocks: [] };
  const html = md.render(text, env);
  return { html, blocks: env.blocks, frontmatter: fm };
}
export function renderInline(src) { return md.renderInline(src, { blocks: [] }); }
