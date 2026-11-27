//! R01's tests. Work through them from the top: each one is a small step.

use r01_word_frequency::{count, report, top, words};

#[test]
fn splits_on_spaces() {
    assert_eq!(words("the cat sat"), ["the", "cat", "sat"]);
}

#[test]
fn lowercases_every_word() {
    assert_eq!(words("The CAT Sat"), ["the", "cat", "sat"]);
}

#[test]
fn punctuation_separates_words() {
    assert_eq!(words("Hello, world! (Again.)"), ["hello", "world", "again"]);
}

#[test]
fn apostrophes_inside_a_word_stay() {
    assert_eq!(words("Don't 'quote' me"), ["don't", "quote", "me"]);
}

#[test]
fn counts_repeated_words() {
    let c = count("a b a c a b");
    assert_eq!(c["a"], 3);
    assert_eq!(c["b"], 2);
    assert_eq!(c["c"], 1);
    assert_eq!(c.len(), 3);
}

#[test]
fn top_is_most_common_first() {
    assert_eq!(top("b a b c b a", 2), [("b".to_string(), 3), ("a".to_string(), 2)]);
}

#[test]
fn ties_are_alphabetical() {
    assert_eq!(top("pear apple fig", 3), [("apple".to_string(), 1), ("fig".to_string(), 1), ("pear".to_string(), 1)]);
}

#[test]
fn asking_for_more_than_there_are_gives_them_all() {
    assert_eq!(top("one two", 10).len(), 2);
}

#[test]
fn report_lines_up_the_counts() {
    assert_eq!(report("the cat the hat the", 2), "the 3\ncat 1\n");
    assert_eq!(report("elephant a a", 2), "a        2\nelephant 1\n");
}

#[test]
fn boss_empty_and_unicode_input() {
    // empty text, text with no words, and words that aren't ASCII
    assert!(words("").is_empty());
    assert!(count("  ... !!! ").is_empty());
    assert_eq!(top("", 5), []);
    assert_eq!(report("", 5), "");
    assert_eq!(count("Café CAFÉ café")["café"], 3);
    assert_eq!(report("naïve naïve x", 2), "naïve 2\nx     1\n");
}
