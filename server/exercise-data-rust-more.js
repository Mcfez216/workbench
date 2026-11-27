'use strict';
// Twelve more Rust exercises, after the first eight (exercise-data-rust.js):
// strings, iterators, closures, lifetimes, generics, HashMap, errors with ?,
// modules, fixing borrow-checker errors, pattern matching, smart pointers
// and threads. Same harness: each step's test is a #[test] body.

module.exports = [
  {
    id: 'rs-strings', lang: 'rust', kind: 'functions', track: 'Rust', topic: 'String and &str', file: 'strings.rs',
    title: 'Strings, properly',
    intro: 'A `String` owns its text and can grow; a `&str` borrows text from somewhere else. Rust strings are UTF-8, so a letter can be more than one byte: `.len()` counts bytes, `.chars()` gives letters.',
    starter: String.raw`fn count_words(s: &str) -> usize {
    todo!() // step 1
}

fn title_case(s: &str) -> String {
    todo!() // step 2
}

fn is_palindrome(s: &str) -> bool {
    todo!() // step 3
}
`,
    steps: [
      { title: 'count_words', brief: 'How many words are in `s`? Words are separated by any amount of whitespace.', hints: ['`s.split_whitespace()` gives the words, with no empty ones.', '`.count()` counts what an iterator gives.'],
        test: String.raw`assert_eq!(count_words("the cat sat"), 3, "count_words(\"the cat sat\")");
assert_eq!(count_words("  lots   of\tspace \n"), 3, "count_words with extra whitespace");
assert_eq!(count_words(""), 0, "count_words(\"\")");` },
      { title: 'title_case', brief: 'Give back a new `String` with each word\'s first letter a capital and the rest small, words joined by one space. `"hELLO wORLD"` becomes `"Hello World"`.', hints: ['For each word: `let mut c = w.chars();` then `c.next()` is the first letter (an Option).', '`first.to_uppercase().collect::<String>() + &c.as_str().to_lowercase()`, then `.collect::<Vec<_>>().join(" ")`.'],
        test: String.raw`assert_eq!(title_case("hELLO wORLD"), "Hello World", "title_case(\"hELLO wORLD\")");
assert_eq!(title_case("  rust   is fun "), "Rust Is Fun", "title_case with extra spaces");
assert_eq!(title_case("élan"), "Élan", "title_case(\"élan\")");
assert_eq!(title_case(""), "", "title_case(\"\")");` },
      { title: 'is_palindrome', brief: 'Does `s` read the same backwards, counting only letters and digits and ignoring case? `"A man, a plan, a canal: Panama"` does. Work on characters, not bytes: `"été"` is a palindrome.', hints: ['Keep the letters: `s.chars().filter(|c| c.is_alphanumeric()).flat_map(|c| c.to_lowercase()).collect::<Vec<char>>()`.', 'Then compare it with itself reversed: `v.iter().eq(v.iter().rev())`.'],
        test: String.raw`assert!(is_palindrome("A man, a plan, a canal: Panama"), "is_palindrome(\"A man, a plan, a canal: Panama\")");
assert!(is_palindrome("été"), "is_palindrome(\"été\")");
assert!(!is_palindrome("rust"), "is_palindrome(\"rust\") should be false");
assert!(is_palindrome(""), "is_palindrome(\"\")");` },
    ],
    solution: String.raw`fn count_words(s: &str) -> usize {
    s.split_whitespace().count()
}

fn title_case(s: &str) -> String {
    s.split_whitespace()
        .map(|w| {
            let mut c = w.chars();
            match c.next() {
                Some(first) => first.to_uppercase().collect::<String>() + &c.as_str().to_lowercase(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn is_palindrome(s: &str) -> bool {
    let v: Vec<char> = s.chars().filter(|c| c.is_alphanumeric()).flat_map(|c| c.to_lowercase()).collect();
    v.iter().eq(v.iter().rev())
}
`,
  },
  {
    id: 'rs-iterators', lang: 'rust', kind: 'functions', track: 'Rust', topic: 'Iterators', file: 'iters.rs',
    title: 'Iterator chains',
    intro: 'An iterator gives values one at a time. Methods like `filter`, `map`, `zip` and `sum` chain together into one pass over the data, with no index to get wrong. Try each step without a `for` loop.',
    starter: String.raw`fn sum_of_even_squares(v: &[i64]) -> i64 {
    todo!() // step 1
}

fn running_totals(v: &[i32]) -> Vec<i32> {
    todo!() // step 2
}

fn dot(a: &[f64], b: &[f64]) -> f64 {
    todo!() // step 3
}
`,
    steps: [
      { title: 'sum_of_even_squares', brief: 'Square each even number in `v` and add them up.', hints: ['`v.iter().filter(|&&x| x % 2 == 0)`: `&&x` because filter gets a reference to the reference the iterator gives.', '`.map(|&x| x * x).sum()`'],
        test: String.raw`assert_eq!(sum_of_even_squares(&[1, 2, 3, 4]), 20, "sum_of_even_squares(&[1, 2, 3, 4])");
assert_eq!(sum_of_even_squares(&[-2, 5]), 4, "sum_of_even_squares(&[-2, 5])");
assert_eq!(sum_of_even_squares(&[]), 0, "sum_of_even_squares(&[])");` },
      { title: 'running_totals', brief: 'Each place in the result is the total so far: `[1, 2, 3]` gives `[1, 3, 6]`.', hints: ['`scan` keeps a value between steps: `v.iter().scan(0, |total, &x| { *total += x; Some(*total) }).collect()`'],
        test: String.raw`assert_eq!(running_totals(&[1, 2, 3]), vec![1, 3, 6], "running_totals(&[1, 2, 3])");
assert_eq!(running_totals(&[5, -5, 5]), vec![5, 0, 5], "running_totals(&[5, -5, 5])");
assert_eq!(running_totals(&[]), Vec::<i32>::new(), "running_totals(&[])");` },
      { title: 'dot', brief: 'The dot product: multiply the pairs `a[0]*b[0]`, `a[1]*b[1]`... and add them up. If the lengths differ, use only the pairs both have.', hints: ['`a.iter().zip(b)` pairs them up, and stops at the shorter one.', '`.map(|(x, y)| x * y).sum()`'],
        test: String.raw`assert_eq!(dot(&[1.0, 2.0, 3.0], &[4.0, 5.0, 6.0]), 32.0, "dot([1, 2, 3], [4, 5, 6])");
assert_eq!(dot(&[1.0, 2.0], &[3.0]), 3.0, "dot with different lengths");
assert_eq!(dot(&[], &[]), 0.0, "dot([], [])");` },
    ],
    solution: String.raw`fn sum_of_even_squares(v: &[i64]) -> i64 {
    v.iter().filter(|&&x| x % 2 == 0).map(|&x| x * x).sum()
}

fn running_totals(v: &[i32]) -> Vec<i32> {
    v.iter().scan(0, |total, &x| { *total += x; Some(*total) }).collect()
}

fn dot(a: &[f64], b: &[f64]) -> f64 {
    a.iter().zip(b).map(|(x, y)| x * y).sum()
}
`,
  },
  {
    id: 'rs-closures', lang: 'rust', kind: 'functions', track: 'Rust', topic: 'Closures', file: 'closures.rs',
    title: 'Closures',
    intro: 'A closure is a function without a name that can use the variables around it: `|x| x + n`. A function can take one as a parameter (`impl Fn(i32) -> i32`) and give one back.',
    starter: String.raw`fn apply_n(f: impl Fn(i32) -> i32, n: usize, x: i32) -> i32 {
    todo!() // step 1
}

fn make_adder(n: i32) -> impl Fn(i32) -> i32 {
    // (todo!() on its own isn't a closure, so it sits inside one for now)
    move |x| todo!("step 2: {n} {x}")
}

fn count_calls(mut f: impl FnMut()) {
    todo!() // step 3: call f three times
}
`,
    steps: [
      { title: 'apply_n', brief: 'Call `f` on `x`, `n` times over: `apply_n(double, 3, 1)` is `double(double(double(1)))`, which is 8.', hints: ['`let mut v = x; for _ in 0..n { v = f(v); } v`'],
        test: String.raw`assert_eq!(apply_n(|x| x * 2, 3, 1), 8, "apply_n(|x| x * 2, 3, 1)");
assert_eq!(apply_n(|x| x + 10, 0, 5), 5, "apply_n(.., 0, 5): no calls at all");
assert_eq!(apply_n(|x| x - 1, 5, 0), -5, "apply_n(|x| x - 1, 5, 0)");` },
      { title: 'make_adder', brief: 'Give back a closure that adds `n` to whatever it gets. The closure has to keep `n` after `make_adder` returns, so it takes it with `move`.', hints: ['`move |x| x + n`'],
        test: String.raw`let add5 = make_adder(5);
assert_eq!(add5(1), 6, "make_adder(5)(1)");
assert_eq!(add5(-5), 0, "make_adder(5)(-5)");
assert_eq!(make_adder(-1)(0), -1, "make_adder(-1)(0)");` },
      { title: 'count_calls', brief: 'Call `f` three times. `f` is `FnMut`: it may change things it captured, like a counter, so calling it needs `mut f`.', hints: ['`for _ in 0..3 { f(); }`'],
        test: String.raw`let mut n = 0;
count_calls(|| n += 1);
assert_eq!(n, 3, "a counter after count_calls");
let mut log = Vec::new();
count_calls(|| log.push("hi"));
assert_eq!(log, vec!["hi", "hi", "hi"], "a log after count_calls");` },
    ],
    solution: String.raw`fn apply_n(f: impl Fn(i32) -> i32, n: usize, x: i32) -> i32 {
    let mut v = x;
    for _ in 0..n {
        v = f(v);
    }
    v
}

fn make_adder(n: i32) -> impl Fn(i32) -> i32 {
    move |x| x + n
}

fn count_calls(mut f: impl FnMut()) {
    for _ in 0..3 {
        f();
    }
}
`,
  },
  {
    id: 'rs-lifetimes', lang: 'rust', kind: 'functions', track: 'Rust', topic: 'Lifetimes', file: 'lifetimes.rs',
    title: 'Lifetimes: borrowing that lasts',
    intro: 'A lifetime like `\'a` names how long a borrow lasts. When a function gives back a `&str` that points into its input, the lifetime says so, and the compiler makes sure the input lives long enough. A struct can hold a borrow too.',
    starter: String.raw`fn first_word<'a>(s: &'a str) -> &'a str {
    todo!() // step 1
}

fn longest_line<'a>(text: &'a str) -> &'a str {
    todo!() // step 2
}

struct Tokens<'a> {
    rest: &'a str,
}

impl<'a> Tokens<'a> {
    fn new(s: &'a str) -> Self {
        Tokens { rest: s }
    }

    fn next_token(&mut self) -> Option<&'a str> {
        todo!() // step 3
    }
}
`,
    steps: [
      { title: 'first_word', brief: 'Give back the first word of `s` (up to the first space), as a slice of `s` itself: no copying. No space: the whole of `s`.', hints: ['`s.split(\' \').next().unwrap_or("")`, or find the space with `s.find(\' \')` and slice `&s[..i]`.'],
        test: String.raw`assert_eq!(first_word("hello world"), "hello", "first_word(\"hello world\")");
assert_eq!(first_word("single"), "single", "first_word(\"single\")");
assert_eq!(first_word(""), "", "first_word(\"\")");
let owned = String::from("borrowed from a String");
let w = first_word(&owned);
assert_eq!(w, "borrowed", "first_word of a String");` },
      { title: 'longest_line', brief: 'The longest line of `text`, as a slice of it. Ties: the first one. Empty text: `""`.', hints: ['`text.lines().max_by_key(|l| l.len())` gives the last of the longest; use a loop or `fold` to keep the first.'],
        test: String.raw`assert_eq!(longest_line("a\nbbb\ncc"), "bbb", "longest_line(\"a\\nbbb\\ncc\")");
assert_eq!(longest_line("xx\nyy"), "xx", "ties: the first");
assert_eq!(longest_line(""), "", "longest_line(\"\")");` },
      { title: 'next_token', brief: '`Tokens` walks through a string, giving back one word at a time, skipping spaces, and `None` at the end. Each token is a slice of the original string: it lives as long as `\'a`, not just as long as `&mut self`.', hints: ['Trim the spaces from the front: `self.rest = self.rest.trim_start();`. Empty now? `None`.', 'Find where the word ends (`find(\' \')` or the end), take `&self.rest[..end]`, and move `self.rest` past it.'],
        test: String.raw`let mut t = Tokens::new("  let x =  42 ");
let mut got = Vec::new();
while let Some(tok) = t.next_token() {
    got.push(tok);
}
assert_eq!(got, vec!["let", "x", "=", "42"], "the tokens of \"  let x =  42 \"");
assert_eq!(Tokens::new("").next_token(), None, "no tokens in \"\"");` },
    ],
    solution: String.raw`fn first_word<'a>(s: &'a str) -> &'a str {
    match s.find(' ') {
        Some(i) => &s[..i],
        None => s,
    }
}

fn longest_line<'a>(text: &'a str) -> &'a str {
    text.lines().fold("", |best, l| if l.len() > best.len() { l } else { best })
}

struct Tokens<'a> {
    rest: &'a str,
}

impl<'a> Tokens<'a> {
    fn new(s: &'a str) -> Self {
        Tokens { rest: s }
    }

    fn next_token(&mut self) -> Option<&'a str> {
        self.rest = self.rest.trim_start();
        if self.rest.is_empty() {
            return None;
        }
        let end = self.rest.find(' ').unwrap_or(self.rest.len());
        let tok = &self.rest[..end];
        self.rest = &self.rest[end..];
        Some(tok)
    }
}
`,
  },
  {
    id: 'rs-generics', lang: 'rust', kind: 'functions', track: 'Rust', topic: 'Generics', file: 'generics.rs',
    title: 'Generics: one function, many types',
    intro: 'A generic function or struct works for any type `T` that has what it needs. The bounds say what that is: `T: PartialOrd` can be compared, `T: Clone` can be copied. You write it once; the compiler makes a version for each type you use.',
    starter: String.raw`fn largest<T: PartialOrd + Copy>(v: &[T]) -> Option<T> {
    todo!() // step 1
}

struct Stack<T> {
    items: Vec<T>,
}

impl<T> Stack<T> {
    fn new() -> Self {
        Stack { items: Vec::new() }
    }
    fn push(&mut self, x: T) {
        todo!() // step 2
    }
    fn pop(&mut self) -> Option<T> {
        todo!() // step 2
    }
    fn peek(&self) -> Option<&T> {
        todo!() // step 2
    }
    fn len(&self) -> usize {
        self.items.len()
    }
}

fn swap_pair<A, B>(p: (A, B)) -> (B, A) {
    todo!() // step 3
}
`,
    steps: [
      { title: 'largest', brief: 'The biggest item in `v`, or `None` if it\'s empty. It works for numbers, chars, anything `PartialOrd + Copy`.', hints: ['Start with the first: `let mut best = *v.first()?;` (the `?` gives back None when there is no first).', 'Then loop over the rest and keep the bigger.'],
        test: String.raw`assert_eq!(largest(&[3, 9, 2]), Some(9), "largest(&[3, 9, 2])");
assert_eq!(largest(&['a', 'z', 'm']), Some('z'), "largest of chars");
assert_eq!(largest(&[1.5, -2.0]), Some(1.5), "largest of floats");
assert_eq!(largest::<i32>(&[]), None, "largest(&[])");` },
      { title: 'Stack<T>', brief: 'Fill in `push`, `pop` (the last pushed comes out first) and `peek` (look at the top without taking it). It works for any `T`.', hints: ['A `Vec` is already a stack: `self.items.push(x)`, `self.items.pop()`, `self.items.last()`.'],
        test: String.raw`let mut s = Stack::new();
s.push(1);
s.push(2);
assert_eq!(s.peek(), Some(&2), "peek after pushing 1, 2");
assert_eq!(s.pop(), Some(2), "the first pop");
assert_eq!(s.pop(), Some(1), "the second pop");
assert_eq!(s.pop(), None, "pop on an empty stack");
let mut words: Stack<String> = Stack::new();
words.push("hi".to_string());
assert_eq!(words.len(), 1, "a Stack<String>");` },
      { title: 'swap_pair', brief: 'Swap the two halves of a pair. The halves can be different types: `(1, "one")` becomes `("one", 1)`.', hints: ['Take the pair apart in the parameter: `let (a, b) = p; (b, a)`.'],
        test: String.raw`assert_eq!(swap_pair((1, "one")), ("one", 1), "swap_pair((1, \"one\"))");
assert_eq!(swap_pair((String::from("x"), 'y')), ('y', String::from("x")), "swap_pair of a String and a char");` },
    ],
    solution: String.raw`fn largest<T: PartialOrd + Copy>(v: &[T]) -> Option<T> {
    let mut best = *v.first()?;
    for &x in &v[1..] {
        if x > best {
            best = x;
        }
    }
    Some(best)
}

struct Stack<T> {
    items: Vec<T>,
}

impl<T> Stack<T> {
    fn new() -> Self {
        Stack { items: Vec::new() }
    }
    fn push(&mut self, x: T) {
        self.items.push(x);
    }
    fn pop(&mut self) -> Option<T> {
        self.items.pop()
    }
    fn peek(&self) -> Option<&T> {
        self.items.last()
    }
    fn len(&self) -> usize {
        self.items.len()
    }
}

fn swap_pair<A, B>(p: (A, B)) -> (B, A) {
    let (a, b) = p;
    (b, a)
}
`,
  },
  {
    id: 'rs-hashmap', lang: 'rust', kind: 'functions', track: 'Rust', topic: 'HashMap', file: 'maps.rs',
    title: 'HashMap and BTreeMap',
    intro: 'A map stores values by key. `HashMap` is fast and has no order; `BTreeMap` keeps its keys sorted. The `entry` API adds a key the first time and updates it after, in one go.',
    starter: String.raw`use std::collections::{BTreeMap, HashMap};

fn letter_counts(s: &str) -> HashMap<char, usize> {
    todo!() // step 1
}

fn group_by_len(words: &[&str]) -> BTreeMap<usize, Vec<String>> {
    todo!() // step 2
}

fn two_sum(v: &[i32], target: i32) -> Option<(usize, usize)> {
    todo!() // step 3
}
`,
    steps: [
      { title: 'letter_counts', brief: 'How many times each letter appears in `s`, ignoring case; only letters count.', hints: ['For each char that `is_alphabetic()`, take its lowercase (`c.to_lowercase().next().unwrap()` for one char).', '`*counts.entry(c).or_insert(0) += 1;`'],
        test: String.raw`let m = letter_counts("Hello, World");
assert_eq!(m.get(&'l'), Some(&3), "letter_counts(\"Hello, World\")['l']");
assert_eq!(m.get(&'h'), Some(&1), "'H' counts as 'h'");
assert_eq!(m.get(&','), None, "',' isn't a letter");
assert_eq!(m.len(), 7, "how many different letters");` },
      { title: 'group_by_len', brief: 'Group the words by their length (in chars): length to the words of that length, in the order they came. A `BTreeMap`, so the lengths come out sorted.', hints: ['`map.entry(w.chars().count()).or_default().push(w.to_string());` (or_default makes an empty Vec the first time).'],
        test: String.raw`let g = group_by_len(&["hi", "rust", "ok", "c", "code"]);
assert_eq!(g.keys().copied().collect::<Vec<_>>(), vec![1, 2, 4], "the lengths, sorted");
assert_eq!(g[&2], vec!["hi", "ok"], "the 2-letter words");
assert_eq!(g[&4], vec!["rust", "code"], "the 4-letter words");
assert!(group_by_len(&[]).is_empty(), "group_by_len(&[])");` },
      { title: 'two_sum', brief: 'Find two different places `i < j` where `v[i] + v[j] == target`. One pass with a map from value to place: for each number, is `target - x` already in the map? `None` if there\'s no pair.', hints: ['`let mut seen: HashMap<i32, usize> = HashMap::new();` then for `(j, &x)` in `v.iter().enumerate()`: `if let Some(&i) = seen.get(&(target - x)) { return Some((i, j)); }`, then `seen.insert(x, j);`'],
        test: String.raw`assert_eq!(two_sum(&[2, 7, 11, 15], 9), Some((0, 1)), "two_sum(&[2, 7, 11, 15], 9)");
assert_eq!(two_sum(&[3, 2, 4], 6), Some((1, 2)), "two_sum(&[3, 2, 4], 6)");
assert_eq!(two_sum(&[3, 3], 6), Some((0, 1)), "two_sum(&[3, 3], 6)");
assert_eq!(two_sum(&[1, 2], 7), None, "no pair");` },
    ],
    solution: String.raw`use std::collections::{BTreeMap, HashMap};

fn letter_counts(s: &str) -> HashMap<char, usize> {
    let mut counts = HashMap::new();
    for c in s.chars().filter(|c| c.is_alphabetic()) {
        let c = c.to_lowercase().next().unwrap_or(c);
        *counts.entry(c).or_insert(0) += 1;
    }
    counts
}

fn group_by_len(words: &[&str]) -> BTreeMap<usize, Vec<String>> {
    let mut map: BTreeMap<usize, Vec<String>> = BTreeMap::new();
    for w in words {
        map.entry(w.chars().count()).or_default().push(w.to_string());
    }
    map
}

fn two_sum(v: &[i32], target: i32) -> Option<(usize, usize)> {
    let mut seen: HashMap<i32, usize> = HashMap::new();
    for (j, &x) in v.iter().enumerate() {
        if let Some(&i) = seen.get(&(target - x)) {
            return Some((i, j));
        }
        seen.insert(x, j);
    }
    None
}
`,
  },
  {
    id: 'rs-question-mark', lang: 'rust', kind: 'functions', track: 'Rust', topic: 'Errors with ?', file: 'question.rs',
    title: 'The ? operator and your own error type',
    intro: '`?` after a `Result` means: if it\'s an error, give that error back from this function now; otherwise, carry on with the value. With `From`, `?` can turn one error type into yours on the way.',
    starter: String.raw`use std::num::ParseIntError;

fn sum_all(lines: &[&str]) -> Result<i64, ParseIntError> {
    todo!() // step 1
}

#[derive(Debug, PartialEq)]
enum ConfigError {
    MissingEquals(usize),   // the line number, from 1
    BadNumber(String),      // the text that wasn't a number
}

impl From<ParseIntError> for ConfigError {
    fn from(e: ParseIntError) -> Self {
        ConfigError::BadNumber(e.to_string())
    }
}

fn parse_setting(line: &str, n: usize) -> Result<(String, i64), ConfigError> {
    todo!() // step 2
}

fn total_of_settings(text: &str) -> Result<i64, ConfigError> {
    todo!() // step 3
}
`,
    steps: [
      { title: 'sum_all', brief: 'Parse every line as a whole number (after trimming spaces) and add them up. The first line that isn\'t a number makes the whole thing an `Err`: use `?`.', hints: ['`let mut total = 0; for l in lines { total += l.trim().parse::<i64>()?; } Ok(total)`'],
        test: String.raw`assert_eq!(sum_all(&["1", " 2 ", "3"]), Ok(6), "sum_all(&[\"1\", \" 2 \", \"3\"])");
assert!(sum_all(&["1", "two"]).is_err(), "sum_all(&[\"1\", \"two\"]) should be an Err");
assert_eq!(sum_all(&[]), Ok(0), "sum_all(&[])");` },
      { title: 'parse_setting', brief: 'A setting is `name = number`, like `width = 80`. Give back the trimmed name and the number. No `=`: `Err(MissingEquals(n))`. A number that doesn\'t parse: thanks to `From`, a plain `?` turns the `ParseIntError` into `BadNumber`.', hints: ['`let (name, value) = line.split_once(\'=\').ok_or(ConfigError::MissingEquals(n))?;`', '`let v: i64 = value.trim().parse()?;` and `Ok((name.trim().to_string(), v))`'],
        test: String.raw`assert_eq!(parse_setting("width = 80", 1), Ok(("width".to_string(), 80)), "parse_setting(\"width = 80\")");
assert_eq!(parse_setting("oops", 3), Err(ConfigError::MissingEquals(3)), "parse_setting(\"oops\", 3)");
assert!(matches!(parse_setting("h = tall", 1), Err(ConfigError::BadNumber(_))), "parse_setting(\"h = tall\") should be BadNumber");` },
      { title: 'total_of_settings', brief: 'Add up the numbers of every setting in `text`, one per line, skipping blank lines and lines starting with `#`. Line numbers count from 1 and include the skipped lines. Any bad line: its error.', hints: ['`for (i, line) in text.lines().enumerate()`: skip with `continue`, then `let (_, v) = parse_setting(line, i + 1)?;`'],
        test: String.raw`assert_eq!(total_of_settings("a = 1\n# a comment\n\nb = 2\n"), Ok(3), "a total with a comment and a blank line");
assert_eq!(total_of_settings("a = 1\nbroken\n"), Err(ConfigError::MissingEquals(2)), "a missing = on line 2");
assert_eq!(total_of_settings(""), Ok(0), "no settings");` },
    ],
    solution: String.raw`use std::num::ParseIntError;

fn sum_all(lines: &[&str]) -> Result<i64, ParseIntError> {
    let mut total = 0;
    for l in lines {
        total += l.trim().parse::<i64>()?;
    }
    Ok(total)
}

#[derive(Debug, PartialEq)]
enum ConfigError {
    MissingEquals(usize),
    BadNumber(String),
}

impl From<ParseIntError> for ConfigError {
    fn from(e: ParseIntError) -> Self {
        ConfigError::BadNumber(e.to_string())
    }
}

fn parse_setting(line: &str, n: usize) -> Result<(String, i64), ConfigError> {
    let (name, value) = line.split_once('=').ok_or(ConfigError::MissingEquals(n))?;
    let v: i64 = value.trim().parse()?;
    Ok((name.trim().to_string(), v))
}

fn total_of_settings(text: &str) -> Result<i64, ConfigError> {
    let mut total = 0;
    for (i, line) in text.lines().enumerate() {
        let t = line.trim();
        if t.is_empty() || t.starts_with('#') {
            continue;
        }
        let (_, v) = parse_setting(line, i + 1)?;
        total += v;
    }
    Ok(total)
}
`,
  },
  {
    id: 'rs-modules', lang: 'rust', kind: 'functions', track: 'Rust', topic: 'Modules and privacy', file: 'modules.rs',
    title: 'Modules and privacy',
    intro: 'A module groups code and decides what the outside can use: everything is private unless it says `pub`. A struct with private fields can only be made through its own functions, so it can keep a promise (here: a temperature is never below absolute zero).',
    starter: String.raw`mod temperature {
    #[derive(Debug, Clone, Copy, PartialEq)]
    pub struct Celsius {
        degrees: f64, // private: only code in this module sees it
    }

    impl Celsius {
        pub fn new(degrees: f64) -> Option<Celsius> {
            todo!() // step 1
        }

        pub fn degrees(&self) -> f64 {
            self.degrees
        }

        pub fn to_fahrenheit(&self) -> f64 {
            todo!() // step 2
        }
    }

    pub fn warmest(list: &[Celsius]) -> Option<Celsius> {
        todo!() // step 3
    }
}
`,
    steps: [
      { title: 'Celsius::new', brief: 'Make a `Celsius`, unless `degrees` is below absolute zero (-273.15) or not a number at all (NaN): then `None`. Because `degrees` is private, this is the only way to make one, so every `Celsius` is a real temperature.', hints: ['`if degrees.is_nan() || degrees < -273.15 { None } else { Some(Celsius { degrees }) }`'],
        test: String.raw`assert_eq!(temperature::Celsius::new(21.5).map(|c| c.degrees()), Some(21.5), "Celsius::new(21.5)");
assert_eq!(temperature::Celsius::new(-300.0), None, "Celsius::new(-300.0)");
assert_eq!(temperature::Celsius::new(f64::NAN), None, "Celsius::new(NaN)");` },
      { title: 'to_fahrenheit', brief: 'Fahrenheit is Celsius times 9/5, plus 32.', hints: ['`self.degrees * 9.0 / 5.0 + 32.0`'],
        test: String.raw`let c = temperature::Celsius::new(100.0).unwrap();
assert_eq!(c.to_fahrenheit(), 212.0, "100 C in Fahrenheit");
assert_eq!(temperature::Celsius::new(-40.0).unwrap().to_fahrenheit(), -40.0, "-40 C in Fahrenheit");` },
      { title: 'warmest', brief: 'A `pub` function in the module: the warmest temperature in the list, or `None` if it\'s empty. It can read the private field, because it\'s in the same module.', hints: ['`list.iter().copied().fold(None, |best: Option<Celsius>, c| match best { Some(b) if b.degrees >= c.degrees => Some(b), _ => Some(c) })`, or a plain loop.'],
        test: String.raw`let t = |d| temperature::Celsius::new(d).unwrap();
assert_eq!(temperature::warmest(&[t(3.0), t(30.0), t(-5.0)]), Some(t(30.0)), "the warmest of 3, 30, -5");
assert_eq!(temperature::warmest(&[]), None, "warmest(&[])");` },
    ],
    solution: String.raw`mod temperature {
    #[derive(Debug, Clone, Copy, PartialEq)]
    pub struct Celsius {
        degrees: f64,
    }

    impl Celsius {
        pub fn new(degrees: f64) -> Option<Celsius> {
            if degrees.is_nan() || degrees < -273.15 {
                None
            } else {
                Some(Celsius { degrees })
            }
        }

        pub fn degrees(&self) -> f64 {
            self.degrees
        }

        pub fn to_fahrenheit(&self) -> f64 {
            self.degrees * 9.0 / 5.0 + 32.0
        }
    }

    pub fn warmest(list: &[Celsius]) -> Option<Celsius> {
        let mut best: Option<Celsius> = None;
        for &c in list {
            match best {
                Some(b) if b.degrees >= c.degrees => {}
                _ => best = Some(c),
            }
        }
        best
    }
}
`,
  },
  {
    id: 'rs-borrow-fix', lang: 'rust', kind: 'functions', track: 'Rust', topic: 'Fixing borrow-checker errors', file: 'fixme.rs',
    title: 'Fix the borrow checker\'s complaints',
    intro: 'Each step has code that looks right but doesn\'t compile. Paste the broken version (it\'s in the comment) over the `todo!()`, press F7, and read the error: the **?** next to it in Problems explains it in plain words. Then fix it. The point is learning to read these errors, not avoiding them.',
    starter: String.raw`// Step 1. The broken version:
//     fn add_shouts(v: &mut Vec<String>) {
//         for s in v.iter() {
//             v.push(s.to_uppercase());
//         }
//     }
fn add_shouts(v: &mut Vec<String>) {
    todo!() // step 1
}

// Step 2. The broken version:
//     fn first_then_push(v: &mut Vec<i32>) -> i32 {
//         let first = &v[0];
//         v.push(100);
//         *first
//     }
fn first_then_push(v: &mut Vec<i32>) -> i32 {
    todo!() // step 2
}

// Step 3. The broken version:
//     fn name_and_len(name: String) -> (String, usize) {
//         let owned = name;
//         (owned, name.len())
//     }
fn name_and_len(name: String) -> (String, usize) {
    todo!() // step 3
}
`,
    steps: [
      { title: 'add_shouts', brief: 'For every string in `v`, add a capitals copy at the end. The broken version changes the vector while it\'s still looping over it ("cannot borrow `*v` as mutable because it is also borrowed as immutable"). In C++ that\'s a crash waiting to happen: the vector moves its items when it grows. Work out the new strings first, then add them.', hints: ['`let shouts: Vec<String> = v.iter().map(|s| s.to_uppercase()).collect();` The loop over `v` ends there.', 'Then `v.extend(shouts);`'],
        test: String.raw`let mut v = vec![String::from("hi"), String::from("ok")];
add_shouts(&mut v);
assert_eq!(v, vec!["hi", "ok", "HI", "OK"], "after add_shouts");
let mut empty: Vec<String> = Vec::new();
add_shouts(&mut empty);
assert!(empty.is_empty(), "an empty vector stays empty");` },
      { title: 'first_then_push', brief: 'Give back the first number, after pushing 100 onto the vector. The broken version keeps a reference to `v[0]` across the push: if the push moves the vector\'s memory, that reference points at freed memory. Copy the number out first: an `i32` is `Copy`.', hints: ['`let first = v[0];` (no `&`): a copy, not a borrow.'],
        test: String.raw`let mut v = vec![7, 8];
assert_eq!(first_then_push(&mut v), 7, "first_then_push(&mut vec![7, 8])");
assert_eq!(v, vec![7, 8, 100], "the vector afterwards");` },
      { title: 'name_and_len', brief: 'Give back the name and its length. The broken version moves `name` into `owned`, then uses `name` again ("borrow of moved value"). Get the length before the move, or use `owned` for both.', hints: ['`let len = name.len(); (name, len)`'],
        test: String.raw`assert_eq!(name_and_len(String::from("Ferris")), (String::from("Ferris"), 6), "name_and_len(\"Ferris\")");
assert_eq!(name_and_len(String::new()), (String::new(), 0), "name_and_len(\"\")");` },
    ],
    solution: String.raw`fn add_shouts(v: &mut Vec<String>) {
    let shouts: Vec<String> = v.iter().map(|s| s.to_uppercase()).collect();
    v.extend(shouts);
}

fn first_then_push(v: &mut Vec<i32>) -> i32 {
    let first = v[0];
    v.push(100);
    first
}

fn name_and_len(name: String) -> (String, usize) {
    let len = name.len();
    (name, len)
}
`,
  },
  {
    id: 'rs-patterns', lang: 'rust', kind: 'functions', track: 'Rust', topic: 'Pattern matching', file: 'patterns.rs',
    title: 'Pattern matching',
    intro: '`match` can take values apart: tuples, ranges, enums with data, slices, with extra conditions (guards). The compiler checks every case is covered, so adding an enum variant shows you every place to update.',
    starter: String.raw`fn describe(n: i32) -> &'static str {
    todo!() // step 1
}

fn quadrant(p: (i32, i32)) -> &'static str {
    todo!() // step 2
}

#[derive(Debug, PartialEq)]
enum Command {
    Go(String),
    Take(String),
    Look,
    Quit,
}

fn parse_command(line: &str) -> Option<Command> {
    todo!() // step 3
}
`,
    steps: [
      { title: 'describe', brief: '`"negative"` below 0, `"zero"`, `"small"` for 1 to 9, `"even"` for even numbers from 10 up, `"odd"` for odd ones from 10 up. One `match` with ranges and a guard.', hints: ['`match n { i32::MIN..=-1 => "negative", 0 => "zero", 1..=9 => "small", x if x % 2 == 0 => "even", _ => "odd" }`'],
        test: String.raw`assert_eq!(describe(-5), "negative", "describe(-5)");
assert_eq!(describe(0), "zero", "describe(0)");
assert_eq!(describe(7), "small", "describe(7)");
assert_eq!(describe(10), "even", "describe(10)");
assert_eq!(describe(11), "odd", "describe(11)");` },
      { title: 'quadrant', brief: 'Where is the point? `"origin"` for (0, 0), `"x axis"` or `"y axis"` if one part is 0, otherwise `"I"`, `"II"`, `"III"` or `"IV"` (counter-clockwise from top right).', hints: ['Match on the tuple: `(0, 0) => "origin", (_, 0) => "x axis", (0, _) => "y axis", (x, y) if x > 0 && y > 0 => "I", ...`'],
        test: String.raw`assert_eq!(quadrant((0, 0)), "origin", "quadrant((0, 0))");
assert_eq!(quadrant((5, 0)), "x axis", "quadrant((5, 0))");
assert_eq!(quadrant((0, -2)), "y axis", "quadrant((0, -2))");
assert_eq!(quadrant((1, 1)), "I", "quadrant((1, 1))");
assert_eq!(quadrant((-1, 1)), "II", "quadrant((-1, 1))");
assert_eq!(quadrant((-1, -1)), "III", "quadrant((-1, -1))");
assert_eq!(quadrant((1, -1)), "IV", "quadrant((1, -1))");` },
      { title: 'parse_command', brief: 'Turn a line into a `Command`: `go north`, `take lamp`, `look`, `quit`. Any amount of space between words; anything else (or a missing word) is `None`. Match on a slice of the words.', hints: ['`let words: Vec<&str> = line.split_whitespace().collect();`', '`match words.as_slice() { ["go", dir] => Some(Command::Go(dir.to_string())), ["look"] => Some(Command::Look), ..., _ => None }`'],
        test: String.raw`assert_eq!(parse_command("go north"), Some(Command::Go("north".into())), "parse_command(\"go north\")");
assert_eq!(parse_command("  take   lamp "), Some(Command::Take("lamp".into())), "parse_command with extra spaces");
assert_eq!(parse_command("look"), Some(Command::Look), "parse_command(\"look\")");
assert_eq!(parse_command("quit"), Some(Command::Quit), "parse_command(\"quit\")");
assert_eq!(parse_command("go"), None, "parse_command(\"go\") with no direction");
assert_eq!(parse_command("dance wildly"), None, "parse_command(\"dance wildly\")");` },
    ],
    solution: String.raw`fn describe(n: i32) -> &'static str {
    match n {
        i32::MIN..=-1 => "negative",
        0 => "zero",
        1..=9 => "small",
        x if x % 2 == 0 => "even",
        _ => "odd",
    }
}

fn quadrant(p: (i32, i32)) -> &'static str {
    match p {
        (0, 0) => "origin",
        (_, 0) => "x axis",
        (0, _) => "y axis",
        (x, y) if x > 0 && y > 0 => "I",
        (x, y) if x < 0 && y > 0 => "II",
        (x, y) if x < 0 && y < 0 => "III",
        _ => "IV",
    }
}

#[derive(Debug, PartialEq)]
enum Command {
    Go(String),
    Take(String),
    Look,
    Quit,
}

fn parse_command(line: &str) -> Option<Command> {
    let words: Vec<&str> = line.split_whitespace().collect();
    match words.as_slice() {
        ["go", dir] => Some(Command::Go(dir.to_string())),
        ["take", what] => Some(Command::Take(what.to_string())),
        ["look"] => Some(Command::Look),
        ["quit"] => Some(Command::Quit),
        _ => None,
    }
}
`,
  },
  {
    id: 'rs-smart-pointers', lang: 'rust', kind: 'functions', track: 'Rust', topic: 'Box, Rc and RefCell', file: 'pointers.rs',
    title: 'Box, Rc and RefCell',
    intro: '`Box<T>` puts a value on the heap (a recursive type needs one). `Rc<T>` lets several owners share a value, freed when the last goes. `RefCell<T>` lets you change something behind a shared reference, checked while the program runs instead of while compiling.',
    starter: String.raw`use std::cell::RefCell;
use std::rc::Rc;

enum List {
    Node(i32, Box<List>),
    End,
}

fn sum(list: &List) -> i32 {
    todo!() // step 1
}

fn shared_count() -> (usize, usize) {
    todo!() // step 2
}

struct Logger {
    lines: RefCell<Vec<String>>,
}

impl Logger {
    fn log(&self, msg: &str) {
        todo!() // step 3: note &self, not &mut self
    }
    fn count(&self) -> usize {
        self.lines.borrow().len()
    }
}
`,
    steps: [
      { title: 'sum', brief: 'Add up the numbers in a linked list made of `Box`es: `Node(1, Box::new(Node(2, Box::new(End))))` is 1 + 2. Recursion, or a loop that follows the boxes.', hints: ['`match list { List::Node(v, next) => v + sum(next), List::End => 0 }` (`next` is a `&Box<List>`, which works where a `&List` is wanted).'],
        test: String.raw`use List::{End, Node};
let l = Node(1, Box::new(Node(2, Box::new(Node(3, Box::new(End))))));
assert_eq!(sum(&l), 6, "sum of 1, 2, 3");
assert_eq!(sum(&End), 0, "sum of an empty list");` },
      { title: 'shared_count', brief: 'Make an `Rc` holding a `String`, clone the `Rc` twice (clones of the pointer, not the string), and give back `Rc::strong_count` then. Then drop one clone and give back the count again: return both, `(3, 2)`.', hints: ['`let a = Rc::new(String::from("shared")); let b = Rc::clone(&a); let c = Rc::clone(&a);`', '`let three = Rc::strong_count(&a); drop(c); (three, Rc::strong_count(&a))` (keep `b` alive until then: use it, or name it `_b`).'],
        test: String.raw`assert_eq!(shared_count(), (3, 2), "the counts after two clones, then after dropping one");` },
      { title: 'Logger::log', brief: '`log` takes `&self`, yet has to add a line. `RefCell` makes that possible: `borrow_mut()` gives a mutable borrow, checked while running (two at once would panic).', hints: ['`self.lines.borrow_mut().push(msg.to_string());`'],
        test: String.raw`let lg = Logger { lines: RefCell::new(Vec::new()) };
let shared = &lg;
shared.log("start");
shared.log("done");
assert_eq!(lg.count(), 2, "two lines logged through &self");
assert_eq!(lg.lines.borrow()[1], "done", "the second line");` },
    ],
    solution: String.raw`use std::cell::RefCell;
use std::rc::Rc;

enum List {
    Node(i32, Box<List>),
    End,
}

fn sum(list: &List) -> i32 {
    match list {
        List::Node(v, next) => v + sum(next),
        List::End => 0,
    }
}

fn shared_count() -> (usize, usize) {
    let a = Rc::new(String::from("shared"));
    let _b = Rc::clone(&a);
    let c = Rc::clone(&a);
    let three = Rc::strong_count(&a);
    drop(c);
    (three, Rc::strong_count(&a))
}

struct Logger {
    lines: RefCell<Vec<String>>,
}

impl Logger {
    fn log(&self, msg: &str) {
        self.lines.borrow_mut().push(msg.to_string());
    }
    fn count(&self) -> usize {
        self.lines.borrow().len()
    }
}
`,
  },
  {
    id: 'rs-threads', lang: 'rust', kind: 'functions', track: 'Rust', topic: 'Threads', file: 'threads.rs',
    title: 'Threads without data races',
    intro: 'Rust checks thread safety while compiling: data shared between threads must be shareable (`Arc`), and changing it needs a lock (`Mutex`). A data race doesn\'t compile. Scoped threads can borrow local data because they\'re sure to finish first.',
    starter: String.raw`use std::sync::{mpsc, Arc, Mutex};
use std::thread;

fn parallel_sum(v: &[u64]) -> u64 {
    todo!() // step 1: split v in two, sum each half on its own thread
}

fn count_together(threads: usize, each: usize) -> usize {
    todo!() // step 2
}

fn squares_by_channel(n: u64) -> Vec<u64> {
    todo!() // step 3
}
`,
    steps: [
      { title: 'parallel_sum', brief: 'Split `v` in half and add up each half on its own thread, then add the two results. `thread::scope` lets the threads borrow `v`: they\'re guaranteed to finish before the scope ends.', hints: ['`let (a, b) = v.split_at(v.len() / 2);`', '`thread::scope(|s| { let ha = s.spawn(|| a.iter().sum::<u64>()); let hb = s.spawn(|| b.iter().sum::<u64>()); ha.join().unwrap() + hb.join().unwrap() })`'],
        test: String.raw`let v: Vec<u64> = (1..=1000).collect();
assert_eq!(parallel_sum(&v), 500500, "parallel_sum(1..=1000)");
assert_eq!(parallel_sum(&[]), 0, "parallel_sum(&[])");
assert_eq!(parallel_sum(&[5]), 5, "parallel_sum(&[5])");` },
      { title: 'count_together', brief: 'Start `threads` threads; each adds 1 to a shared counter `each` times. Give back the final count. The counter is an `Arc<Mutex<usize>>`: `Arc` so each thread can own a handle, `Mutex` so only one changes it at a time.', hints: ['`let counter = Arc::new(Mutex::new(0));` In a loop: `let c = Arc::clone(&counter); handles.push(thread::spawn(move || { for _ in 0..each { *c.lock().unwrap() += 1; } }));`', 'Join every handle, then `*counter.lock().unwrap()`.'],
        test: String.raw`assert_eq!(count_together(8, 1000), 8000, "count_together(8, 1000)");
assert_eq!(count_together(1, 0), 0, "count_together(1, 0)");` },
      { title: 'squares_by_channel', brief: 'A worker thread sends the squares of 1 to `n` down a channel; the main thread collects them in order. The loop on the receiving side ends when the sender is dropped (when the worker finishes).', hints: ['`let (tx, rx) = mpsc::channel();` `thread::spawn(move || for i in 1..=n { tx.send(i * i).unwrap(); });`', '`rx.iter().collect()`'],
        test: String.raw`assert_eq!(squares_by_channel(4), vec![1, 4, 9, 16], "squares_by_channel(4)");
assert_eq!(squares_by_channel(0), Vec::<u64>::new(), "squares_by_channel(0)");` },
    ],
    solution: String.raw`use std::sync::{mpsc, Arc, Mutex};
use std::thread;

fn parallel_sum(v: &[u64]) -> u64 {
    let (a, b) = v.split_at(v.len() / 2);
    thread::scope(|s| {
        let ha = s.spawn(|| a.iter().sum::<u64>());
        let hb = s.spawn(|| b.iter().sum::<u64>());
        ha.join().unwrap() + hb.join().unwrap()
    })
}

fn count_together(threads: usize, each: usize) -> usize {
    let counter = Arc::new(Mutex::new(0));
    let mut handles = Vec::new();
    for _ in 0..threads {
        let c = Arc::clone(&counter);
        handles.push(thread::spawn(move || {
            for _ in 0..each {
                *c.lock().unwrap() += 1;
            }
        }));
    }
    for h in handles {
        h.join().unwrap();
    }
    let total = *counter.lock().unwrap();
    total
}

fn squares_by_channel(n: u64) -> Vec<u64> {
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        for i in 1..=n {
            tx.send(i * i).unwrap();
        }
    });
    rx.iter().collect()
}
`,
  },
];
