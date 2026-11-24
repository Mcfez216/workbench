'use strict';
// The memory view: run a small C or C++ program under gdb one line at a
// time and record, at every step, each function's variables (name, type,
// value, address, size) and what the pointers point at: another variable,
// something on the heap, or nothing. The window draws boxes and arrows from
// that, and lets you step backwards and forwards through it.
//
// It talks to gdb through its machine interface (MI). Built with -O0 -g and
// no sanitizers, so variables live where the source says and addresses are
// the real ones. At most MAX_STEPS lines: enough for exercises and sandbox
// programs, not meant for big ones.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const config = require('./config');
const { execStream, toolchain, which, hint } = require('./build');

const MAX_STEPS = 300;

// ------------------------------------------------------------------ a tiny MI client
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
  constructor(exe, cwd) {
    this.p = spawn(require('./platform').gdb(), ['--interpreter=mi2', '-q', '-nx', exe], { cwd, env: { ...process.env, LC_ALL: 'C' } });
    this.buf = '';
    this.token = 1;
    this.waiting = new Map();
    this.stopWaiters = [];
    this.p.stdout.on('data', (b) => { this.buf += b; let k; while ((k = this.buf.indexOf('\n')) >= 0) { this.line(this.buf.slice(0, k).replace(/\r$/, '')); this.buf = this.buf.slice(k + 1); } });
    this.p.on('error', () => {});
    this.p.on('exit', () => { for (const w of this.waiting.values()) w.reject(new Error('gdb stopped')); this.waiting.clear(); for (const w of this.stopWaiters) w({ reason: 'gdb-exited' }); this.stopWaiters = []; });
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
    if (st) { const d = st[1] ? miParse(st[1]) : {}; const ws = this.stopWaiters; this.stopWaiters = []; for (const w of ws) w(d); }
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

const q = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const hex = (s) => { const m = /0x[0-9a-f]+/i.exec(s || ''); return m ? BigInt(m[0]) : null; };

// ------------------------------------------------------------------ the trace
async function trace({ source, lang = 'c', input = '' }) {
  if (!which('gdb') && !which('egdb')) throw new Error(`The memory view needs gdb (${hint('gdb')})`);
  const tc = toolchain(lang === 'cpp' ? 'cpp' : 'c');
  const dir = path.dirname(config.dataPath('memviz', 'x'));
  const name = tc.lang === 'c' ? 'viz.c' : 'viz.cpp';
  const src = path.join(dir, name);
  fs.writeFileSync(src, source);
  // stdout unbuffered, so what the program prints lines up with the step that printed it
  const init = path.join(dir, 'viz-init.c');
  fs.writeFileSync(init, '#include <stdio.h>\n__attribute__((constructor)) static void cpw_unbuffered(void) { setvbuf(stdout, NULL, _IONBF, 0); }\n');
  const exe = path.join(dir, 'viz');
  const cc = tc.lang === 'c' ? tc.cc : tc.cc === 'clang++' ? 'clang' : 'gcc';   // the C compiler, for the init file
  const o1 = await execStream({ cmd: cc, args: ['-c', '-o', path.join(dir, 'viz-init.o'), init], cwd: dir, quiet: true });
  if (o1.code !== 0) throw new Error(o1.output);
  const b = await execStream({ cmd: tc.cc, args: [`-std=${tc.std}`, '-g', '-O0', '-fno-inline', '-fno-omit-frame-pointer', '-o', exe, src, path.join(dir, 'viz-init.o'), ...(tc.lang === 'c' ? ['-lm'] : [])], cwd: dir, title: `memory view: ${tc.cc}` });
  if (b.code !== 0) return { compiled: false, problems: b.problems, steps: [] };
  fs.writeFileSync(path.join(dir, 'viz-in.txt'), input);
  const outFile = path.join(dir, 'viz-out.txt');
  fs.writeFileSync(outFile, '');

  const g = new Gdb(exe, dir);
  const steps = [];
  let end = 'finished';
  try {
    await g.cmd('-gdb-set confirm off');
    await g.cmd('-gdb-set print pretty off');
    await g.cmd('-gdb-set print elements 40');
    await g.cmd('-gdb-set width 0');
    await g.cmd('-exec-arguments <viz-in.txt >viz-out.txt');
    await g.cmd('-break-insert -f main');
    let stop = await g.run('-exec-run');
    while (steps.length < MAX_STEPS) {
      if (!stop || stop.reason === 'gdb-exited' || /^exited/.test(stop.reason || '')) { end = stop && stop.reason === 'exited' ? `exited with code ${parseInt(stop['exit-code'], 8)}` : 'finished'; break; }
      if (stop.reason === 'signal-received') { steps.push(await snapshot(g, src, outFile, `stopped by ${stop['signal-name']}: ${stop['signal-meaning']}`)); end = `crashed (${stop['signal-meaning']})`; break; }
      if (stop.reason === 'timeout') { end = 'waiting for input (give it some in the Input box)'; break; }
      const frame = stop.frame || {};
      if (frame.fullname !== src) {
        // inside the library (printf, std::vector...): come back out to your code
        stop = await g.run('-exec-finish').catch(() => ({ reason: 'gdb-exited' }));
        continue;
      }
      const snap = await snapshot(g, src, outFile);
      // stepping into a library call and back out lands on the same line again: keep the newer one
      const prev = steps[steps.length - 1];
      if (prev && prev.line === snap.line && prev.frames.length === snap.frames.length) steps[steps.length - 1] = snap; else steps.push(snap);
      stop = await g.run('-exec-step').catch(() => ({ reason: 'gdb-exited' }));
    }
    if (steps.length >= MAX_STEPS) end = `stopped after ${MAX_STEPS} steps`;
  } finally { g.kill(); }
  let stdout = '';
  try { stdout = fs.readFileSync(outFile, 'utf8'); } catch (e) { /* none */ }
  return { compiled: true, problems: b.problems, steps, end, stdout, file: src };
}

async function evalExpr(g, frame, expr) {
  try { return (await g.cmd(`-data-evaluate-expression --frame ${frame} --thread 1 ${q(expr)}`)).value; } catch (e) { return null; }
}

async function snapshot(g, src, outFile, note) {
  const st = await g.cmd('-stack-list-frames --thread 1');
  const frames = (st.stack || []).map((f) => (f.frame || f)).filter((f) => f.fullname === src);
  const all = (st.stack || []).map((f) => (f.frame || f));
  const out = { line: frames[0] ? +frames[0].line : null, frames: [], heap: [], note: note || null };
  const known = [];   // {addr, size, frame, name}
  for (const f of frames) {
    const level = all.indexOf(f);
    let vars = [];
    try { vars = (await g.cmd(`-stack-list-variables --thread 1 --frame ${level} --simple-values`)).variables || []; } catch (e) { vars = []; }
    const rows = [];
    for (const v of vars) {
      const row = { name: v.name, type: v.type || '', value: v.value, arg: v.arg === '1' };
      if (row.value === undefined) row.value = await evalExpr(g, level, v.name);
      row.addr = hex(await evalExpr(g, level, `&${v.name}`));
      row.size = parseInt(await evalExpr(g, level, `sizeof(${v.name})`), 10) || 0;
      // a pointer: its target (char* shows as a string already)
      if (/\*\s*(const\s*)?$/.test(row.type) || /\*$/.test(row.type.trim())) {
        row.ptr = hex(row.value);
        if (row.ptr === 0n) row.isNull = true;
      }
      if (row.addr !== null) known.push({ addr: row.addr, size: row.size, frame: f.func, level, name: v.name });
      rows.push(row);
    }
    out.frames.push({ func: f.func, line: +f.line, level, vars: rows });
  }
  // where each pointer goes: a variable we have (maybe inside an array or
  // struct), else memory on the heap (or elsewhere) shown as its own box
  const heapBoxes = new Map();
  for (const fr of out.frames) {
    for (const row of fr.vars) {
      if (row.ptr === undefined || row.ptr === null || row.isNull) continue;
      const hit = known.find((k) => row.ptr >= k.addr && row.ptr < k.addr + BigInt(Math.max(1, k.size)));
      if (hit) { row.target = { kind: 'var', level: hit.level, name: hit.name, offset: Number(row.ptr - hit.addr) }; continue; }
      const key = row.ptr.toString(16);
      if (!heapBoxes.has(key)) {
        const base = row.type.replace(/\*\s*(const\s*)?$/, '').trim();
        let value = null;
        if (!/^(void|const void|char|const char|unsigned char|const unsigned char)$/.test(base) && !/\(\*\)/.test(row.type)) {
          value = await evalExpr(g, fr.level, `*(${row.type.replace(/\bconst\b/g, '').trim()})${'0x' + key}`);
        }
        if (/char$/.test(base)) value = (row.value.match(/"(.*)"/) || [])[0] || null;
        heapBoxes.set(key, { addr: '0x' + key, type: base, value: value === null ? '?' : value });
      }
      row.target = { kind: 'heap', addr: '0x' + key };
    }
  }
  out.heap = [...heapBoxes.values()];
  // BigInts don't go through JSON
  for (const fr of out.frames) for (const r of fr.vars) { r.addr = r.addr === null ? null : '0x' + r.addr.toString(16); if (r.ptr !== undefined && r.ptr !== null) r.ptr = '0x' + r.ptr.toString(16); }
  try { out.stdout = fs.readFileSync(outFile, 'utf8').slice(-4000); } catch (e) { out.stdout = ''; }
  return out;
}

function init(api) {
  api.register('memviz.trace', trace);
}

module.exports = { init, trace, miParse };
