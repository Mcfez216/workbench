'use strict';
// A small client for gdb's machine interface (MI): commands with tokens and
// their answers, the async records (*stopped...), and gdb's console text.
// The memory view and the debugger both use it.

const { spawn } = require('child_process');

function miParse(s) {
  // MI values: "c-string" | {k=v,...} | [v,...] | [k=v,...]
  let i = 0;
  const str = () => {
    let out = '';
    i++;
    while (i < s.length && s[i] !== '"') {
      if (s[i] === '\\') {
        i++;
        const c = s[i];
        if (c === 'n') out += '\n'; else if (c === 't') out += '\t'; else if (/[0-7]/.test(c)) { const o = s.slice(i, i + 3); out += String.fromCharCode(parseInt(o, 8)); i += 2; } else out += c;
      } else out += s[i];
      i++;
    }
    i++;
    return out;
  };
  const val = () => {
    if (s[i] === '"') return str();
    if (s[i] === '{' || s[i] === '[') {
      const close = s[i] === '{' ? '}' : ']';
      i++;
      const isList = close === ']';
      const obj = isList ? [] : {};
      while (i < s.length && s[i] !== close) {
        const m = /^[\w-]+=/.exec(s.slice(i));
        if (m) {
          i += m[0].length;
          const v = val();
          if (isList) obj.push(v); else obj[m[0].slice(0, -1)] = v;
        } else obj.push(val());
        if (s[i] === ',') i++;
      }
      i++;
      return obj;
    }
    return null;
  };
  const out = {};
  while (i < s.length) {
    const m = /^([\w-]+)=/.exec(s.slice(i));
    if (!m) break;
    i += m[0].length;
    out[m[1]] = val();
    if (s[i] === ',') i++;
  }
  return out;
}

class Gdb {
  // opts: gdb (the program: gdb, rust-gdb, egdb), env, nx (skip ~/.gdbinit),
  // onRecord(kind, body, line) for every async record (*stopped,
  // *running, =breakpoint-modified...), onStream(text) for gdb's own console
  // output, onTarget(text) for the program's output when it has no terminal
  constructor(exe, cwd, opts = {}) {
    const args = ['--interpreter=mi2', '-q', ...(opts.nx === false ? [] : ['-nx']), ...(exe ? [exe] : [])];
    this.opts = opts;
    this.p = spawn(opts.gdb || require('./platform').gdb(), args, { cwd, env: { ...process.env, LC_ALL: 'C', ...(opts.env || {}) } });
    this.buf = '';
    this.token = 1;
    this.waiting = new Map();
    this.stopWaiters = [];
    this.p.stdout.on('data', (b) => { this.buf += b; let k; while ((k = this.buf.indexOf('\n')) >= 0) { this.line(this.buf.slice(0, k).replace(/\r$/, '')); this.buf = this.buf.slice(k + 1); } });
    this.p.on('error', () => {});
    this.p.stderr.on('data', (b) => { if (this.opts.onStream) this.opts.onStream(String(b)); });
    this.p.on('exit', () => {
      if (this.opts.onExit) this.opts.onExit(); for (const w of this.waiting.values()) w.reject(new Error('gdb stopped')); this.waiting.clear(); for (const w of this.stopWaiters) w({ reason: 'gdb-exited' }); this.stopWaiters = []; });
  }
  line(l) {
    const r = /^(\d+)\^(done|error|running|connected|exit)(?:,(.*))?$/.exec(l);
    if (r) {
      const w = this.waiting.get(+r[1]);
      if (!w) return;
      this.waiting.delete(+r[1]);
      const body = r[3] ? miParse(r[3]) : {};
      if (r[2] === 'error') w.reject(new Error(body.msg || 'gdb error')); else w.resolve(body);
      return;
    }
    const st = /^\*stopped(?:,(.*))?$/.exec(l);
    if (st) { const d = st[1] ? miParse(st[1]) : {}; const ws = this.stopWaiters; this.stopWaiters = []; for (const w of ws) w(d); if (this.opts.onRecord) this.opts.onRecord('stopped', d, l); return; }
    const as = /^[*=]([\w-]+)(?:,(.*))?$/.exec(l);
    if (as) { if (this.opts.onRecord) this.opts.onRecord(as[1], as[2] ? miParse(as[2]) : {}, l); return; }
    const cs = /^[~&]"(.*)"$/.exec(l);
    if (cs) { if (this.opts.onStream) this.opts.onStream(miParse(`x="${cs[1]}"`).x); return; }
    if (l && !/^\(gdb\)/.test(l) && !/^@/.test(l) && !/^\d*\^/.test(l) && this.opts.onTarget) this.opts.onTarget(l + '\n');
    else if (/^@"(.*)"$/.test(l) && this.opts.onTarget) this.opts.onTarget(miParse(`x="${/^@"(.*)"$/.exec(l)[1]}"`).x);
  }
  cmd(c) {
    const t = this.token++;
    return new Promise((resolve, reject) => {
      this.waiting.set(t, { resolve, reject });
      this.p.stdin.write(`${t}${c}\n`);
      setTimeout(() => { if (this.waiting.has(t)) { this.waiting.delete(t); reject(new Error(`gdb didn't answer: ${c}`)); } }, 15000);
    });
  }
  stopped(ms = 15000) {
    return new Promise((resolve) => {
      const t = setTimeout(() => resolve({ reason: 'timeout' }), ms);
      this.stopWaiters.push((d) => { clearTimeout(t); resolve(d); });
    });
  }
  async run(c) { const s = this.stopped(); await this.cmd(c); return s; }
  kill() { try { this.p.stdin.write('-gdb-exit\n'); } catch (e) { /* gone */ } setTimeout(() => { try { this.p.kill('SIGKILL'); } catch (e) { /* gone */ } }, 500); }
}


module.exports = { miParse, Gdb };
