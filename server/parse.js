'use strict';
// Reading tool output into a Problems list. One parser understands
// everything the C++ path produces:
//
//   g++ / clang++   file.cpp:12:5: error: expected ';' before 'return'
//                   (the "note:" lines after an error are kept with it)
//   ld              main.cpp:7:(.text+0x1a): undefined reference to `calc::add(int, int)'
//   CMake           CMake Error at CMakeLists.txt:12 (add_executable):
//   Catch2          /path/test_text_stats.cpp:14: FAILED:
//   ASan / LSan     ==123==ERROR: AddressSanitizer: heap-use-after-free ...
//                       #0 0x55d1 in main /path/scratch.cpp:9:12
//   UBSan           /path/scratch.cpp:6:8: runtime error: signed integer overflow
//   clang-tidy      same shape as the compiler, with [check-name] at the end
//   cppcheck        our --template gives the compiler's shape too
//   Open Watcom     hello.cpp(12): Error! E029: col(5) symbol 'x' has not been declared

const path = require('path');

const DIAG = /^(.+?):(\d+):(?:(\d+):)?\s+(fatal error|error|warning|note|remark|style|performance|portability|information):\s+(.*)$/;
const LD_REF = /^(?:\/usr\/bin\/)?(?:ld(?:\.\w+)?:\s+)?(\/?[^\s:][^:]*?):(\d+):(?:\(.+?\):)?\s*(undefined reference to .*|multiple definition of .*)$/;
const LD = /^(?:\/usr\/bin\/)?(?:ld(?:\.\w+)?|collect2):\s+(?:error:\s+)?(.*)$/;
const MAKE_DIR = /make(?:\[\d+\])?: Entering directory ['`](.*)'/;
const CMAKE = /^CMake (Error|Warning)(?: \(dev\))? at (.+?):(\d+)(?: \((.+?)\))?:?\s*$/;
const CMAKE_PLAIN = /^CMake (Error|Warning)(?: \(dev\))?:\s*(.*)$/;
const CATCH = /^(.+?):(\d+): FAILED:\s*$/;
const SAN_ERR = /==\d+==\s*ERROR: (AddressSanitizer|LeakSanitizer|ThreadSanitizer|MemorySanitizer):\s*(.*)$/;
const LEAK = /^(Direct|Indirect) leak of (\d+) byte\(s\) in (\d+) object\(s\) allocated from:/;
const FRAME = /^\s*#(\d+) 0x[0-9a-f]+ in (.+?) (\/[^\s:]+):(\d+)(?::(\d+))?\s*$/;
const UBSAN = /^(.+?):(\d+):(\d+): runtime error: (.*)$/;
const WATCOM = /^(.+?)\((\d+)\): (Error|Warning|Note)! ([EWN]\d+): (?:col\((\d+)\) )?(.*)$/;
const SAN_SECTION = /^(freed by thread|previously allocated by thread|allocated by thread)/;
const SAN_STAGE = { 'freed by thread': 'freed here', 'previously allocated by thread': 'allocated here', 'allocated by thread': 'allocated here' };
// g++'s template backtrace: the line in YOUR code that started it
const REQUIRED = /^(.+?):(\d+):(\d+):\s+required (?:from|by) (here|.*)$/;
const SYSTEM = (f) => f.startsWith('/usr/') || /\/_deps\//.test(f);

// Frames in the C++ library, the sanitizer runtime or a fetched dependency
// aren't where your bug is; the first frame in your own code is.
function userFrame(file) {
  return !file.startsWith('/usr/') && !/\/_deps\//.test(file) && !/sanitizer_common|asan_|ubsan_|lsan_/.test(file);
}

const SEVERITY = { 'fatal error': 'error', error: 'error', warning: 'warning', note: 'info', remark: 'info',
  style: 'warning', performance: 'warning', portability: 'warning', information: 'info' };

class OutputParser {
  constructor(cwd, { source } = {}) {
    this.cwdStack = [cwd];
    this.problems = [];
    this.source = source || null;     // label for compiler lines (gcc, clang-tidy, cppcheck)
    this.pending = null;              // a problem still collecting its continuation lines
    this.san = null;                  // inside a sanitizer report
    this.required = null;             // last "required from here" in your code
  }
  resolve(f) { return path.isAbsolute(f) ? path.normalize(f) : path.join(this.cwdStack[this.cwdStack.length - 1], f); }
  push(p) { this.problems.push(p); return p; }
  // Point a library-internal error at your line, keeping where the library
  // tripped over it as the first note.
  relocate(p, at) {
    const where = { file: p.file, line: p.line, col: p.col, severity: 'info', message: `inside the library: ${path.basename(p.file)}:${p.line}` };
    p.notes = [where, ...(p.notes || [])];
    p.file = at.file; p.line = at.line; p.col = at.col || 1;
    p.moved = true;
  }

  line(raw) {
    // eslint-disable-next-line no-control-regex
    const line = raw.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\r$/, '');
    const dm = line.match(MAKE_DIR);
    if (dm) { this.cwdStack.push(dm[1]); return; }
    if (/make(?:\[\d+\])?: Leaving directory/.test(line) && this.cwdStack.length > 1) { this.cwdStack.pop(); return; }

    // continuation lines: CMake's indented explanation, Catch2's expression
    if (this.pending) {
      const p = this.pending;
      if (p.kind === 'cmake') {
        if (/^\s{2,}\S/.test(line) && p.extra < 3) { p.problem.message += (p.extra ? ' ' : ': ') + line.trim(); p.extra++; return; }
        if (!line.trim() && p.extra === 0) return;
        this.pending = null;
      } else if (p.kind === 'catch') {
        if (line.trim() && !/^[-=.]{10,}/.test(line) && p.extra < 4) {
          const t = line.trim();
          p.problem.message += (p.extra ? ' ' : ': ') + (t === 'with expansion:' ? '→' : t);
          p.extra++;
          return;
        }
        if (line.trim() || p.extra) this.pending = null;
        else return;
      }
    }

    // sanitizer reports span many lines: the error, then a stack
    const se = line.match(SAN_ERR);
    if (se) {
      const kind = se[1] === 'AddressSanitizer' ? 'ASan' : se[1] === 'LeakSanitizer' ? 'LSan' : se[1].replace('Sanitizer', 'San');
      const what = se[2].replace(/ on (unknown )?address 0x[0-9a-f]+.*$/, '').replace(/^detected memory leaks$/, 'memory leak');
      this.san = { kind, what, stage: 'main', problem: null };
      return;
    }
    if (this.san) {
      const lk = line.match(LEAK);
      if (lk) { this.san.what = `${lk[1].toLowerCase()} leak of ${lk[2]} bytes`; this.san.stage = 'main'; this.san.problem = null; return; }
      const sec = line.match(SAN_SECTION);
      if (sec) { this.san.stage = sec[1]; return; }
      const fr = line.match(FRAME);
      if (fr && userFrame(fr[3])) {
        if (this.san.stage === 'main' && !this.san.problem) {
          this.san.problem = this.push({ file: fr[3], line: +fr[4], col: fr[5] ? +fr[5] : 1, severity: 'error',
            message: `${this.san.kind}: ${this.san.what} (in ${fr[2]})`, source: this.san.kind.toLowerCase(), runtime: true, notes: [] });
        } else if (this.san.stage !== 'main' && this.san.problem && !this.san.problem.notes.some((n) => n.stage === this.san.stage)) {
          this.san.problem.notes.push({ stage: this.san.stage, file: fr[3], line: +fr[4], col: fr[5] ? +fr[5] : 1, message: `${SAN_STAGE[this.san.stage] || this.san.stage} (in ${fr[2]})` });
        }
        return;
      }
      if (/^SUMMARY: /.test(line) || /^==\d+==ABORTING/.test(line)) { if (/ABORTING/.test(line)) this.san = null; return; }
    }

    let m = line.match(UBSAN);
    if (m) {
      this.push({ file: this.resolve(m[1]), line: +m[2], col: +m[3], severity: 'error', message: `UBSan: ${m[4]}`, source: 'ubsan', runtime: true });
      return;
    }
    m = line.match(CATCH);
    if (m) {
      const p = this.push({ file: this.resolve(m[1]), line: +m[2], col: 1, severity: 'error', message: 'test failed', source: 'test' });
      this.pending = { kind: 'catch', problem: p, extra: 0 };
      return;
    }
    m = line.match(CMAKE);
    if (m) {
      const p = this.push({ file: this.resolve(m[2]), line: +m[3], col: 1, severity: m[1] === 'Error' ? 'error' : 'warning',
        message: m[4] ? `${m[4]}` : `CMake ${m[1].toLowerCase()}`, source: 'cmake' });
      this.pending = { kind: 'cmake', problem: p, extra: 0 };
      return;
    }
    m = line.match(CMAKE_PLAIN);
    if (m) {
      const p = this.push({ file: '', line: 0, col: 0, severity: m[1] === 'Error' ? 'error' : 'warning', message: m[2] || `CMake ${m[1].toLowerCase()}`, source: 'cmake' });
      this.pending = { kind: 'cmake', problem: p, extra: m[2] ? 1 : 0 };
      return;
    }
    m = line.match(WATCOM);
    if (m) {
      this.push({ file: this.resolve(m[1]), line: +m[2], col: m[5] ? +m[5] : 1, severity: m[3] === 'Error' ? 'error' : m[3] === 'Warning' ? 'warning' : 'info',
        message: `${m[4]}: ${m[6]}`, source: 'watcom' });
      return;
    }
    m = line.match(REQUIRED);
    if (m) {
      const f = this.resolve(m[1]);
      if (!SYSTEM(f)) this.required = { file: f, line: +m[2], col: +m[3] };
      return;
    }
    m = line.match(DIAG);
    if (m && !/^In file included from/.test(line) && !/^\s/.test(line)) {
      const sev = SEVERITY[m[4]];
      const p = { file: this.resolve(m[1]), line: +m[2], col: m[3] ? +m[3] : 1, severity: sev, message: m[5], source: this.source || 'compiler' };
      // A template error comes with a page of notes; keep them with the
      // error they explain instead of flooding the list.
      const last = this.problems[this.problems.length - 1];
      if (sev === 'info' && m[4] === 'note' && last && last.severity !== 'info' && !last.runtime) {
        (last.notes = last.notes || []).push(p);
        // clang: "note: in instantiation of ... requested here" in your code
        if (SYSTEM(last.file) && !SYSTEM(p.file) && /requested here/.test(p.message) && !last.moved) this.relocate(last, p);
        return;
      }
      // g++: the error is inside the library, but "required from here"
      // (just before it) says which line of yours asked for it
      if (sev !== 'info' && SYSTEM(p.file) && this.required) this.relocate(p, this.required);
      this.required = null;
      this.push(p);
      return;
    }
    m = line.match(LD_REF);
    if (m) { this.push({ file: this.resolve(m[1]), line: +m[2], col: 1, severity: 'error', message: m[3], source: 'ld' }); return; }
    m = line.match(LD);
    if (m && /undefined reference|multiple definition|cannot find/.test(m[1])) {
      this.push({ file: '', line: 0, col: 0, severity: 'error', message: m[1], source: 'ld' });
    }
  }
}

// Catch2's summary line: how much of a project stub works yet.
//   test cases: 7 | 2 passed | 5 failed
//   All tests passed (12 assertions in 5 test cases)
function catchSummary(text) {
  const all = text.match(/All tests passed \((\d+) assertions? in (\d+) test cases?\)/);
  if (all) return { total: +all[2], passed: +all[2], failed: 0 };
  const m = text.match(/test cases:\s*(\d+)\s*\|\s*(\d+) passed\s*\|\s*(\d+) failed/);
  if (m) return { total: +m[1], passed: +m[2], failed: +m[3] };
  const f = text.match(/test cases:\s*(\d+)\s*\|\s*(\d+) failed/);
  if (f) return { total: +f[1], passed: 0, failed: +f[2] };
  return null;
}

// ctest's progress lines:
//   12/60 Test #12: FixedStack push and pop ..........   Passed    0.01 sec
//    3/60 Test  #3: splitWords handles spaces .......***Failed    0.02 sec
const CTEST = /^\s*\d+\/\d+\s+Test\s+#(\d+):\s+(.+?)\s+\.+\s*\**\s*(Passed|Failed|Not Run|Timeout|Exception: \S+|Subprocess aborted|Child aborted|SegFault|[A-Za-z][\w ]*?)\s+([\d.]+)\s+sec/;
function ctestLine(line) {
  const m = line.match(CTEST);
  if (!m) return null;
  return { index: +m[1], name: m[2], status: m[3] === 'Passed' ? 'passed' : m[3] === 'Not Run' ? 'notrun' : 'failed', detail: m[3], seconds: +m[4] };
}

module.exports = { OutputParser, catchSummary, ctestLine, userFrame };
