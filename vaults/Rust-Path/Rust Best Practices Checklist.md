---
tags: [rust, hub, checklist]
---
# Rust Best Practices Checklist

> [!abstract] Why this matters
> The compiler already stops many mistakes. These habits cover the rest. Go through this list before you call something finished.

## Every file

- [ ] It builds with no warnings.
- [ ] clippy (Ctrl+Shift+K) has nothing to say.
- [ ] It's tidied with rustfmt (Ctrl+Shift+O).

## Ownership

- [ ] Functions that only read take a borrow: `&str`, `&[T]` or `&T`.
- [ ] You clone only when you really need two copies, not just to quiet the borrow checker.
- [ ] No reference is kept longer than it needs to be.

## Errors

- [ ] Functions that can fail return `Result`, and the caller handles it.
- [ ] `unwrap()` and `expect()` only appear where failure really is impossible, or in tests.
- [ ] Errors from outside the program, like files and user input, are handled, not unwrapped.
- [ ] Integer maths on outside values uses `checked_`, `saturating_` or `wrapping_` on purpose.

## Types

- [ ] An `enum` is used for "one of these", instead of a string or a number.
- [ ] `Option` is used for "maybe", never a special value like -1.
- [ ] Structs derive the traits they need, like `Debug`, `Clone` and `PartialEq`.

## unsafe

- [ ] There's no `unsafe` unless it's needed.
- [ ] Every `unsafe` block has a `// SAFETY:` comment that says why it's correct.

## Before you commit

- [ ] `cargo test` passes (F7), including the edge cases: empty, one item, the biggest value, and bad input.
- [ ] You've made a checkpoint, or a commit that says why you made the change.
