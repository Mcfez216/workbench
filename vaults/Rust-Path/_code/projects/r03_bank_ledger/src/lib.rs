//! R03 Bank Ledger. The note "R03 Bank Ledger" in the vault says what
//! each part must do; tests/r03_bank_ledger.rs checks it (▶ in the Tests
//! sidebar). The types are written for you. Replace each todo!() with code.
//!
//! Money is a whole number of pence (u64), never a float: 0.1 + 0.2 isn't
//! 0.3 in floating point, and a bank can't lose a penny.

// Delete this line once everything is written: it hides the warnings
// about things you haven't used yet.
#![allow(unused_variables, dead_code)]

use std::collections::HashMap;
use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Entry {
    Deposit(u64),
    Withdrawal(u64),
    TransferIn { from: String, amount: u64 },
    TransferOut { to: String, amount: u64 },
}

#[derive(Debug, PartialEq, Eq)]
pub enum LedgerError {
    AlreadyExists(String),
    NoSuchAccount(String),
    ZeroAmount,
    Insufficient { needed: u64, available: u64 },
    /// The balance would be more than a u64 can hold
    Overflow,
    SameAccount,
}

impl fmt::Display for LedgerError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        todo!("a message for each kind of error: match self")
    }
}

impl std::error::Error for LedgerError {}

/// 1234 pence as "£12.34"
pub fn pounds(pence: u64) -> String {
    todo!("1234 pence is £12.34: / and %")
}

#[derive(Debug, Default)]
struct Account {
    balance: u64,
    history: Vec<Entry>,
}

#[derive(Debug, Default)]
pub struct Ledger {
    accounts: HashMap<String, Account>,
}

impl Ledger {
    pub fn new() -> Self {
        Ledger::default()
    }

    pub fn open(&mut self, name: &str) -> Result<(), LedgerError> {
        todo!("add the account, unless the name is taken")
    }

    fn account(&self, name: &str) -> Result<&Account, LedgerError> {
        todo!()
    }

    fn account_mut(&mut self, name: &str) -> Result<&mut Account, LedgerError> {
        todo!()
    }

    pub fn balance(&self, name: &str) -> Result<u64, LedgerError> {
        todo!()
    }

    pub fn deposit(&mut self, name: &str, amount: u64) -> Result<u64, LedgerError> {
        todo!("checked_add stops an overflow")
    }

    pub fn withdraw(&mut self, name: &str, amount: u64) -> Result<u64, LedgerError> {
        todo!("checked_sub tells you if there isn't enough")
    }

    /// Moves money between two accounts. All or nothing: if anything is
    /// wrong, neither account changes.
    pub fn transfer(&mut self, from: &str, to: &str, amount: u64) -> Result<(), LedgerError> {
        todo!("check everything first, then change both accounts")
    }

    /// Everything that happened to an account, oldest first
    pub fn history(&self, name: &str) -> Result<&[Entry], LedgerError> {
        todo!()
    }

    /// All the money in the bank. u128, so it can't overflow.
    pub fn total(&self) -> u128 {
        todo!("u128, so adding every balance can't overflow")
    }
}
