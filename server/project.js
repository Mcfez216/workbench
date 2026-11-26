'use strict';
// Starting things: a new CMake project in C or C++ (ready to configure,
// build, test and debug, nothing to download), new files from templates
// (a source file with main, a header with an include guard, a class or a
// module as a header/source pair), and switching between a header and its
// source file.

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { execFile } = require('child_process');
const config = require('./config');
const { abs } = require('./files');

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
function ident(name) {
  const id = String(name || '').trim().replace(/[^A-Za-z0-9_]+/g, '_').replace(/^(\d)/, '_$1');
  if (!IDENT.test(id)) throw new Error(`"${name}" can't be a name in code: use letters, digits and _`);
  return id;
}
const guard = (file) => path.basename(file).toUpperCase().replace(/[^A-Z0-9]+/g, '_') + '_';

// ------------------------------------------------------------------ file templates
// What a new file starts as. kind: main | source | header | class | module
function fileTemplate(kind, file, lang) {
  const base = path.basename(file).replace(/\.[^.]+$/, '');
  const c = lang === 'c';
  if (lang === 'rust' || /\.rs$/.test(file)) {
    if (kind === 'main') return `fn main() {\n    println!("Hello from ${base}!");\n}\n`;
    return `//! ${base}\n\n`;
  }
  switch (kind) {
    case 'main':
      return c
        ? `#include <stdio.h>\n#include <stdlib.h>\n\nint main(void) {\n    printf("Hello from ${base}!\\n");\n    return EXIT_SUCCESS;\n}\n`
        : `#include <iostream>\n\nint main() {\n    std::cout << "Hello from ${base}!\\n";\n    return 0;\n}\n`;
    case 'header':
      return c
        ? `#ifndef ${guard(file)}\n#define ${guard(file)}\n\n#ifdef __cplusplus\nextern "C" {\n#endif\n\n\n\n#ifdef __cplusplus\n}\n#endif\n\n#endif /* ${guard(file)} */\n`
        : `#pragma once\n\n\n`;
    case 'source':
      return '';
    default:
      return '';
  }
}

// A class (C++) or a module (C): the header and the source together.
function pairTemplates(name, dir, lang) {
  const id = ident(name);
  if (lang === 'c') {
    const h = path.join(dir, `${id}.h`), src = path.join(dir, `${id}.c`);
    const g = guard(h);
    return [
      [h, `#ifndef ${g}\n#define ${g}\n\n#include <stddef.h>\n\n/* An opaque type: callers only ever hold a pointer to it. */\ntypedef struct ${id} ${id};\n\n${id} *${id}_create(void);\nvoid ${id}_destroy(${id} *self);\n\n#endif /* ${g} */\n`],
      [src, `#include "${id}.h"\n\n#include <stdlib.h>\n\nstruct ${id} {\n    size_t count;\n};\n\n${id} *${id}_create(void) {\n    ${id} *self = calloc(1, sizeof *self);\n    return self;   /* NULL if out of memory: the caller checks */\n}\n\nvoid ${id}_destroy(${id} *self) {\n    free(self);   /* free(NULL) is fine */\n}\n`],
    ];
  }
  const h = path.join(dir, `${id}.hpp`), src = path.join(dir, `${id}.cpp`);
  return [
    [h, `#pragma once\n\n#include <string>\n\nclass ${id} {\npublic:\n    ${id}() = default;\n    explicit ${id}(std::string name);\n\n    [[nodiscard]] const std::string& name() const noexcept { return name_; }\n\nprivate:\n    std::string name_;\n};\n`],
    [src, `#include "${id}.hpp"\n\n#include <utility>\n\n${id}::${id}(std::string name) : name_(std::move(name)) {}\n`],
  ];
}

async function newFile({ file, kind = 'source', lang }) {
  const f = abs(file);
  const l = lang || (/\.c$/.test(f) ? 'c' : /\.rs$/.test(f) ? 'rust' : /\.h$/.test(f) ? config.get().language : 'cpp');
  if (fs.existsSync(f)) throw new Error(`${path.basename(f)} already exists`);
  await fsp.mkdir(path.dirname(f), { recursive: true });
  await fsp.writeFile(f, fileTemplate(kind, f, l), { flag: 'wx' });
  return { file: f };
}

async function newPair({ dir, name, lang }) {
  const d = abs(dir);
  const files = pairTemplates(name, d, lang === 'c' ? 'c' : 'cpp');
  for (const [f] of files) if (fs.existsSync(f)) throw new Error(`${path.basename(f)} already exists`);
  await fsp.mkdir(d, { recursive: true });
  for (const [f, text] of files) await fsp.writeFile(f, text, { flag: 'wx' });
  return { files: files.map(([f]) => f) };
}

// ------------------------------------------------------------------ new Cargo project
// The same as cargo new, written out here so it works offline and says
// what each file is for. library: lib.rs with tests, and a small program
// that uses it.
function cargoFiles({ name, kind }) {
  const pkg = String(name).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!/^[a-z_][a-z0-9_-]*$/.test(pkg)) throw new Error(`"${name}" can't be a Rust package name: use small letters, digits, - and _`);
  const crate = pkg.replace(/-/g, '_');
  const edition = String(config.get().build.rustEdition || '2024');
  const files = {
    'Cargo.toml': `[package]\nname = "${pkg}"\nversion = "0.1.0"\nedition = "${edition}"\n\n[dependencies]\n`,
    '.gitignore': '/target\n',
    'rustfmt.toml': 'max_width = 100\n',
  };
  if (kind === 'library') {
    files['src/lib.rs'] = `//! ${pkg}: a library. Its tests are at the bottom of this file (F7 runs them).\n\n/// Adds two numbers.\npub fn add(a: i64, b: i64) -> i64 {\n    a + b\n}\n\n#[cfg(test)]\nmod tests {\n    use super::*;\n\n    #[test]\n    fn adds_two_numbers() {\n        assert_eq!(add(2, 3), 5);\n    }\n\n    #[test]\n    fn adds_negative_numbers() {\n        assert_eq!(add(-2, -3), -5);\n    }\n}\n`;
    files['src/main.rs'] = `fn main() {\n    println!("2 + 3 = {}", ${crate}::add(2, 3));\n}\n`;
  } else {
    files['src/main.rs'] = `fn main() {\n    println!("Hello from ${pkg}!");\n}\n`;
  }
  files['README.md'] = `# ${pkg}\n\nA Rust project (edition ${edition}). In MHDE: F9 builds, Ctrl+F9 runs${kind === 'library' ? ', F7 runs the tests' : ''}, Ctrl+Shift+D debugs, Ctrl+Shift+K asks clippy.\n\nFrom a terminal:\n\n\`\`\`bash\ncargo build\ncargo run\n${kind === 'library' ? 'cargo test\n' : ''}\`\`\`\n`;
  return { pkg, files };
}

// ------------------------------------------------------------------ new project
// kind: console (one program) | library (a library, a program that uses it,
// and tests run by CTest). Tests are plain programs that return non-zero on
// failure, so there's nothing to download; swap in Catch2 or Unity later.
function projectFiles({ name, lang, kind }) {
  const id = ident(name);
  const c = lang === 'c';
  const ext = c ? 'c' : 'cpp', hext = c ? 'h' : 'hpp';
  const files = {};
  const stdLine = c
    ? 'set(CMAKE_C_STANDARD 17)\nset(CMAKE_C_STANDARD_REQUIRED ON)\nset(CMAKE_C_EXTENSIONS OFF)'
    : 'set(CMAKE_CXX_STANDARD 20)\nset(CMAKE_CXX_STANDARD_REQUIRED ON)\nset(CMAKE_CXX_EXTENSIONS OFF)';
  let cm = `cmake_minimum_required(VERSION 3.16)
project(${id} LANGUAGES ${c ? 'C' : 'CXX'})

${stdLine}
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)   # for clangd and clang-tidy

if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Debug)
endif()

# Warnings on everywhere; AddressSanitizer and UBSan in Debug builds
add_compile_options(-Wall -Wextra -Wpedantic${c ? ' -Wshadow -Wstrict-prototypes' : ' -Wshadow -Wconversion'})
if(CMAKE_BUILD_TYPE STREQUAL "Debug")
    if(CMAKE_SYSTEM_NAME STREQUAL "OpenBSD" OR (MINGW AND CMAKE_${c ? 'C' : 'CXX'}_COMPILER_ID STREQUAL "GNU"))
        # OpenBSD's clang and gcc on Windows have no ASan: UBSan stops the
        # program instead (trap); on OpenBSD the workbench also runs it with
        # MALLOC_OPTIONS=S to check the heap
        add_compile_options(-fsanitize=undefined -fsanitize-trap=undefined -fno-omit-frame-pointer)
        add_link_options(-fsanitize=undefined -fsanitize-trap=undefined)
    else()
        add_compile_options(-fsanitize=address,undefined -fno-omit-frame-pointer)
        add_link_options(-fsanitize=address,undefined)
    endif()
endif()
`;
  if (kind === 'library') {
    cm += `
add_library(${id}_lib src/${id}.${ext})
target_include_directories(${id}_lib PUBLIC include)
${c ? `target_link_libraries(${id}_lib PUBLIC m)\n` : ''}
add_executable(${id} src/main.${ext})
target_link_libraries(${id} PRIVATE ${id}_lib)

enable_testing()
add_executable(${id}_tests tests/test_${id}.${ext})
target_link_libraries(${id}_tests PRIVATE ${id}_lib)
add_test(NAME ${id}_tests COMMAND ${id}_tests)
`;
    files[`include/${id}.${hext}`] = c
      ? `#ifndef ${id.toUpperCase()}_H_\n#define ${id.toUpperCase()}_H_\n\n/* Adds two numbers. Replace with your own library. */\nint ${id}_add(int a, int b);\n\n#endif /* ${id.toUpperCase()}_H_ */\n`
      : `#pragma once\n\nnamespace ${id} {\n\n// Adds two numbers. Replace with your own library.\nint add(int a, int b);\n\n}  // namespace ${id}\n`;
    files[`src/${id}.${ext}`] = c
      ? `#include "${id}.h"\n\nint ${id}_add(int a, int b) {\n    return a + b;\n}\n`
      : `#include "${id}.hpp"\n\nnamespace ${id} {\n\nint add(int a, int b) {\n    return a + b;\n}\n\n}  // namespace ${id}\n`;
    files[`src/main.${ext}`] = c
      ? `#include <stdio.h>\n\n#include "${id}.h"\n\nint main(void) {\n    printf("2 + 3 = %d\\n", ${id}_add(2, 3));\n    return 0;\n}\n`
      : `#include <iostream>\n\n#include "${id}.hpp"\n\nint main() {\n    std::cout << "2 + 3 = " << ${id}::add(2, 3) << '\\n';\n    return 0;\n}\n`;
    files[`tests/test_${id}.${ext}`] = c
      ? `/* Tests: each CHECK that fails prints where, and the program exits 1, which
 * is what CTest counts as a failure. F7 runs them. */
#include <stdio.h>

#include "${id}.h"

static int failures = 0;
#define CHECK(expr) do { if (!(expr)) { ++failures; printf("%s:%d: FAILED: CHECK( %s )\\n", __FILE__, __LINE__, #expr); } } while (0)

int main(void) {
    CHECK(${id}_add(2, 3) == 5);
    CHECK(${id}_add(-1, 1) == 0);
    if (failures == 0) printf("All tests passed\\n");
    return failures ? 1 : 0;
}
`
      : `// Tests: each CHECK that fails prints where, and the program exits 1, which
// is what CTest counts as a failure. F7 runs them.
#include <iostream>

#include "${id}.hpp"

static int failures = 0;
#define CHECK(expr) do { if (!(expr)) { ++failures; std::cout << __FILE__ << ':' << __LINE__ << ": FAILED: CHECK( " #expr " )\\n"; } } while (0)

int main() {
    CHECK(${id}::add(2, 3) == 5);
    CHECK(${id}::add(-1, 1) == 0);
    if (failures == 0) std::cout << "All tests passed\\n";
    return failures ? 1 : 0;
}
`;
  } else {
    cm += `\nadd_executable(${id} src/main.${ext})\n${c ? `target_link_libraries(${id} PRIVATE m)\n` : ''}`;
    files[`src/main.${ext}`] = fileTemplate('main', `src/main.${ext}`, lang).replace(/Hello from main!/, `Hello from ${id}!`);
  }
  files['CMakeLists.txt'] = cm;
  files['.gitignore'] = 'build/\n.cache/\n';
  files['.clang-format'] = 'BasedOnStyle: LLVM\nIndentWidth: 4\nColumnLimit: 100\nAllowShortFunctionsOnASingleLine: Empty\n';
  files['README.md'] = `# ${id}\n\nA ${c ? 'C17' : 'C++20'} project. In the workbench: Alt+F9 configures, F9 builds, Ctrl+F9 runs${kind === 'library' ? ', F7 runs the tests' : ''}, Ctrl+Shift+D debugs.\n\nFrom a terminal:\n\n\`\`\`bash\ncmake -S . -B build\ncmake --build build\n${kind === 'library' ? 'ctest --test-dir build --output-on-failure\n' : ''}./build/${id}\n\`\`\`\n`;
  return files;
}

async function createProject({ dir, name, lang = 'cpp', kind = 'console', git = true }) {
  const parent = abs(dir);
  const id = ident(name);
  const root = path.join(parent, id);
  if (fs.existsSync(root) && fs.readdirSync(root).length) throw new Error(`${root} already exists and isn't empty`);
  const rust = lang === 'rust';
  const files = rust ? cargoFiles({ name, kind }).files : projectFiles({ name: id, lang: lang === 'c' ? 'c' : 'cpp', kind: kind === 'library' ? 'library' : 'console' });
  for (const [rel, text] of Object.entries(files)) {
    const f = path.join(root, rel);
    await fsp.mkdir(path.dirname(f), { recursive: true });
    await fsp.writeFile(f, text);
  }
  let gitInit = false;
  if (git) {
    gitInit = await new Promise((resolve) => execFile('git', ['init', '-q'], { cwd: root }, (err) => resolve(!err)));
  }
  const main = path.join(root, 'src', rust ? (kind === 'library' ? 'lib.rs' : 'main.rs') : `main.${lang === 'c' ? 'c' : 'cpp'}`);
  return { root, main, files: Object.keys(files), git: gitInit };
}

// ------------------------------------------------------------------ header <-> source
const HEADERS = ['.h', '.hpp', '.hh', '.hxx', '.inl'];
const SOURCES = ['.c', '.cpp', '.cc', '.cxx'];

// foo.cpp -> foo.hpp / foo.h: next to it first, then include/ and src/
// folders up to the project root, then anywhere under the root (bounded).
async function counterpart({ file }) {
  const f = abs(file);
  const ext = path.extname(f).toLowerCase();
  const base = path.basename(f, path.extname(f));
  const want = HEADERS.includes(ext) ? SOURCES : SOURCES.includes(ext) ? HEADERS : null;
  if (!want) return { file: null };
  const names = new Set(want.map((e) => base + e));
  const dir = path.dirname(f);
  for (const e of want) { const p = path.join(dir, base + e); if (fs.existsSync(p)) return { file: p }; }
  const root = require('./cmake').cmakeRoot(f) || path.dirname(dir);
  const near = [];
  for (let d = dir; d.startsWith(root); d = path.dirname(d)) {
    for (const sub of ['include', 'src', 'source', 'lib']) near.push(path.join(d, sub));
    if (d === root || path.dirname(d) === d) break;
  }
  for (const d of near) for (const e of want) { const p = path.join(d, base + e); if (fs.existsSync(p)) return { file: p }; }
  // last resort: a bounded walk of the project
  let seen = 0;
  async function walk(d, depth) {
    if (depth > 6 || seen > 5000) return null;
    let ents;
    try { ents = await fsp.readdir(d, { withFileTypes: true }); } catch (e) { return null; }
    for (const e of ents) {
      seen++;
      if (e.isFile() && names.has(e.name)) return path.join(d, e.name);
    }
    for (const e of ents) {
      if (e.isDirectory() && !e.name.startsWith('.') && !['build', 'node_modules', '_deps'].includes(e.name)) {
        const r = await walk(path.join(d, e.name), depth + 1);
        if (r) return r;
      }
    }
    return null;
  }
  return { file: await walk(root, 0) };
}

// ------------------------------------------------------------------ a test for a function
// tests/test_<func>.c(pp) with the same tiny CHECK the exercises use, and,
// in a CMake project that has enable_testing(), the lines that build and
// register it (linked with the project's first library, or the file itself).
async function testFor({ file, func, signature = '' }) {
  const f = abs(file);
  const fn = String(func || '').replace(/[^\w]/g, '');
  if (!fn) throw new Error('Put the cursor inside the function to test');
  const c = /\.(c|h)$/.test(f) && !/\.(cpp|cc|cxx|hpp)$/.test(f) ? true : false;
  const ext = c ? 'c' : 'cpp';
  const root = require('./cmake').cmakeRoot(f) || path.dirname(f);
  const dir = path.join(root, 'tests');
  const out = path.join(dir, `test_${fn}.${ext}`);
  if (fs.existsSync(out)) return { file: out, existed: true };
  // the header that goes with it: next to it, or in include/ (the same search as Alt+F12)
  const header = /\.(h|hpp|hh)$/.test(f) ? f : (await counterpart({ file: f })).file;
  const decl = header ? `#include "${path.relative(dir, header)}"` : `/* the function under test (or #include its header) */\n${signature ? signature.replace(/\s*\{?\s*$/, '') + ';' : `/* declare ${fn} here */`}`;
  const text = c ? `/* Tests for ${fn}. Each CHECK that fails says where; the program exits 1,
 * which is what CTest counts as a failure. */
#include <stdio.h>

${decl}

static int failures = 0;
#define CHECK(expr) do { if (!(expr)) { ++failures; printf("%s:%d: FAILED: CHECK( %s )\\n", __FILE__, __LINE__, #expr); } } while (0)

int main(void) {
    /* one CHECK per thing ${fn} should do: the normal case, the edges (0, empty, negative, the biggest) */
    CHECK(1 == 1);   /* TODO: CHECK(${fn}(...) == ...); */
    if (failures == 0) printf("All tests passed\\n");
    return failures ? 1 : 0;
}
` : `// Tests for ${fn}. Each CHECK that fails says where; the program exits 1,
// which is what CTest counts as a failure.
#include <iostream>

${decl}

static int failures = 0;
#define CHECK(expr) do { if (!(expr)) { ++failures; std::cout << __FILE__ << ':' << __LINE__ << ": FAILED: CHECK( " #expr " )\\n"; } } while (0)

int main() {
    // one CHECK per thing ${fn} should do: the normal case, the edges (0, empty, negative, the biggest)
    CHECK(1 == 1);   // TODO: CHECK(${fn}(...) == ...);
    if (failures == 0) std::cout << "All tests passed\\n";
    return failures ? 1 : 0;
}
`;
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(out, text);
  let cmake = null;
  const cm = path.join(root, 'CMakeLists.txt');
  if (fs.existsSync(cm)) {
    const src = fs.readFileSync(cm, 'utf8');
    const lib = (src.match(/add_library\(\s*([\w-]+)/) || [])[1];
    const name = `test_${fn}`;
    if (!new RegExp(`add_executable\\(\\s*${name}\\b`).test(src)) {
      cmake = `\n# ${name}: made by the workbench\n${/enable_testing\(\)/.test(src) ? '' : 'enable_testing()\n'}add_executable(${name} tests/${name}.${ext}${lib ? '' : ` ${path.relative(root, f)}`})\n${lib ? `target_link_libraries(${name} PRIVATE ${lib})\n` : ''}add_test(NAME ${name} COMMAND ${name})\n`;
      fs.appendFileSync(cm, cmake);
    }
  }
  return { file: out, existed: false, cmake };
}

function init(api) {
  api.register('project.testFor', testFor);
  api.register('project.create', createProject);
  api.register('project.newFile', newFile);
  api.register('project.newPair', newPair);
  api.register('files.counterpart', counterpart);
}

module.exports = { init, projectFiles, counterpart };
