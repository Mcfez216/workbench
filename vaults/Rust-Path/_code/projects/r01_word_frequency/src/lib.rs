//! R01 Word Frequency. The note "R01 Word Frequency" in the vault says what
//! each function must do. The tests in tests/r01_word_frequency.rs check it:
//! ▶ in the Tests sidebar runs them. Replace each todo!() with your code.
//!
//! Delete this line once every function is written: it hides the warnings
//! about parameters you haven't used yet.
#![allow(unused_variables)]

use std::collections::HashMap;

/// The words in `text`, lowercased, in order. A word is letters, digits and
/// apostrophes inside a word ("don't"); everything else separates words.
pub fn words(text: &str) -> Vec<String> {
    todo!("split the text into lowercase words")
}

/// How many times each word appears.
pub fn count(text: &str) -> HashMap<String, usize> {
    todo!("count the words: HashMap's entry API helps")
}

/// The `n` most common words, most common first. Words with the same count
/// come in alphabetical order, so the answer is always the same.
pub fn top(text: &str, n: usize) -> Vec<(String, usize)> {
    todo!("sort the counts")
}

/// One line per word: the word, then its count, lined up, e.g.
/// "the    3". The word column is as wide as the longest word shown.
pub fn report(text: &str, n: usize) -> String {
    todo!("format the top words")
}
