'use strict';
// The judge, for Phase 5 and Codeforces/LeetCode practice: compile a
// solution once with -O2 (what judges use), feed it each sample input,
// time it, and compare its output with the expected answer the way judges
// do (token by token, so trailing spaces and newlines don't matter).
//   AC accepted · WA wrong answer · TLE over the time limit · RE crashed
// The sample cases for a file are kept in the app's data folder, not
// next to your code.

const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { execStream, toolchain } = require('./build');

const MAX_OUT = 4 * 1024 * 1024;

function casesFile(file) {
  const h = crypto.createHash('sha1').update(path.resolve(file)).digest('hex').slice(0, 16);
  return config.dataPath('cp-cases', `${path.basename(file)}-${h}.json`);
}
function getCases({ file }) {
  try {
    const d = JSON.parse(fs.readFileSync(casesFile(file), 'utf8'));
    return { file, cases: d.cases || [], timeLimitMs: d.timeLimitMs || config.get().judge.timeLimitMs };
  } catch (e) { return { file, cases: [{ input: '', expected: '' }], timeLimitMs: config.get().judge.timeLimitMs }; }
}
function saveCases({ file, cases, timeLimitMs }) {
  const clean = (cases || []).slice(0, 100).map((c) => ({ input: String(c.input || ''), expected: String(c.expected || '') }));
  fs.writeFileSync(casesFile(file), JSON.stringify({ file, cases: clean, timeLimitMs: Number(timeLimitMs) || undefined }, null, 1));
  return true;
}

function tokens(s) { return String(s).split(/\s+/).filter(Boolean); }
function same(out, expected) {
  const a = tokens(out), b = tokens(expected);
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    // 0.333333 vs 0.3333333: judges allow a little floating-point slack
    const x = Number(a[i]), y = Number(b[i]);
    if (Number.isFinite(x) && Number.isFinite(y) && /[.eE]/.test(a[i] + b[i]) && Math.abs(x - y) <= 1e-6 * Math.max(1, Math.abs(y))) continue;
    return false;
  }
  return true;
}

function runCase(exe, input, timeLimitMs) {
  return new Promise((resolve) => {
    const started = process.hrtime.bigint();
    const child = spawn(exe, [], { cwd: path.dirname(exe), env: { ...process.env, ASAN_OPTIONS: 'detect_leaks=0' } });
    let out = '', err = '', killed = false, size = 0;
    const timer = setTimeout(() => { killed = true; child.kill('SIGKILL'); }, timeLimitMs);
    child.stdout.on('data', (b) => { size += b.length; if (size <= MAX_OUT) out += b; else if (!killed) { killed = 'output'; child.kill('SIGKILL'); } });
    child.stderr.on('data', (b) => { if (err.length < 64 * 1024) err += b; });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: 127, signal: null, out, err: e.message, ms: 0, killed }); });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, out, err, ms: Number(process.hrtime.bigint() - started) / 1e6, killed });
    });
  });
}

async function judge({ file, cases, timeLimitMs }) {
  const cfg = config.get();
  if (!file || !/\.(cpp|cc|cxx|c|rs)$/.test(file)) throw new Error('Open the .c, .cpp or .rs file you want to judge');
  const rust = /\.rs$/.test(file);
  const tc = rust ? null : toolchain(/\.c$/.test(file) ? 'c' : 'cpp');
  if (cases) saveCases({ file, cases, timeLimitMs });
  const tl = Math.max(100, Math.min(Number(timeLimitMs) || cfg.judge.timeLimitMs || 2000, 60000));
  const list = cases || getCases({ file }).cases;
  const exe = require('./platform').exe(config.dataPath('cp-bin', path.basename(file).replace(/\.\w+$/, '')));
  const flags = cfg.judge.flags && cfg.judge.flags.length ? cfg.judge.flags : ['-O2', '-Wall'];
  // Rust: an optimised build, like the judges use (overflow checks off in -O)
  const c = rust
    ? await execStream({ cmd: 'rustc', args: ['--edition', String(cfg.build.rustEdition || '2024'), '--color=never', '-O', '-o', exe, file], cwd: path.dirname(file), title: `judge: rustc -O ${path.basename(file)}`, source: 'rustc' })
    : await execStream({ cmd: tc.cc, args: [`-std=${tc.std}`, ...flags, '-o', exe, file, ...(tc.lang === 'c' ? ['-lm'] : [])],
      cwd: path.dirname(file), title: `judge: compile ${path.basename(file)}` });
  if (c.code !== 0) return { compiled: false, problems: c.problems, results: [] };
  const results = [];
  for (const k of list) {
    const r = await runCase(exe, k.input, tl);
    let verdict;
    if (r.killed === true) verdict = 'TLE';
    else if (r.killed === 'output') verdict = 'OLE';
    else if (r.code !== 0) verdict = 'RE';
    else if (!String(k.expected || '').trim()) verdict = 'RAN';
    else verdict = same(r.out, k.expected) ? 'AC' : 'WA';
    results.push({ verdict, ms: Math.round(r.ms), output: r.out.slice(0, 64 * 1024), stderr: r.err.slice(0, 8 * 1024), code: r.code, signal: r.signal });
  }
  return { compiled: true, problems: c.problems, results, timeLimitMs: tl };
}

// A new problem: a copy of the vault's template.cpp (or template.c) to start from.
function newProblem({ name, lang }) {
  const cfg = config.get();
  const l = lang || (/\.c$/.test(String(name || '')) ? 'c' : /\.rs$/.test(String(name || '')) ? 'rust' : ['c', 'rust'].includes(cfg.language) ? cfg.language : 'cpp');
  const ext = l === 'c' ? 'c' : l === 'rust' ? 'rs' : 'cpp';
  const safe = String(name || '').trim().replace(/\.(cpp|c|rs)$/, '').replace(/[^\w.-]+/g, '_');
  if (!safe) throw new Error('Give the problem a name, for example cf-1850A');
  const ws = config.expand(cfg.workspace);
  const dir = path.join(ws, 'cp', 'problems');
  const file = path.join(dir, `${safe}.${ext}`);
  if (fs.existsSync(file)) throw new Error(`${file} already exists`);
  const sources = [path.join(ws, 'cp', `template.${ext}`)];
  for (const v of cfg.vaults || []) sources.push(path.join(config.expand(v.path), '_code', 'cp', `template.${ext}`));
  const tpl = sources.find((s) => fs.existsSync(s));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, tpl ? fs.readFileSync(tpl, 'utf8') : ext === 'c' ? FALLBACK_C : ext === 'rs' ? FALLBACK_RS : FALLBACK);
  return { file, from: tpl || null };
}
// Rust: read all of stdin once, take the numbers as you need them
const FALLBACK_RS = `use std::io::{self, BufWriter, Read, Write};

fn solve(input: &mut std::str::SplitAsciiWhitespace, out: &mut impl Write) {
    let n: i64 = input.next().unwrap().parse().unwrap();
    writeln!(out, "{}", n).unwrap();
}

fn main() {
    let mut text = String::new();
    io::stdin().read_to_string(&mut text).unwrap();
    let mut input = text.split_ascii_whitespace();
    let out = &mut BufWriter::new(io::stdout().lock());
    let test_cases = 1;
    // let test_cases: usize = input.next().unwrap().parse().unwrap();
    for _ in 0..test_cases {
        solve(&mut input, out);
    }
}
`;
const FALLBACK = `#include <bits/stdc++.h>
using namespace std;

static void solve() {
    int n;
    cin >> n;
    cout << n << '\\n';
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int testCases = 1;
    // cin >> testCases;
    while (testCases--) solve();
    return 0;
}
`;

const FALLBACK_C = `#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void solve(void) {
    int n;
    if (scanf("%d", &n) != 1) return;
    printf("%d\\n", n);
}

int main(void) {
    int testCases = 1;
    /* if (scanf("%d", &testCases) != 1) return 0; */
    while (testCases--) solve();
    return 0;
}
`;

function init(api) {
  api.register('cp.cases', getCases);
  api.register('cp.saveCases', saveCases);
  api.register('cp.judge', judge);
  api.register('cp.newProblem', newProblem);
}

module.exports = { init, same, tokens };
