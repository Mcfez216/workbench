'use strict';
// A throwaway world for the tests: a home folder with a small CMake C++
// project in git (a library, tests in Catch2's output format, examples, a
// project stub and its solution, a competitive-programming template), a
// fake copy of the vault's _code, a config file, a fake secret-tool on PATH,
// a local IMAP server, an SMTP server that catches what you send, and a
// tiny IRC server with SASL and someone in #c++-basic. Nothing touches your
// real setup, and nothing is downloaded (the real Catch2 isn't needed).

const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { execFileSync } = require('child_process');

const ADDRESS = 'josh@example.org';
const PASSWORD = 'abcd efgh ijkl mnop';

function sh(cwd, cmd, args) { return execFileSync(cmd, args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', LC_ALL: 'C' } }); }
function put(dir, files) {
  for (const [rel, text] of Object.entries(files)) {
    const f = path.join(dir, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, text);
  }
}

// A test framework that prints what Catch2 prints (FAILED lines, the
// summary), so the app's parsing is tested without downloading Catch2.
const MINI_TEST = `#pragma once
#include <cstdio>
#include <cstring>
#include <functional>
#include <vector>

namespace mini {
struct Case { const char* name; std::function<void()> fn; };
inline std::vector<Case>& cases() { static std::vector<Case> c; return c; }
inline int& failures() { static int f = 0; return f; }
inline int& assertions() { static int a = 0; return a; }
struct Reg { Reg(const char* n, std::function<void()> f) { cases().push_back({n, std::move(f)}); } };
}  // namespace mini

#define MINI_CAT2(a, b) a##b
#define MINI_CAT(a, b) MINI_CAT2(a, b)
#define TEST_CASE(name) static void MINI_CAT(t_, __LINE__)(); \\
    static mini::Reg MINI_CAT(r_, __LINE__)(name, MINI_CAT(t_, __LINE__)); \\
    static void MINI_CAT(t_, __LINE__)()
#define CHECK(expr) do { ++mini::assertions(); if (!(expr)) { ++mini::failures(); \\
    std::printf("%s:%d: FAILED:\\n  CHECK( %s )\\n\\n", __FILE__, __LINE__, #expr); } } while (0)
`;
const MINI_MAIN = `#include "mini_test.hpp"

int main(int argc, char** argv) {
    int passed = 0, failed = 0;
    for (auto& c : mini::cases()) {
        if (argc > 1 && std::strcmp(argv[1], c.name) != 0) continue;
        int before = mini::failures();
        c.fn();
        if (mini::failures() == before) ++passed; else ++failed;
    }
    if (!failed) std::printf("All tests passed (%d assertions in %d test cases)\\n", mini::assertions(), passed);
    else std::printf("test cases: %d | %d passed | %d failed\\n", passed + failed, passed, failed);
    return failed ? 1 : 0;
}
`;

const PROJECT = {
  'CMakeLists.txt': `cmake_minimum_required(VERSION 3.21)
project(Demo CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)
if (NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Debug)
endif()
add_compile_options(-Wall -Wextra)
if (CMAKE_BUILD_TYPE STREQUAL "Debug")
    add_compile_options(-fsanitize=address,undefined -g)
    add_link_options(-fsanitize=address,undefined)
endif()

include(CTest)
add_subdirectory(src)
add_subdirectory(tests)
add_subdirectory(examples)
add_subdirectory(projects)
add_subdirectory(solutions)
`,
  'src/CMakeLists.txt': 'add_library(demo STATIC mathx.cpp)\ntarget_include_directories(demo PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})\n',
  'src/mathx.hpp': '#pragma once\n\nint add(int a, int b);\nint sub(int a, int b);\nint square(int x);\n',
  'src/mathx.cpp': '#include "mathx.hpp"\n\n// the small library the tests check\nint add(int a, int b) { return a + b; }\nint sub(int a, int b) { return a - b; }\nint square(int x) { return x * x; }\n',
  'tests/mini_test.hpp': MINI_TEST,
  'tests/mini_main.cpp': MINI_MAIN,
  'tests/MathTest.cpp': '#include "mini_test.hpp"\n#include "mathx.hpp"\n\nTEST_CASE("add adds") {\n    CHECK(add(2, 3) == 5);\n}\n\nTEST_CASE("sub subtracts") {\n    CHECK(sub(5, 3) == 2);\n}\n\nTEST_CASE("square squares") {\n    CHECK(square(4) == 16);\n}\n',
  'tests/CMakeLists.txt': 'add_executable(demo_tests MathTest.cpp mini_main.cpp)\ntarget_link_libraries(demo_tests PRIVATE demo)\nforeach(t "add adds" "sub subtracts" "square squares")\n    add_test(NAME "${t}" COMMAND demo_tests "${t}")\nendforeach()\n',
  'examples/CMakeLists.txt': 'add_executable(ex01_greet 01_greet.cpp)\nadd_executable(ex02_dangling 02_dangling.cpp)\nadd_executable(ex03_square 03_square.cpp)\ntarget_link_libraries(ex03_square PRIVATE demo)\n',
  'examples/01_greet.cpp': '#include <iostream>\n#include <string>\n\nint main() {\n    std::string name;\n    std::cout << "Name? " << std::flush;\n    std::getline(std::cin, name);\n    std::cout << "Hello, " << name << "!\\n";\n    return 0;\n}\n',
  'examples/02_dangling.cpp': '#include <iostream>\n#include <vector>\n\nint main() {\n    std::vector<int> v{1, 2, 3};\n    int& first = v[0];\n    v.push_back(4);\n    std::cout << first << \'\\n\';\n    return 0;\n}\n',
  'examples/03_square.cpp': '#include <iostream>\n#include "mathx.hpp"\n\nint main() {\n    int total = 0;\n    for (int i = 1; i <= 3; ++i) {\n        total += square(i);\n    }\n    std::cout << "total " << total << \'\\n\';\n    return 0;\n}\n',
  'projects/CMakeLists.txt': 'add_executable(p01_words_stub_tests P01_words/words.cpp P01_words/test_words.cpp ${CMAKE_SOURCE_DIR}/tests/mini_main.cpp)\ntarget_include_directories(p01_words_stub_tests PRIVATE P01_words ${CMAKE_SOURCE_DIR}/tests)\n',
  'projects/P01_words/words.hpp': '#pragma once\n#include <cstddef>\n#include <string>\n\nstd::size_t countWords(const std::string& text);\n',
  'projects/P01_words/words.cpp': '#include "words.hpp"\n\nstd::size_t countWords(const std::string& text) {\n    // TODO: count the words in text\n    (void)text;\n    return 0;\n}\n',
  'projects/P01_words/test_words.cpp': '#include "mini_test.hpp"\n#include "words.hpp"\n\nTEST_CASE("words counts words") {\n    CHECK(countWords("a b c") == 3);\n}\n\nTEST_CASE("words handles empty") {\n    CHECK(countWords("") == 0);\n}\n\nTEST_CASE("words ignores extra spaces") {\n    CHECK(countWords("  a  b ") == 2);\n}\n',
  'solutions/CMakeLists.txt': 'add_executable(p01_words_solution_tests P01_words/words.cpp ${CMAKE_SOURCE_DIR}/projects/P01_words/test_words.cpp ${CMAKE_SOURCE_DIR}/tests/mini_main.cpp)\ntarget_include_directories(p01_words_solution_tests PRIVATE ${CMAKE_SOURCE_DIR}/projects/P01_words ${CMAKE_SOURCE_DIR}/tests)\nforeach(t "words counts words" "words handles empty" "words ignores extra spaces")\n    add_test(NAME "${t}" COMMAND p01_words_solution_tests "${t}")\nendforeach()\n',
  'solutions/P01_words/words.cpp': '#include "words.hpp"\n#include <sstream>\n\nstd::size_t countWords(const std::string& text) {\n    std::istringstream in(text);\n    std::string w;\n    std::size_t n = 0;\n    while (in >> w) ++n;\n    return n;\n}\n',
  'cp/template.cpp': '#include <iostream>\n#include <vector>\nusing namespace std;\n\nstatic void solve() {\n    int n;\n    cin >> n;\n    vector<long> a(n);\n    for (auto& x : a) cin >> x;\n    long sum = 0;\n    for (long x : a) sum += x;\n    cout << sum << \'\\n\';\n}\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    int testCases = 1;\n    while (testCases--) solve();\n    return 0;\n}\n',
  'lint/demo.cpp': 'struct Account {\n    Account() {}\n    int balance;\n};\n\nint main() {\n    Account a;\n    int* p = 0;\n    return a.balance + (p ? *p : 0);\n}\n',
  '.gitignore': 'build/\n',
};

function makeHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cpw-test-'));
  const proj = path.join(home, 'cpp-path');
  put(proj, PROJECT);
  sh(proj, 'git', ['init', '-q', '-b', 'main']);
  sh(proj, 'git', ['config', 'user.name', 'Josh McFerran']);
  sh(proj, 'git', ['config', 'user.email', ADDRESS]);
  sh(proj, 'git', ['add', '-A']);
  sh(proj, 'git', ['commit', '-qm', 'Start the C++ path']);

  // a patch someone mails you, made against this repository
  const lib = path.join(proj, 'src', 'mathx.cpp');
  fs.writeFileSync(lib, fs.readFileSync(lib, 'utf8').replace('// the small library the tests check\n', '// the small library the tests check (add, sub, square)\n'));
  sh(proj, 'git', ['-c', 'user.name=Alice Dev', '-c', 'user.email=alice@example.org', 'commit', '-qam', 'mathx: say what is in the library\n\nSo the comment matches the header.']);
  const patch = sh(proj, 'git', ['format-patch', '-1', '--stdout']).replace(/^From [0-9a-f]{40} .*\n/, '');
  sh(proj, 'git', ['reset', '-q', '--hard', 'HEAD~1']);

  // a fake vault _code folder, for "copy the vault's code"
  const fakeVault = path.join(home, 'FakeVault');
  put(path.join(fakeVault, '_code'), { 'CMakeLists.txt': '# vault copy\n', 'src/a.cpp': 'int a() { return 1; }\n', 'scripts/run.sh': '#!/bin/sh\necho hi\n' });
  fs.chmodSync(path.join(fakeVault, '_code', 'scripts', 'run.sh'), 0o755);

  // fake secret-tool: hands back the test password, like the GNOME keyring would
  const bin = path.join(home, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'secret-tool'), `#!/bin/sh\nif [ "$1" = lookup ]; then printf '%s' '${PASSWORD.replace(/\s/g, '')}'; exit 0; fi\ncat > /dev/null; exit 0\n`, { mode: 0o755 });
  return { home, proj, bin, patch, fakeVault };
}

function mailFixtures(patch) {
  const d = (n) => new Date(Date.UTC(2026, 9, 20 + n, 9, 0, 0)).toUTCString().replace('GMT', '+0000');
  const msg = (h, body) => Object.entries(h).map(([k, v]) => `${k}: ${v}`).join('\r\n') + '\r\n\r\n' + body.replace(/\r?\n/g, '\r\n');
  const list = 'List-Id: <cpp-study.example.org>';
  const patchMail = patch.replace(/^Subject:/m, `Message-ID: <patch-1@example.org>\nTo: cpp-study@example.org\nCc: ${ADDRESS}\n${list}\nSubject:`).replace(/\r?\n/g, '\r\n');
  return [
    { raw: msg({ From: 'C++ study group <cpp-study-owner@example.org>', To: 'cpp-study@example.org', Subject: 'Welcome to the C++ study group', Date: d(0), 'Message-ID': '<welcome@example.org>', 'List-Id': '<cpp-study.example.org>' },
      'Welcome! Read the FAQ, ask good questions, and reply inline.\n\n-- \ncpp-study mailing list'), flags: ['\\Seen'] },
    { raw: patchMail },
    { raw: msg({ From: 'Bob Reviewer <bob@example.org>', To: 'Alice Dev <alice@example.org>', Cc: `cpp-study@example.org, ${ADDRESS}`, Subject: 'Re: [PATCH] mathx: say what is in the library', Date: d(2), 'Message-ID': '<review-1@example.org>', 'In-Reply-To': '<patch-1@example.org>', References: '<patch-1@example.org>', 'List-Id': '<cpp-study.example.org>' },
      'On Wed, Alice Dev wrote:\n> So the comment matches the header.\n\nLooks right to me.\n\nReviewed-by: Bob Reviewer <bob@example.org>\n') },
    { raw: msg({ From: 'Carol <carol@example.org>', To: 'cpp-study@example.org', Subject: 'Re: Welcome to the C++ study group', Date: d(3), 'Message-ID': '<carol-1@example.org>', 'In-Reply-To': '<welcome@example.org>', References: '<welcome@example.org>', 'List-Id': '<cpp-study.example.org>' },
      '> Welcome! Read the FAQ\n\nThanks, reading it now.\n') },
  ];
}

async function freePort() {
  return new Promise((resolve) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
}

async function startMail(patch) {
  const hoodiecrow = require('hoodiecrow-imap');
  const { SMTPServer } = require('smtp-server');
  const imapPort = await freePort();
  const smtpPort = await freePort();
  const imap = hoodiecrow({
    plugins: ['IDLE', 'UIDPLUS', 'SPECIAL-USE', 'ENABLE', 'ID'],
    users: { [ADDRESS]: { password: PASSWORD.replace(/\s/g, '') } },
    storage: { INBOX: { messages: mailFixtures(patch) }, '': { separator: '/', folders: { Sent: { 'special-use': '\\Sent' } } } },
  });
  await new Promise((r) => imap.listen(imapPort, '127.0.0.1', r));
  const sent = [];
  const smtp = new SMTPServer({
    secure: false, disabledCommands: ['STARTTLS'], allowInsecureAuth: true, logger: false,
    onAuth(auth, session, cb) { cb(auth.username === ADDRESS && auth.password === PASSWORD.replace(/\s/g, '') ? null : new Error('bad login'), { user: auth.username }); },
    onData(stream, session, cb) { let raw = ''; stream.on('data', (b) => { raw += b; }); stream.on('end', () => { sent.push({ raw, rcpt: session.envelope.rcptTo.map((r) => r.address) }); cb(); }); },
  });
  await new Promise((r) => smtp.listen(smtpPort, '127.0.0.1', r));
  return { imapPort, smtpPort, sent, close: async () => { await new Promise((r) => imap.close(r)); await new Promise((r) => smtp.close(r)); } };
}

// Just enough IRC: CAP negotiation with SASL PLAIN, registration, JOIN with
// a names list, PRIVMSG both ways.
async function startIrc({ account = 'joshm', password = PASSWORD.replace(/\s/g, '') } = {}) {
  const port = await freePort();
  const said = [];
  const logins = [];
  const clients = new Set();
  const server = net.createServer((sock) => {
    clients.add(sock);
    let nick = '*', buf = '', capping = false, userSeen = false, welcomed = false;
    const send = (l) => sock.write(l + '\r\n');
    const welcome = () => {
      if (welcomed) return;
      welcomed = true;
      send(`:fake.irc 001 ${nick} :Welcome to the fake network ${nick}`);
      send(`:fake.irc 005 ${nick} CHANTYPES=# PREFIX=(ov)@+ NETWORK=Fake :are supported`);
      send(`:fake.irc 376 ${nick} :End of /MOTD command.`);
    };
    sock.on('data', (b) => {
      buf += b;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, '');
        buf = buf.slice(i + 1);
        const [cmd, ...rest] = line.split(' ');
        const arg = rest.join(' ');
        switch (cmd.toUpperCase()) {
          case 'CAP':
            if (rest[0] === 'LS') { capping = true; send(':fake.irc CAP * LS :sasl'); }
            else if (rest[0] === 'REQ') send(`:fake.irc CAP * ACK ${rest.slice(1).join(' ')}`);
            else if (rest[0] === 'END') { capping = false; if (userSeen) welcome(); }
            break;
          case 'AUTHENTICATE':
            if (rest[0] === 'PLAIN') send('AUTHENTICATE +');
            else {
              const [, user, pass] = Buffer.from(rest[0], 'base64').toString('utf8').split('\0');
              if (user === account && pass === password) { logins.push(user); send(`:fake.irc 900 ${nick} ${nick}!u@localhost ${user} :You are now logged in as ${user}`); send(`:fake.irc 903 ${nick} :SASL authentication successful`); }
              else send(`:fake.irc 904 ${nick} :SASL authentication failed`);
            }
            break;
          case 'NICK': nick = rest[0]; break;
          case 'USER': userSeen = true; if (!capping) welcome(); break;
          case 'PING': send(`:fake.irc PONG fake.irc :${rest[0].replace(/^:/, '')}`); break;
          case 'JOIN': {
            const ch = rest[0];
            send(`:${nick}!u@localhost JOIN ${ch}`);
            send(`:fake.irc 332 ${nick} ${ch} :C++ for learners: ask good questions, paste code to a paste site`);
            send(`:fake.irc 353 ${nick} = ${ch} :${nick} @alice bob`);
            send(`:fake.irc 366 ${nick} ${ch} :End of /NAMES list.`);
            setTimeout(() => send(`:alice!a@localhost PRIVMSG ${ch} :hi ${nick}, welcome to ${ch}`), 200);
            break;
          }
          case 'PRIVMSG': said.push(arg); break;
          case 'QUIT': sock.end(); break;
          default: break;
        }
      }
    });
    sock.on('close', () => clients.delete(sock));
    sock.on('error', () => {});
  });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  return { port, said, logins, close: () => new Promise((r) => { for (const c of clients) c.destroy(); server.close(r); }) };
}

function writeConfig(home, { imapPort, smtpPort, ircPort, vault }) {
  const dir = path.join(home, '.config', 'cpp-path-workbench');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({
    workspace: path.join(home, 'cpp-path'), vault, keymap: 'standard',
    build: { jobs: 4 },
    irc: { host: '127.0.0.1', port: ircPort, tls: false, nick: 'joshm', login: 'sasl', account: 'joshm', certFile: '', channels: ['#c++-basic'] },
    mail: { name: 'Josh McFerran', address: ADDRESS, imapHost: '127.0.0.1', imapPort, imapSecure: false, smtpHost: '127.0.0.1', smtpPort, smtpSecure: false },
  }, null, 2));
}

// The real CPP-Path vault, for the guide and flashcard tests
function findVault() {
  const candidates = [process.env.CPW_VAULT, path.join(__dirname, '..', '..', 'cpp-upload', 'CPP-Path'), path.join(os.homedir(), 'CPP-Path')].filter(Boolean);
  return candidates.find((p) => fs.existsSync(path.join(p, 'CPP Start Here.md'))) || null;
}

module.exports = { makeHome, startMail, startIrc, writeConfig, findVault, ADDRESS, PASSWORD };
