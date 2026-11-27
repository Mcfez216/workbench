'use strict';
// More kinds of new project, on top of the plain program (project.js):
//
//   cli    a command-line tool: options (-n, -u, --help, --version), files or
//          standard input, errors on standard error with exit codes. No
//          libraries needed, in C, C++ and Rust.
//   game   a window with something moving in it: raylib for C and C++ (CMake
//          downloads and builds it), macroquad for Rust (Cargo does).
//   web    a small web server: cpp-httplib for C++, only the standard
//          library for Rust.
//   bench  timing two ways of doing the same job, built optimised (a
//          benchmark in a Debug build with sanitizers measures nothing).
//
// Each gets the project.js files for its language first, then these replace
// main and add what they need.

const { RECIPES, block } = require('./libraries');

const KINDS = {
  cli: { label: 'Command-line tool', langs: ['c', 'cpp', 'rust'] },
  game: { label: 'Game window', langs: ['c', 'cpp', 'rust'] },
  web: { label: 'Web server', langs: ['cpp', 'rust'] },
  bench: { label: 'Benchmarks', langs: ['c', 'cpp', 'rust'] },
};

// ------------------------------------------------------------------ cli
const CLI_C = (id) => String.raw`/* ${id}: a command-line tool. Prints files (or standard input), with
   options. A starting point: change what it does to each line.

     ${id} [-n] [-u] [FILE...]
       -n   number the lines
       -u   capitals
       -h   help;  --version  the version

   Errors go to standard error, with exit code 1 (a file that can't be
   read) or 2 (a wrong option), like the tools you already use. */
#include <ctype.h>
#include <stdio.h>
#include <string.h>

static int number_lines = 0, upper = 0;

static void usage(FILE *to)
{
    fprintf(to, "usage: ${id} [-n] [-u] [FILE...]\n"
                "  -n  number the lines\n"
                "  -u  capitals\n");
}

static void process(FILE *in)
{
    char line[4096];
    long n = 0;
    while (fgets(line, sizeof line, in)) {
        if (upper)
            for (char *p = line; *p; p++)
                *p = (char)toupper((unsigned char)*p);
        if (number_lines)
            printf("%6ld  ", ++n);
        fputs(line, stdout);
    }
}

int main(int argc, char **argv)
{
    int i = 1;
    for (; i < argc && argv[i][0] == '-' && argv[i][1]; i++) {
        if (strcmp(argv[i], "--help") == 0) { usage(stdout); return 0; }
        if (strcmp(argv[i], "--version") == 0) { puts("${id} 0.1.0"); return 0; }
        for (const char *p = argv[i] + 1; *p; p++) {
            if (*p == 'n') number_lines = 1;
            else if (*p == 'u') upper = 1;
            else if (*p == 'h') { usage(stdout); return 0; }
            else { fprintf(stderr, "${id}: unknown option -%c\n", *p); usage(stderr); return 2; }
        }
    }
    if (i == argc) {
        process(stdin);
        return 0;
    }
    int status = 0;
    for (; i < argc; i++) {
        FILE *f = fopen(argv[i], "r");
        if (!f) { fprintf(stderr, "${id}: %s: can't open it\n", argv[i]); status = 1; continue; }
        process(f);
        fclose(f);
    }
    return status;
}
`;
const CLI_CPP = (id) => String.raw`// ${id}: a command-line tool. Prints files (or standard input), with
// options. A starting point: change what it does to each line.
//
//   ${id} [-n] [-u] [FILE...]
//     -n   number the lines
//     -u   capitals
//     -h   help;  --version  the version
//
// Errors go to standard error, with exit code 1 (a file that can't be read)
// or 2 (a wrong option), like the tools you already use.
#include <algorithm>
#include <cctype>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <string>
#include <vector>

struct Options {
    bool numberLines = false;
    bool upper = false;
    std::vector<std::string> files;
};

void usage(std::ostream& to)
{
    to << "usage: ${id} [-n] [-u] [FILE...]\n  -n  number the lines\n  -u  capitals\n";
}

void process(std::istream& in, const Options& o)
{
    std::string line;
    long n = 0;
    while (std::getline(in, line)) {
        if (o.upper) std::transform(line.begin(), line.end(), line.begin(), [](unsigned char c) { return static_cast<char>(std::toupper(c)); });
        if (o.numberLines) std::cout << std::setw(6) << ++n << "  ";
        std::cout << line << '\n';
    }
}

int main(int argc, char** argv)
{
    Options o;
    std::vector<std::string> args(argv + 1, argv + argc);
    std::size_t i = 0;
    for (; i < args.size() && args[i].size() > 1 && args[i][0] == '-'; ++i) {
        if (args[i] == "--help") { usage(std::cout); return 0; }
        if (args[i] == "--version") { std::cout << "${id} 0.1.0\n"; return 0; }
        for (char c : args[i].substr(1)) {
            if (c == 'n') o.numberLines = true;
            else if (c == 'u') o.upper = true;
            else if (c == 'h') { usage(std::cout); return 0; }
            else { std::cerr << "${id}: unknown option -" << c << '\n'; usage(std::cerr); return 2; }
        }
    }
    o.files.assign(args.begin() + static_cast<long>(i), args.end());
    if (o.files.empty()) { process(std::cin, o); return 0; }
    int status = 0;
    for (const auto& name : o.files) {
        std::ifstream in(name);
        if (!in) { std::cerr << "${id}: " << name << ": can't open it\n"; status = 1; continue; }
        process(in, o);
    }
    return status;
}
`;
const CLI_RS = (id) => String.raw`//! ${id}: a command-line tool. Prints files (or standard input), with
//! options. A starting point: change what it does to each line.
//!
//!   ${id} [-n] [-u] [FILE...]
//!     -n   number the lines
//!     -u   capitals
//!     -h   help;  --version  the version
//!
//! Errors go to standard error, with exit code 1 (a file that can't be read)
//! or 2 (a wrong option). No libraries: when you want more, the clap crate
//! (Tools → Add a library) writes the option parsing for you.
use std::io::{self, BufRead, Write};
use std::process::ExitCode;

#[derive(Default)]
struct Options {
    number_lines: bool,
    upper: bool,
    files: Vec<String>,
}

const USAGE: &str = "usage: ${id} [-n] [-u] [FILE...]\n  -n  number the lines\n  -u  capitals";

enum Parsed {
    Run(Options),
    Exit(u8),
}

fn parse(args: &[String]) -> Parsed {
    let mut o = Options::default();
    let mut i = 0;
    while i < args.len() && args[i].len() > 1 && args[i].starts_with('-') {
        match args[i].as_str() {
            "--help" => {
                println!("{USAGE}");
                return Parsed::Exit(0);
            }
            "--version" => {
                println!("${id} 0.1.0");
                return Parsed::Exit(0);
            }
            flags => {
                for c in flags.chars().skip(1) {
                    match c {
                        'n' => o.number_lines = true,
                        'u' => o.upper = true,
                        'h' => {
                            println!("{USAGE}");
                            return Parsed::Exit(0);
                        }
                        _ => {
                            eprintln!("${id}: unknown option -{c}\n{USAGE}");
                            return Parsed::Exit(2);
                        }
                    }
                }
            }
        }
        i += 1;
    }
    o.files = args[i..].to_vec();
    Parsed::Run(o)
}

fn process(input: impl BufRead, o: &Options, out: &mut impl Write) -> io::Result<()> {
    for (n, line) in input.lines().enumerate() {
        let line = line?;
        let line = if o.upper { line.to_uppercase() } else { line };
        if o.number_lines {
            write!(out, "{:6}  ", n + 1)?;
        }
        writeln!(out, "{line}")?;
    }
    Ok(())
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let o = match parse(&args) {
        Parsed::Run(o) => o,
        Parsed::Exit(code) => return ExitCode::from(code),
    };
    let stdout = io::stdout();
    let mut out = io::BufWriter::new(stdout.lock());
    if o.files.is_empty() {
        let _ = process(io::stdin().lock(), &o, &mut out);
        return ExitCode::SUCCESS;
    }
    let mut status = 0;
    for name in &o.files {
        match std::fs::File::open(name) {
            Ok(f) => {
                let _ = process(io::BufReader::new(f), &o, &mut out);
            }
            Err(e) => {
                eprintln!("${id}: {name}: can't open it ({e})");
                status = 1;
            }
        }
    }
    ExitCode::from(status)
}
`;

// ------------------------------------------------------------------ game
const GAME_C = (id) => String.raw`/* ${id}: a game window with raylib. Catch the falling squares with the
   paddle: left and right arrows (or A and D). Esc or the window's close
   button quits. CMake downloads and builds raylib the first time. */
#include <stdio.h>
#include "raylib.h"

#define W 800
#define H 450

int main(void)
{
    InitWindow(W, H, "${id}");
    SetTargetFPS(60);
    float paddle = W / 2.0f;
    Vector2 drop = {(float)GetRandomValue(20, W - 20), 0};
    float speed = 3.0f;
    int score = 0, missed = 0;
    while (!WindowShouldClose()) {
        if (IsKeyDown(KEY_LEFT) || IsKeyDown(KEY_A)) paddle -= 7;
        if (IsKeyDown(KEY_RIGHT) || IsKeyDown(KEY_D)) paddle += 7;
        if (paddle < 50) paddle = 50;
        if (paddle > W - 50) paddle = W - 50;
        drop.y += speed;
        if (drop.y > H - 40 && drop.y < H - 20 && drop.x > paddle - 60 && drop.x < paddle + 60) {
            score++;
            speed += 0.3f;
            drop = (Vector2){(float)GetRandomValue(20, W - 20), 0};
        } else if (drop.y > H) {
            missed++;
            drop = (Vector2){(float)GetRandomValue(20, W - 20), 0};
        }
        BeginDrawing();
        ClearBackground(RAYWHITE);
        DrawRectangle((int)paddle - 50, H - 30, 100, 12, DARKBLUE);
        DrawRectangle((int)drop.x - 10, (int)drop.y - 10, 20, 20, MAROON);
        char text[64];
        snprintf(text, sizeof text, "Caught %d   Missed %d", score, missed);
        DrawText(text, 20, 20, 24, DARKGRAY);
        EndDrawing();
    }
    CloseWindow();
    return 0;
}
`;
const GAME_CPP = (id) => String.raw`// ${id}: a game window with raylib. Catch the falling squares with the
// paddle: left and right arrows (or A and D). Esc or the window's close
// button quits. CMake downloads and builds raylib the first time.
#include <string>
#include <vector>
#include "raylib.h"

constexpr int W = 800, H = 450;

struct Drop {
    float x, y, speed;
};

int main()
{
    InitWindow(W, H, "${id}");
    SetTargetFPS(60);
    float paddle = W / 2.0f;
    std::vector<Drop> drops;
    int score = 0, missed = 0, frames = 0;
    while (!WindowShouldClose()) {
        if (IsKeyDown(KEY_LEFT) || IsKeyDown(KEY_A)) paddle -= 7;
        if (IsKeyDown(KEY_RIGHT) || IsKeyDown(KEY_D)) paddle += 7;
        paddle = paddle < 50 ? 50 : paddle > W - 50 ? W - 50 : paddle;
        if (++frames % 60 == 0) drops.push_back({static_cast<float>(GetRandomValue(20, W - 20)), 0, 2.0f + score * 0.2f});
        for (auto& d : drops) d.y += d.speed;
        // caught or missed: count it, then remove it (erase-remove)
        std::erase_if(drops, [&](const Drop& d) {
            if (d.y > H - 40 && d.y < H - 20 && d.x > paddle - 60 && d.x < paddle + 60) { ++score; return true; }
            if (d.y > H) { ++missed; return true; }
            return false;
        });
        BeginDrawing();
        ClearBackground(RAYWHITE);
        DrawRectangle(static_cast<int>(paddle) - 50, H - 30, 100, 12, DARKBLUE);
        for (const auto& d : drops) DrawRectangle(static_cast<int>(d.x) - 10, static_cast<int>(d.y) - 10, 20, 20, MAROON);
        DrawText(("Caught " + std::to_string(score) + "   Missed " + std::to_string(missed)).c_str(), 20, 20, 24, DARKGRAY);
        EndDrawing();
    }
    CloseWindow();
}
`;
const GAME_RS = (id) => String.raw`//! ${id}: a game window with macroquad. Catch the falling squares with the
//! paddle: left and right arrows (or A and D). Esc quits. Cargo downloads
//! and builds macroquad the first time (that needs the internet).
use macroquad::prelude::*;

struct Drop {
    x: f32,
    y: f32,
    speed: f32,
}

#[macroquad::main("${id}")]
async fn main() {
    let mut paddle = screen_width() / 2.0;
    let mut drops: Vec<Drop> = Vec::new();
    let (mut score, mut missed, mut timer) = (0, 0, 0.0);
    loop {
        if is_key_pressed(KeyCode::Escape) {
            break;
        }
        let (w, h) = (screen_width(), screen_height());
        if is_key_down(KeyCode::Left) || is_key_down(KeyCode::A) {
            paddle -= 420.0 * get_frame_time();
        }
        if is_key_down(KeyCode::Right) || is_key_down(KeyCode::D) {
            paddle += 420.0 * get_frame_time();
        }
        paddle = paddle.clamp(50.0, w - 50.0);
        timer += get_frame_time();
        if timer > 1.0 {
            timer = 0.0;
            drops.push(Drop { x: rand::gen_range(20.0, w - 20.0), y: 0.0, speed: 120.0 + score as f32 * 12.0 });
        }
        for d in &mut drops {
            d.y += d.speed * get_frame_time();
        }
        drops.retain(|d| {
            if d.y > h - 40.0 && d.y < h - 20.0 && (d.x - paddle).abs() < 60.0 {
                score += 1;
                false
            } else if d.y > h {
                missed += 1;
                false
            } else {
                true
            }
        });
        clear_background(WHITE);
        draw_rectangle(paddle - 50.0, h - 30.0, 100.0, 12.0, DARKBLUE);
        for d in &drops {
            draw_rectangle(d.x - 10.0, d.y - 10.0, 20.0, 20.0, MAROON);
        }
        draw_text(&format!("Caught {score}   Missed {missed}"), 20.0, 40.0, 30.0, DARKGRAY);
        next_frame().await;
    }
}
`;

// ------------------------------------------------------------------ web
const WEB_CPP = (id) => String.raw`// ${id}: a small web server with cpp-httplib. Run it (Ctrl+F9) and open
// http://localhost:8080 in a browser. Ctrl+C in the terminal stops it.
// CMake downloads cpp-httplib (one header) the first time.
#include <atomic>
#include <iostream>
#include <string>
#include <httplib.h>

int main()
{
    httplib::Server svr;
    std::atomic<int> visits{0};

    svr.Get("/", [&](const httplib::Request&, httplib::Response& res) {
        int n = ++visits;
        res.set_content("<h1>Hello from C++</h1><p>Visit number " + std::to_string(n) +
                        ".</p><p>Try <a href=\"/hello/Ada\">/hello/Ada</a> or <a href=\"/api/time\">/api/time</a>.</p>",
                        "text/html");
    });
    // a part of the path as a value: /hello/<name>
    svr.Get(R"(/hello/(\w+))", [](const httplib::Request& req, httplib::Response& res) {
        res.set_content("Hello, " + req.matches[1].str() + "!\n", "text/plain");
    });
    svr.Get("/api/time", [](const httplib::Request&, httplib::Response& res) {
        res.set_content("{\"seconds\": " + std::to_string(std::time(nullptr)) + "}\n", "application/json");
    });

    std::cout << "Listening on http://localhost:8080 (Ctrl+C stops it)\n";
    if (!svr.listen("127.0.0.1", 8080)) {   // this computer only: not the whole network
        std::cerr << "${id}: couldn't listen on port 8080 (is something else using it?)\n";
        return 1;
    }
}
`;
const WEB_RS = (id) => String.raw`//! ${id}: a small web server with nothing but the standard library. Run it
//! (Ctrl+F9) and open http://localhost:8080 in a browser. Ctrl+C stops it.
//! Each connection gets its own thread. (For a real one, the axum crate.)
use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::thread;

fn respond(mut stream: TcpStream, visits: &AtomicUsize) -> std::io::Result<()> {
    let mut first = String::new();
    BufReader::new(&stream).read_line(&mut first)?;
    // "GET /path HTTP/1.1"
    let path = first.split_whitespace().nth(1).unwrap_or("/");
    let (status, kind, body) = match path {
        "/" => {
            let n = visits.fetch_add(1, Ordering::Relaxed) + 1;
            ("200 OK", "text/html", format!("<h1>Hello from Rust</h1><p>Visit number {n}.</p><p>Try <a href=\"/hello/Ada\">/hello/Ada</a>.</p>"))
        }
        p if p.starts_with("/hello/") => {
            let name: String = p["/hello/".len()..].chars().filter(|c| c.is_alphanumeric()).take(40).collect();
            ("200 OK", "text/plain", format!("Hello, {name}!\n"))
        }
        _ => ("404 Not Found", "text/plain", "Nothing here.\n".to_string()),
    };
    write!(stream, "HTTP/1.1 {status}\r\nContent-Type: {kind}; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len())
}

fn main() -> std::io::Result<()> {
    let listener = TcpListener::bind("127.0.0.1:8080")?;
    println!("Listening on http://localhost:8080 (Ctrl+C stops it)");
    let visits = Arc::new(AtomicUsize::new(0));
    for stream in listener.incoming() {
        let stream = stream?;
        let visits = Arc::clone(&visits);
        thread::spawn(move || {
            if let Err(e) = respond(stream, &visits) {
                eprintln!("${id}: {e}");
            }
        });
    }
    Ok(())
}
`;

// ------------------------------------------------------------------ bench
const BENCH_C = (id) => String.raw`/* ${id}: benchmarks. Times two ways of doing the same job, several runs
   each, and prints the fastest. Built optimised (Release): timing a Debug
   build with the sanitizers on measures the sanitizers.

   The job here: add up an array, by index and by pointer, and find a
   number in it, one by one and by binary search. Put your own in. */
#include <stdio.h>
#include <stdlib.h>
#include <time.h>

static double now(void)
{
    struct timespec t;
    timespec_get(&t, TIME_UTC);
    return (double)t.tv_sec + (double)t.tv_nsec / 1e9;
}

/* the best of several runs: the least disturbed by everything else */
#define BENCH(label, runs, expr)                                          \
    do {                                                                  \
        double best = 1e9;                                                \
        volatile long sink = 0; /* stops the compiler skipping the work */ \
        for (int r_ = 0; r_ < (runs); r_++) {                             \
            double t0 = now();                                            \
            sink += (expr);                                               \
            double dt = now() - t0;                                       \
            if (dt < best) best = dt;                                     \
        }                                                                 \
        printf("%-28s %10.3f ms\n", label, best * 1e3);                   \
        (void)sink;                                                       \
    } while (0)

static long sum_index(const int *a, size_t n) { long s = 0; for (size_t i = 0; i < n; i++) s += a[i]; return s; }
static long sum_pointer(const int *a, size_t n) { long s = 0; for (const int *p = a, *e = a + n; p < e; p++) s += *p; return s; }
static long find_linear(const int *a, size_t n, int x) { for (size_t i = 0; i < n; i++) if (a[i] == x) return (long)i; return -1; }
static long find_binary(const int *a, size_t n, int x)
{
    size_t lo = 0, hi = n;
    while (lo < hi) { size_t mid = lo + (hi - lo) / 2; if (a[mid] < x) lo = mid + 1; else hi = mid; }
    return lo < n && a[lo] == x ? (long)lo : -1;
}

int main(void)
{
    size_t n = 10 * 1000 * 1000;
    int *a = malloc(n * sizeof *a);
    if (!a) return 1;
    for (size_t i = 0; i < n; i++) a[i] = (int)(2 * i); /* sorted, so binary search works */
    BENCH("sum by index", 10, sum_index(a, n));
    BENCH("sum by pointer", 10, sum_pointer(a, n));
    BENCH("find, one by one", 10, find_linear(a, n, (int)(2 * (n - 1))));
    BENCH("find, binary search", 10, find_binary(a, n, (int)(2 * (n - 1))));
    free(a);
    return 0;
}
`;
const BENCH_CPP = (id) => String.raw`// ${id}: benchmarks. Times two ways of doing the same job, several runs
// each, and prints the fastest. Built optimised (Release): timing a Debug
// build with the sanitizers on measures the sanitizers.
//
// The jobs here: std::vector against std::list for adding up, and
// std::map against std::unordered_map for lookups. Put your own in.
#include <chrono>
#include <cstdio>
#include <list>
#include <map>
#include <numeric>
#include <unordered_map>
#include <vector>

// the best of several runs: the least disturbed by everything else
template <class F>
void bench(const char* label, int runs, F job)
{
    using clock = std::chrono::steady_clock;
    double best = 1e9;
    volatile long long sink = 0;   // stops the compiler skipping the work
    for (int r = 0; r < runs; ++r) {
        auto t0 = clock::now();
        sink = sink + job();
        double dt = std::chrono::duration<double, std::milli>(clock::now() - t0).count();
        if (dt < best) best = dt;
    }
    std::printf("%-30s %10.3f ms\n", label, best);
}

int main()
{
    const int n = 2'000'000;
    std::vector<int> v(n);
    std::iota(v.begin(), v.end(), 0);
    std::list<int> l(v.begin(), v.end());
    bench("sum a vector", 10, [&] { return std::accumulate(v.begin(), v.end(), 0LL); });
    bench("sum a list", 10, [&] { return std::accumulate(l.begin(), l.end(), 0LL); });

    std::map<int, int> m;
    std::unordered_map<int, int> um;
    for (int i = 0; i < 200'000; ++i) { m[i] = i; um[i] = i; }
    bench("200k lookups, std::map", 10, [&] { long long s = 0; for (int i = 0; i < 200'000; ++i) s += m.find(i)->second; return s; });
    bench("200k lookups, unordered_map", 10, [&] { long long s = 0; for (int i = 0; i < 200'000; ++i) s += um.find(i)->second; return s; });
}
`;
const BENCH_RS = (id) => String.raw`//! ${id}: benchmarks. Times two ways of doing the same job, several runs
//! each, and prints the fastest. Run it optimised: cargo run --release
//! (a debug build checks every index and overflow, and measures that).
//!
//! The jobs here: a Vec against a LinkedList for adding up, and a
//! BTreeMap against a HashMap for lookups. Put your own in.
use std::collections::{BTreeMap, HashMap, LinkedList};
use std::hint::black_box;
use std::time::Instant;

/// The best of several runs: the least disturbed by everything else.
/// black_box stops the compiler working the answer out ahead of time.
fn bench(label: &str, runs: u32, mut job: impl FnMut() -> u64) {
    let mut best = f64::MAX;
    for _ in 0..runs {
        let t0 = Instant::now();
        black_box(job());
        best = best.min(t0.elapsed().as_secs_f64() * 1e3);
    }
    println!("{label:<30} {best:>10.3} ms");
}

fn main() {
    if cfg!(debug_assertions) {
        println!("(a debug build: use cargo run --release for real numbers)\n");
    }
    let n = 2_000_000u64;
    let v: Vec<u64> = (0..n).collect();
    let l: LinkedList<u64> = v.iter().copied().collect();
    bench("sum a Vec", 10, || black_box(&v).iter().sum());
    bench("sum a LinkedList", 10, || black_box(&l).iter().sum());

    let bt: BTreeMap<u64, u64> = (0..200_000).map(|i| (i, i)).collect();
    let hm: HashMap<u64, u64> = (0..200_000).map(|i| (i, i)).collect();
    bench("200k lookups, BTreeMap", 10, || (0..200_000).map(|i| bt[&black_box(i)]).sum());
    bench("200k lookups, HashMap", 10, || (0..200_000).map(|i| hm[&black_box(i)]).sum());
}
`;

// Debug builds with ASan don't suit these: the GPU driver's memory confuses
// LeakSanitizer (game), and timing measures the sanitizers (bench)
function withoutSanitizers(cmake, why) {
  return cmake.replace(/# Warnings on everywhere; AddressSanitizer and UBSan in Debug builds\n([\s\S]*?)\nendif\(\)\n/, (all, body) => {
    const warn = body.split('\n')[0];
    return `# Warnings on everywhere. No sanitizers here: ${why}\n${warn}\n`;
  });
}

// Changes the files project.js made for a plain program into this kind
function apply(files, { id, lang, kind }) {
  const k = KINDS[kind];
  if (!k) return files;
  if (!k.langs.includes(lang)) throw new Error(`${k.label}: ${k.langs.map((l) => ({ c: 'C', cpp: 'C++', rust: 'Rust' }[l])).join(' or ')} only`);
  const ext = { c: 'c', cpp: 'cpp', rust: 'rs' }[lang];
  const main = `src/main.${ext}`;
  const T = { cli: [CLI_C, CLI_CPP, CLI_RS], game: [GAME_C, GAME_CPP, GAME_RS], web: [null, WEB_CPP, WEB_RS], bench: [BENCH_C, BENCH_CPP, BENCH_RS] }[kind];
  files[main] = T[['c', 'cpp', 'rust'].indexOf(lang)](id);
  const readme = (extra) => { files['README.md'] = `${files['README.md'].trimEnd()}\n\n## ${k.label}\n\n${extra}\n`; };
  if (lang === 'rust') {
    if (kind === 'game') files['Cargo.toml'] = files['Cargo.toml'].replace('[dependencies]\n', '[dependencies]\nmacroquad = "0.4"\n');
    if (kind === 'bench') files['Cargo.toml'] += '\n# benchmarks: optimised, with the symbols kept for profilers\n[profile.release]\ndebug = true\n';
    readme({ cli: 'Try it: `cargo run -- -n src/main.rs`, or `echo hi | cargo run -- -u`.', game: 'Ctrl+F9 runs it (the first build downloads macroquad). On Linux it needs: `sudo apt install libgl1-mesa-dev libasound2-dev libx11-dev libxi-dev`.', web: 'Ctrl+F9 runs it; open http://localhost:8080.', bench: '`cargo run --release` for real numbers.' }[kind]);
    return files;
  }
  let cm = files['CMakeLists.txt'];
  if (kind === 'game') {
    cm = withoutSanitizers(cm, 'the graphics driver\'s memory confuses LeakSanitizer.');
    cm = cm.replace(/add_compile_options\(([^)]*)\)/, (all, flags) => `add_compile_options(${flags.replace(/ -Wconversion| -Wpedantic| -Wstrict-prototypes/g, '')})`);
    cm += block(RECIPES.find((r) => r.id === 'raylib'), id);
    readme(`Ctrl+F9 runs it: the first build downloads and builds raylib (a minute; it needs the internet). ${RECIPES.find((r) => r.id === 'raylib').needs}`);
  } else if (kind === 'web') {
    cm += block(RECIPES.find((r) => r.id === 'httplib'), id);
    readme('Ctrl+F9 runs it (the first build downloads cpp-httplib); open http://localhost:8080.');
  } else if (kind === 'bench') {
    cm = withoutSanitizers(cm, 'a benchmark would measure them.').replace('set(CMAKE_BUILD_TYPE Debug)', 'set(CMAKE_BUILD_TYPE Release)   # benchmarks are only meaningful optimised');
    readme('Ctrl+F9 builds it optimised (Release) and runs it.');
  } else if (kind === 'cli') {
    readme(`Try it in the terminal: \`./build/${id} -n src/main.${ext}\`, or \`echo hi | ./build/${id} -u\`.`);
  }
  files['CMakeLists.txt'] = cm;
  return files;
}

module.exports = { KINDS, apply };
