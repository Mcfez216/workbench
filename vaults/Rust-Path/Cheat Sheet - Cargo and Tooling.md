---
tags: [rust, cheatsheet, tooling]
---
# Cheat Sheet - Cargo and Tooling

> [!abstract] Why this matters
> These are the commands behind MHDE's keys. They're useful in a terminal, on another computer, or when you want to know what F9 really does.

## Cargo

| Task | Command | MHDE key |
|---|---|---|
| Make a new project | `cargo new name` | File → New project → Rust |
| Build | `cargo build` | F9 |
| Build and run | `cargo run` | Ctrl+F9 |
| Run the tests | `cargo test` | F7 |
| Check quickly, without building | `cargo check` | |
| Build for speed | `cargo build --release` | |
| Ask clippy for advice | `cargo clippy` | Ctrl+Shift+K |
| Tidy the code | `cargo fmt` | Ctrl+Shift+O |
| Make the documentation | `cargo doc --open` | |
| Add a library | `cargo add rand` | |

## rustup

| Task | Command |
|---|---|
| Update Rust | `rustup update` |
| Add the editor helper | `rustup component add rust-analyzer` |
| Add clippy and rustfmt | `rustup component add clippy rustfmt` |
| See what's installed | `rustup show` |

## Debugging

| Task | Command |
|---|---|
| Start the debugger | `rust-gdb target/debug/name`. In MHDE, Ctrl+Shift+D. |
| See a value while the program runs | `dbg!(x)` prints the line, the expression and the value |
| See where a panic came from | run with `RUST_BACKTRACE=1` |
| Explain an error code | `rustc --explain E0382` |
