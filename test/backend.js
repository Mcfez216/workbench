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
  catch (e) { results.push([false, name]); console.log(`  FAIL  ${name}\n        ${e.stack.split("\n").slice(0, process.env.CPW_LONG ? 30 : 3).join("\n        ")}`); }
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

  await test('import std; (C++23): the std module is built once and kept; a header that imports it works; g++ too old falls back to clang++', async () => {
    const libcxx = require('child_process').spawnSync('clang++', ['-stdlib=libc++', '-print-file-name=libc++.modules.json'], { encoding: 'utf8' }).stdout.trim();
    if (!libcxx.startsWith('/') || !fs.existsSync(libcxx)) { console.log('        (skipped: no libc++ module files here; apt install libc++-dev)'); return; }
    const dir = fs.mkdtempSync(path.join(HOME, 'ppp-'));
    const hello = path.join(dir, 'hello.cpp');
    fs.writeFileSync(hello, 'import std;\n\nint main()\n{\n    std::cout << "Hello world!\\n";\n    return 0;\n}\n');
    fs.writeFileSync(path.join(dir, 'PPP_support.h'), '// like Stroustrup\'s PPP_support.h: it imports std itself\nimport std;\ninline int twice(int x) { return 2 * x; }\n');
    const drill = path.join(dir, 'drill.cpp');
    fs.writeFileSync(drill, '#include "PPP_support.h"\n\nint main()\n{\n    std::vector<int> v{1, 2, 3};\n    std::println("{} {}", v.size(), twice(21));\n}\n');
    const t0 = Date.now();
    const a = await call('build.build', { file: hello });
    assert.strictEqual(a.code, 0, JSON.stringify(a.problems));
    const first = Date.now() - t0;
    assert.match(a.note || '', /C\+\+23/);
    assert.match(a.clangd.command.join(' '), /-fmodule-file=std=/);
    assert.strictEqual(require('child_process').execFileSync(a.exe, { encoding: 'utf8' }), 'Hello world!\n');
    const t1 = Date.now();
    const b = await call('build.build', { file: hello });
    assert.strictEqual(b.code, 0);
    assert.ok(Date.now() - t1 < first, `the module is kept: ${Date.now() - t1} ms the second time, ${first} ms the first`);
    const d = await call('build.build', { file: drill });
    assert.strictEqual(d.code, 0, JSON.stringify(d.problems));
    assert.strictEqual(require('child_process').execFileSync(d.exe, { encoding: 'utf8' }), '3 42\n');
    // the judge (F8) too: import std; with -O2, cases judged
    const sol = path.join(dir, 'sum.cpp');
    fs.writeFileSync(sol, 'import std;\nint main() { long long a, b; std::cin >> a >> b; std::cout << a + b << "\\n"; }\n');
    const j = await call('cp.judge', { file: sol, cases: [{ input: '2 3\n', expected: '5\n' }, { input: '10 -4\n', expected: '6\n' }] });
    assert.ok(j.compiled, JSON.stringify(j.problems));
    assert.deepStrictEqual(j.results.map((x) => x.verdict), ['AC', 'AC']);
    // a commented-out import doesn't count; a plain #include program is untouched
    fs.writeFileSync(hello, '// import std;\n#include <iostream>\nint main() { std::cout << "plain\\n"; }\n');
    const p = await call('build.build', { file: hello });
    assert.strictEqual(p.code, 0);
    assert.strictEqual(p.clangd, undefined);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  await test('rust: a lone file, a Cargo project with tests, clippy, rustfmt, rustc --explain, the sandbox, the judge, new projects', async () => {
    const work = fs.mkdtempSync(path.join(HOME, 'rust-'));
    // a lone file: rustc's error lands on the line, with its notes
    const bad = path.join(work, 'bad.rs');
    fs.writeFileSync(bad, 'fn main() {\n    let s = String::from("hi");\n    let t = s;\n    println!("{} {}", s, t);\n}\n');
    const b1 = await call('build.build', { file: bad });
    assert.notStrictEqual(b1.code, 0);
    const e = b1.problems.find((p) => p.severity === 'error');
    assert.deepStrictEqual([path.basename(e.file), e.line, e.code, e.message], ['bad.rs', 4, 'E0382', 'borrow of moved value: `s`']);
    assert.ok(e.notes.some((n) => n.line === 3 && /value moved here/.test(n.message)), JSON.stringify(e.notes));
    const ex = await call('rust.explain', { code: 'E0382' });
    assert.match(ex.text, /moved/);
    // a new Cargo project (a library with tests), as File -> New project makes it
    const proj = await call('project.create', { dir: work, name: 'fleet', lang: 'rust', kind: 'library', git: false });
    assert.deepStrictEqual(fs.readdirSync(proj.root).sort(), ['.gitignore', 'Cargo.toml', 'README.md', 'rustfmt.toml', 'src']);
    assert.match(fs.readFileSync(path.join(proj.root, 'Cargo.toml'), 'utf8'), /name = "fleet"\nversion = "0.1.0"\nedition = "2024"/);
    assert.strictEqual(path.basename(proj.main), 'lib.rs');
    const root = await call('cmake.root', { file: proj.main });
    assert.deepStrictEqual([root.root, root.kind, root.configured], [proj.root, 'cargo', true]);
    const b2 = await call('build.build', { file: proj.main });
    assert.strictEqual(b2.code, 0, JSON.stringify(b2.problems));
    const tl = await call('ctest.list', { root: proj.root });
    assert.deepStrictEqual(tl.tests.map((t) => t.name).sort(), ['tests::adds_negative_numbers', 'tests::adds_two_numbers']);
    // break one test: the Tests sidebar's results and the panic's line
    fs.writeFileSync(proj.main, fs.readFileSync(proj.main, 'utf8').replace('assert_eq!(add(-2, -3), -5);', 'assert_eq!(add(-2, -3), -6);'));
    const tr = await call('ctest.run', { root: proj.root });
    assert.deepStrictEqual(tr.results.map((r) => `${r.name}=${r.status}`).sort(), ['tests::adds_negative_numbers=failed', 'tests::adds_two_numbers=passed']);
    const fail = tr.problems.find((p) => p.source === 'panic');
    assert.strictEqual(path.basename(fail.file), 'lib.rs');
    assert.match(fail.message, /left: -5 \/ right: -6/);
    const loc = await call('ctest.locate', { root: proj.root, name: 'tests::adds_negative_numbers' });
    assert.match(fs.readFileSync(loc.file, 'utf8').split('\n')[loc.line - 1], /fn adds_negative_numbers\(\)/);
    const one = await call('ctest.run', { root: proj.root, indexes: [tl.tests.find((t) => t.name === 'tests::adds_two_numbers').index] });
    assert.deepStrictEqual(one.results.map((r) => r.status), ['passed']);
    // Ctrl+F9: the program in a terminal
    const ran = await call('cmake.run', { file: path.join(proj.root, 'src', 'main.rs') });
    assert.ok(ran.ok && ran.terminal, JSON.stringify(ran));
    await until(() => false, 1500);
    // clippy and rustfmt
    const cl = await call('analyze.tidy', { file: bad });
    assert.ok(cl.problems.some((p) => p.code === 'E0382'), 'clippy builds it too, so it reports the error');
    const fm = await call('format.file', { file: bad, text: 'fn main(){let x=1;println!("{}",x);}' });
    assert.strictEqual(fm.text, 'fn main() {\n    let x = 1;\n    println!("{}", x);\n}\n');
    // the sandbox: a panic is a runtime problem on its line
    const got = waitFor('build.runtime', (d) => d.problems.some((p) => /index out of bounds/.test(p.message)), 30000);
    const sb = await call('sandbox.run', { source: 'fn main() {\n    let v = vec![1, 2, 3];\n    let i = v.len();\n    println!("{}", v[i]);\n}\n', lang: 'rust', std: '2024' });
    assert.ok(sb.ok);
    const rt = (await got).problems.find((p) => /index out of bounds/.test(p.message));
    assert.deepStrictEqual([path.basename(rt.file), rt.line, rt.runtime], ['scratch.rs', 4, true]);
    const asm = await call('sandbox.asm', { source: '#[inline(never)]\nfn square(x: u64) -> u64 { x * x }\nfn main() { println!("{}", square(std::env::args().count() as u64)); }\n', lang: 'rust', opt: '-O2' });
    assert.ok(asm.ok && asm.lines.some((l) => l.label && /square/.test(l.text)), JSON.stringify(asm.lines.slice(0, 5)));
    assert.ok(!asm.lines.some((l) => l.label && /lang_start/.test(l.text)), 'not the runtime\'s start-up code');
    // the judge
    const sol = path.join(work, 'sum.rs');
    fs.writeFileSync(sol, 'use std::io::Read;\nfn main() { let mut s = String::new(); std::io::stdin().read_to_string(&mut s).unwrap(); let t: i64 = s.split_whitespace().map(|w| w.parse::<i64>().unwrap()).sum(); println!("{t}"); }\n');
    const j = await call('cp.judge', { file: sol, cases: [{ input: '1 2 3\n', expected: '6' }, { input: '5\n', expected: '6' }] });
    assert.deepStrictEqual(j.results.map((r) => r.verdict), ['AC', 'WA']);
    // the tools list knows Rust, and the installers' hint is rustup's
    const tools = await call('build.tools');
    assert.strictEqual(tools.rustc, true);
    assert.strictEqual(tools.cargo, true);
    fs.rmSync(work, { recursive: true, force: true });
  });

  await test('rust projects: R01-R05 from the vault, your stub fails, the solution passes, one test at a time, the notes are there', async () => {
    if (!require('./../server/platform').which('cargo')) { console.log('        (skipped: no cargo)'); return; }
    const from = path.join(__dirname, '..', 'vaults', 'Rust-Path', '_code');
    const ws = path.join(HOME, 'rust-path');
    const cp = await call('files.copyDir', { from, to: ws });
    assert.strictEqual(cp.copied, 28, `copied ${cp.copied}`);
    assert.ok(!fs.existsSync(path.join(ws, 'target')));
    // from a file inside a project, the sidebar still finds the workspace
    const lib = path.join(ws, 'projects', 'r01_word_frequency', 'src', 'lib.rs');
    const r = await call('cmake.root', { file: lib });
    assert.strictEqual(r.kind, 'cargo');
    const l = await call('projects.list', { root: r.root });
    assert.deepStrictEqual(l.projects.map((p) => p.label), ['R01 word frequency', 'R02 todo list', 'R03 bank ledger', 'R04 route planner', 'R05 packet parser']);
    const p1 = l.projects[0];
    assert.deepStrictEqual(p1.stubFiles, [lib]);
    assert.match(p1.tests[0], /tests[\\/]r01_word_frequency\.rs$/);
    assert.match(p1.solutionFiles[0], /solutions[\\/]r01_word_frequency[\\/]src[\\/]lib\.rs$/);
    // the stub: it builds, and every test fails, pointing at its todo!()
    const a = await call('projects.run', { root: r.root, id: 'r01_word_frequency' });
    assert.strictEqual(a.built, true);
    assert.deepStrictEqual(a.summary, { passed: 0, failed: 10, total: 10 });
    assert.ok(a.problems.some((x) => x.file === lib), JSON.stringify(a.problems.slice(0, 2)));
    // write the solution in: all pass; one test on its own
    fs.copyFileSync(p1.solutionFiles[0], lib);
    const b = await call('projects.run', { root: r.root, id: 'r01_word_frequency' });
    assert.deepStrictEqual(b.summary, { passed: 10, failed: 0, total: 10 });
    const one = await call('projects.run', { root: r.root, id: 'r01_word_frequency', testName: 'ties_are_alphabetical' });
    assert.deepStrictEqual(one.summary, { passed: 1, failed: 0, total: 1 });
    // a stub that doesn't compile says so
    fs.writeFileSync(lib, 'pub fn words( {\n');
    const c = await call('projects.run', { root: r.root, id: 'r01_word_frequency' });
    assert.strictEqual(c.built, false);
    // plain cargo test (F7) runs the solutions only: they all pass
    const t = await call('ctest.run', { root: ws });
    assert.strictEqual(t.summary.failed, 0);
    assert.strictEqual(t.summary.total, 44);
    // each project has its note
    const notes = fs.readdirSync(path.join(__dirname, '..', 'vaults', 'Rust-Path', 'Projects'));
    for (const p of l.projects) assert.ok(notes.some((n) => n.toUpperCase().startsWith(p.label.split(' ')[0] + ' ')), p.label);
  });

  await test('debugger: breakpoints, typing into the program, step into and out, variables, watches, a crash stops on its line; Rust too', async () => {
    const dir = fs.mkdtempSync(path.join(HOME, 'dbg-'));
    const file = path.join(dir, 'prog.cpp');
    fs.writeFileSync(file, '#include <iostream>\n#include <string>\n#include <vector>\n\nint square(int x)\n{\n    int y = x * x;\n    return y;\n}\n\nint main()\n{\n    std::vector<int> v{1, 2, 3};\n    std::string name;\n    std::cin >> name;\n    int total = 0;\n    for (int n : v) {\n        total += square(n);\n    }\n    std::cout << name << " " << total << "\\n";\n    int* p = nullptr;\n    if (name == "crash") *p = 1;\n    return 0;\n}\n');
    const paused = () => waitFor('dbg.paused', () => true, 60000);
    await call('dbg.setBreakpoints', { file, lines: [18] });
    let w = paused();
    const r = await call('dbg.start', { file });
    assert.ok(r.ok, JSON.stringify(r).slice(0, 400));
    if (r.terminal) setTimeout(() => call('pty.write', { id: r.terminal, data: 'ana\r' }), 800);
    let p = await w;
    assert.strictEqual(p.line, 18);
    assert.match(p.reason, /breakpoint/);
    const val = (n) => (p.locals.find((x) => x.name === n) || {}).value;
    assert.strictEqual(val('total'), '0');
    assert.match(val('name'), /"ana"/);
    assert.match(val('v'), /\{1, 2, 3\}/);
    assert.ok(!p.locals.some((x) => /^__/.test(x.name)), 'no compiler helpers');
    await call('dbg.setWatches', { list: ['total + 100', 'nothere'] });
    w = paused(); await call('dbg.resume', { how: 'step' }); p = await w;
    assert.strictEqual(p.func, 'square');
    assert.strictEqual(p.locals.find((x) => x.name === 'x').arg, true);
    w = paused(); await call('dbg.resume', { how: 'finish' }); p = await w;
    assert.match(p.reason, /gave back 1/);
    assert.deepStrictEqual(p.watches[0], { expr: 'total + 100', value: '100' });
    assert.match(p.watches[1].error, /nothere/);
    // looking at main's frame from inside square: main's variables
    w = paused(); await call('dbg.resume', { how: 'step' }); p = await w;
    if (p.func === 'square') { w = paused(); await call('dbg.selectFrame', { level: 1 }); p = await w; assert.ok(p.locals.some((x) => x.name === 'total')); w = paused(); await call('dbg.resume', { how: 'finish' }); await w; }
    await call('dbg.setBreakpoints', { file, lines: [] });
    const ended = waitFor('dbg.ended', () => true, 30000);
    await call('dbg.resume', { how: 'continue' });
    assert.strictEqual((await ended).code, 0);
    // a crash: no breakpoints, so it pauses at main first; then the segfault stops on its line
    w = paused();
    const r2 = await call('dbg.start', { file });
    await w;
    if (r2.terminal) setTimeout(() => call('pty.write', { id: r2.terminal, data: 'crash\r' }), 300);
    w = paused(); await call('dbg.resume', { how: 'continue' }); p = await w;
    assert.strictEqual(p.crashed, true);
    assert.strictEqual(p.line, 22);
    assert.match(p.reason, /segmentation fault/);
    await call('dbg.stop', {});
    // Rust: rust-gdb shows a Vec's contents; a panic stops on your line
    if (require('./../server/platform').which('rustc')) {
      const rs = path.join(dir, 'prog.rs');
      fs.writeFileSync(rs, 'fn total(v: &[i32]) -> i32 {\n    let mut sum = 0;\n    for x in v {\n        sum += x;\n    }\n    sum\n}\n\nfn main() {\n    let v = vec![1, 2, 3];\n    let t = total(&v);\n    println!("{t}");\n    let empty: Vec<i32> = Vec::new();\n    println!("{}", empty[0]);\n}\n');
      await call('dbg.setBreakpoints', { file: rs, lines: [11] });
      w = paused();
      assert.ok((await call('dbg.start', { file: rs })).ok);
      p = await w;
      assert.match((p.locals.find((x) => x.name === 'v') || {}).value, /1, 2, 3/);
      w = paused(); await call('dbg.resume', { how: 'step' }); p = await w;
      assert.match(p.func, /total/);
      await call('dbg.setBreakpoints', { file: rs, lines: [] });
      w = paused(); await call('dbg.resume', { how: 'continue' }); p = await w;
      assert.match(p.reason, /panicked/);
      assert.strictEqual(p.line, 14);
      await call('dbg.stop', {});
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  await test('build a real thing: a project, the starter fails, the finished program passes every milestone, install puts it on PATH; Rust too', async () => {
    const tl = await call('tracks.list');
    assert.deepStrictEqual(tl.map((t) => t.id), ['count', 'todo', 'adventure', 'kv', 'jsonq', 'port-caesar', 'port-stats', 'port-rpn']);
    assert.deepStrictEqual(Object.keys(tl[5].langs), ['cpp', 'rust'], 'a port is to C++ or Rust');
    const o = await call('tracks.open', { id: 'count', lang: 'c' });
    assert.ok(fs.existsSync(path.join(path.dirname(path.dirname(o.main)), 'CMakeLists.txt')));
    const a = await call('tracks.check', { id: 'count', lang: 'c' });
    assert.strictEqual(a.compiled, true);
    assert.strictEqual(a.passed, false);
    assert.strictEqual(a.milestone, 0);
    assert.match(a.results[0].fails[0].cmd, /^count -l/);
    // the finished version: milestone after milestone
    fs.copyFileSync(path.join(__dirname, '..', 'server', 'tracks', 'count', 'solution.c'), o.main);
    let r;
    for (let i = 0; i < 5; i++) { r = await call('tracks.check', { id: 'count', lang: 'c' }); assert.strictEqual(r.passed, true, JSON.stringify(r.results).slice(0, 500)); assert.strictEqual(r.milestone, i); }
    assert.strictEqual(r.finished, true);
    const g = await call('tracks.get', { id: 'count', lang: 'c' });
    assert.strictEqual(g.reached, 5);
    const ins = await call('tracks.install', { id: 'count', lang: 'c' });
    assert.ok(ins.ok);
    assert.strictEqual(require('child_process').execFileSync(ins.path, ['-w'], { input: 'one two three\n', encoding: 'utf8' }), '3\n');
    // a compile error is a compile error
    fs.writeFileSync(o.main, 'int main(void) { return x; }\n');
    const bad = await call('tracks.check', { id: 'count', lang: 'c' });
    assert.strictEqual(bad.compiled, false);
    assert.ok(bad.problems.some((p) => p.severity === 'error'));
    if (require('./../server/platform').which('cargo')) {
      const ro = await call('tracks.open', { id: 'kv', lang: 'rust' });
      fs.copyFileSync(path.join(__dirname, '..', 'server', 'tracks', 'kv', 'solution.rs'), ro.main);
      const rr = await call('tracks.check', { id: 'kv', lang: 'rust' });
      assert.strictEqual(rr.passed, true, JSON.stringify(rr).slice(0, 500));
    }
  });

  await test('exercise of the day: the same all day; an exercise you started and left comes first', async () => {
    const a = await call('exercises.today');
    const b = await call('exercises.today');
    assert.strictEqual(a.id, b.id);
    assert.ok(a.title && a.reason);
    // a fresh pick tomorrow: pretend the stored pick is old, after starting one
    const progFile = path.join(HOME, '.local', 'share', 'cpp-path-workbench', 'exercises', 'progress.json');
    const p = JSON.parse(fs.readFileSync(progFile, 'utf8'));
    p.today.date = '2000-01-01';
    p.exercises['rs-closures'] = { step: 1, done: false, attempts: 2, reflections: {}, updated: Date.now() + 1000 };
    fs.writeFileSync(progFile, JSON.stringify(p));
    const c = await call('exercises.today');
    assert.strictEqual(c.id, 'rs-closures');
    assert.match(c.reason, /finish it/);
  });

  await test('libraries and templates: add fmt to CMakeLists.txt (once), pick a target, popular crates; a command-line tool, a game, a web server, benchmarks', async () => {
    const cpp = await call('libs.list', { lang: 'cpp' });
    assert.ok(['fmt', 'cli11', 'json', 'httplib', 'raylib'].every((id) => cpp.recipes.some((r) => r.id === id)));
    assert.ok((await call('libs.list', { lang: 'c' })).recipes.some((r) => r.id === 'cjson'));
    assert.ok((await call('libs.list', { lang: 'rust' })).crates.some((c) => c.name === 'clap'));
    const dir = fs.mkdtempSync(path.join(HOME, 'libs-'));
    fs.writeFileSync(path.join(dir, 'CMakeLists.txt'), 'cmake_minimum_required(VERSION 3.16)\nproject(x CXX)\nadd_executable(app main.cpp)\n');
    const a = await call('libs.addCmake', { root: dir, id: 'fmt' });
    assert.strictEqual(a.target, 'app');
    const cm = fs.readFileSync(path.join(dir, 'CMakeLists.txt'), 'utf8');
    assert.match(cm, /FetchContent_Declare\(fmt GIT_REPOSITORY https:\/\/github\.com\/fmtlib\/fmt\.git\n\s+GIT_TAG 12\.2\.1 GIT_SHALLOW TRUE\)/);
    assert.match(cm, /target_link_libraries\(app PRIVATE fmt::fmt\)/);
    assert.strictEqual((await call('libs.addCmake', { root: dir, id: 'fmt' })).already, true);
    assert.strictEqual(fs.readFileSync(path.join(dir, 'CMakeLists.txt'), 'utf8'), cm, 'not added twice');
    const j = await call('libs.addCmake', { root: dir, id: 'json' });
    assert.match(fs.readFileSync(path.join(dir, 'CMakeLists.txt'), 'utf8'), /URL_HASH SHA256=[0-9a-f]{64}/);
    assert.ok(j.ok);
    fs.appendFileSync(path.join(dir, 'CMakeLists.txt'), 'add_executable(tool tool.cpp)\n');
    const t = await call('libs.addCmake', { root: dir, id: 'spdlog' });
    assert.deepStrictEqual(t.choices, ['app', 'tool']);
    // the new kinds of project
    for (const [lang, kind, has] of [['c', 'cli', /unknown option/], ['cpp', 'game', /raylib/], ['cpp', 'web', /httplib/], ['rust', 'web', /TcpListener/], ['rust', 'game', /macroquad/], ['cpp', 'bench', /bench\(/], ['rust', 'bench', /black_box/]]) {
      const r = await call('project.create', { dir, name: `p_${lang}_${kind}`, lang, kind, git: false });
      assert.match(fs.readFileSync(r.main, 'utf8'), has, `${lang} ${kind}`);
      if (kind === 'game' && lang !== 'rust') assert.doesNotMatch(fs.readFileSync(path.join(r.root, 'CMakeLists.txt'), 'utf8'), /fsanitize=address/, 'no ASan for a game');
      if (kind === 'bench' && lang !== 'rust') assert.match(fs.readFileSync(path.join(r.root, 'CMakeLists.txt'), 'utf8'), /set\(CMAKE_BUILD_TYPE Release\)/);
      if (lang === 'rust' && kind === 'game') assert.match(fs.readFileSync(path.join(r.root, 'Cargo.toml'), 'utf8'), /macroquad = "0\.4"/);
    }
    await assert.rejects(call('project.create', { dir, name: 'p_c_web', lang: 'c', kind: 'web', git: false }), /C\+\+ or Rust/);
    // a command-line tool builds and runs as it says
    const own = fs.mkdtempSync(path.join(HOME, 'tool-'));   // not under the folder with the other CMakeLists.txt
    const cli = await call('project.create', { dir: own, name: 'mytool', lang: 'cpp', kind: 'cli', git: false });
    const b = await call('build.build', { file: cli.main });
    assert.strictEqual(b.code, 0, JSON.stringify(b.problems).slice(0, 400));
    const exe = path.join(cli.root, 'build', 'mytool');
    assert.strictEqual(require('child_process').execFileSync(exe, ['-nu'], { input: 'hi\n', encoding: 'utf8' }), '     1  HI\n');
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(own, { recursive: true, force: true });
  });

  await test('coverage: one run of a file (with input) marks what ran; a CMake project\'s tests show what they reach', async () => {
    const dir = fs.mkdtempSync(path.join(HOME, 'cov-'));
    const file = path.join(dir, 'grade.c');
    fs.writeFileSync(file, '#include <stdio.h>\n\nint main(void)\n{\n    int score = 0;\n    if (scanf("%d", &score) != 1)\n        return 1;\n    if (score >= 50)\n        puts("pass");\n    else\n        puts("fail");\n    return 0;\n}\n');
    const r = await call('coverage.run', { file, input: '70\n' });
    assert.ok(r.ok, JSON.stringify(r).slice(0, 300));
    const f = r.files[0];
    assert.strictEqual(f.file, file);
    assert.ok(f.lines[9] >= 1, 'puts("pass") ran');
    assert.strictEqual(f.lines[11], 0, 'puts("fail") never ran');
    assert.strictEqual(f.lines[7], 0, 'the early return never ran');
    assert.ok(f.percent > 50 && f.percent < 100, String(f.percent));
    // the fixture project: its tests call add, sub and square
    const p = await call('coverage.run', { file: LIB });
    assert.ok(p.ok, JSON.stringify(p).slice(0, 400));
    assert.strictEqual(p.kind, 'project');
    const lib = p.files.find((x) => x.file === LIB);
    assert.ok(lib, p.files.map((x) => x.file).join(', '));
    assert.strictEqual(lib.percent, 100);
    assert.ok(!p.files.some((x) => /build-coverage|_deps/.test(x.file)));
    fs.rmSync(path.join(PROJ, 'build-coverage'), { recursive: true, force: true });
    fs.rmSync(dir, { recursive: true, force: true });
  });

  await test('Makefile projects: F9 runs make, F7 runs make test, the program it made is found, and the debugger can use it', async () => {
    for (const lang of ['c', 'cpp']) {
      const dir = fs.mkdtempSync(path.join(HOME, 'mk-'));
      const r = await call('project.create', { dir, name: 'hello_make', lang, kind: 'makefile', git: false });
      assert.ok(fs.existsSync(path.join(r.root, 'Makefile')) && !fs.existsSync(path.join(r.root, 'CMakeLists.txt')));
      assert.match(fs.readFileSync(path.join(r.root, 'Makefile'), 'utf8'), /^\t\$\(CC{0,2}X{0,2}\) \$\(LDFLAGS\)/m, 'recipes start with a tab');
      const root = await call('cmake.root', { file: r.main });
      assert.strictEqual(root.kind, 'make');
      const b = await call('build.build', { file: r.main });
      assert.strictEqual(b.code, 0, JSON.stringify(b.problems).slice(0, 400));
      assert.strictEqual(b.kind, 'make');
      const exe = path.join(r.root, 'build', 'hello_make');
      assert.match(require('child_process').execFileSync(exe, { encoding: 'utf8' }), /Hello/);
      const tl = await call('ctest.list', { root: root.root });
      assert.deepStrictEqual(tl.tests.map((t) => t.name), ['make test']);
      const tr = await call('ctest.run', { root: root.root });
      assert.strictEqual(tr.summary.failed, 0);
      const tg = await call('cmake.targets', { root: root.root });
      assert.deepStrictEqual(tg.targets.map((t) => t.name), ['build/hello_make']);
      const d = await call('cmake.debug', { file: r.main, prepare: true });
      assert.ok(d.ok && d.exe === exe, JSON.stringify(d).slice(0, 300));
      // a compile error lands in Problems
      fs.appendFileSync(r.main, '\nint broken( { \n');
      const bad = await call('build.build', { file: r.main });
      assert.notStrictEqual(bad.code, 0);
      assert.ok(bad.problems.some((p) => p.severity === 'error' && p.file === r.main), JSON.stringify(bad.problems).slice(0, 300));
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  await test('predict the output: every drill compiles and prints its answer here; a guess is marked right or wrong', async () => {
    const list = await call('drills.list');
    assert.ok(list.length >= 24 && list.some((d) => d.lang === 'c') && list.some((d) => d.lang === 'cpp'));
    assert.ok(!('answer' in list[0]), 'the answer isn\'t sent before you guess');
    const data = require('../server/drill-data');
    for (const d of data) {
      const r = await call('drills.run', { id: d.id, guess: d.answer + '  \n' });
      assert.ok(r.ok, `${d.id} compiles`);
      assert.strictEqual(r.output, d.answer, d.id);
      assert.strictEqual(r.right, true, d.id);
    }
    const wrong = await call('drills.run', { id: 'c-int-division', guess: '3.5 -3.5 1' });
    assert.strictEqual(wrong.right, false);
    assert.match(wrong.explain, /fraction/);
  });

  await test('course vaults: copied to ~/Notes on the first start; new notes later, your edits never replaced', async () => {
    const { execFileSync } = require('child_process');
    const home = fs.mkdtempSync(path.join(HOME, 'first-'));
    const run = (code) => JSON.parse(execFileSync(process.execPath, ['-e', code], { cwd: path.join(__dirname, '..'), env: { ...process.env, HOME: home, XDG_CONFIG_HOME: '', XDG_DATA_HOME: '' }, encoding: 'utf8' }));
    const first = run(`const c = require('./server/config').load(); console.log(JSON.stringify(c.vaults))`);
    assert.deepStrictEqual(first, [{ path: path.join(home, 'Notes', 'C-Path'), name: 'C-Path' }, { path: path.join(home, 'Notes', 'CPP-Path'), name: 'CPP-Path' }, { path: path.join(home, 'Notes', 'Rust-Path'), name: 'Rust-Path' }]);
    const cpp = path.join(home, 'Notes', 'CPP-Path');
    assert.ok(fs.existsSync(path.join(cpp, 'CPP Start Here.md')) && fs.existsSync(path.join(home, 'Notes', 'C-Path', 'C Start Here.md')));
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(home, '.config', 'cpp-path-workbench', 'config.json'), 'utf8')).vaults.map((v) => v.name), ['C-Path', 'CPP-Path', 'Rust-Path'], 'remembered');
    // your changes: an edited note, a daily note, a deleted note
    const edited = path.join(cpp, 'CPP Done Log.md');
    fs.writeFileSync(edited, '# My log\n');
    fs.mkdirSync(path.join(cpp, 'Daily'));
    fs.writeFileSync(path.join(cpp, 'Daily', '2026-11-25.md'), '# today\n');
    fs.rmSync(path.join(cpp, 'Phase 3 - The Standard Library', '3.05 Ranges.md'));
    const again = run(`const c = require('./server/config'); c.load(); console.log(JSON.stringify(c.installBundledVaults()))`);
    assert.deepStrictEqual(again.find((g) => g.name === 'CPP-Path').copied, 1, 'only the missing note');
    assert.strictEqual(again.find((g) => g.name === 'C-Path').copied, 0);
    assert.strictEqual(fs.readFileSync(edited, 'utf8'), '# My log\n');
    assert.ok(fs.existsSync(path.join(cpp, 'Daily', '2026-11-25.md')) && fs.existsSync(path.join(cpp, 'Phase 3 - The Standard Library', '3.05 Ranges.md')));
    // removing every vault sticks; the app's own copy is never used as your vault
    fs.writeFileSync(path.join(home, '.config', 'cpp-path-workbench', 'config.json'), JSON.stringify({ vaults: [] }));
    fs.rmSync(path.join(home, 'Notes'), { recursive: true });
    assert.deepStrictEqual(run(`console.log(JSON.stringify(require('./server/config').load().vaults))`), []);
    assert.ok(!fs.existsSync(path.join(home, 'Notes')));
    const inApp = run(`console.log(JSON.stringify(require('./server/distro').findFolderWith('CPP Start Here.md', { home: ${JSON.stringify(path.join(__dirname, '..'))}, accept: (d) => true })))`);
    assert.match(inApp, /vaults[\\/]CPP-Path$/, 'it is there to find...');
    assert.strictEqual(run(`console.log(JSON.stringify(require('./server/config').findVault()))`), null, '...but findVault skips the app\'s own copy');
    fs.rmSync(home, { recursive: true, force: true });
  });

  await test('course vaults: both load, every question has a phase, every link goes somewhere or to a note still to come', async () => {
    const { execFileSync } = require('child_process');
    const out = JSON.parse(execFileSync(process.execPath, ['-e', `
      const fs = require('fs'), path = require('path');
      const notes = [];
      const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith('.md')) notes.push(p); } };
      walk('vaults');
      const names = new Set(notes.map((p) => path.basename(p, '.md').toLowerCase()));
      const rels = new Set(notes.map((p) => path.relative(path.join('vaults', p.split(path.sep)[1]), p).replace(/\\.md$/, '').toLowerCase()));
      const missing = new Set();
      let questions = 0;
      for (const p of notes) {
        const t = fs.readFileSync(p, 'utf8').replace(/^(\`\`\`)[\\s\\S]*?^\\1/gm, '').replace(/\`[^\`\\n]*\`/g, '');
        questions += (t.match(/^> \\[!question\\]/gm) || []).length;
        for (const m of t.matchAll(/\\[\\[([^\\]\\n]+)\\]\\]/g)) {
          const target = m[1].replace(/\\\\\\|/g, '|').split('|')[0].split('#')[0].trim().toLowerCase();
          if (target && !names.has(target) && !rels.has(target) && target !== '...') missing.add(target);
        }
      }
      console.log(JSON.stringify({ count: notes.length, questions, missing: [...missing] }));
    `], { cwd: path.join(__dirname, '..'), encoding: 'utf8' }));
    assert.ok(out.count >= 68, `${out.count} notes`);
    assert.ok(out.questions >= 150, `${out.questions} questions`);
    // links to the phases still to be written (4-6) are fine; anything else is a typo
    for (const m of out.missing) assert.match(m, /^[4-6]\.\d\d /, `a link to "${m}" goes nowhere`);
  });

  await test('notes: backlinks, the graph, tags, new and daily notes, ticking tasks', async () => {
    const l = await call('guides.list');
    const cv = l.vaults.find((v) => v.name === 'C-Path'), mv = l.vaults.find((v) => v.name === 'Scratch Notes');
    const made = [];
    try {
      // a link to Pointers from each vault's start note lands in its own vault's Pointers
      const myPtr = path.join(mv.path, 'Pointers.md'), cPtr = path.join(cv.path, 'Phase 1', 'Pointers.md');
      const b1 = await call('guides.backlinks', { file: myPtr });
      assert.deepStrictEqual(b1.from.map((x) => x.name), ['Start Here']);
      assert.match(b1.from[0].line, /My own take/);
      const b2 = await call('guides.backlinks', { file: cPtr });
      assert.deepStrictEqual(b2.from.map((x) => x.name), ['C Start Here']);
      const g = await call('guides.graph', { vault: mv.path });
      assert.deepStrictEqual([g.nodes.length, g.edges.length], [2, 1]);
      // a new note: its links (not the ones in code) and tags; never overwritten; no escaping the vault
      const n = await call('guides.create', { vault: mv.path, name: 'Smart Pointers', text: '---\ntags: [cpp, memory]\n---\n# Smart Pointers\n\nSee [[Pointers]] and [[Nowhere Yet]]. #todo\n\n```cpp\n[[nodiscard]] int f(); // #not-a-tag\n```\n\n- [ ] read about unique_ptr\n- [x] read about raw pointers\n\n> [!tip]\n> - [ ] a task in a callout\n' });
      made.push(n.path);
      assert.strictEqual(n.existed, false);
      assert.strictEqual((await call('guides.create', { vault: mv.path, name: 'Smart Pointers', text: 'X' })).existed, true);
      assert.match(fs.readFileSync(n.path, 'utf8'), /Nowhere Yet/, 'not overwritten');
      const b3 = await call('guides.backlinks', { file: n.path });
      assert.deepStrictEqual(b3.missing, ['Nowhere Yet']);
      assert.deepStrictEqual(b3.tags.sort(), ['cpp', 'memory', 'todo']);
      assert.strictEqual(b3.out, 1);
      assert.deepStrictEqual((await call('guides.backlinks', { file: myPtr })).from.map((x) => x.name).sort(), ['Smart Pointers', 'Start Here']);
      const tags = await call('guides.tags', { vault: mv.path });
      assert.deepStrictEqual(tags.find((x) => x.tag === 'todo').notes.map((x) => x.name), ['Smart Pointers']);
      assert.ok(!tags.some((x) => x.tag === 'not-a-tag'), 'tags inside code don\'t count');
      for (const bad of ['../escape', 'a/../../b', '.hidden', '']) await assert.rejects(call('guides.create', { vault: mv.path, name: bad }), /can't be a note name/);
      // tasks: the nth box on the page is the nth in the file, callouts included
      await call('guides.toggleTask', { file: n.path, index: 0, done: true, expectText: 'read about unique_ptr' });
      await call('guides.toggleTask', { file: n.path, index: 1, done: false });
      await call('guides.toggleTask', { file: n.path, index: 2, done: true });
      const t = fs.readFileSync(n.path, 'utf8');
      assert.match(t, /- \[x\] read about unique_ptr\n- \[ \] read about raw pointers/);
      assert.match(t, /> - \[x\] a task in a callout/);
      await assert.rejects(call('guides.toggleTask', { file: n.path, index: 9, done: true }), /no longer in the note/);
      await assert.rejects(call('guides.toggleTask', { file: path.join(PROJ, 'CMakeLists.txt'), index: 0, done: true }), /outside your vaults/);
      // a note from the vault's template; today's note in Daily/
      fs.mkdirSync(path.join(mv.path, 'Templates'));
      fs.writeFileSync(path.join(mv.path, 'Templates', 'Note Template.md'), '---\ntags: [draft]\n---\n# {{title}}\n\nStarted {{date}}.\n');
      made.push(path.join(mv.path, 'Templates'));
      const fromTpl = await call('guides.create', { vault: mv.path, name: 'Lambdas', folder: 'Phase 2' });
      made.push(path.dirname(fromTpl.path));
      assert.match(fs.readFileSync(fromTpl.path, 'utf8'), /^---\ntags: \[draft\]\n---\n# Lambdas\n\nStarted \d{4}-\d\d-\d\d\.\n$/);
      const d = await call('guides.daily', { vault: mv.path });
      made.push(path.dirname(d.path));
      assert.match(path.relative(mv.path, d.path), /^Daily\/\d{4}-\d\d-\d\d\.md$/);
      assert.match(fs.readFileSync(d.path, 'utf8'), /- \[ \] Read one note/);
      assert.strictEqual((await call('guides.daily', { vault: mv.path })).existed, true);
    } finally {
      for (const p of made) fs.rmSync(p, { recursive: true, force: true });
    }
  });

  await test('openbsd: clang, egdb, UBSan in trap mode with the strict malloc, doas pkg_add hints', async () => {
    const platform = require('../server/platform');
    const asan = ['-Wall', '-g', '-fsanitize=address,undefined', '-fno-sanitize-recover=all', '-fno-omit-frame-pointer'];
    assert.deepStrictEqual(platform.sanitizerFlags(asan, { platform: 'linux' }), asan, 'Linux: unchanged');
    assert.deepStrictEqual(platform.sanitizerFlags(asan, { platform: 'openbsd' }), ['-Wall', '-g', '-fno-omit-frame-pointer', '-fsanitize=undefined', '-fsanitize-trap=undefined']);
    assert.deepStrictEqual(platform.sanitizerFlags(['-O2'], { platform: 'openbsd' }), ['-O2']);
    assert.throws(() => platform.sanitizerFlags(['-fsanitize=fuzzer,address'], { platform: 'openbsd' }), /libFuzzer isn't available on OpenBSD/);
    assert.deepStrictEqual(platform.runEnv(asan, { platform: 'openbsd' }), { MALLOC_OPTIONS: 'S' });
    assert.deepStrictEqual(platform.runEnv(['-O2'], { platform: 'openbsd' }), {});
    assert.deepStrictEqual(platform.runEnv(asan, { platform: 'linux' }), {});
    // the whole backend, as if on OpenBSD: compilers, hints, the CMake template
    const { execFileSync } = require('child_process');
    const out = JSON.parse(execFileSync(process.execPath, ['-e', `
      const d = require('./server/distro'), p = require('./server/platform');
      console.log(JSON.stringify({ cc: p.defaultCompilers(), fam: d.info().family, gdb: d.installHint('gdb'), clangd: d.installHint('clangd'), gpp: d.installHint('g++'), clang: d.installHint('clang') }));
    `], { cwd: path.join(__dirname, '..'), env: { ...process.env, WORKBENCH_PLATFORM: 'openbsd' }, encoding: 'utf8' }));
    assert.deepStrictEqual(out.cc, { compiler: 'clang++', cCompiler: 'clang' });
    assert.strictEqual(out.fam, 'openbsd');
    assert.match(out.gdb, /doas pkg_add gdb.*egdb/);
    assert.strictEqual(out.clangd, 'doas pkg_add clang-tools-extra');
    assert.match(out.gpp, /clang\+\+ \/ clang in Settings/);
    assert.strictEqual(out.clang, 'part of OpenBSD itself');
    const cm = fs.readFileSync(path.join(__dirname, '..', 'server', 'project.js'), 'utf8');
    assert.match(cm, /CMAKE_SYSTEM_NAME STREQUAL "OpenBSD" OR \(MINGW AND [^\n]*"GNU"\)\)\n(\s+# [^\n]*\n)+\s+add_compile_options\(-fsanitize=undefined -fsanitize-trap=undefined/);
    // the window: Chromium in app mode with its own profile (inside ~/.config/chromium: unveil)
    const bin = path.join(HOME, 'fake-browsers');
    fs.mkdirSync(bin, { recursive: true });
    fs.writeFileSync(path.join(bin, 'chrome'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    const aw = path.join(__dirname, '..', 'scripts', 'app-window.js');
    const chk = execFileSync(process.execPath, [aw, '--check'], { env: { ...process.env, PATH: `${bin}:/usr/bin:/bin`, CPW_BROWSER: path.join(bin, 'chrome') }, encoding: 'utf8' });
    assert.match(chk, /^chromium: .*\/chrome\nchrome --app=URL --user-data-dir=\S+ --class=cpp-path-workbench/);
    const none = require('child_process').spawnSync(process.execPath, [aw, '--check'], { env: { ...process.env, PATH: bin, CPW_BROWSER: '/nowhere/browser' }, encoding: 'utf8' });
    assert.strictEqual(none.status, 1);
    assert.match(none.stdout, /no window: CPW_BROWSER is \/nowhere\/browser/);
    const setup = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'setup-openbsd.sh'), 'utf8');
    assert.match(setup, /^#!\/bin\/sh\n/, 'plain sh: OpenBSD has no bash out of the box');
    assert.doesNotMatch(setup, /\[\[|\bfunction\b|\$\{[^}]*\/\/|local /, 'no bashisms');
    assert.strictEqual(require('child_process').spawnSync('sh', ['-n', path.join(__dirname, '..', 'scripts', 'setup-openbsd.sh')]).status, 0);
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

  await test('windows without WSL: clang.exe through PATHEXT, the toolchain on PATH, sanitizers, C:/ paths, DPAPI, a real terminal', async () => {
    const platform = require('../server/platform');
    const { execFileSync } = require('child_process');
    const world = fs.mkdtempSync(path.join(HOME, 'win-'));
    const bin = path.join(world, 'bin');
    fs.mkdirSync(bin);
    for (const f of ['clang++.EXE', 'sh.exe', 'notes.txt']) fs.writeFileSync(path.join(bin, f), '');
    const env = { PATH: `${path.join(world, 'nowhere')};${bin}`, PATHEXT: '.COM;.EXE;.BAT;.CMD' };
    assert.strictEqual(platform.which('clang++', [], { platform: 'win32', env }), path.join(bin, 'clang++.EXE'));
    assert.strictEqual(platform.which('sh', [], { platform: 'win32', env }), path.join(bin, 'sh.exe'));
    assert.strictEqual(platform.which('notes', [], { platform: 'win32', env }), null, 'only programs');
    assert.strictEqual(platform.which('clang++', [], { platform: 'linux', env }), null, 'Linux splits PATH on : and wants the exact name');
    assert.deepStrictEqual([platform.exe('a/scratch', { platform: 'win32' }), platform.exe('x.exe', { platform: 'win32' }), platform.exe('a/scratch', { platform: 'linux' })], ['a/scratch.exe', 'x.exe', 'a/scratch']);
    // clang: ASan and UBSan, no leak checker; gcc: UBSan trap mode only
    const flags = ['-g', '-fsanitize=address,undefined', '-fno-sanitize-recover=all'];
    assert.deepStrictEqual(platform.sanitizerFlags(flags, { platform: 'win32', cc: 'clang++' }), flags);
    assert.deepStrictEqual(platform.sanitizerFlags(['-fsanitize=address,leak'], { platform: 'win32', cc: 'clang' }), ['-fsanitize=address']);
    assert.deepStrictEqual(platform.sanitizerFlags(flags, { platform: 'win32', cc: 'g++' }), ['-g', '-fsanitize=undefined', '-fsanitize-trap=undefined']);
    assert.deepStrictEqual(platform.runEnv(flags, { platform: 'win32' }), { ASAN_OPTIONS: 'detect_leaks=0:abort_on_error=0' });
    // paths reach the window as C:/...; file contents and messages don't change
    assert.deepStrictEqual(platform.slashes({ file: 'C:\\Users\\jo\\cpp-path\\main.cpp', list: [{ path: 'D:\\Notes\\C-Path' }], text: '#include <x>\nC:\\not\\a\\path', msg: 'error in C:\\x.cpp: oops', n: 3 }),
      { file: 'C:/Users/jo/cpp-path/main.cpp', list: [{ path: 'D:/Notes/C-Path' }], text: '#include <x>\nC:\\not\\a\\path', msg: 'error in C:\\x.cpp: oops', n: 3 });
    // the backend as if on Windows: the toolchain first on PATH, clang by default, hints
    const tools = path.join(world, 'tools');
    for (const d of ['llvm-mingw/bin', 'llvm-mingw/x86_64-w64-mingw32/bin', 'w64devkit/bin', 'node']) fs.mkdirSync(path.join(tools, d), { recursive: true });
    const out = JSON.parse(execFileSync(process.execPath, ['-e', `
      const p = require('./server/platform'), d = require('./server/distro');
      const have = p.setupPath();
      console.log(JSON.stringify({ have, path: process.env.PATH, cc: p.defaultCompilers(), fam: d.info().family, vg: d.installHint('valgrind'), gdb: d.installHint('gdb'),
        secret: require('./server/secrets').dpapiFile('neomutt', 'jo@example.org') }));
    `], { cwd: path.join(__dirname, '..'), env: { ...process.env, WORKBENCH_PLATFORM: 'win32', CPW_TOOLS: tools, PATH: 'C:\\Windows\\System32' }, encoding: 'utf8' }));
    assert.deepStrictEqual(out.have.map((d) => path.relative(tools, d)), ['llvm-mingw/bin', 'llvm-mingw/x86_64-w64-mingw32/bin', 'w64devkit/bin', 'node'], 'only the folders that are there, llvm-mingw first');
    assert.strictEqual(out.path, [...out.have, 'C:\\Windows\\System32'].join(';'));
    assert.deepStrictEqual(out.cc, { compiler: 'clang++', cCompiler: 'clang' });
    assert.strictEqual(out.fam, 'windows');
    assert.match(out.vg, /doesn't exist for Windows: the sanitizers/);
    assert.match(out.gdb, /Install on Windows \(no WSL\)\.cmd" again/);
    assert.match(out.secret, /secrets[\\/][0-9a-f]{32}\.dpapi$/, 'a hashed name: the address isn\'t in the file name');
    // passwords go to PowerShell on stdin, never on its command line
    const sec = fs.readFileSync(path.join(__dirname, '..', 'server', 'secrets.js'), 'utf8');
    assert.match(sec, /\[Console\]::In\.ReadToEnd\(\)/);
    assert.match(sec, /p\.stdin\.end\(input === undefined \? '' : input\)/);
    assert.match(sec, /spawn\('powershell\.exe', \['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script\]/, 'only the fixed script on the command line');
    assert.match(sec, /await powershell\(PS_STORE, f, secret\)/);
    // a real terminal through node-pty (what Windows uses, as ConPTY), here on Linux
    const term = execFileSync(process.execPath, ['-e', `
      const pty = require('./server/pty'); let out = '';
      pty.init({ register() {}, onExit: [], broadcast(k, d) { if (k === 'pty.data') out += d.data; if (k === 'pty.exit') { console.log(JSON.stringify({ out, code: d.code, b: pty.backend() })); process.exit(0); } } });
      const t = pty.open({ cwd: ${JSON.stringify(world)}, cols: 77, argv: ['bash', '-c', 'read -r x; echo "got $x"; tput cols; exit 3'] });
      setTimeout(() => pty.write({ id: t.id, data: 'hello\\r' }), 200);
      setTimeout(() => { console.log(JSON.stringify({ out, timeout: true })); process.exit(1); }, 8000);
    `], { cwd: path.join(__dirname, '..'), env: { ...process.env, CPW_PTY: 'node-pty' }, encoding: 'utf8' });
    const t = JSON.parse(term);
    assert.strictEqual(t.b, 'node-pty');
    assert.match(t.out, /got hello\r\n77\r\n/);
    assert.strictEqual(t.code, 3);
    // the installer: plain ASCII with Windows line endings, pinned https downloads, every one checked
    const ps = fs.readFileSync(path.join(__dirname, '..', 'windows', 'Install-Native.ps1'), 'utf8');
    for (const f of ['windows/Install-Native.ps1', 'Install on Windows (no WSL).cmd']) {
      const txt = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
      assert.ok(/^[\x00-\x7f]*$/.test(txt), `${f}: ASCII only (Windows PowerShell 5.1 reads files without a BOM as ANSI)`);
      assert.ok(!/[^\r]\n/.test(txt), `${f}: CRLF line endings`);
    }
    const urls = [...ps.matchAll(/Url = '([^']+)'/g)].map((m) => m[1]);
    assert.strictEqual(urls.length, 6);
    for (const u of urls) assert.match(u, /^https:\/\/(nodejs\.org\/dist|github\.com\/[\w-]+\/[\w-]+\/releases\/download)\//);
    for (const m of ps.matchAll(/Url = 'https:\/\/github\.com\/([\w-]+\/[\w-]+)\/releases\/download\/([^/]+)\/([^']+)'; Repo = '([^']+)'; Tag = '([^']+)'/g)) {
      assert.deepStrictEqual([m[4], m[5]], [m[1], m[2]], 'the checksum is looked up for the same release that is downloaded');
    }
    assert.match(ps, /Get-FileHash -Algorithm SHA256[\s\S]*isn't the file its project published/);
    // Rust: rustup-init from rust-lang.org over https, checked against its .sha256, and optional
    assert.match(ps, /\$rustupFrom = 'https:\/\/static\.rust-lang\.org\/rustup\/dist\/x86_64-pc-windows-gnu\/rustup-init\.exe'/);
    assert.match(ps, /"\$rustupFrom\.sha256"[\s\S]*isn't the file rust-lang\.org published[\s\S]*Rust didn't install/);
    // your PATH: the user one only (no admin), unexpanded entries kept, ours at the end, undone by -Uninstall
    assert.match(ps, /OpenSubKey\('Environment', \$true\)[\s\S]*RegistryValueKind\]::ExpandString/);
    assert.match(ps, /DoNotExpandEnvironmentNames/);
    assert.match(ps, /SetUserPath \(\(\$keep \+ \$ours\) -join ';'\)/);
    assert.match(ps, /if \(\$Uninstall\) \{\s*Say [^\n]*\s*RemoveFromUserPath/);
    assert.ok(!/'Machine'/.test(ps), 'never the system-wide PATH');
    assert.doesNotMatch(ps, /Invoke-Expression|\biex\b|-NoProxy \$true|\$a\.NoProxy/);
    assert.match(ps, /\$env:NODE_EXTRA_CA_CERTS = \$CertFile/);
    fs.rmSync(world, { recursive: true, force: true });
  });

  await test('windows: behind a company proxy, WSL setup goes through it and trusts the inspecting certificate', async () => {
    const { spawnSync, execFileSync } = require('child_process');
    const script = path.join(__dirname, '..', 'scripts', 'wsl-proxy.sh');
    const world = fs.mkdtempSync(path.join(HOME, 'proxy-'));
    const bin = path.join(world, 'bin'), root = path.join(world, 'root'), home = path.join(world, 'home');
    for (const d of [bin, path.join(root, 'etc/apt/apt.conf.d'), home]) fs.mkdirSync(d, { recursive: true });
    const log = path.join(world, 'calls.log');
    const tool = (name, body) => fs.writeFileSync(path.join(bin, name), `#!/bin/bash\necho "${name} $*" >> ${JSON.stringify(log)}\n${body}\n`, { mode: 0o755 });
    // curl: through an inspecting proxy, HTTPS fails until the Windows certificates are in;
    // CPW_FAKE=auth: the proxy wants a login
    tool('curl', `if [ "$CPW_FAKE" = auth ]; then echo "curl: (56) CONNECT tunnel failed, response 407" >&2; exit 56; fi
if [ "$CPW_FAKE" = inspect ] && [ ! -e ${JSON.stringify(path.join(root, 'trusted'))} ]; then echo "curl: (60) SSL certificate problem: self-signed certificate in certificate chain" >&2; exit 60; fi
printf 200`);
    tool('update-ca-certificates', `touch ${JSON.stringify(path.join(root, 'trusted'))}`);
    tool('npm', 'exit 0');
    tool('git', '[ "$2" = --get ] && exit 1; exit 0');
    tool('ip', 'echo "default via 172.28.0.1 dev eth0"');
    tool('wslinfo', 'echo nat');
    // two real certificates in one PEM file, as Install.ps1 exports them
    const pem = path.join(world, 'windows-roots.pem');
    for (const n of [1, 2]) {
      execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(world, `k${n}`), '-out', path.join(world, `c${n}.pem`), '-days', '2', '-subj', `/CN=Company Root ${n}`], { stdio: 'ignore' });
    }
    fs.writeFileSync(pem, fs.readFileSync(path.join(world, 'c1.pem'), 'utf8') + fs.readFileSync(path.join(world, 'c2.pem'), 'utf8') + '-----BEGIN CERTIFICATE-----\nnot a certificate\n-----END CERTIFICATE-----\n');
    const run = (env) => {
      fs.rmSync(log, { force: true });
      const r = spawnSync('bash', ['-c', `. ${JSON.stringify(script)}; proxy_setup; echo "exit=$?"; echo "https_proxy=$https_proxy"; echo "extra=$NODE_EXTRA_CA_CERTS"`],
        { env: { PATH: `${bin}:/usr/bin:/bin`, HOME: home, CPW_SUDO: 'env', CPW_ROOT: root, ...env }, encoding: 'utf8' });
      return { out: r.stdout + r.stderr, calls: fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '' };
    };
    // a proxy on Windows' localhost, an inspecting one: reached via the Windows host, certificates trusted
    const a = run({ CPW_PROXY: 'http://127.0.0.1:3128', CPW_WINDOWS_CERTS: pem, CPW_FAKE: 'inspect' });
    assert.match(a.out, /from WSL that's http:\/\/172\.28\.0\.1:3128/);
    assert.match(a.out, /Trusted 2 certificates from Windows/, a.out);
    assert.match(a.out, /OK: https:\/\/registry\.npmjs\.org\/ answers through the proxy/);
    assert.match(a.out, /exit=0\nhttps_proxy=http:\/\/172\.28\.0\.1:3128\nextra=\/etc\/ssl\/certs\/ca-certificates\.crt/);
    assert.strictEqual(fs.readFileSync(path.join(root, 'etc/apt/apt.conf.d/95cpp-path-workbench-proxy'), 'utf8'), 'Acquire::http::Proxy "http://172.28.0.1:3128";\nAcquire::https::Proxy "http://172.28.0.1:3128";\n');
    assert.deepStrictEqual(fs.readdirSync(path.join(root, 'usr/local/share/ca-certificates/cpp-path-workbench')), ['windows-001.crt', 'windows-002.crt'], 'the broken one is left out');
    assert.match(a.calls, /npm config set https-proxy http:\/\/172\.28\.0\.1:3128\nnpm config set cafile \/etc\/ssl\/certs\/ca-certificates\.crt/);
    assert.match(a.calls, /git config --global http\.proxy http:\/\/172\.28\.0\.1:3128/);
    const envFile = path.join(home, '.config/cpp-path-workbench/proxy.env');
    const saved = fs.readFileSync(envFile, 'utf8');
    assert.match(saved, /export https_proxy='http:\/\/172\.28\.0\.1:3128'/);
    assert.match(saved, /export ELECTRON_GET_USE_PROXY=1/);
    assert.match(saved, /export NODE_EXTRA_CA_CERTS='\/etc\/ssl\/certs\/ca-certificates\.crt'/);
    assert.strictEqual((fs.statSync(envFile).mode & 0o777).toString(8), '600', 'it can hold a proxy password');
    assert.match(spawnSync('bash', ['-c', `. ${JSON.stringify(envFile)}; echo $GLOBAL_AGENT_HTTPS_PROXY`], { encoding: 'utf8' }).stdout, /^http:\/\/172\.28\.0\.1:3128$/m);
    run({ CPW_PROXY: 'http://proxy.corp:8080' });
    assert.strictEqual(fs.readFileSync(path.join(home, '.profile'), 'utf8').split('proxy.env').length - 1, 2, '~/.profile reads it, added once');
    // mirrored networking: localhost stays localhost
    assert.match(run({ CPW_PROXY: 'http://localhost:3128', CPW_MIRRORED: '1' }).out, /https_proxy=http:\/\/localhost:3128/);
    // a proxy that wants a login: says how, and stops
    const c = run({ CPW_PROXY: 'http://proxy.corp:8080', CPW_FAKE: 'auth' });
    assert.match(c.out, /wants a login \(HTTP 407\)[\s\S]*px[\s\S]*exit=1/);
    // no proxy and nothing from Windows: does nothing at all
    const d = run({});
    assert.strictEqual(d.calls, '');
    assert.match(d.out, /^exit=0\nhttps_proxy=\n/);
    fs.rmSync(world, { recursive: true, force: true });
  });

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
    if (!electron) assert.match(r0.stdout, /Electron .* isn't installed[\s\S]*electron\/install\.js/);
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
