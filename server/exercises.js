'use strict';
// Exercises: one small step at a time. Your file lives in
// ~/workbench-exercises/<id>/ (yours to keep, edit, put in git); the app
// compiles it with a test program for the steps you've reached, with the
// sanitizers on, and says exactly which check failed and why.
// Progress (how far, what you wrote for the "explain it" steps) and a daily
// log for the progress map are kept in the data folder.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');
const { execStream } = require('./build');
const { same } = require('./cp');
const DATA = require('./exercise-data');

let api;
const byId = new Map(DATA.map((e) => [e.id, e]));

// ------------------------------------------------------------------ progress
function progressFile() { return config.dataPath('exercises', 'progress.json'); }
function loadProgress() {
  try { return JSON.parse(fs.readFileSync(progressFile(), 'utf8')); } catch (e) { return { exercises: {}, days: {} }; }
}
function saveProgress(p) {
  const f = progressFile();
  fs.writeFileSync(f + '.tmp', JSON.stringify(p, null, 1));
  fs.renameSync(f + '.tmp', f);
}
function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function logDay(p, field, n = 1) {
  const d = (p.days[today()] = p.days[today()] || { steps: 0, checks: 0, passedChecks: 0, minutes: 0 });
  d[field] = (d[field] || 0) + n;
}
function progressOf(p, id) { return p.exercises[id] || (p.exercises[id] = { step: 0, done: false, attempts: 0, reflections: {}, updated: null }); }

// ------------------------------------------------------------------ where things go
function exercisesDir() { return config.expand(config.get().exercisesDir || '~/workbench-exercises'); }
function dirOf(ex) { return path.join(exercisesDir(), ex.id); }
function fileOf(ex) { return path.join(dirOf(ex), ex.file); }
function publicView(ex) {
  const { solution, solutions, source, flagHash, ...rest } = ex;
  return { ...rest, steps: ex.steps.map(({ test, cases, answer, ...s }) => ({ ...s, type: s.type || (ex.kind === 'ctf' ? 'flag' : 'tests'), cases: cases ? cases.map((c) => ({ input: c.input })) : undefined })) };
}

function list() {
  const p = loadProgress();
  return DATA.map((ex) => {
    const pr = p.exercises[ex.id] || { step: 0, done: false, attempts: 0 };
    return { id: ex.id, title: ex.title, track: ex.track, topic: ex.topic, lang: ex.lang, kind: ex.kind, steps: ex.steps.length, step: pr.step, done: pr.done, attempts: pr.attempts, updated: pr.updated || null, dir: dirOf(ex) };
  });
}

// Make the folder: the given files (headers) always, your file only if it isn't there
async function open({ id }) {
  const ex = byId.get(id);
  if (!ex) throw new Error(`No exercise ${id}`);
  const dir = dirOf(ex);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, text] of Object.entries(ex.files || {})) fs.writeFileSync(path.join(dir, name), text);
  if (ex.kind === 'ctf') await buildCtf(ex);
  else if (!fs.existsSync(fileOf(ex))) fs.writeFileSync(fileOf(ex), ex.starter);
  const p = loadProgress();
  const pr = progressOf(p, id);
  pr.updated = pr.updated || Date.now();
  saveProgress(p);
  return { exercise: publicView(ex), dir, file: ex.kind === 'ctf' ? null : fileOf(ex), binary: ex.kind === 'ctf' ? fileOf(ex) : null, progress: pr };
}

// ------------------------------------------------------------------ the test program
const HARNESS_C = String.raw`#include <limits.h>
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
static int cpw_step = 0, cpw_fails = 0;
static void cpw_fail(const char *what, const char *detail) {
    cpw_fails++;
    printf("  \u2717 step %d: %s -- %s\n", cpw_step, what, detail && *detail ? detail : "false");
}
#define CHECK(e) do { if (!(e)) cpw_fail(#e, ""); } while (0)
#define CHECK_INT(a, b) do { long long cpw_a = (long long)(a), cpw_b = (long long)(b); if (cpw_a != cpw_b) { char cpw_d[128]; snprintf(cpw_d, sizeof cpw_d, "got %lld, expected %lld", cpw_a, cpw_b); cpw_fail(#a, cpw_d); } } while (0)
#define CHECK_DBL(a, b) do { double cpw_a = (a), cpw_b = (b); if (fabs(cpw_a - cpw_b) > 1e-6 * (fabs(cpw_b) > 1 ? fabs(cpw_b) : 1)) { char cpw_d[128]; snprintf(cpw_d, sizeof cpw_d, "got %g, expected %g", cpw_a, cpw_b); cpw_fail(#a, cpw_d); } } while (0)
#define CHECK_STR(a, b) do { const char *cpw_a = (a), *cpw_b = (b); if (!cpw_a || strcmp(cpw_a, cpw_b) != 0) { char cpw_d[320]; snprintf(cpw_d, sizeof cpw_d, "got \"%.140s\", expected \"%.140s\"", cpw_a ? cpw_a : "(NULL)", cpw_b); cpw_fail(#a, cpw_d); } } while (0)
`;
const HARNESS_CPP = String.raw`#include <climits>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <sstream>
#include <string>
#include <vector>
static int cpw_step = 0, cpw_fails = 0;
static void cpw_fail(const std::string& what, const std::string& detail) {
    cpw_fails++;
    std::printf("  \u2717 step %d: %s -- %s\n", cpw_step, what.c_str(), detail.empty() ? "false" : detail.c_str());
}
template <class T> static std::string cpw_show(const std::vector<T>& v) {
    std::ostringstream o; o << '{';
    for (std::size_t i = 0; i < v.size(); ++i) o << (i ? ", " : "") << v[i];
    o << '}'; return o.str();
}
#define CHECK(e) do { if (!(e)) cpw_fail(#e, ""); } while (0)
#define CHECK_INT(a, b) do { long long cpw_a = (long long)(a), cpw_b = (long long)(b); if (cpw_a != cpw_b) cpw_fail(#a, "got " + std::to_string(cpw_a) + ", expected " + std::to_string(cpw_b)); } while (0)
#define CHECK_DBL(a, b) do { double cpw_a = (a), cpw_b = (b); if (std::fabs(cpw_a - cpw_b) > 1e-6 * (std::fabs(cpw_b) > 1 ? std::fabs(cpw_b) : 1)) cpw_fail(#a, "got " + std::to_string(cpw_a) + ", expected " + std::to_string(cpw_b)); } while (0)
#define CHECK_STR(a, b) do { std::string cpw_a = (a), cpw_b = (b); if (cpw_a != cpw_b) cpw_fail(#a, "got \"" + cpw_a + "\", expected \"" + cpw_b + "\""); } while (0)
#define CHECK_VEC(a, b) do { auto cpw_a = (a); auto cpw_b = (b); if (cpw_a != cpw_b) cpw_fail(#a, "got " + cpw_show(cpw_a) + ", expected " + cpw_show(cpw_b)); } while (0)
`;

function harness(ex, upto) {
  const cpp = ex.lang === 'cpp';
  const steps = ex.steps.map((s, i) => ({ s, i })).filter(({ s, i }) => i <= upto && s.type !== 'reflect');
  let src = (cpp ? HARNESS_CPP : HARNESS_C) + '\n' + (ex.decls || '') + '\n';
  for (const { s, i } of steps) src += `static void cpw_step_${i + 1}(void) {\n${s.test}\n}\n`;
  src += `int main(void) {\n    setvbuf(stdout, NULL, _IONBF, 0);\n`;
  for (const { i } of steps) src += `    cpw_step = ${i + 1}; printf("step ${i + 1}: ${(ex.steps[i].title || '').replace(/["\\]/g, '').replace(/%/g, '%%')}\\n"); cpw_step_${i + 1}();\n`;
  src += `    printf(cpw_fails ? "done: %d check%s failed\\n" : "done: every check passed\\n", cpw_fails, cpw_fails == 1 ? "" : "s");\n    return cpw_fails ? 1 : 0;\n}\n`;
  return { src, steps: steps.map(({ i }) => i) };
}

function compilerFor(ex) {
  const b = config.get().build;
  return ex.lang === 'cpp' ? { cc: b.compiler || 'g++', std: b.std || 'c++20' } : { cc: b.cCompiler || 'gcc', std: b.cStd || 'c17' };
}
const SAN = ['-g', '-O0', '-fsanitize=address,undefined', '-fno-sanitize-recover=all', '-fno-omit-frame-pointer'];
const RUN_ENV = { ASAN_OPTIONS: 'detect_leaks=1:abort_on_error=0', UBSAN_OPTIONS: 'print_stacktrace=1:halt_on_error=1' };

// ------------------------------------------------------------------ check
async function check({ id }) {
  const ex = byId.get(id);
  if (!ex) throw new Error(`No exercise ${id}`);
  if (ex.kind === 'ctf') throw new Error('This one is checked by entering the flag');
  const p = loadProgress();
  const pr = progressOf(p, id);
  const current = Math.min(pr.step, ex.steps.length - 1);
  if (ex.steps[current].type === 'reflect' && !pr.done) return { ok: false, reflect: true, step: current, progress: pr };
  pr.attempts++;
  logDay(p, 'checks');
  const r = ex.kind === 'program' ? await checkProgram(ex, current) : await checkFunctions(ex, pr.done ? ex.steps.length - 1 : current);
  // a pass of the step you're on moves you to the next one
  const cur = r.results.find((x) => x.step === current);
  let advanced = false;
  if (r.compiled && !pr.done && cur && cur.passed && r.results.every((x) => x.passed)) {
    pr.step = current + 1;
    advanced = true;
    logDay(p, 'steps');
    if (pr.step >= ex.steps.length) { pr.done = true; pr.step = ex.steps.length; }
  }
  if (r.results.length && r.results.every((x) => x.passed)) logDay(p, 'passedChecks');
  pr.updated = Date.now();
  saveProgress(p);
  api.broadcast('exercises.changed', { id });
  return { ...r, advanced, progress: pr, file: fileOf(ex) };
}

async function checkFunctions(ex, upto) {
  const dir = dirOf(ex);
  const work = path.join(dir, '.check');
  fs.mkdirSync(work, { recursive: true });
  const { src, steps } = harness(ex, upto);
  const ext = ex.lang === 'cpp' ? 'cpp' : 'c';
  const h = path.join(work, `tests.${ext}`);
  fs.writeFileSync(h, src);
  const exe = path.join(work, 'tests');
  const { cc, std } = compilerFor(ex);
  const c = await execStream({ cmd: cc, args: [`-std=${std}`, '-Wall', '-Wextra', '-Wno-unused-parameter', ...SAN, '-I', dir, '-o', exe, fileOf(ex), h, ...(ext === 'c' ? ['-lm'] : [])], cwd: dir, title: `exercise: ${ex.title}` });
  // the test program's own lines are ours, not yours: keep only problems in your files
  const mine = (pr) => pr.filter((x) => !x.file || x.file.startsWith(dir + path.sep) && !x.file.startsWith(work));
  if (c.code !== 0) return { compiled: false, problems: mine(c.problems), results: steps.map((s) => ({ step: s, passed: false, fails: [] })) };
  const r = await execStream({ cmd: exe, args: [], cwd: dir, env: RUN_ENV, title: `exercise: tests up to step ${upto + 1}`, timeoutMs: 10000, source: 'test' });
  const results = parseRun(r.output, steps, r.code);
  return { compiled: true, problems: mine(c.problems).concat(mine(r.problems).map((x) => ({ ...x, runtime: true }))), results, output: r.output.slice(-8000) };
}

function parseRun(out, steps, code) {
  const res = new Map(steps.map((s) => [s, { step: s, passed: false, reached: false, fails: [] }]));
  let at = null, done = false;
  for (const line of out.split('\n')) {
    const st = line.match(/^step (\d+): /);
    if (st) { at = +st[1] - 1; if (res.has(at)) res.get(at).reached = true; continue; }
    const f = line.match(/^ {2}\u2717 step (\d+): (.*?) -- (.*)$/);
    if (f && f[3] === 'false') f[3] = '';
    if (f && res.has(+f[1] - 1)) { res.get(+f[1] - 1).fails.push({ check: f[2], detail: f[3] }); continue; }
    if (/^done: /.test(line)) done = true;
  }
  const crashed = !done;
  const leaked = done && code !== 0 && /LeakSanitizer|detected memory leaks/.test(out);
  const timedOut = /\[stopped after \d+ s/.test(out);
  for (const r of res.values()) {
    if (crashed && r.reached && r.step === at) r.fails.push({ check: timedOut ? 'it never finished' : 'the program crashed here', detail: timedOut ? 'stopped after 10 s: an endless loop?' : crashReason(out) });
    r.passed = r.reached && !r.fails.length && !(crashed && r.step >= at);
  }
  if (leaked) {
    const last = steps[steps.length - 1];
    res.get(last).passed = false;
    res.get(last).fails.push({ check: 'memory leak', detail: 'memory was allocated and never freed (see Problems for where)' });
  }
  return [...res.values()].map(({ reached, ...r }) => r);
}
function crashReason(out) {
  const m = out.match(/ERROR: AddressSanitizer: ([\w-]+)/) || out.match(/runtime error: (.*)/) || out.match(/(Segmentation fault|Aborted)/);
  return m ? m[1] : 'see the Build panel';
}

async function checkProgram(ex, step) {
  const dir = dirOf(ex);
  const work = path.join(dir, '.check');
  fs.mkdirSync(work, { recursive: true });
  const exe = path.join(work, 'program');
  const { cc, std } = compilerFor(ex);
  const c = await execStream({ cmd: cc, args: [`-std=${std}`, '-Wall', '-Wextra', ...SAN, '-o', exe, fileOf(ex), ...(ex.lang === 'c' ? ['-lm'] : [])], cwd: dir, title: `exercise: ${ex.title}` });
  if (c.code !== 0) return { compiled: false, problems: c.problems, results: [{ step, passed: false, fails: [] }] };
  const fails = [];
  let problems = c.problems;
  for (const k of ex.steps[step].cases) {
    const r = await execStream({ cmd: exe, args: [], cwd: dir, env: RUN_ENV, input: k.input, quiet: true, timeoutMs: 5000 });
    problems = problems.concat(r.problems.map((x) => ({ ...x, runtime: true })));
    const out = r.output.replace(/^\[stopped after.*$/m, '');
    if (r.code !== 0) fails.push({ check: `with input ${JSON.stringify(k.input)}`, detail: `the program stopped with exit code ${r.code}${/ERROR: AddressSanitizer|runtime error/.test(r.output) ? ` (${crashReason(r.output)})` : ''}` });
    else if (!same(out, k.expected)) fails.push({ check: `with input ${JSON.stringify(k.input)}`, detail: `printed ${JSON.stringify(out.slice(0, 200))}, expected ${JSON.stringify(k.expected)}` });
  }
  return { compiled: true, problems, results: [{ step, passed: !fails.length, fails }] };
}

// ------------------------------------------------------------------ reflect, flags, hints, reset
function reflect({ id, step, text }) {
  const ex = byId.get(id);
  if (!ex || !ex.steps[step] || ex.steps[step].type !== 'reflect') throw new Error('Not a question step');
  if (String(text || '').trim().length < 15) throw new Error('Write a sentence or two first: it\'s for you, nobody marks it');
  const p = loadProgress();
  const pr = progressOf(p, id);
  pr.reflections[step] = String(text).trim();
  if (pr.step === step) { pr.step++; logDay(p, 'steps'); if (pr.step >= ex.steps.length) pr.done = true; }
  pr.updated = Date.now();
  saveProgress(p);
  api.broadcast('exercises.changed', { id });
  return { answer: ex.steps[step].answer, progress: pr };
}

function flag({ id, flag: f }) {
  const ex = byId.get(id);
  if (!ex || ex.kind !== 'ctf') throw new Error('Not a capture-the-flag exercise');
  const ok = crypto.createHash('sha256').update(String(f || '').trim()).digest('hex') === ex.flagHash;
  const p = loadProgress();
  const pr = progressOf(p, id);
  pr.attempts++;
  logDay(p, 'checks');
  if (ok && !pr.done) { pr.step = ex.steps.length; pr.done = true; logDay(p, 'steps'); logDay(p, 'passedChecks'); }
  pr.updated = Date.now();
  saveProgress(p);
  api.broadcast('exercises.changed', { id });
  return { ok, progress: pr };
}

// the CTF program, built from source you don't see (except where showSource)
async function buildCtf(ex) {
  const dir = dirOf(ex);
  const src = path.join(dir, '.check', `${ex.file}.c`);
  fs.mkdirSync(path.dirname(src), { recursive: true });
  fs.writeFileSync(src, ex.source);
  if (ex.showSource) fs.writeFileSync(path.join(dir, `${ex.file}.c`), ex.source);
  const exe = fileOf(ex);
  if (fs.existsSync(exe)) return;
  const r = await execStream({ cmd: config.get().build.cCompiler || 'gcc', args: [...(ex.build || []), '-o', exe, src], cwd: dir, quiet: true, title: `build ${ex.file}` });
  if (r.code !== 0) throw new Error(`Couldn't build ${ex.file}: ${r.output.slice(0, 400)}`);
  if (!ex.showSource) fs.rmSync(src);
}

function solution({ id, step }) {
  const ex = byId.get(id);
  if (!ex || ex.kind === 'ctf') throw new Error('No solution to show');
  return { text: (ex.solutions && step !== undefined && ex.solutions[step]) || ex.solution };
}

function reset({ id }) {
  const ex = byId.get(id);
  if (!ex) throw new Error(`No exercise ${id}`);
  const f = fileOf(ex);
  let backup = null;
  if (ex.kind !== 'ctf' && fs.existsSync(f)) { backup = `${f}.${Date.now()}.bak`; fs.renameSync(f, backup); fs.writeFileSync(f, ex.starter); }
  const p = loadProgress();
  p.exercises[id] = { step: 0, done: false, attempts: 0, reflections: {}, updated: Date.now() };
  saveProgress(p);
  api.broadcast('exercises.changed', { id });
  return { backup };
}

// the progress map: topics, and what you did each day (no streaks)
function summary() {
  const p = loadProgress();
  const items = list();
  const topics = new Map();
  for (const it of items) {
    const key = `${it.track}\t${it.topic}`;
    const t = topics.get(key) || { track: it.track, topic: it.topic, exercises: [], done: 0, started: 0 };
    t.exercises.push({ id: it.id, title: it.title, step: it.step, steps: it.steps, done: it.done });
    if (it.done) t.done++; else if (it.step > 0 || it.attempts > 0) t.started++;
    topics.set(key, t);
  }
  return { topics: [...topics.values()], days: p.days, totals: { done: items.filter((i) => i.done).length, started: items.filter((i) => !i.done && (i.step > 0 || i.attempts > 0)).length, all: items.length } };
}
function logMinutes({ minutes }) { const p = loadProgress(); logDay(p, 'minutes', Math.max(0, Math.min(600, Math.round(+minutes || 0)))); saveProgress(p); return true; }

function init(a) {
  api = a;
  a.register('exercises.list', list);
  a.register('exercises.open', open);
  a.register('exercises.check', check);
  a.register('exercises.reflect', reflect);
  a.register('exercises.flag', flag);
  a.register('exercises.solution', solution);
  a.register('exercises.reset', reset);
  a.register('progress.summary', summary);
  a.register('progress.minutes', logMinutes);
}

module.exports = { init, DATA, harness, parseRun };
