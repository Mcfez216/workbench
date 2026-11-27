'use strict';
// The Rust exercises. Each step's test is the body of a #[test] function,
// run by Rust's own test runner (see harnessRust in exercises.js). Checks
// are written assert_eq!(what you got, what was expected, "what was called"),
// so a failure says "got 3, expected 5" next to the call.
//
// Starters use todo!(): it compiles, and a step that reaches it fails with
// "not written yet".

module.exports = [
  // ================================================================== Rust basics
  {
    id: 'rs-first-functions', lang: 'rust', kind: 'functions', track: 'Rust', topic: 'Functions', file: 'first.rs',
    title: 'First functions in Rust',
    intro: 'A Rust function says the type of each input, and the type it gives back after `->`. The last line, with no semicolon, is the value it gives back. Each step adds one function.',
    starter: String.raw`// Write each function where it says todo!(). F7 (or "Check my code") runs the tests.

fn add(a: i32, b: i32) -> i32 {
    todo!() // step 1
}

fn max3(a: i32, b: i32, c: i32) -> i32 {
    todo!() // step 2
}

fn clamp(x: i32, lo: i32, hi: i32) -> i32 {
    todo!() // step 3
}
`,
    steps: [
      { title: 'add', brief: 'Make `add(a, b)` return the sum of `a` and `b`.', hints: ['The last line of a function is its result, if it has no semicolon.', 'Just `a + b`'],
        test: String.raw`assert_eq!(add(2, 3), 5, "add(2, 3)");
assert_eq!(add(-4, 4), 0, "add(-4, 4)");
assert_eq!(add(-2, -3), -5, "add(-2, -3)");` },
      { title: 'max3', brief: 'Make `max3(a, b, c)` return the biggest of the three numbers.', hints: ['Start with `let mut m = a;`. Then compare `m` with `b`, and with `c`.', 'Or use the max method: `a.max(b).max(c)`'],
        test: String.raw`assert_eq!(max3(1, 2, 3), 3, "max3(1, 2, 3)");
assert_eq!(max3(9, 2, 3), 9, "max3(9, 2, 3)");
assert_eq!(max3(1, 8, 3), 8, "max3(1, 8, 3)");
assert_eq!(max3(-5, -2, -9), -2, "max3(-5, -2, -9)");` },
      { title: 'clamp', brief: '`clamp(x, lo, hi)` keeps `x` between `lo` and `hi`. If `x` is below `lo`, return `lo`. If it\'s above `hi`, return `hi`. Otherwise, return `x`.', hints: ['In Rust, `if` gives a value: `if x < lo { lo } else if x > hi { hi } else { x }`'],
        test: String.raw`assert_eq!(clamp(5, 0, 10), 5, "clamp(5, 0, 10)");
assert_eq!(clamp(-3, 0, 10), 0, "clamp(-3, 0, 10)");
assert_eq!(clamp(42, 0, 10), 10, "clamp(42, 0, 10)");
assert_eq!(clamp(10, 0, 10), 10, "clamp(10, 0, 10)");` },
    ],
    solution: String.raw`fn add(a: i32, b: i32) -> i32 {
    a + b
}

fn max3(a: i32, b: i32, c: i32) -> i32 {
    a.max(b).max(c)
}

fn clamp(x: i32, lo: i32, hi: i32) -> i32 {
    if x < lo {
        lo
    } else if x > hi {
        hi
    } else {
        x
    }
}
`,
  },
  {
    id: 'rs-ownership', lang: 'rust', kind: 'functions', track: 'Rust', topic: 'Ownership and borrowing', file: 'borrow.rs',
    title: 'Ownership and borrowing',
    intro: 'Every value in Rust has one owner. A function can borrow a value instead of taking it. `&T` lets it read the value, and `&mut T` lets it change it. These steps practise both.',
    starter: String.raw`// & borrows to read. &mut borrows to change. Neither takes ownership.

fn total_len(words: &[String]) -> usize {
    todo!() // step 1
}

fn shout(s: &mut String) {
    todo!() // step 2
}

fn longest<'a>(a: &'a str, b: &'a str) -> &'a str {
    todo!() // step 3
}
`,
    steps: [
      { title: 'total_len', brief: 'Add up the lengths of all the words, in bytes. The function only borrows the list, so the caller still owns it afterwards.', hints: ['Loop with `for w in words`, and add `w.len()` to a total.', 'Or: `words.iter().map(|w| w.len()).sum()`'],
        test: String.raw`let crew = vec![String::from("Han"), String::from("Chewie")];
assert_eq!(total_len(&crew), 9, "total_len(&[\"Han\", \"Chewie\"])");
assert_eq!(crew.len(), 2, "crew is still usable afterwards");
assert_eq!(total_len(&[]), 0, "total_len(&[])");` },
      { title: 'shout', brief: 'Change the string itself: make every letter a capital, and add an `!` at the end. The function gets `&mut String`, so it changes the caller\'s string.', hints: ['`*s = s.to_uppercase();` replaces the contents.', 'Then `s.push(\'!\');`'],
        test: String.raw`let mut msg = String::from("help me");
shout(&mut msg);
assert_eq!(msg, "HELP ME!", "msg after shout(&mut msg)");
let mut empty = String::new();
shout(&mut empty);
assert_eq!(empty, "!", "an empty string after shout");` },
      { title: 'longest', brief: 'Return whichever string is longer. If they\'re the same length, return the first one. The `\'a` says the result lives as long as the inputs do.', hints: ['`if b.len() > a.len() { b } else { a }`'],
        test: String.raw`assert_eq!(longest("Leia", "Luke"), "Leia", "longest(\"Leia\", \"Luke\")");
assert_eq!(longest("R2", "C-3PO"), "C-3PO", "longest(\"R2\", \"C-3PO\")");
assert_eq!(longest("", ""), "", "longest(\"\", \"\")");` },
    ],
    solution: String.raw`fn total_len(words: &[String]) -> usize {
    words.iter().map(|w| w.len()).sum()
}

fn shout(s: &mut String) {
    *s = s.to_uppercase();
    s.push('!');
}

fn longest<'a>(a: &'a str, b: &'a str) -> &'a str {
    if b.len() > a.len() { b } else { a }
}
`,
  },
  {
    id: 'rs-structs-enums', lang: 'rust', kind: 'functions', track: 'Rust', topic: 'Structs, enums and Option', file: 'shapes.rs',
    title: 'Structs, enums and Option',
    intro: 'A struct groups values together. An enum is one of several choices, and `match` handles each choice. `Option` is Rust\'s way to say "maybe a value", instead of a null pointer.',
    starter: String.raw`struct Rect {
    w: u32,
    h: u32,
}

impl Rect {
    fn area(&self) -> u32 {
        todo!() // step 1
    }

    fn can_hold(&self, other: &Rect) -> bool {
        todo!() // step 1
    }
}

enum Shape {
    Circle(f64), // the radius
    Square(f64), // the side
}

fn shape_area(s: &Shape) -> f64 {
    todo!() // step 2
}

fn first_even(v: &[i32]) -> Option<i32> {
    todo!() // step 3
}
`,
    steps: [
      { title: 'Rect', brief: '`area` returns width times height. `can_hold` is true if `other` fits inside: both its width and its height are smaller than this rectangle\'s.', hints: ['`self.w * self.h`', '`self.w > other.w && self.h > other.h`'],
        test: String.raw`let big = Rect { w: 8, h: 7 };
let small = Rect { w: 5, h: 1 };
assert_eq!(big.area(), 56, "Rect {{ w: 8, h: 7 }}.area()");
assert_eq!(big.can_hold(&small), true, "big.can_hold(&small)");
assert_eq!(small.can_hold(&big), false, "small.can_hold(&big)");` },
      { title: 'shape_area', brief: 'Use `match` to give each shape\'s area. A circle\'s area is π × r × r (use `std::f64::consts::PI`). A square\'s is side × side.', hints: ['`match s { Shape::Circle(r) => ..., Shape::Square(side) => ... }`', 'Inside the arms, `r` and `side` are `&f64`: write `*r` or just use them in maths, which works too.'],
        test: String.raw`let round2 = |x: f64| (x * 100.0).round() / 100.0;
assert_eq!(round2(shape_area(&Shape::Circle(1.0))), 3.14, "shape_area(&Shape::Circle(1.0)), to 2 places");
assert_eq!(round2(shape_area(&Shape::Square(3.0))), 9.0, "shape_area(&Shape::Square(3.0))");` },
      { title: 'first_even', brief: 'Return the first even number as `Some(n)`. If there isn\'t one, return `None`.', hints: ['Loop: `for &x in v { if x % 2 == 0 { return Some(x); } }`, then `None` at the end.', 'Or: `v.iter().copied().find(|x| x % 2 == 0)`'],
        test: String.raw`assert_eq!(first_even(&[1, 3, 4, 6]), Some(4), "first_even(&[1, 3, 4, 6])");
assert_eq!(first_even(&[1, 3, 5]), None, "first_even(&[1, 3, 5])");
assert_eq!(first_even(&[-2]), Some(-2), "first_even(&[-2])");` },
    ],
    solution: String.raw`struct Rect {
    w: u32,
    h: u32,
}

impl Rect {
    fn area(&self) -> u32 {
        self.w * self.h
    }

    fn can_hold(&self, other: &Rect) -> bool {
        self.w > other.w && self.h > other.h
    }
}

enum Shape {
    Circle(f64),
    Square(f64),
}

fn shape_area(s: &Shape) -> f64 {
    match s {
        Shape::Circle(r) => std::f64::consts::PI * r * r,
        Shape::Square(side) => side * side,
    }
}

fn first_even(v: &[i32]) -> Option<i32> {
    v.iter().copied().find(|x| x % 2 == 0)
}
`,
  },
  {
    id: 'rs-errors', lang: 'rust', kind: 'functions', track: 'Rust', topic: 'Errors with Result', file: 'errors.rs',
    title: 'Errors with Result and ?',
    intro: 'A function that can fail returns `Result`. That\'s `Ok(value)` when it works, or `Err(reason)` when it doesn\'t. The `?` operator passes an error straight back to the caller.',
    starter: String.raw`fn parse_age(text: &str) -> Result<u8, String> {
    todo!() // step 1
}

fn total_age(texts: &[&str]) -> Result<u32, String> {
    todo!() // step 2
}

fn safe_divide(a: i32, b: i32) -> Option<i32> {
    todo!() // step 3
}
`,
    steps: [
      { title: 'parse_age', brief: 'Turn the text into an age. Spaces around it are fine. If it isn\'t a number from 0 to 255, return `Err("not an age: <the text>")`.', hints: ['`text.trim().parse::<u8>()` gives a `Result<u8, ...>`.', 'Change its error into yours: `.map_err(|_| format!("not an age: {text}"))`'],
        test: String.raw`assert_eq!(parse_age("42"), Ok(42), "parse_age(\"42\")");
assert_eq!(parse_age(" 7 "), Ok(7), "parse_age(\" 7 \")");
assert_eq!(parse_age("old"), Err(String::from("not an age: old")), "parse_age(\"old\")");
assert_eq!(parse_age("900"), Err(String::from("not an age: 900")), "parse_age(\"900\")");` },
      { title: 'total_age', brief: 'Add up all the ages. Use `parse_age` and `?`: if any text isn\'t an age, return that same error.', hints: ['`let mut total = 0u32; for t in texts { total += parse_age(t)? as u32; }`', 'Then `Ok(total)` at the end.'],
        test: String.raw`assert_eq!(total_age(&["19", "23", "32"]), Ok(74), "total_age(&[\"19\", \"23\", \"32\"])");
assert_eq!(total_age(&[]), Ok(0), "total_age(&[])");
assert_eq!(total_age(&["19", "Han", "32"]), Err(String::from("not an age: Han")), "total_age(&[\"19\", \"Han\", \"32\"])");` },
      { title: 'safe_divide', brief: 'Divide `a` by `b`. Dividing by zero isn\'t possible, so return `None` then. Otherwise return `Some(a / b)`.', hints: ['`if b == 0 { None } else { Some(a / b) }`', 'Or: `a.checked_div(b)`, which also handles i32::MIN / -1.'],
        test: String.raw`assert_eq!(safe_divide(10, 2), Some(5), "safe_divide(10, 2)");
assert_eq!(safe_divide(7, 0), None, "safe_divide(7, 0)");
assert_eq!(safe_divide(-9, 3), Some(-3), "safe_divide(-9, 3)");` },
    ],
    solution: String.raw`fn parse_age(text: &str) -> Result<u8, String> {
    text.trim().parse::<u8>().map_err(|_| format!("not an age: {text}"))
}

fn total_age(texts: &[&str]) -> Result<u32, String> {
    let mut total = 0u32;
    for t in texts {
        total += parse_age(t)? as u32;
    }
    Ok(total)
}

fn safe_divide(a: i32, b: i32) -> Option<i32> {
    a.checked_div(b)
}
`,
  },
  {
    id: 'rs-collections', lang: 'rust', kind: 'functions', track: 'Rust', topic: 'Collections and iterators', file: 'words.rs',
    title: 'Collections and iterators',
    intro: '`Vec` is a list that grows, and `HashMap` looks things up by a key. Iterators let you filter, change and collect values without writing the loop yourself.',
    starter: String.raw`use std::collections::HashMap;

fn evens(v: &[i32]) -> Vec<i32> {
    todo!() // step 1
}

fn word_count(text: &str) -> HashMap<String, usize> {
    todo!() // step 2
}

fn top(mut scores: Vec<u32>, n: usize) -> Vec<u32> {
    todo!() // step 3
}
`,
    steps: [
      { title: 'evens', brief: 'Return a new `Vec` with only the even numbers, in the same order.', hints: ['`v.iter().copied().filter(|x| x % 2 == 0).collect()`'],
        test: String.raw`assert_eq!(evens(&[1, 2, 3, 4, -6]), vec![2, 4, -6], "evens(&[1, 2, 3, 4, -6])");
assert_eq!(evens(&[1, 3]), Vec::<i32>::new(), "evens(&[1, 3])");` },
      { title: 'word_count', brief: 'Count how many times each word appears. Words are separated by spaces, and several spaces in a row are fine.', hints: ['`text.split_whitespace()` gives the words.', '`*counts.entry(w.to_string()).or_insert(0) += 1;`'],
        test: String.raw`let c = word_count("the force  the  dark side the");
assert_eq!(c.get("the"), Some(&3), "word_count(...).get(\"the\")");
assert_eq!(c.get("force"), Some(&1), "word_count(...).get(\"force\")");
assert_eq!(c.len(), 4, "how many different words");
assert_eq!(word_count("").len(), 0, "word_count(\"\")");` },
      { title: 'top', brief: 'Return the `n` biggest scores, biggest first. If there are fewer than `n`, return them all.', hints: ['`scores.sort();` then `scores.reverse();`, or `scores.sort_by(|a, b| b.cmp(a));`', '`scores.truncate(n);` keeps the first n.'],
        test: String.raw`assert_eq!(top(vec![42, 7, 99, 64], 2), vec![99, 64], "top(vec![42, 7, 99, 64], 2)");
assert_eq!(top(vec![5], 3), vec![5], "top(vec![5], 3)");
assert_eq!(top(vec![], 1), Vec::<u32>::new(), "top(vec![], 1)");` },
    ],
    solution: String.raw`use std::collections::HashMap;

fn evens(v: &[i32]) -> Vec<i32> {
    v.iter().copied().filter(|x| x % 2 == 0).collect()
}

fn word_count(text: &str) -> HashMap<String, usize> {
    let mut counts = HashMap::new();
    for w in text.split_whitespace() {
        *counts.entry(w.to_string()).or_insert(0) += 1;
    }
    counts
}

fn top(mut scores: Vec<u32>, n: usize) -> Vec<u32> {
    scores.sort_by(|a, b| b.cmp(a));
    scores.truncate(n);
    scores
}
`,
  },
  {
    id: 'rs-traits', lang: 'rust', kind: 'functions', track: 'Rust', topic: 'Traits and generics', file: 'traits.rs',
    title: 'Traits and generics',
    intro: 'A trait is a set of methods a type promises to have, a bit like an interface. A generic function works for any type with the traits it asks for.',
    starter: String.raw`trait Describe {
    fn describe(&self) -> String;
}

struct Droid {
    model: String,
}

struct Pilot {
    name: String,
    rank: u8,
}

impl Describe for Droid {
    fn describe(&self) -> String {
        todo!() // step 1
    }
}

impl Describe for Pilot {
    fn describe(&self) -> String {
        todo!() // step 1
    }
}

fn describe_all(things: &[Box<dyn Describe>]) -> Vec<String> {
    todo!() // step 2
}

fn largest<T: PartialOrd + Copy>(items: &[T]) -> T {
    todo!() // step 3
}
`,
    steps: [
      { title: 'describe', brief: 'A droid describes itself as `"droid <model>"`. A pilot as `"<name>, rank <rank>"`.', hints: ['`format!("droid {}", self.model)`', '`format!("{}, rank {}", self.name, self.rank)`'],
        test: String.raw`assert_eq!(Droid { model: "R2-D2".into() }.describe(), "droid R2-D2", "Droid {{ model: \"R2-D2\" }}.describe()");
assert_eq!(Pilot { name: "Wedge".into(), rank: 3 }.describe(), "Wedge, rank 3", "Pilot {{ name: \"Wedge\", rank: 3 }}.describe()");` },
      { title: 'describe_all', brief: 'The list holds different types, all boxed as `dyn Describe`. Return each one\'s description, in order.', hints: ['`things.iter().map(|t| t.describe()).collect()`'],
        test: String.raw`let crew: Vec<Box<dyn Describe>> = vec![Box::new(Pilot { name: "Poe".into(), rank: 5 }), Box::new(Droid { model: "BB-8".into() })];
assert_eq!(describe_all(&crew), vec!["Poe, rank 5".to_string(), "droid BB-8".to_string()], "describe_all(&crew)");` },
      { title: 'largest', brief: 'Return the largest item. It works for any type that can be compared (`PartialOrd`) and copied (`Copy`). The list always has at least one item.', hints: ['`let mut best = items[0];` then loop and compare with `>`.'],
        test: String.raw`assert_eq!(largest(&[3, 9, 2]), 9, "largest(&[3, 9, 2])");
assert_eq!(largest(&['x', 'b', 'q']), 'x', "largest(&['x', 'b', 'q'])");
assert_eq!(largest(&[1.5, -2.0]), 1.5, "largest(&[1.5, -2.0])");` },
    ],
    solution: String.raw`trait Describe {
    fn describe(&self) -> String;
}

struct Droid {
    model: String,
}

struct Pilot {
    name: String,
    rank: u8,
}

impl Describe for Droid {
    fn describe(&self) -> String {
        format!("droid {}", self.model)
    }
}

impl Describe for Pilot {
    fn describe(&self) -> String {
        format!("{}, rank {}", self.name, self.rank)
    }
}

fn describe_all(things: &[Box<dyn Describe>]) -> Vec<String> {
    things.iter().map(|t| t.describe()).collect()
}

fn largest<T: PartialOrd + Copy>(items: &[T]) -> T {
    let mut best = items[0];
    for &x in items {
        if x > best {
            best = x;
        }
    }
    best
}
`,
  },
  {
    id: 'rs-hello-io', lang: 'rust', kind: 'program', track: 'Rust', topic: 'Input and output', file: 'main.rs',
    title: 'Talking to the user, in Rust',
    intro: 'This time you write a whole program. It reads what\'s typed on the keyboard, and prints to the screen. Each step runs it with some input, and compares what it prints with the right answer.',
    starter: String.raw`fn main() {
    // step 1: print Hello, World!
}
`,
    steps: [
      { title: 'Hello', brief: 'Print exactly `Hello, World!`, then a new line.', hints: ['`println!("Hello, World!");`'],
        cases: [{ input: '', expected: 'Hello, World!\n' }] },
      { title: 'Hello, you', brief: 'Read a name from the first line, and print `Hello, <name>!`. This replaces step 1. Ignore spaces around the name.', hints: ['`let mut name = String::new(); std::io::stdin().read_line(&mut name).unwrap();`', 'Then `println!("Hello, {}!", name.trim());`'],
        cases: [{ input: 'Ada\n', expected: 'Hello, Ada!\n' }, { input: 'Chewie\n', expected: 'Hello, Chewie!\n' }] },
      { title: 'Add them up', brief: 'Now read all the input. The first number is a count n, then come n whole numbers. Print their total, and nothing else.', hints: ['Read everything: `let mut text = String::new(); std::io::Read::read_to_string(&mut std::io::stdin(), &mut text).unwrap();`', '`let mut nums = text.split_whitespace().map(|w| w.parse::<i64>().unwrap());` then `let n = nums.next().unwrap();`'],
        cases: [{ input: '3\n1 2 3\n', expected: '6\n' }, { input: '4\n-5 10\n20 -5\n', expected: '20\n' }, { input: '0\n', expected: '0\n' }] },
    ],
    solutions: [
      String.raw`fn main() {
    println!("Hello, World!");
}
`,
      String.raw`fn main() {
    let mut name = String::new();
    std::io::stdin().read_line(&mut name).unwrap();
    println!("Hello, {}!", name.trim());
}
`,
      String.raw`use std::io::Read;

fn main() {
    let mut text = String::new();
    std::io::stdin().read_to_string(&mut text).unwrap();
    let mut nums = text.split_whitespace().map(|w| w.parse::<i64>().unwrap());
    let n = nums.next().unwrap_or(0);
    let total: i64 = nums.take(n as usize).sum();
    println!("{total}");
}
`,
    ],
  },
  // ================================================================== Security lab, the Rust side
  {
    id: 'rs-safe-by-default', lang: 'rust', kind: 'functions', track: 'Security lab', topic: 'Rust: safe by default', file: 'safe.rs',
    title: 'Safe by default (Rust)',
    intro: 'The C security exercises show buffer overflows and numbers that wrap around. Rust checks both. Reading past the end of a Vec stops the program with a panic, instead of reading other memory. These steps show the calm way: ask first, and handle "no" yourself.',
    starter: String.raw`fn get_or_zero(v: &[i32], i: usize) -> i32 {
    todo!() // step 1: v[i] would panic when i is too big
}

fn add_fuel(tank: u8, more: u8) -> Option<u8> {
    todo!() // step 2: tank + more would panic when it's over 255
}

fn copy_name(dst: &mut [u8; 8], src: &str) -> usize {
    todo!() // step 3
}
`,
    steps: [
      { title: 'get_or_zero', brief: 'Return `v[i]`, or 0 if `i` is past the end. Use `v.get(i)`, which gives `None` instead of panicking.', hints: ['`v.get(i)` is an `Option<&i32>`.', '`v.get(i).copied().unwrap_or(0)`'],
        test: String.raw`let v = [10, 20, 30];
assert_eq!(get_or_zero(&v, 1), 20, "get_or_zero(&[10, 20, 30], 1)");
assert_eq!(get_or_zero(&v, 3), 0, "get_or_zero(&[10, 20, 30], 3)");
assert_eq!(get_or_zero(&v, usize::MAX), 0, "get_or_zero(&[10, 20, 30], usize::MAX)");` },
      { title: 'add_fuel', brief: 'Add the two amounts. A `u8` holds 0 to 255. If the total won\'t fit, return `None`, instead of letting it wrap around like C would.', hints: ['`tank.checked_add(more)` does exactly this.'],
        test: String.raw`assert_eq!(add_fuel(200, 50), Some(250), "add_fuel(200, 50)");
assert_eq!(add_fuel(250, 10), None, "add_fuel(250, 10)");
assert_eq!(add_fuel(255, 0), Some(255), "add_fuel(255, 0)");` },
      { title: 'copy_name', brief: 'Copy the name\'s bytes into the 8-byte array, like the C strcpy exercise. Copy at most 8 bytes, and return how many you copied. A longer name is cut short, never overflowed.', hints: ['`let n = src.len().min(dst.len());`', '`dst[..n].copy_from_slice(&src.as_bytes()[..n]);` then return `n`.'],
        test: String.raw`let mut buf = [0u8; 8];
assert_eq!(copy_name(&mut buf, "Han"), 3, "copy_name(&mut buf, \"Han\")");
assert_eq!(&buf[..3], b"Han", "the first 3 bytes");
let mut buf2 = [0u8; 8];
assert_eq!(copy_name(&mut buf2, "Millennium Falcon"), 8, "copy_name(&mut buf, \"Millennium Falcon\")");
assert_eq!(&buf2, b"Millenni", "all 8 bytes");` },
      { title: 'Why it matters', type: 'reflect', brief: 'In your own words: in the C version of this lab, a long name could overwrite other data. What would happen if you wrote the same mistake in Rust, like indexing past the end of the array?',
        answer: 'Rust checks every index while the program runs. Writing past the end of the array doesn\'t touch the memory next to it. Instead, the program stops with a panic that names the line. A crash that you can see and fix is much safer than quietly overwriting other data, which is what an attacker needs. Methods like get, checked_add and min let you handle the "too big" case yourself, so the program doesn\'t stop at all.' },
    ],
    solution: String.raw`fn get_or_zero(v: &[i32], i: usize) -> i32 {
    v.get(i).copied().unwrap_or(0)
}

fn add_fuel(tank: u8, more: u8) -> Option<u8> {
    tank.checked_add(more)
}

fn copy_name(dst: &mut [u8; 8], src: &str) -> usize {
    let n = src.len().min(dst.len());
    dst[..n].copy_from_slice(&src.as_bytes()[..n]);
    n
}
`,
  },
];
