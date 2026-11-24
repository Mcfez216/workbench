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

  await test('config: an old single "vault" becomes the first of several, with the new defaults', async () => {
    const tmp = fs.mkdtempSync(path.join(HOME, 'cfg-'));
    const dir = path.join(tmp, '.config', 'cpp-path-workbench');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ vault: '~/Old Vault', theme: 'turbo' }));
    const script = `const c = require(${JSON.stringify(path.join(__dirname, '..', 'server', 'config.js'))});
      const x = c.load(); const a = { vaults: x.vaults, vault: x.vault, language: x.language, look: x.look, cStd: x.build.cStd, theme: x.theme };
      const y = c.save({ ...x, vaults: [] }); const b = { vaults: y.vaults, vault: y.vault };
      const z = c.save({ ...x, vaults: [{ path: '/n/A' }, '/n/B', { path: '/n/A/' }, { path: ' ' }] }); console.log(JSON.stringify({ a, b, z: z.vaults }));`;
    const out = JSON.parse(require('child_process').execFileSync(process.execPath, ['-e', script], { env: { ...process.env, HOME: tmp }, encoding: 'utf8' }));
    assert.deepStrictEqual(out.a.vaults, [{ path: '~/Old Vault', name: 'Old Vault' }]);
    assert.strictEqual(out.a.vault, '~/Old Vault');
    assert.deepStrictEqual([out.a.language, out.a.look.palette, out.a.look.retroFont, out.a.cStd, out.a.theme], ['cpp', 'soft', 'vga', 'c17', 'turbo']);
    assert.deepStrictEqual(out.b, { vaults: [], vault: null }, 'removing every vault sticks: the old "vault" doesn\'t come back');
    assert.deepStrictEqual(out.z.map((v) => v.path), ['/n/A', '/n/B'], 'no blanks, no duplicates');
    fs.rmSync(tmp, { recursive: true });
  });

  await test('guides: several vaults at once; each note knows its vault and links stay inside it', async () => {
    const l = await call('guides.list');
    const cv = l.vaults.find((v) => v.name === 'C-Path'), mv = l.vaults.find((v) => v.name === 'Scratch Notes');
    assert.ok(cv && mv, JSON.stringify(l.vaults));
    assert.deepStrictEqual([cv.count, cv.start, mv.count, mv.start], [2, 'C Start Here', 2, 'Start Here']);
    assert.strictEqual(l.notes.filter((n) => n.name === 'Pointers').length, 2, 'the same name in two vaults');
    const inC = await call('guides.read', { name: 'Pointers', vault: cv.path });
    assert.match(inC.text, /Pointers in C/);
    assert.strictEqual(inC.vaultName, 'C-Path');
    const mine = await call('guides.read', { name: 'Pointers', vault: mv.path });
    assert.match(mine.text, /in my words/);
    const hits = await call('guides.search', { query: 'pointers', vault: mv.path });
    assert.ok(hits.length && hits.every((x) => x.vault === mv.path));
    const all = await call('guides.search', { query: 'pointers' });
    assert.ok(all.some((x) => x.vault === cv.path) && all.some((x) => x.vault === mv.path));
    const code = await call('guides.codePath', { rel: '_code/hello.c', vault: cv.path });
    assert.strictEqual(code.path, path.join(cv.path, '_code', 'hello.c'));
    const cards = await call('guides.cards');
    assert.ok(cards.questions.some((q) => q.vaultName === 'C-Path' && q.phase === 1 && /\*p/.test(q.q)));
    assert.ok(cards.why.some((q) => q.vault === cv.path));
    await assert.rejects(call('guides.read', { file: path.join(PROJ, 'CMakeLists.txt') }), /outside your vaults/);
  });

  await test('sandbox: C with gcc, its own scratch.c, a runtime problem, Valgrind, and the assembly', async () => {
    const src = '#include <stdio.h>\n#include <stdlib.h>\n\nint main(void) {\n    int *p = malloc(sizeof *p);\n    free(p);\n    printf("%d\\n", *p);\n    return 0;\n}\n';
    const got = waitFor('build.runtime', (d) => d.problems.some((x) => /use-after-free/.test(x.message)), 30000);
    const r = await call('sandbox.run', { source: src, lang: 'c', compiler: 'gcc', std: 'c17' });
    assert.ok(r.ok, 'compiles as C');
    assert.match(r.file, /scratch\.c$/);
    const d = await got;
    const p = d.problems.find((x) => /use-after-free/.test(x.message));
    assert.deepStrictEqual([p.file, p.line], [r.file, 7]);
    await call('pty.close', { id: r.terminal.id });
    // C isn't C++: this only compiles as C
    const cOnly = await call('sandbox.run', { source: '#include <stdlib.h>\nint main(void) { int *new = malloc(4); free(new); return 0; }\n', lang: 'c' });
    assert.ok(cOnly.ok, '"new" is just a name in C');
    await call('pty.close', { id: cOnly.terminal.id });
    if (require('../server/build').which('valgrind')) {
      let out = '';
      c.on((ev, x) => { if (ev === 'pty.data') out += x.data; });
      const v = await call('sandbox.run', { source: '#include <stdlib.h>\nint main(void) { int *a = malloc(40); a[0] = 1; return 0; }\n', lang: 'c', tool: 'valgrind' });
      assert.ok(v.ok);
      assert.ok(await until(() => /definitely lost: 40 bytes/.test(out), 30000), out.slice(-400));
      await call('pty.close', { id: v.terminal.id });
    }
    const asm = await call('sandbox.asm', { source: 'int square(int x) {\n    return x * x;\n}\n', lang: 'c', opt: '-O1' });
    assert.ok(asm.ok);
    assert.match(asm.flags, /^gcc -std=c17/);
    assert.match(asm.lines.map((l) => l.text).join('\n'), /^square:$/m);
  });

  await test('C: a lone .c file builds with gcc, runs, and gdb stops in it without CMake', async () => {
    const dir = path.join(HOME, 'lone-c');
    fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, 'hello.c');
    fs.writeFileSync(f, '#include <stdio.h>\n\nint main(void) {\n    int n = 6 * 7;\n    printf("n is %d\\n", n);\n    return 0;\n}\n');
    let out = '';
    c.on((ev, x) => { if (ev === 'pty.data') out += x.data.replace(/\x1b\[[0-9;]*m/g, ''); });
    const r = await call('cmake.run', { file: f });
    assert.ok(r.ok, JSON.stringify(r.problems));
    assert.strictEqual(r.lang, 'c');
    assert.ok(await until(() => /n is 42/.test(out), 15000));
    await call('pty.close', { id: r.terminal.id });
    const g = await call('cmake.debug', { file: f, line: 5 });
    assert.ok(g.ok);
    assert.ok(await until(() => /Breakpoint 1, main \(\) at .*hello\.c:5/.test(out), 20000), out.slice(-400));
    await call('pty.write', { id: g.terminal.id, data: 'print n\n' });
    assert.ok(await until(() => /\$1 = 42/.test(out)));
    await call('pty.close', { id: g.terminal.id });
    // and a lone .cpp the same way (this used to run "./" instead of the program)
    const cpp = path.join(dir, 'hi.cpp');
    fs.writeFileSync(cpp, '#include <iostream>\nint main() { std::cout << "hi from C++\\n"; }\n');
    const rc = await call('cmake.run', { file: cpp });
    assert.ok(rc.ok);
    assert.ok(await until(() => /hi from C\+\+/.test(out), 15000), out.slice(-300));
    await call('pty.close', { id: rc.terminal.id });
    const bad = path.join(dir, 'bad.c');
    fs.writeFileSync(bad, 'int main(void) {\n    return missing;\n}\n');
    const b = await call('build.build', { file: bad });
    assert.notStrictEqual(b.code, 0);
    assert.deepStrictEqual([b.problems[0].file, b.problems[0].line], [bad, 2]);
  });

  await test('judge: a C solution, compiled with gcc -O2', async () => {
    const r = await call('cp.newProblem', { name: 'sum-c', lang: 'c' });
    assert.match(r.file, /cp\/problems\/sum-c\.c$/);
    fs.writeFileSync(r.file, '#include <stdio.h>\nint main(void) { long a, b; if (scanf("%ld %ld", &a, &b) != 2) return 1; printf("%ld\\n", a + b); return 0; }\n');
    const j = await call('cp.judge', { file: r.file, cases: [{ input: '2 3\n', expected: '5\n' }, { input: '1 1\n', expected: '3\n' }] });
    assert.ok(j.compiled, JSON.stringify(j.problems));
    assert.deepStrictEqual(j.results.map((x) => x.verdict), ['AC', 'WA']);
    fs.rmSync(r.file);
  });

  await test('new project: a C library with tests configures, builds and passes ctest', async () => {
    const parent = path.join(HOME, 'projects');
    const r = await call('project.create', { dir: parent, name: 'ring buffer', lang: 'c', kind: 'library' });
    assert.strictEqual(r.root, path.join(parent, 'ring_buffer'));
    assert.ok(r.git && fs.existsSync(path.join(r.root, '.git')));
    for (const f of ['CMakeLists.txt', 'src/main.c', 'src/ring_buffer.c', 'include/ring_buffer.h', 'tests/test_ring_buffer.c', '.clang-format', '.gitignore']) assert.ok(fs.existsSync(path.join(r.root, f)), f);
    const t = await call('ctest.run', { root: r.root });
    assert.ok(t.ok, JSON.stringify(t.problems));
    assert.deepStrictEqual(t.summary, { percent: 100, failed: 0, total: 1 });
    await assert.rejects(call('project.create', { dir: parent, name: 'ring_buffer', lang: 'c' }), /already exists/);
    const cpp = await call('project.create', { dir: parent, name: 'shapes', lang: 'cpp', kind: 'console', git: false });
    const b = await call('build.build', { file: cpp.main });
    assert.strictEqual(b.code, 0, 'a new C++ program builds warning-clean');
    assert.ok(!b.problems.some((x) => x.severity === 'warning'));
    // the header and the source find each other
    assert.strictEqual((await call('files.counterpart', { file: path.join(r.root, 'src', 'ring_buffer.c') })).file, path.join(r.root, 'include', 'ring_buffer.h'));
    assert.strictEqual((await call('files.counterpart', { file: path.join(r.root, 'include', 'ring_buffer.h') })).file, path.join(r.root, 'src', 'ring_buffer.c'));
    const pair = await call('project.newPair', { dir: path.join(cpp.root, 'src'), name: 'Circle', lang: 'cpp' });
    assert.deepStrictEqual(pair.files.map((f) => path.basename(f)), ['Circle.hpp', 'Circle.cpp']);
    assert.strictEqual((await call('files.counterpart', { file: pair.files[0] })).file, pair.files[1]);
    const hdr = await call('project.newFile', { file: path.join(r.root, 'include', 'util.h'), kind: 'header', lang: 'c' });
    assert.match(fs.readFileSync(hdr.file, 'utf8'), /#ifndef UTIL_H_\n#define UTIL_H_/);
  });

  if (require('../server/build').which('clang-format')) {
    await test('format: clang-format on its own, with the project\'s .clang-format', async () => {
      const r = await call('format.file', { file: path.join(HOME, 'projects', 'shapes', 'src', 'x.cpp'), text: 'int  main( ){return 0;}\n' });
      // the project's style (4 spaces, short functions not on one line), not LLVM's 2
      assert.strictEqual(r.text, 'int main() {\n    return 0;\n}\n');
    });
  }

  await test('windows: the WSL launcher picks the window or the browser, and says what is missing', async () => {
    const { execFileSync, spawnSync } = require('child_process');
    const script = path.join(__dirname, '..', 'scripts', 'wsl-launch.sh');
    const env = { ...process.env, HOME };
    delete env.DISPLAY; delete env.WAYLAND_DISPLAY;
    const check = (...a) => execFileSync('bash', [script, ...a, '--check'], { env, encoding: 'utf8' }).trim();
    const electron = fs.existsSync(path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron'));
    // always the window; the browser only when asked for. What blocks the window is said, with the fix
    const r0 = spawnSync('bash', [script, '--check'], { env, encoding: 'utf8' });
    assert.strictEqual(r0.stdout.split('\n')[0], 'window', 'never the browser by surprise');
    if (!fs.existsSync('/mnt/wslg')) { assert.strictEqual(r0.status, 1); assert.match(r0.stdout, /WSLg isn't running[\s\S]*wsl --update/); }
    if (!electron) assert.match(r0.stdout, /Electron .* isn't installed[\s\S]*npm install/);
    assert.strictEqual(check('browser'), 'browser');
    // a copy without its packages says to run the installer again
    const app = fs.mkdtempSync(path.join(HOME, 'app-'));
    fs.mkdirSync(path.join(app, 'scripts'));
    fs.copyFileSync(script, path.join(app, 'scripts', 'wsl-launch.sh'));
    const r = spawnSync('bash', [path.join(app, 'scripts', 'wsl-launch.sh')], { env: { ...env, PATH: process.env.PATH.split(':').filter((d) => !fs.existsSync(path.join(d, 'powershell.exe'))).join(':') }, encoding: 'utf8' });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /Run 'Install on Windows' again/);
    fs.rmSync(app, { recursive: true });
    // the Windows files keep Windows line endings and plain ASCII (Windows PowerShell 5.1 reads them as ANSI)
    for (const f of ['windows/Install.ps1', 'windows/Launch.vbs', 'Install on Windows.cmd']) {
      const text = fs.readFileSync(path.join(__dirname, '..', f), 'latin1');
      assert.ok(!/[^\r]\n/.test(text), `${f}: CRLF line endings`);
      assert.ok(!/[^\x00-\x7f]/.test(text), `${f}: ASCII only`);
    }
    // the wsl.exe helper must stay a plain function: with param() PowerShell takes wsl's -d / -e / -v as its own -Debug, -ErrorAction, -Verbose
    const ps = fs.readFileSync(path.join(__dirname, '..', 'windows', 'Install.ps1'), 'latin1');
    const wslFn = ps.slice(ps.indexOf('function Wsl {'), ps.indexOf('\n}', ps.indexOf('function Wsl {')));
    assert.ok(wslFn && !/param\s*\(/.test(wslFn) && /& wsl\.exe @args/.test(wslFn), 'Wsl passes its arguments straight through');
  });

  await test('exercises: every starter fails step 1, every solution passes them all; the CTF flags are reachable', async () => {
    const { execFileSync } = require('child_process');
    const list = await call('exercises.list');
    assert.ok(list.length >= 20);
    for (const it of list) {
      const o = await call('exercises.open', { id: it.id });
      const data = require('../server/exercise-data').find((e) => e.id === it.id);
      if (it.kind === 'ctf') {
        const run = (input) => execFileSync(o.binary, [], { input, cwd: o.dir, encoding: 'utf8' });
        let out;
        if (it.id === 'ctf-strings') {
          const pw = execFileSync('strings', [o.binary], { encoding: 'utf8' }).split('\n').find((l) => /^hunter/.test(l));
          out = run(pw + '\n');
        } else if (it.id === 'ctf-xor') out = run('open_sesame\n');
        else if (it.id === 'ctf-overflow') out = run('A'.repeat(16) + 'B\n');
        else out = run('2147484\n');
        const flag = (out.match(/FLAG\{[^}]+\}/) || [])[0];
        assert.ok(flag, `${it.id}: the intended way gives a flag (${out})`);
        assert.strictEqual((await call('exercises.flag', { id: it.id, flag: 'FLAG{nope}' })).ok, false);
        assert.strictEqual((await call('exercises.flag', { id: it.id, flag })).ok, true, it.id);
        continue;
      }
      const first = await call('exercises.check', { id: it.id });
      assert.ok(first.compiled, `${it.id}: the starter compiles ${JSON.stringify(first.problems.filter((p) => p.severity === 'error'))}`);
      assert.strictEqual(first.advanced, false, `${it.id}: the starter doesn't pass step 1`);
      for (let guard = 0; guard < 10; guard++) {
        const pr = (await call('exercises.list')).find((x) => x.id === it.id);
        if (pr.done) break;
        const step = data.steps[pr.step];
        if (step.type === 'reflect') {
          const r = await call('exercises.reflect', { id: it.id, step: pr.step, text: 'In my own words: it writes past the end.' });
          assert.ok(r.answer);
          continue;
        }
        fs.writeFileSync(o.file, (data.solutions && data.solutions[pr.step]) || data.solution);
        const r = await call('exercises.check', { id: it.id });
        assert.ok(r.advanced, `${it.id} step ${pr.step + 1}: ${JSON.stringify(r.results)} ${JSON.stringify(r.problems.filter((p) => p.severity === 'error'))}`);
      }
      assert.ok((await call('exercises.list')).find((x) => x.id === it.id).done, `${it.id} done`);
    }
    // a failure says what was expected
    const o = await call('exercises.open', { id: 'c-first-functions' });
    await call('exercises.reset', { id: 'c-first-functions' });
    fs.writeFileSync(o.file, fs.readFileSync(o.file, 'utf8').replace('/* TODO step 1 */\n    return 0;', 'return a - b;'));
    const bad = await call('exercises.check', { id: 'c-first-functions' });
    assert.match(bad.results[0].fails[0].detail, /got -1, expected 5/);
    // a memory bug fails the step even when the answer looks right
    const m = await call('exercises.open', { id: 'c-memory' });
    await call('exercises.reset', { id: 'c-memory' });
    fs.writeFileSync(m.file, '#include <stdlib.h>\n#include <string.h>\nint *make_range(int n) { if (n <= 0) return NULL; int *a = malloc(n * sizeof *a); for (int i = 0; i <= n; ++i) a[i] = i; return a; }\nchar *dup_string(const char *s) { return NULL; }\nint *grow(int *a, size_t o, size_t n) { return a; }\n');
    const oob = await call('exercises.check', { id: 'c-memory' });
    assert.strictEqual(oob.results[0].passed, false);
    assert.match(oob.results[0].fails.map((f) => f.detail).join(' '), /heap-buffer-overflow/);
    assert.ok(oob.problems.some((p) => p.runtime && p.file === m.file && p.line === 3), 'the sanitizer points at your line');
    const sum = await call('progress.summary');
    assert.ok(sum.totals.done >= 18 && sum.days[Object.keys(sum.days)[0]].steps > 0);
  });

  await test('security: hardening three ways, checksec, and a look inside the binary', async () => {
    const src = '#include <stdio.h>\n#include <string.h>\nint main(int argc, char **argv) { char b[16]; if (argc > 1) strcpy(b, argv[1]); printf("%s\\n", b); return 0; }\n';
    const r = await call('security.compare', { source: src, lang: 'c' });
    const [off, def, hard] = r.variants;
    assert.ok(off.ok && def.ok && hard.ok, JSON.stringify(r.variants.map((v) => v.error)));
    const st = (v, id) => v.checks.find((c) => c.id === id);
    assert.deepStrictEqual(['pie', 'nx', 'canary', 'relro'].map((id) => st(off, id).on), [false, false, false, false], 'everything off is off');
    assert.deepStrictEqual(['pie', 'nx', 'canary', 'relro', 'fortify'].map((id) => st(hard, id).on), [true, true, true, true, true], 'hardened is hardened');
    assert.strictEqual(st(hard, 'relro').state, 'full');
    const syms = await call('security.inspect', { exe: def.exe, what: 'symbols' });
    assert.ok(syms.rows.some((x) => x.pretty === 'main' && x.kind === 'code'));
    const dis = await call('security.inspect', { exe: def.exe, what: 'disasm', symbol: 'main' });
    assert.match(dis.text, /<main>:/);
    assert.ok((await call('security.inspect', { exe: def.exe, what: 'strings' })).rows.some((x) => /GLIBC|libc\.so/.test(x.text)));
    assert.ok((await call('security.inspect', { exe: def.exe, what: 'sections' })).rows.some((x) => x.name === '.text' && /X/.test(x.flags)));
    await assert.rejects(call('security.checksec', { exe: path.join(PROJ, 'CMakeLists.txt') }), /isn't a Linux program/);
  });

  const fuzzOk = fs.existsSync('/usr/lib/llvm-18/lib/clang/18/lib/linux/libclang_rt.fuzzer-x86_64.a') || process.env.CPW_FUZZ;
  if (fuzzOk) {
    await test('security: libFuzzer finds the overflow, it lands in Problems, and the input is kept', async () => {
      const got = waitFor('build.runtime', (d) => d.problems.some((x) => /stack-buffer-overflow/.test(x.message)), 60000);
      const src = '#include <stddef.h>\n#include <stdint.h>\n#include <string.h>\nint LLVMFuzzerTestOneInput(const uint8_t *d, size_t n) {\n    char name[8];\n    if (n < 1) return 0;\n    size_t len = d[0];\n    if (len > n - 1) len = n - 1;\n    memcpy(name, d + 1, len);\n    return name[0] == 0;\n}\n';
      const r = await call('security.fuzz', { source: src, lang: 'c', seconds: 20 });
      assert.ok(r.ok, JSON.stringify(r.problems));
      const d = await got;
      assert.strictEqual(d.problems.find((x) => /stack-buffer-overflow/.test(x.message)).line, 9);
      await until(() => false, 1500);
      const cr = await call('security.crashes', { source: '', lang: 'c' });
      assert.ok(cr.crashes.length >= 1 && /^0000 {2}/.test(cr.crashes[0].hex));
      await call('pty.close', { id: r.terminal.id });
    });
  }

  await test('memory view: the stack, a pointer into an array, the heap, NULL, and what was printed', async () => {
    const r = await call('memviz.trace', { lang: 'c', source: '#include <stdio.h>\n#include <stdlib.h>\n\nstatic void bump(int *x) {\n    *x += 1;\n}\n\nint main(void) {\n    int a[3] = {1, 2, 3};\n    int *p = &a[1];\n    int *h = malloc(sizeof *h);\n    *h = 42;\n    int *none = NULL;\n    bump(p);\n    printf("%d\\n", a[1]);\n    free(h);\n    return 0;\n}\n' });
    assert.ok(r.compiled);
    assert.match(r.end, /exited with code 0|finished/);
    const at = (line) => r.steps.find((s) => s.line === line);
    const v = (s, f, n) => s.frames.find((x) => x.func === f).vars.find((x) => x.name === n);
    const s14 = at(14);
    assert.deepStrictEqual(v(s14, 'main', 'p').target, { kind: 'var', level: 0, name: 'a', offset: 4 }, 'p points 4 bytes into a');
    assert.strictEqual(v(s14, 'main', 'h').target.kind, 'heap');
    assert.ok(s14.heap.some((b) => b.value === '42'));
    assert.ok(v(s14, 'main', 'none').isNull);
    const inBump = at(5);
    assert.deepStrictEqual(inBump.frames.map((f) => f.func), ['bump', 'main'], 'a call is a new frame on top');
    assert.strictEqual(v(inBump, 'bump', 'x').target.name, 'a');
    assert.strictEqual(at(16).stdout, '3\n');
    const cpp = await call('memviz.trace', { lang: 'cpp', source: '#include <vector>\nint main() {\n    std::vector<int> v{1, 2};\n    v.push_back(3);\n    return 0;\n}\n' });
    assert.ok(cpp.steps.some((s) => s.frames[0] && s.frames[0].vars.some((x) => /length 3/.test(x.value))), 'gdb shows the vector');
    const bad = await call('memviz.trace', { lang: 'c', source: 'int main(void) { return nope; }\n' });
    assert.strictEqual(bad.compiled, false);
  });

  await test('checkpoints: save, change, go back, and the present was kept', async () => {
    const dir = path.join(HOME, 'cp-demo');
    fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, 'a.c');
    fs.writeFileSync(f, 'int one(void) { return 1; }\n');
    assert.ok((await call('git.checkpoint', { cwd: dir, note: 'first' })).needRepo, 'asks before making a repository');
    const c1 = await call('git.checkpoint', { cwd: dir, note: 'works', status: 'green', init: true });
    assert.ok(c1.hash);
    assert.ok((await call('git.checkpoint', { cwd: dir })).nothing);
    fs.writeFileSync(f, 'int one(void) { return 2; }   /* broke it */\n');
    fs.writeFileSync(path.join(dir, 'new.c'), 'int extra;\n');
    const back = await call('git.goBack', { cwd: dir, hash: c1.hash });
    assert.strictEqual(fs.readFileSync(f, 'utf8'), 'int one(void) { return 1; }\n');
    assert.ok(!fs.existsSync(path.join(dir, 'new.c')), 'files made later are gone too');
    const list = await call('git.checkpoints', { cwd: dir });
    assert.ok(list.list.some((x) => x.status === 'green' && /works/.test(x.subject)));
    assert.ok(list.list.some((x) => /before going back/.test(x.subject)) && back.saved, 'the broken version is a checkpoint too');
    const t = await call('project.testFor', { file: path.join(HOME, 'projects', 'ring_buffer', 'src', 'ring_buffer.c'), func: 'ring_buffer_add', signature: 'int ring_buffer_add(int a, int b)' });
    assert.match(fs.readFileSync(t.file, 'utf8'), /#include "..\/include\/ring_buffer.h"/);
    assert.match(t.cmake, /add_test\(NAME test_ring_buffer_add/);
    const b = await call('build.build', { file: t.file });
    assert.strictEqual(b.code, 0, 'the project still builds with the new test');
  });

  await test('man pages come back as text, or say why not', async () => {
    try { const m = await call('man.page', { page: 'gcc' }); assert.match(m.text, /gcc/i); }
    catch (e) { assert.match(e.message, /minimal Ubuntu|No manual page|not installed/); }
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
