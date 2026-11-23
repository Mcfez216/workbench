'use strict';
// Backend tests: every module, through the same WebSocket the window uses.
// Run by test/run-all.js, which sets HOME and PATH to a throwaway world.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const { connect } = require('./client');

const HOME = process.env.HOME;
const PROJ = path.join(HOME, 'cpp-path');
const LIB = path.join(PROJ, 'src', 'mathx.cpp');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 10000) => { for (let i = 0; i < ms / 100 && !fn(); i++) await sleep(100); return fn(); };
const results = [];
async function test(name, fn) {
  try { await fn(); results.push([true, name]); console.log(`  ok    ${name}`); }
  catch (e) { results.push([false, name]); console.log(`  FAIL  ${name}\n        ${e.stack.split('\n').slice(0, 3).join('\n        ')}`); }
}

(async () => {
  const c = await connect();
  const { call, waitFor } = c;

  await test('the server refuses requests without the token', async () => {
    const code = await new Promise((r) => http.get(c.srv.origin + '/', (res) => { res.resume(); r(res.statusCode); }));
    assert.strictEqual(code, 403);
    const bad = await new Promise((r) => http.get(c.srv.origin + '/?t=' + 'f'.repeat(64), (res) => { res.resume(); r(res.statusCode); }));
    assert.strictEqual(bad, 403);
  });
  await test('a WebSocket from another origin is refused, even with the cookie', async () => {
    const ws = new WebSocket(c.srv.origin.replace('http', 'ws') + '/ws', { headers: { Cookie: c.cookie, Origin: 'http://evil.example' } });
    const err = await new Promise((r) => { ws.on('error', (e) => r(e.message)); ws.on('open', () => r('opened')); });
    assert.match(err, /403/);
  });
  await test('the page is served with a content security policy', async () => {
    const csp = await new Promise((r) => http.get(c.srv.origin + '/', { headers: { Cookie: c.cookie } }, (res) => { res.resume(); r(res.headers['content-security-policy']); }));
    assert.match(csp, /script-src 'self'/);
  });

  await test('files: list, read, write, and refuse to overwrite a newer file', async () => {
    const list = await call('files.list', { dir: PROJ });
    assert.ok(list.some((e) => e.name === 'CMakeLists.txt'));
    const f = path.join(PROJ, 'notes.txt');
    const w = await call('files.write', { file: f, text: 'one\n' });
    const r = await call('files.read', { file: f });
    assert.strictEqual(r.text, 'one\n');
    fs.writeFileSync(f, 'changed elsewhere\n');
    fs.utimesSync(f, new Date(), new Date(Date.now() + 5000));
    await assert.rejects(call('files.write', { file: f, text: 'two\n', expectMtime: w.mtime }), /changed on disk/);
    fs.rmSync(f);
  });

  await test('terminal: a shell runs, echoes, and resizes', async () => {
    const t = await call('pty.open', { cwd: PROJ, argv: ['/bin/sh'] });
    const got = waitFor('pty.data', (d) => d.id === t.id && /cpw-hello-42/.test(d.data));
    await call('pty.write', { id: t.id, data: 'echo cpw-hello-$((6*7))\n' });
    await got;
    await call('pty.resize', { id: t.id, rows: 30, cols: 100 });
    const size = waitFor('pty.data', (d) => d.id === t.id && /30 100/.test(d.data));
    await call('pty.write', { id: t.id, data: 'stty size\n' });
    await size;
    await call('pty.close', { id: t.id });
  });

  await test('terminal: closing one hangs up on the program running in it, too', async () => {
    const { execFileSync } = require('child_process');
    const running = () => { try { return execFileSync('pgrep', ['-f', 'sleep 4321'], { encoding: 'utf8' }).trim(); } catch (e) { return ''; } };
    const t = await call('pty.open', { cwd: PROJ, argv: ['/bin/bash', '--norc', '-i'] });
    await new Promise((r) => setTimeout(r, 300));
    await call('pty.write', { id: t.id, data: 'sleep 4321\n' });
    for (let i = 0; i < 30 && !running(); i++) await new Promise((r) => setTimeout(r, 100));
    assert.ok(running(), 'sleep started');
    const closed = waitFor('pty.closed', (d) => d.id === t.id);
    await call('pty.close', { id: t.id });
    await closed;
    for (let i = 0; i < 60 && running(); i++) await new Promise((r) => setTimeout(r, 100));
    assert.strictEqual(running(), '', `the foreground program is gone (still running: ${running() && require('child_process').execFileSync('ps', ['-o', 'pid,pgid,stat,cmd', '-p', running().split('\n').join(',')], { encoding: 'utf8' })})`);
    assert.ok(!(await call('pty.list')).some((x) => x.id === t.id), 'and the session with it');
  });
  await test('terminal: typing exit closes the tab (no dead "(ended)" tabs left behind)', async () => {
    const t = await call('pty.open', { cwd: PROJ, argv: ['/bin/sh'] });
    await new Promise((r) => setTimeout(r, 2200));      // a shell that dies at once stays, to show why
    const closed = waitFor('pty.closed', (d) => d.id === t.id);
    await call('pty.write', { id: t.id, data: 'exit\n' });
    await closed;
    assert.ok(!(await call('pty.list')).some((x) => x.id === t.id));
  });

  await test('parse: g++ and clang template errors point at your line; ld, CMake, Catch2, UBSan, Watcom too', async () => {
    const { OutputParser, catchSummary, ctestLine } = require('../server/parse');
    const run = (text, cwd = '/w') => { const p = new OutputParser(cwd); for (const l of text.split('\n')) p.line(l); return p.problems; };
    let p = run([
      "/usr/include/c++/13/bits/stl_function.h: In instantiation of 'constexpr bool std::less<_Tp>::operator()':",
      "/usr/include/c++/13/bits/stl_map.h:531:32:   required from 'std::map<K, int>::operator[]'",
      't.cpp:6:11:   required from here',
      "/usr/include/c++/13/bits/stl_function.h:408:20: error: no match for 'operator<' (operand types are 'const K' and 'const K')",
      "/usr/include/c++/13/bits/stl_iterator.h:583:5: note: candidate: 'template<...>'",
    ].join('\n'));
    assert.strictEqual(p.length, 1);
    assert.deepStrictEqual([p[0].file, p[0].line, p[0].col], ['/w/t.cpp', 6, 11]);
    assert.match(p[0].notes[0].message, /inside the library: stl_function\.h:408/);
    p = run([
      "/usr/include/c++/v1/__functional/operations.h:372:16: error: invalid operands to binary expression ('const K' and 'const K')",
      "/usr/include/c++/v1/map:1100:5: note: in instantiation of member function 'std::less<K>::operator()' requested here",
      "/w/t.cpp:6:5: note: in instantiation of member function 'std::map<K, int>::operator[]' requested here",
    ].join('\n'));
    assert.deepStrictEqual([p[0].file, p[0].line], ['/w/t.cpp', 6]);
    p = run("/usr/bin/ld: CMakeFiles/ex.dir/main.cpp.o: in function `main':\n/w/main.cpp:7:(.text+0x1a): undefined reference to `calc::add(int, int)'\ncollect2: error: ld returned 1 exit status");
    assert.deepStrictEqual([p.length, p[0].file, p[0].line, p[0].source], [1, '/w/main.cpp', 7, 'ld']);
    p = run('CMake Error at src/CMakeLists.txt:3 (add_library):\n  Cannot find source file:\n\n    nope.cpp\n\n');
    assert.deepStrictEqual([p[0].file, p[0].line, p[0].severity], ['/w/src/CMakeLists.txt', 3, 'error']);
    assert.match(p[0].message, /add_library: Cannot find source file:/);
    p = run('/w/tests/T.cpp:14: FAILED:\n  REQUIRE( splitWords("a b").size() == 2 )\nwith expansion:\n  0 == 2\n\n');
    assert.deepStrictEqual([p[0].file, p[0].line], ['/w/tests/T.cpp', 14]);
    assert.match(p[0].message, /REQUIRE\( splitWords\("a b"\)\.size\(\) == 2 \) → 0 == 2/);
    p = run('/w/s.cpp:6:9: runtime error: signed integer overflow: 2147483647 + 1 cannot be represented in type \'int\'');
    assert.deepStrictEqual([p[0].line, p[0].col, p[0].runtime], [6, 9, true]);
    p = run('hello.cpp(12): Error! E029: col(5) symbol \'x\' has not been declared', '/w/dos');
    assert.deepStrictEqual([p[0].file, p[0].line, p[0].col, p[0].source], ['/w/dos/hello.cpp', 12, 5, 'watcom']);
    assert.deepStrictEqual(catchSummary('test cases: 7 | 2 passed | 5 failed'), { total: 7, passed: 2, failed: 5 });
    assert.deepStrictEqual(catchSummary('All tests passed (12 assertions in 5 test cases)'), { total: 5, passed: 5, failed: 0 });
    assert.strictEqual(ctestLine('  3/60 Test  #3: splitWords handles spaces .......***Failed    0.02 sec').status, 'failed');
    assert.strictEqual(ctestLine(' 12/60 Test #12: FixedStack push and pop ..........   Passed    0.01 sec').name, 'FixedStack push and pop');
  });

  await test('cmake: the project root, first build configures, the File API lists every target', async () => {
    const r0 = await call('cmake.root', { file: path.join(PROJ, 'projects', 'P01_words', 'words.cpp') });
    assert.strictEqual(r0.root, PROJ);
    assert.strictEqual(r0.configured, false);
    const r = await call('build.build', { file: path.join(PROJ, 'examples', '03_square.cpp') });
    assert.strictEqual(r.kind, 'cmake');
    assert.strictEqual(r.code, 0, 'builds');
    assert.ok(fs.existsSync(path.join(PROJ, 'build', 'compile_commands.json')), 'compile_commands.json for clangd');
    const t = await call('cmake.targets', { root: PROJ });
    const kinds = Object.fromEntries(t.targets.map((x) => [x.name, x.kind]));
    assert.deepStrictEqual(kinds, { ex01_greet: 'example', ex02_dangling: 'example', ex03_square: 'example', p01_words_stub_tests: 'stub', p01_words_solution_tests: 'solution', demo: 'library', demo_tests: 'tests' });
    assert.strictEqual(t.buildType, 'Debug');
    const lr = await call('cmake.root', { file: path.join(PROJ, 'build', 'CMakeFiles', 'x.cpp') });
    assert.strictEqual(lr.root, PROJ, 'a file inside build/ belongs to its project');
  });

  await test('build: compile errors and link errors land on your line', async () => {
    const orig = fs.readFileSync(LIB, 'utf8');
    try {
      fs.writeFileSync(LIB, orig.replace('return a - b;', 'return a - nope;'));
      let r = await call('build.build', { file: LIB });
      assert.notStrictEqual(r.code, 0);
      const e = r.problems.find((p) => p.severity === 'error');
      assert.deepStrictEqual([e.file, e.line, e.col], [LIB, 5, 36]);
      assert.match(e.message, /nope/);
      fs.writeFileSync(LIB, orig.replace('int square(int x) { return x * x; }\n', ''));
      // one program, one linker: parallel links can interleave their messages
      r = await call('build.build', { file: LIB, target: 'ex03_square' });
      const ld = r.problems.find((p) => p.source === 'ld');
      assert.ok(ld, 'a linker problem');
      assert.match(ld.message, /undefined reference to `square\(int\)'/);
      assert.deepStrictEqual([ld.file, ld.line], [path.join(PROJ, 'examples', '03_square.cpp'), 7]);
    } finally { fs.writeFileSync(LIB, orig); }
    assert.strictEqual((await call('build.build', { file: LIB })).code, 0, 'builds once fixed');
  });

  await test('ctest: lists, runs all with live results, runs one, finds the TEST_CASE', async () => {
    const l = await call('ctest.list', { root: PROJ });
    assert.deepStrictEqual(l.tests.map((t) => [t.name, t.target]), [['add adds', 'demo_tests'], ['sub subtracts', 'demo_tests'], ['square squares', 'demo_tests'],
      ['words counts words', 'p01_words_solution_tests'], ['words handles empty', 'p01_words_solution_tests'], ['words ignores extra spaces', 'p01_words_solution_tests']]);
    const live = [];
    c.on((ev, d) => { if (ev === 'ctest.result') live.push(d); });
    let r = await call('ctest.run', { root: PROJ });
    assert.ok(r.ok);
    assert.deepStrictEqual(r.summary, { percent: 100, failed: 0, total: 6 });
    assert.strictEqual(live.length, 6);
    r = await call('ctest.run', { root: PROJ, indexes: [2], buildFirst: false });
    assert.deepStrictEqual(r.results.map((x) => [x.name, x.status]), [['sub subtracts', 'passed']]);
    const loc = await call('ctest.locate', { root: PROJ, name: 'sub subtracts', target: 'demo_tests' });
    assert.deepStrictEqual(loc, { file: path.join(PROJ, 'tests', 'MathTest.cpp'), line: 8 });
  });

  await test('ctest: a broken function fails its test, and the failure points at the CHECK', async () => {
    const orig = fs.readFileSync(LIB, 'utf8');
    try {
      fs.writeFileSync(LIB, orig.replace('return a - b;', 'return a + b;'));
      const r = await call('ctest.run', { root: PROJ });
      assert.strictEqual(r.ok, false);
      assert.deepStrictEqual(r.summary, { percent: 83, failed: 1, total: 6 });
      assert.deepStrictEqual(r.results.filter((x) => x.status === 'failed').map((x) => x.name), ['sub subtracts']);
      const f = r.problems.find((p) => p.source === 'test');
      assert.deepStrictEqual([f.file, f.line], [path.join(PROJ, 'tests', 'MathTest.cpp'), 9]);
      assert.match(f.message, /CHECK\( sub\(5, 3\) == 2 \)/);
    } finally { fs.writeFileSync(LIB, orig); }
  });

  await test('projects: a stub builds and reports how many test cases pass; one test by name', async () => {
    const pl = await call('projects.list', { root: PROJ });
    assert.strictEqual(pl.projects.length, 1);
    const p = pl.projects[0];
    assert.deepStrictEqual([p.id, p.stub, p.solution], ['p01_words', 'p01_words_stub_tests', 'p01_words_solution_tests']);
    assert.deepStrictEqual(p.stubFiles, [path.join(PROJ, 'projects', 'P01_words', 'words.cpp')]);
    assert.deepStrictEqual(p.solutionFiles, [path.join(PROJ, 'solutions', 'P01_words', 'words.cpp')]);
    let r = await call('projects.run', { root: PROJ, id: 'p01_words' });
    assert.deepStrictEqual(r.summary, { total: 3, passed: 1, failed: 2 });
    assert.deepStrictEqual(r.problems.map((x) => x.line), [5, 13]);
    r = await call('projects.run', { root: PROJ, id: 'p01_words', testName: 'words counts words' });
    assert.deepStrictEqual(r.summary, { total: 1, passed: 0, failed: 1 });
    // finish the stub: everything passes
    const stub = p.stubFiles[0];
    const orig = fs.readFileSync(stub, 'utf8');
    try {
      fs.writeFileSync(stub, fs.readFileSync(path.join(PROJ, 'solutions', 'P01_words', 'words.cpp'), 'utf8'));
      r = await call('projects.run', { root: PROJ, id: 'p01_words' });
      assert.deepStrictEqual(r.summary, { total: 3, passed: 3, failed: 0 });
    } finally { fs.writeFileSync(stub, orig); }
  });

  await test('run: Ctrl+F9 builds the file\'s program and runs it in a terminal that reads your typing', async () => {
    let out = '';
    c.on((ev, d) => { if (ev === 'pty.data') out += d.data; });
    const r = await call('cmake.run', { file: path.join(PROJ, 'examples', '01_greet.cpp') });
    assert.ok(r.ok);
    assert.strictEqual(r.target, 'ex01_greet');
    assert.ok(await until(() => /Name\?/.test(out)));
    await call('pty.write', { id: r.terminal.id, data: 'Josh\n' });
    assert.ok(await until(() => /Hello, Josh!/.test(out)));
    await call('pty.close', { id: r.terminal.id });
    const lib = await call('cmake.run', { file: LIB });
    assert.strictEqual(lib.needTarget, true, 'a library file asks which program');
    assert.ok(lib.choices.some((x) => x.name === 'ex03_square' && x.kind === 'example'));
  });

  await test('run: an AddressSanitizer report becomes a problem on the line, with where it was freed', async () => {
    const got = waitFor('build.runtime', () => true, 30000);
    const r = await call('cmake.run', { file: path.join(PROJ, 'examples', '02_dangling.cpp') });
    assert.ok(r.ok);
    const d = await got;
    const p = d.problems[0];
    assert.deepStrictEqual([p.file, p.line, p.runtime], [path.join(PROJ, 'examples', '02_dangling.cpp'), 8, true]);
    assert.match(p.message, /^ASan: heap-use-after-free/);
    assert.deepStrictEqual(p.notes.map((n) => [n.line, n.message.split(' (')[0]]), [[7, 'freed here'], [5, 'allocated here']]);
    await call('pty.close', { id: r.terminal.id });
  });

  await test('debug: gdb stops at the cursor line, with LeakSanitizer off', async () => {
    let out = '';
    c.on((ev, d) => { if (ev === 'pty.data') out += d.data.replace(/\x1b\[[0-9;]*m/g, ''); });
    const r = await call('cmake.debug', { file: path.join(PROJ, 'examples', '03_square.cpp'), line: 7 });
    assert.ok(r.ok);
    assert.ok(await until(() => /Breakpoint 1, main \(\) at .*03_square\.cpp:7/.test(out), 20000), out.slice(-500));
    await call('pty.write', { id: r.terminal.id, data: 'print i\n' });
    assert.ok(await until(() => /\$1 = 1/.test(out)));
    await call('pty.write', { id: r.terminal.id, data: 'show environment ASAN_OPTIONS\n' });
    assert.ok(await until(() => /ASAN_OPTIONS = detect_leaks=0/.test(out)));
    await call('pty.close', { id: r.terminal.id });
  });

  await test('sandbox: C++ with the sanitizers, a runtime problem on the scratch line, and the assembly', async () => {
    const src = '#include <climits>\n#include <iostream>\n\nint main() {\n    int big = INT_MAX;\n    big += 1;\n    std::cout << big << \'\\n\';\n    return 0;\n}\n';
    const got = waitFor('build.runtime', () => true, 30000);
    const r = await call('sandbox.run', { source: src, compiler: 'g++', std: 'c++20' });
    assert.ok(r.ok, 'compiles');
    const d = await got;
    assert.deepStrictEqual([d.problems[0].file, d.problems[0].line], [r.file, 6]);
    assert.match(d.problems[0].message, /UBSan: signed integer overflow/);
    const bad = await call('sandbox.run', { source: 'int main() { return nope; }\n' });
    assert.strictEqual(bad.ok, false);
    assert.deepStrictEqual([bad.problems[0].file, bad.problems[0].line], [r.file, 1]);
    const asm = await call('sandbox.asm', { source: 'int square(int x) {\n    return x * x;\n}\n', opt: '-O2' });
    assert.ok(asm.ok);
    const text = asm.lines.map((l) => l.text).join('\n');
    assert.match(text, /^square\(int\):$/m, 'demangled function label');
    assert.match(text, /imul/);
    assert.doesNotMatch(text, /\.cfi_|\.loc|\.file|debug_info/);
    assert.ok(asm.lines.some((l) => /imul/.test(l.text) && l.src === 2), 'instructions know their source line');
  });

  await test('analyze: clang-tidy and cppcheck findings come back as problems', async () => {
    const f = path.join(PROJ, 'lint', 'demo.cpp');
    const t = await call('analyze.tidy', { file: f });
    assert.ok(t.problems.some((p) => p.file === f && p.line === 8 && /nullptr/.test(p.message)), JSON.stringify(t.problems.map((p) => [p.line, p.message])));
    assert.ok(t.problems.some((p) => p.file === f && /balance/.test(p.message) && /cppcoreguidelines-pro-type-member-init/.test(p.message)));
    const k = await call('analyze.cppcheck', { file: f });
    assert.ok(k.problems.some((p) => p.file === f && /balance|uninit/i.test(p.message)), JSON.stringify(k.problems.map((p) => [p.line, p.message])));
  });

  await test('judge: AC, WA, TLE and RE, with the cases remembered', async () => {
    const file = path.join(PROJ, 'cp', 'template.cpp');
    const cases = [
      { input: '5\n1 2 3 4 5\n', expected: '15\n' },
      { input: '3\n1 1 1\n', expected: '4' },
      { input: '2\n10   20', expected: '  30  ' },
      { input: '1\n7\n', expected: '' },
    ];
    let r = await call('cp.judge', { file, cases, timeLimitMs: 2000 });
    assert.ok(r.compiled);
    assert.deepStrictEqual(r.results.map((x) => x.verdict), ['AC', 'WA', 'AC', 'RAN']);
    assert.strictEqual(r.results[3].output.trim(), '7');
    const saved = await call('cp.cases', { file });
    assert.strictEqual(saved.cases.length, 4);
    const slow = path.join(PROJ, 'cp', 'slow.cpp');
    fs.writeFileSync(slow, '#include <cstdlib>\nint main() {\n    volatile unsigned long n = 0;\n    for (;;) ++n;\n}\n');
    r = await call('cp.judge', { file: slow, cases: [{ input: '', expected: '1' }], timeLimitMs: 300 });
    assert.strictEqual(r.results[0].verdict, 'TLE');
    fs.writeFileSync(slow, '#include <cstdlib>\nint main() { std::abort(); }\n');
    r = await call('cp.judge', { file: slow, cases: [{ input: '', expected: '1' }] });
    assert.strictEqual(r.results[0].verdict, 'RE');
    fs.writeFileSync(slow, 'int main() { return nope; }\n');
    r = await call('cp.judge', { file: slow, cases: [{ input: '', expected: '1' }] });
    assert.strictEqual(r.compiled, false);
    assert.strictEqual(r.problems[0].line, 1);
    fs.rmSync(slow);
    const np = await call('cp.newProblem', { name: 'cf-1850A' });
    assert.strictEqual(np.file, path.join(PROJ, 'cp', 'problems', 'cf-1850A.cpp'));
    assert.strictEqual(fs.readFileSync(np.file, 'utf8'), fs.readFileSync(file, 'utf8'), 'starts from cp/template.cpp');
    await assert.rejects(call('cp.newProblem', { name: 'cf-1850A' }), /already exists/);
    fs.rmSync(path.join(PROJ, 'cp', 'problems'), { recursive: true });
  });

  await test('files: copying the vault\'s _code never overwrites your work', async () => {
    const from = path.join(HOME, 'FakeVault', '_code');
    const to = path.join(HOME, 'copy-test');
    fs.mkdirSync(path.join(to, 'src'), { recursive: true });
    fs.writeFileSync(path.join(to, 'src', 'a.cpp'), 'my own work\n');
    const r = await call('files.copyDir', { from, to });
    assert.deepStrictEqual([r.copied, r.kept, r.gitignore], [2, 1, true]);
    assert.match(fs.readFileSync(path.join(to, '.gitignore'), 'utf8'), /^build\/$/m);
    assert.strictEqual(fs.readFileSync(path.join(to, 'src', 'a.cpp'), 'utf8'), 'my own work\n');
    assert.ok(fs.statSync(path.join(to, 'scripts', 'run.sh')).mode & 0o100, 'scripts stay executable');
    await assert.rejects(call('files.copyDir', { from, to: path.join(from, 'inside') }), /outside the vault/);
    fs.rmSync(to, { recursive: true });
  });

  await test('dos: without Open Watcom it says how to get it', async () => {
    const st = await call('dos.status');
    assert.ok('owcc' in st && 'dosbox' in st);
    if (!st.owcc) await assert.rejects(call('dos.build', { file: path.join(PROJ, 'examples', '01_greet.cpp') }), /install-open-watcom\.sh/);
    const tools = await call('build.tools');
    assert.strictEqual(tools['g++'], true);
    assert.strictEqual(tools.cmake, true);
  });

  await test('git: status, stage one hunk, commit, log, format-patch', async () => {
    const TEST = path.join(PROJ, 'tests', 'MathTest.cpp');
    const orig = fs.readFileSync(TEST, 'utf8');
    fs.writeFileSync(TEST, '// SPDX-License-Identifier: MIT\n' + orig + '// end\n');
    const st = await call('git.status', { cwd: PROJ });
    assert.strictEqual(st.branch, 'main');
    assert.deepStrictEqual(st.unstaged.map((u) => u.path), ['tests/MathTest.cpp']);
    const { text } = await call('git.diff', { cwd: PROJ, file: 'tests/MathTest.cpp' });
    const header = text.split('\n@@')[0];
    const firstHunk = '@@' + text.split('\n@@')[1];
    await call('git.applyHunk', { cwd: PROJ, patch: header + '\n' + firstHunk.replace(/\n*$/, '') + '\n' });
    const staged = await call('git.diff', { cwd: PROJ, file: 'tests/MathTest.cpp', staged: true });
    assert.match(staged.text, /SPDX/);
    assert.doesNotMatch(staged.text, /\/\/ end/);
    await call('git.commit', { cwd: PROJ, message: 'tests: add an SPDX line', signoff: false });
    const log = await call('git.log', { cwd: PROJ });
    assert.strictEqual(log[0].subject, 'tests: add an SPDX line');
    const show = await call('git.diff', { cwd: PROJ, commit: 'HEAD' });
    assert.doesNotMatch(show.text, /Signed-off-by/);
    const fp = await call('git.formatPatch', { cwd: PROJ, count: 1, outDir: path.join(HOME, 'outgoing') });
    assert.strictEqual(fp.files.length, 1);
    assert.match(fs.readFileSync(fp.files[0], 'utf8'), /Subject: \[PATCH\] tests: add an SPDX line/);
    require('child_process').execFileSync('git', ['reset', '-q', '--hard', 'HEAD~1'], { cwd: PROJ });
  });

  if (process.env.CPW_VAULT_OK) {
    await test('guides: the CPP-Path vault lists, searches and makes three decks of flashcards', async () => {
      const l = await call('guides.list');
      assert.ok(l.notes.length >= 40, `notes ${l.notes.length}`);
      assert.ok(l.notes.some((n) => n.name === 'CPP Start Here'));
      const hits = await call('guides.search', { query: 'unique_ptr' });
      assert.ok(hits.length > 5);
      const cards = await call('guides.cards');
      assert.ok(cards.questions.length >= 50, `questions ${cards.questions.length}`);
      assert.ok(cards.why.length >= 20, `why ${cards.why.length}`);
      assert.ok(cards.reference.length >= 8, `reference ${cards.reference.length}`);
      assert.ok(cards.questions.filter((q) => q.note === 'CPP Phase Gates').every((q) => q.phase !== null), 'gate questions get their gate\'s phase');
      assert.ok(cards.why.some((q) => /^Why does "Smart Pointers" matter\?$/.test(q.q)));
      assert.ok(cards.reference.some((q) => /heap-use-after-free/.test(q.q)));
      const code = await call('guides.codePath', { rel: '_code/src/mathx.cpp' });
      assert.strictEqual(code.path, LIB, '_code/ paths in notes open your workspace copy first');
    });
  }

  if (process.env.CPW_FAKE_SERVERS) {
    await test('mail: reads the inbox with threads from the keyring password', async () => {
      const st = await call('mail.status');
      assert.ok(st.hasPassword);
      const r = await call('mail.list', { folder: 'INBOX' });
      assert.strictEqual(r.messages.length, 4);
      const review = r.messages.find((m) => /^Re: \[PATCH\]/.test(m.subject));
      assert.strictEqual(review.inReplyTo, '<patch-1@example.org>');
      const patch = r.messages.find((m) => /^\[PATCH\]/.test(m.subject));
      const msg = await call('mail.read', { folder: 'INBOX', uid: patch.uid });
      assert.ok(msg.isPatch);
      assert.match(msg.listId, /cpp-study/);
    });
    await test('mail: a patch from the list applies with git am', async () => {
      const r = await call('mail.list', { folder: 'INBOX' });
      const patch = r.messages.find((m) => /^\[PATCH\]/.test(m.subject));
      await call('mail.apply', { folder: 'INBOX', uid: patch.uid, repo: PROJ });
      const log = await call('git.log', { cwd: PROJ });
      assert.strictEqual(log[0].subject, 'mathx: say what is in the library');
      assert.strictEqual(log[0].author, 'Alice Dev');
      require('child_process').execFileSync('git', ['reset', '-q', '--hard', 'HEAD~1'], { cwd: PROJ });
    });
    await test('mail: sending is plain text, threaded, from your name', async () => {
      await call('mail.send', { to: 'bob@example.org', cc: 'cpp-study@example.org', subject: 'Re: [PATCH] mathx: say what is in the library', text: '> Looks right to me.\n\nThanks Bob!\n', inReplyTo: '<review-1@example.org>', references: ['<patch-1@example.org>', '<review-1@example.org>'] });
      // run-all.js checks what the SMTP server received
    });
    await test('irc: logs in with SASL (password from the keyring), joins #c++-basic, and talks', async () => {
      const lines = [];
      c.on((ev, d) => { if (ev === 'irc.line') lines.push(d); });
      const joined = waitFor('irc.users', (d) => d.buffer === '#c++-basic' && d.users.includes('alice'), 10000);
      await call('irc.connect');
      await joined;
      await until(() => lines.some((l) => /welcome to #c\+\+-basic/.test(l.line.text)));
      assert.ok(lines.some((l) => /Logged in to your account joshm/.test(l.line.text)), 'SASL login');
      assert.ok(lines.some((l) => l.line.nick === 'alice' && /hi joshm/.test(l.line.text)));
      await call('irc.send', { buffer: '#c++-basic', text: 'hello from the workbench' });
      await call('irc.send', { buffer: '#c++-basic', text: '/me waves' });
      await assert.rejects(call('irc.send', { buffer: '#c++-basic', text: '/frobnicate' }), /Unknown command/);
      const st = await call('irc.state');
      assert.strictEqual(st.status.state, 'connected');
      const pw = await call('irc.hasPassword');
      assert.ok(pw.stored);
      assert.strictEqual(pw.user, 'joshm@127.0.0.1');
      await call('irc.disconnect');
    });
  }

  await test('config: finds the CPP-Path vault inside an Obsidian vault on its own', async () => {
    const v = path.join(HOME, 'Documents', 'Obsidian', 'Programming', 'CPP-Path');
    fs.mkdirSync(v, { recursive: true });
    fs.writeFileSync(path.join(v, 'CPP Start Here.md'), '# CPP Start Here\n');
    try { assert.strictEqual(require('../server/config').findVault(), v); }
    finally { fs.rmSync(path.join(HOME, 'Documents'), { recursive: true }); }
  });

  await test('distro: Ubuntu or Fedora, and the install line to match', async () => {
    const d = require('../server/distro');
    assert.strictEqual(d.familyOf({ ID: 'ubuntu', ID_LIKE: 'debian' }), 'debian');
    assert.strictEqual(d.familyOf({ ID: 'linuxmint', ID_LIKE: 'ubuntu debian' }), 'debian');
    assert.strictEqual(d.familyOf({ ID: 'fedora' }), 'fedora');
    assert.strictEqual(d.familyOf({ ID: 'arch' }), 'other');
    const info = await call('app.info');
    assert.strictEqual(info.distro.family, d.FAMILY);
    const r = await call('build.installLine', { tools: ['clangd', 'clang-tidy', 'g++', 'secret-tool'] });
    if (d.FAMILY === 'debian') {
      assert.strictEqual(r.line, 'sudo apt install clangd clang-tidy g++ libsecret-tools');
      assert.strictEqual(d.installHint('dosbox-x'), 'sudo apt install dosbox-x');
    }
    if (d.FAMILY === 'fedora') assert.strictEqual(r.line, 'sudo dnf install clang-tools-extra gcc-c++ libsecret');
  });

  await test('secrets: "no keyring running" is told apart from "nothing stored"', async () => {
    const bin = fs.mkdtempSync(path.join(HOME, 'nokeyring-'));
    fs.writeFileSync(path.join(bin, 'secret-tool'), '#!/bin/sh\necho "secret-tool: Cannot autolaunch D-Bus without X11 $DISPLAY" >&2\nexit 1\n', { mode: 0o755 });
    const secrets = require('../server/secrets');
    const saved = process.env.PATH;
    process.env.PATH = `${bin}:${saved}`;
    try {
      await assert.rejects(secrets.lookup('neomutt', 'josh@example.org'), /No keyring is answering.*Cannot autolaunch D-Bus/);
      await assert.rejects(secrets.store('neomutt', 'josh@example.org', 'pw', 'x'), /No keyring is answering/);
      fs.writeFileSync(path.join(bin, 'secret-tool'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
      assert.strictEqual(await secrets.lookup('neomutt', 'josh@example.org'), null, 'nothing stored is just null');
    } finally { process.env.PATH = saved; fs.rmSync(bin, { recursive: true }); }
  });

  await test('config: finds a vault on the Windows side under WSL (Documents, OneDrive)', async () => {
    const users = path.join(HOME, 'fake-c', 'Users');
    const v = path.join(users, 'josh', 'OneDrive - Work', 'Documents', 'Obsidian', 'Programming', 'CPP-Path');
    fs.mkdirSync(path.join(users, 'Public', 'Documents'), { recursive: true });
    fs.mkdirSync(v, { recursive: true });
    fs.writeFileSync(path.join(v, 'CPP Start Here.md'), '# CPP Start Here\n');
    process.env.WORKBENCH_WIN_USERS = users;
    try {
      const d = require('../server/distro');
      assert.deepStrictEqual(d.windowsHomes(), [path.join(users, 'josh')]);
      assert.strictEqual(d.findFolderWith('CPP Start Here.md', { home: path.join(HOME, 'nowhere') }), v);
    } finally { delete process.env.WORKBENCH_WIN_USERS; fs.rmSync(path.join(HOME, 'fake-c'), { recursive: true }); }
  });

  await test('state: remembers values', async () => {
    await call('state.set', { key: 'test.x', value: { a: 1 } });
    assert.deepStrictEqual(await call('state.get', { key: 'test.x' }), { a: 1 });
  });

  await c.close();
  const failed = results.filter((r) => !r[0]).length;
  console.log(`backend: ${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
