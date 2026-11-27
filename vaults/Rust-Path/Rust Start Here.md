---
tags: [rust, hub]
---
# Rust Start Here

> [!abstract] Why this matters
> Rust is a language for the same jobs as C and C++: fast programs, operating systems, browsers and tools. The difference is that Rust checks your use of memory while it compiles. Whole kinds of bugs, like using freed memory, can't get into a Rust program by accident. Learning Rust also makes you better at C and C++, because it makes the rules visible.

> [!holocron] How this vault works
> Every note has the same parts, in the same order, so you always know where to look.
> 1. **Why this matters** is at the top.
> 2. Then the idea, in short sections.
> 3. Then some code. In MHDE, set the switch to **Rust** and click **Try in sandbox** to run it.
> 4. **Try it** gives you something to do, in numbered steps.
> 5. **The dark side** shows one common mistake.
> 6. **Check yourself** has questions. Click one to see the answer. They also become flashcards in Revise (Ctrl+Shift+V).
> 7. A link to the next note.
>
> A note takes 5 to 15 minutes. You don't have to finish a phase in one go.

## Your path

| Phase | What you'll be able to do | Rank |
|---|---|---|
| [[0.1 Installing Rust with rustup\|Phase 0: Setup]] | Install Rust, and build and run programs in MHDE | Recruit |
| [[1.01 Why Rust\|Phase 1: First Programs]] | Use variables, types, functions, loops, input and output | Recruit |
| [[2.01 Ownership and Moves\|Phase 2: Ownership]] | Understand ownership and borrowing, Rust's big idea | Pilot |
| [[3.01 Structs and Methods\|Phase 3: Types]] | Build your own types with structs, enums and traits | Pilot |
| [[4.01 Vec\|Phase 4: Collections and Tools]] | Use collections, iterators, modules, tests and clippy | Commander |
| [[5.01 Recursion and Speed\|Phase 5: Algorithms]] | Solve problems quickly, and use the judge | Commander |
| [[6.01 Threads\|Phase 6: Systems and Security]] | Use threads safely, call C, and know what Rust protects | General |
| [[Projects/Start Here\|Projects]] | Build real programs, R01 to R05, with tests | |

Each phase ends with a short check called a gate: [[Rust Phase Gates]].

## If you already know C or C++

You can move faster through Phase 1. Slow down for Phase 2. Ownership is where Rust is most different, and where most of the "fighting the compiler" happens. [[2.06 Ownership Compared with C and C++]] puts the three languages side by side.

## Your first hour

1. Read [[0.1 Installing Rust with rustup]], and check Rust is installed.
2. Read [[0.2 Rust in MHDE]], and set the toolbar switch to **Rust**.
3. Read [[0.3 Cargo Basics]], and make your first Cargo project.
4. Read [[1.01 Why Rust]].
5. Open Learn → **First functions in Rust**. It's your first Rust exercise.

## A daily habit

15 to 45 minutes a day is plenty.

1. **Start** with Learn → Where was I?
2. **Focus** with Ctrl+Shift+G. Pick one thing and start the timer.
3. **Do** one note, or one step of an exercise.
4. **Finish** by writing one line in [[Rust Done Log]].

> [!tip] Stuck?
> Rust's error messages are long, but they're helpful. Read them from the top. Click the **?** next to an error for a plain-words explanation. For any error with a code like E0382, the **rustc --explain** button shows the compiler's own explanation, with examples.

## Reference

- [[Rust Code Index]] lists every example.
- [[Rust Best Practices Checklist]] lists good habits.
- Quick look-ups: [[Cheat Sheet - Rust Basics]], [[Cheat Sheet - Ownership and Borrowing]] and [[Cheat Sheet - Cargo and Tooling]].

"Never tell me the odds." Han Solo. The borrow checker will tell you anyway.
