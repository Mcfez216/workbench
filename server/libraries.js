'use strict';
// "Add a library": most real programs stall at "how do I use a library?".
//
//   Rust: crates from crates.io, with `cargo add` (a search box, and a short
//         list of the ones everybody uses, in plain words).
//   C and C++: a few well-known libraries, each a pinned version that CMake
//         downloads and builds itself (FetchContent): no package manager to
//         install. The block goes at the end of CMakeLists.txt, marked, with
//         the line that links it to your program, and a small example.
//
// The first build after adding one needs the internet (CMake or Cargo
// downloads it); after that it's cached.

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

let api;

// git tag (and the commit it pointed at when this was written)
const RECIPES = [
  { id: 'fmt', name: 'fmt', langs: ['cpp'], version: '12.2.1', commit: '208219daff58f2a7438f6931cc2ddc358acf33ef',
    about: 'Text formatting: fmt::print("{} is {}\\n", name, age). What std::format and std::print grew from, on every compiler.',
    repo: 'https://github.com/fmtlib/fmt.git', link: 'fmt::fmt',
    example: '#include <fmt/core.h>\n\nint main()\n{\n    fmt::print("{} is {} years old\\n", "Ada", 36);\n}\n' },
  { id: 'cli11', name: 'CLI11', langs: ['cpp'], version: 'v2.7.2', commit: 'cbd58a3696887b34c70949aef21a71735a0c2ad5',
    about: 'Command-line arguments: options, flags, --help written for you.',
    repo: 'https://github.com/CLIUtils/CLI11.git', link: 'CLI11::CLI11',
    example: '#include <CLI/CLI.hpp>\n#include <iostream>\n\nint main(int argc, char** argv)\n{\n    CLI::App app{"A tool of mine"};\n    int count = 1;\n    bool loud = false;\n    app.add_option("-n,--count", count, "How many times");\n    app.add_flag("-l,--loud", loud, "Shout");\n    CLI11_PARSE(app, argc, argv);\n    for (int i = 0; i < count; ++i) std::cout << (loud ? "HELLO\\n" : "hello\\n");\n}\n' },
  { id: 'json', name: 'nlohmann/json', langs: ['cpp'], version: 'v3.12.0',
    about: 'JSON that feels like a built-in type: auto j = json::parse(text); j["name"].get<std::string>().',
    url: 'https://github.com/nlohmann/json/releases/download/v3.12.0/json.tar.xz', hash: '42f6e95cad6ec532fd372391373363b62a14af6d771056dbfc86160e6dfff7aa', link: 'nlohmann_json::nlohmann_json',
    example: '#include <nlohmann/json.hpp>\n#include <iostream>\n\nint main()\n{\n    auto j = nlohmann::json::parse(R"({"name": "Ada", "langs": ["C", "Rust"]})");\n    std::cout << j["name"].get<std::string>() << " knows " << j["langs"].size() << " languages\\n";\n    j["age"] = 36;\n    std::cout << j.dump(2) << \'\\n\';\n}\n' },
  { id: 'spdlog', name: 'spdlog', langs: ['cpp'], version: 'v1.17.0', commit: '79524ddd08a4ec981b7fea76afd08ee05f83755d',
    about: 'Logging with levels and timestamps: spdlog::info("started"), spdlog::warn("{} retries", n).',
    repo: 'https://github.com/gabime/spdlog.git', link: 'spdlog::spdlog',
    example: '#include <spdlog/spdlog.h>\n\nint main()\n{\n    spdlog::info("starting up");\n    spdlog::warn("{} retries left", 3);\n    spdlog::set_level(spdlog::level::debug);\n    spdlog::debug("now you see debug messages");\n}\n' },
  { id: 'httplib', name: 'cpp-httplib', langs: ['cpp'], version: 'v0.67.0', commit: '7800c3dc5b33285cbb18baa5998de4ff7ef63515',
    about: 'A web server (or client) in one header: svr.Get("/", ...) and svr.listen("127.0.0.1", 8080).',
    repo: 'https://github.com/yhirose/cpp-httplib.git', link: 'httplib::httplib',
    example: '#include <httplib.h>\n#include <iostream>\n\nint main()\n{\n    httplib::Server svr;\n    svr.Get("/", [](const httplib::Request&, httplib::Response& res) {\n        res.set_content("Hello from C++!\\n", "text/plain");\n    });\n    std::cout << "Open http://localhost:8080 (Ctrl+C stops it)\\n";\n    svr.listen("localhost", 8080);\n}\n' },
  { id: 'doctest', name: 'doctest', langs: ['cpp'], version: 'v2.5.3', commit: '2d0a9359a60c51affe2a9bebb1be1dca47868151',
    about: 'Tests in one light header: TEST_CASE("adds") { CHECK(add(2, 2) == 4); }.',
    repo: 'https://github.com/doctest/doctest.git', link: 'doctest::doctest',
    example: '#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN\n#include <doctest/doctest.h>\n\nint add(int a, int b) { return a + b; }\n\nTEST_CASE("add adds")\n{\n    CHECK(add(2, 2) == 4);\n    CHECK(add(-1, 1) == 0);\n}\n' },
  { id: 'catch2', name: 'Catch2', langs: ['cpp'], version: 'v3.16.1', commit: '08092139210881f01a34e60c5f2fd6afa0ea4024',
    about: 'The test framework the CPP-Path vault uses: TEST_CASE, REQUIRE, sections, and a main written for you.',
    repo: 'https://github.com/catchorg/Catch2.git', link: 'Catch2::Catch2WithMain',
    example: '#include <catch2/catch_test_macros.hpp>\n\nint add(int a, int b) { return a + b; }\n\nTEST_CASE("add adds")\n{\n    REQUIRE(add(2, 2) == 4);\n}\n' },
  { id: 'raylib', name: 'raylib', langs: ['c', 'cpp'], version: '6.2', commit: '02566453880e06bec97f5b8160fa6fe1e98397ca',
    about: 'Games and graphics, simply: a window, shapes, text, images, sound and input in a few calls. Written in C, easy from C++.',
    repo: 'https://github.com/raysan5/raylib.git', link: 'raylib', options: 'set(BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)\nset(BUILD_GAMES OFF CACHE BOOL "" FORCE)',
    needs: 'On Ubuntu it needs: sudo apt install libgl1-mesa-dev libx11-dev libxrandr-dev libxinerama-dev libxcursor-dev libxi-dev libasound2-dev (WSL shows the window through WSLg).',
    example: '#include "raylib.h"\n\nint main(void)\n{\n    InitWindow(800, 450, "My game");\n    SetTargetFPS(60);\n    float x = 400;\n    while (!WindowShouldClose()) {\n        if (IsKeyDown(KEY_RIGHT)) x += 4;\n        if (IsKeyDown(KEY_LEFT)) x -= 4;\n        BeginDrawing();\n        ClearBackground(RAYWHITE);\n        DrawText("Arrow keys move the ball", 20, 20, 20, DARKGRAY);\n        DrawCircle((int)x, 225, 30, MAROON);\n        EndDrawing();\n    }\n    CloseWindow();\n    return 0;\n}\n' },
  { id: 'cjson', name: 'cJSON', langs: ['c'], version: 'v1.7.19', commit: 'c859b25da02955fef659d658b8f324b5cde87be3',
    about: 'JSON in plain C: cJSON_Parse, cJSON_GetObjectItem, cJSON_Print, and cJSON_Delete to free it all.',
    repo: 'https://github.com/DaveGamble/cJSON.git', link: 'cjson', include: '${cjson_SOURCE_DIR}',
    options: 'set(ENABLE_CJSON_TEST OFF CACHE BOOL "" FORCE)\nset(ENABLE_CJSON_UNINSTALL OFF CACHE BOOL "" FORCE)\nset(BUILD_SHARED_AND_STATIC_LIBS OFF CACHE BOOL "" FORCE)\nset(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)',
    example: '#include <stdio.h>\n#include "cJSON.h"\n\nint main(void)\n{\n    cJSON *root = cJSON_Parse("{\\"name\\": \\"Ada\\", \\"age\\": 36}");\n    if (!root) return 1;\n    const cJSON *name = cJSON_GetObjectItemCaseSensitive(root, "name");\n    if (cJSON_IsString(name)) printf("name: %s\\n", name->valuestring);\n    cJSON_Delete(root);   /* one call frees the whole tree */\n    return 0;\n}\n' },
];

// The crates everybody uses, in plain words (the search box finds the rest)
const CRATES = [
  ['clap', 'Command-line arguments with --help, from a struct: #[derive(Parser)].', 'clap --features derive'],
  ['serde', 'Turn your structs into JSON, TOML... and back: #[derive(Serialize, Deserialize)]. Add serde_json with it.', 'serde --features derive'],
  ['serde_json', 'JSON: serde_json::from_str and to_string_pretty (with serde).', 'serde_json'],
  ['anyhow', 'Easy errors for programs: fn main() -> anyhow::Result<()>, and ? on anything.', 'anyhow'],
  ['thiserror', 'Your own error types with #[derive(Error)], for libraries.', 'thiserror'],
  ['rand', 'Random numbers: rand::random::<u8>(), rng.random_range(1..=6).', 'rand'],
  ['regex', 'Regular expressions, guaranteed fast (no catastrophic backtracking).', 'regex'],
  ['itertools', 'More iterator tools: sorted(), unique(), join(", "), tuple_windows().', 'itertools'],
  ['rayon', 'Make a loop parallel by changing iter() to par_iter().', 'rayon'],
  ['chrono', 'Dates and times: today, durations, formatting.', 'chrono'],
  ['crossterm', 'Terminal control: colours, cursor, raw keyboard input (for terminal games).', 'crossterm'],
  ['macroquad', 'Simple 2D games: a window, shapes, textures, input, with an async main loop.', 'macroquad'],
];

function run(cmd, args, cwd) {
  return new Promise((resolve) => execFile(cmd, args, { cwd, maxBuffer: 8 * 1024 * 1024, timeout: 120000 }, (err, out, errOut) => resolve({ code: err ? err.code || 1 : 0, out: String(out), err: String(errOut) })));
}

function list({ lang }) {
  if (lang === 'rust') return { kind: 'crates', crates: CRATES.map(([name, about, add]) => ({ name, about, add })) };
  return { kind: 'cmake', recipes: RECIPES.filter((r) => r.langs.includes(lang === 'c' ? 'c' : 'cpp')).map(({ id, name, version, about, needs, example }) => ({ id, name, version, about, needs, example })) };
}

// The block for CMakeLists.txt
function block(r, target) {
  const declare = r.url
    ? `FetchContent_Declare(${r.id} URL ${r.url}\n    URL_HASH SHA256=${r.hash} DOWNLOAD_EXTRACT_TIMESTAMP TRUE)`
    : `FetchContent_Declare(${r.id} GIT_REPOSITORY ${r.repo}\n    GIT_TAG ${r.version} GIT_SHALLOW TRUE)   # ${r.version} is commit ${r.commit.slice(0, 12)}`;
  return [
    '',
    `# --- ${r.name} ${r.version} (added by MHDE): ${r.about.replace(/\n/g, ' ')}`,
    '# CMake downloads and builds it the first time you build (that needs the internet).',
    'include(FetchContent)',
    ...(r.options ? [r.options] : []),
    declare,
    `FetchContent_MakeAvailable(${r.id})`,
    `target_link_libraries(${target} PRIVATE ${r.link})`,
    ...(r.include ? [`target_include_directories(${target} PRIVATE ${r.include})`] : []),
    `# --- end of ${r.name}`,
    '',
  ].join('\n');
}

// The program targets a CMakeLists.txt makes (add_executable / add_library)
function targetsIn(text) {
  const out = [];
  for (const m of text.matchAll(/^\s*add_(executable|library)\s*\(\s*([A-Za-z0-9_.+-]+)/gm)) out.push({ name: m[2], kind: m[1] });
  return out;
}

function addCmake({ root, id, target }) {
  const r = RECIPES.find((x) => x.id === id);
  if (!r) throw new Error(`No library ${id}`);
  const file = path.join(root, 'CMakeLists.txt');
  const text = fs.readFileSync(file, 'utf8');
  const targets = targetsIn(text).filter((t) => t.kind === 'executable').concat(targetsIn(text).filter((t) => t.kind === 'library'));
  if (text.includes(`# --- ${r.name} `)) return { already: true, file, example: r.example };
  if (!target) {
    if (targets.length === 1) target = targets[0].name;
    else return { needTarget: true, choices: targets.map((t) => t.name) };
  }
  fs.writeFileSync(file, text.replace(/\n*$/, '\n') + block(r, target));
  if (api) api.broadcast('cmake.changed', { root });
  return { ok: true, file, target, name: r.name, example: r.example, needs: r.needs || null };
}

async function searchCrates({ q }) {
  const query = String(q || '').trim();
  if (!/^[A-Za-z0-9_ -]{1,64}$/.test(query)) return { crates: [] };
  const r = await run('cargo', ['search', query, '--limit', '15', '--color=never'], process.cwd());
  if (r.code !== 0) throw new Error(`cargo search didn't work: ${(r.err || r.out).trim().split('\n').pop()}`);
  const crates = [];
  for (const line of r.out.split('\n')) {
    const m = line.match(/^([A-Za-z0-9_-]+) = "([^"]+)"\s*(?:#\s*(.*))?$/);
    if (m) crates.push({ name: m[1], version: m[2], about: (m[3] || '').trim(), add: m[1] });
  }
  return { crates };
}

async function addCrate({ root, add }) {
  const words = String(add || '').trim().split(/\s+/);
  if (!words.length || !words.every((w) => /^(--features|[A-Za-z0-9_][A-Za-z0-9_-]*(@[\w.^~=<>*-]+)?)$/.test(w))) throw new Error('That isn\'t a crate name');
  const r = await require('./build').execStream({ cmd: 'cargo', args: ['add', ...words, '--color=never'], cwd: root, title: `cargo add ${words.join(' ')}`, source: 'cargo' });
  if (api) api.broadcast('cmake.changed', { root });
  return { ok: r.code === 0, code: r.code, problems: r.problems, output: (r.output || '').slice(-3000) };
}

function init(a) {
  api = a;
  a.register('libs.list', list);
  a.register('libs.addCmake', addCmake);
  a.register('libs.searchCrates', searchCrates);
  a.register('libs.addCrate', addCrate);
}

module.exports = { init, RECIPES, CRATES, block, addCmake, targetsIn };
