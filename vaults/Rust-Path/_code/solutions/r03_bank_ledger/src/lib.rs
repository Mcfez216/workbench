//! R03 Bank Ledger: the finished version.
//!
//! Money is a whole number of pence (u64), never a float: 0.1 + 0.2 isn't
//! 0.3 in floating point, and a bank can't lose a penny.

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
        match self {
            LedgerError::AlreadyExists(n) => write!(f, "there's already an account called {n}"),
            LedgerError::NoSuchAccount(n) => write!(f, "there's no account called {n}"),
            LedgerError::ZeroAmount => write!(f, "the amount must be more than zero"),
            LedgerError::Insufficient { needed, available } => {
                write!(f, "not enough money: needed {}, only {} there", pounds(*needed), pounds(*available))
            }
            LedgerError::Overflow => write!(f, "that's more money than the ledger can count"),
            LedgerError::SameAccount => write!(f, "can't transfer from an account to itself"),
        }
    }
}

impl std::error::Error for LedgerError {}

/// 1234 pence as "£12.34"
pub fn pounds(pence: u64) -> String {
    format!("£{}.{:02}", pence / 100, pence % 100)
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
        if self.accounts.contains_key(name) {
            return Err(LedgerError::AlreadyExists(name.to_string()));
        }
        self.accounts.insert(name.to_string(), Account::default());
        Ok(())
    }

    fn account(&self, name: &str) -> Result<&Account, LedgerError> {
        self.accounts.get(name).ok_or_else(|| LedgerError::NoSuchAccount(name.to_string()))
    }

    fn account_mut(&mut self, name: &str) -> Result<&mut Account, LedgerError> {
        self.accounts.get_mut(name).ok_or_else(|| LedgerError::NoSuchAccount(name.to_string()))
    }

    pub fn balance(&self, name: &str) -> Result<u64, LedgerError> {
        Ok(self.account(name)?.balance)
    }

    pub fn deposit(&mut self, name: &str, amount: u64) -> Result<u64, LedgerError> {
        if amount == 0 {
            return Err(LedgerError::ZeroAmount);
        }
        let a = self.account_mut(name)?;
        a.balance = a.balance.checked_add(amount).ok_or(LedgerError::Overflow)?;
        a.history.push(Entry::Deposit(amount));
        Ok(a.balance)
    }

    pub fn withdraw(&mut self, name: &str, amount: u64) -> Result<u64, LedgerError> {
        if amount == 0 {
            return Err(LedgerError::ZeroAmount);
        }
        let a = self.account_mut(name)?;
        a.balance = a
            .balance
            .checked_sub(amount)
            .ok_or(LedgerError::Insufficient { needed: amount, available: a.balance })?;
        a.history.push(Entry::Withdrawal(amount));
        Ok(a.balance)
    }

    /// Moves money between two accounts. All or nothing: if anything is
    /// wrong, neither account changes.
    pub fn transfer(&mut self, from: &str, to: &str, amount: u64) -> Result<(), LedgerError> {
        if amount == 0 {
            return Err(LedgerError::ZeroAmount);
        }
        if from == to {
            return Err(LedgerError::SameAccount);
        }
        // check everything first, change things after
        let have = self.balance(from)?;
        let theirs = self.balance(to)?;
        let left = have.checked_sub(amount).ok_or(LedgerError::Insufficient { needed: amount, available: have })?;
        let now = theirs.checked_add(amount).ok_or(LedgerError::Overflow)?;
        let a = self.account_mut(from)?;
        a.balance = left;
        a.history.push(Entry::TransferOut { to: to.to_string(), amount });
        let b = self.account_mut(to)?;
        b.balance = now;
        b.history.push(Entry::TransferIn { from: from.to_string(), amount });
        Ok(())
    }

    /// Everything that happened to an account, oldest first
    pub fn history(&self, name: &str) -> Result<&[Entry], LedgerError> {
        Ok(&self.account(name)?.history)
    }

    /// All the money in the bank. u128, so it can't overflow.
    pub fn total(&self) -> u128 {
        self.accounts.values().map(|a| a.balance as u128).sum()
    }
}
