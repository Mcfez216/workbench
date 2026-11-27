---
phase: 4
tags: [rust, project]
time: 1-2 hours
---
# R01 Word Frequency

> [!abstract] Why this matters
> Counting words is a small job that uses the everyday tools together: `&str` and `String`, iterators, `HashMap` and sorting. Most real programs are this shape: read text in, work something out, print it neatly.

## What you'll build

A library with four functions. Given some text:

| Function | Gives back |
|---|---|
| `words(text)` | the words, lowercased, in order: `"The cat, the hat"` → `["the", "cat", "the", "hat"]` |
| `count(text)` | how many times each word appears, as a `HashMap<String, usize>` |
| `top(text, n)` | the `n` most common words, most common first; ties in alphabetical order |
| `report(text, n)` | `top` as lined-up text: `"the 2\ncat 1\n"` |

A word is letters, digits, and apostrophes inside a word (`don't`). Everything else (spaces, commas, brackets) separates words.

## How to start

1. In MHDE: File → **Copy the vault's code to my workspace...**, pick **Rust-Path**. It goes to `~/rust-path` (you can choose another folder).
2. Open the **Tests** sidebar. Under *Projects*, click **R01 Word Frequency**: your `src/lib.rs` opens.
3. Press **▶** next to it. Every test fails: that's the start. The badge shows `0/10`.
4. Open `tests/r01_word_frequency.rs`. Work through the tests from the top. Put the cursor in one and press **Shift+F7** to run only that one.

Code: `_code/projects/r01_word_frequency/`

## Hints

> [!tip]- Hint 1: splitting
> `text.split(|c: char| !(c.is_alphanumeric() || c == '\''))` splits on anything that isn't part of a word. It gives empty pieces where two separators touch: `.filter(|w| !w.is_empty())` drops them. See [[1.07 String and str]].

> [!tip]- Hint 2: apostrophes at the edges
> `'quote'` should be `quote`. `w.trim_matches('\'')` takes apostrophes off both ends, and leaves the one in `don't`.

> [!tip]- Hint 3: counting
> `*counts.entry(word).or_insert(0) += 1;` adds one, starting from zero the first time. See [[4.02 HashMap and HashSet]].

> [!tip]- Hint 4: sorting by two things
> Turn the map into a `Vec<(String, usize)>`, then `sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)))`: biggest count first, then A to Z. A `HashMap` has no order of its own, so without the second rule the answer would change from run to run.

> [!tip]- Hint 5: lining up
> `format!("{w:<width$} {c}")` pads `w` with spaces to `width` characters. Count the width with `.chars().count()`, not `.len()`: `.len()` counts bytes, and `é` is two of them.

> [!boss] Boss fight
> `boss_empty_and_unicode_input`: empty text, text with no words at all, and words like `café` and `naïve`. Your `report` must line them up by characters, not bytes.

> [!sith] The dark side
> `.len()` on a `&str` is bytes, not letters. ASCII text hides the difference; the first `é` shows it. When you mean "how many characters", say `.chars().count()`.

## Check yourself

> [!question]- Why does top() need a second sorting rule for ties?
> Because a HashMap gives its entries back in no fixed order. Sorting by count alone leaves equal counts in whatever order the map produced, which can differ between runs, so the tests (and your users) would see different answers.

> [!question]- Why does R01 take &str parameters rather than String?
> The functions only read the text. Taking &str lets callers pass a String, a literal or a slice of either without giving up ownership or copying.

Done? Write a line in [[Rust Done Log]]. Next: [[R02 To-do List]]
