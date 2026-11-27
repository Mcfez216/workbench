//! R01 Word Frequency: the finished version.

use std::collections::HashMap;

/// The words in `text`, lowercased, in order. A word is letters, digits and
/// apostrophes inside a word ("don't"); everything else separates words.
pub fn words(text: &str) -> Vec<String> {
    text.split(|c: char| !(c.is_alphanumeric() || c == '\''))
        .map(|w| w.trim_matches('\''))
        .filter(|w| !w.is_empty())
        .map(str::to_lowercase)
        .collect()
}

/// How many times each word appears.
pub fn count(text: &str) -> HashMap<String, usize> {
    let mut counts = HashMap::new();
    for w in words(text) {
        *counts.entry(w).or_insert(0) += 1;
    }
    counts
}

/// The `n` most common words, most common first. Words with the same count
/// come in alphabetical order, so the answer is always the same.
pub fn top(text: &str, n: usize) -> Vec<(String, usize)> {
    let mut all: Vec<(String, usize)> = count(text).into_iter().collect();
    all.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    all.truncate(n);
    all
}

/// One line per word: the word, then its count, lined up, e.g.
/// "the    3". The word column is as wide as the longest word shown.
pub fn report(text: &str, n: usize) -> String {
    let list = top(text, n);
    let width = list.iter().map(|(w, _)| w.chars().count()).max().unwrap_or(0);
    list.iter()
        .map(|(w, c)| format!("{w:<width$} {c}\n"))
        .collect()
}
