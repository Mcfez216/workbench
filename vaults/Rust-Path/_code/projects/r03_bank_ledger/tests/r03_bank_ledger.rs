//! R03's tests. Work through them from the top.

use r03_bank_ledger::{pounds, Entry, Ledger, LedgerError};

fn bank() -> Ledger {
    let mut l = Ledger::new();
    l.open("ana").unwrap();
    l.open("ben").unwrap();
    l
}

#[test]
fn pence_show_as_pounds() {
    assert_eq!(pounds(1234), "£12.34");
    assert_eq!(pounds(5), "£0.05");
    assert_eq!(pounds(100), "£1.00");
}

#[test]
fn new_accounts_start_empty_and_names_are_unique() {
    let mut l = bank();
    assert_eq!(l.balance("ana"), Ok(0));
    assert_eq!(l.open("ana"), Err(LedgerError::AlreadyExists("ana".into())));
    assert_eq!(l.balance("zed"), Err(LedgerError::NoSuchAccount("zed".into())));
}

#[test]
fn deposit_adds_and_returns_the_balance() {
    let mut l = bank();
    assert_eq!(l.deposit("ana", 500), Ok(500));
    assert_eq!(l.deposit("ana", 250), Ok(750));
    assert_eq!(l.deposit("ana", 0), Err(LedgerError::ZeroAmount));
    assert_eq!(l.deposit("zed", 1), Err(LedgerError::NoSuchAccount("zed".into())));
}

#[test]
fn withdraw_cant_go_below_zero() {
    let mut l = bank();
    l.deposit("ana", 500).unwrap();
    assert_eq!(l.withdraw("ana", 200), Ok(300));
    assert_eq!(l.withdraw("ana", 301), Err(LedgerError::Insufficient { needed: 301, available: 300 }));
    assert_eq!(l.balance("ana"), Ok(300), "a failed withdrawal changes nothing");
}

#[test]
fn transfer_moves_money() {
    let mut l = bank();
    l.deposit("ana", 1000).unwrap();
    l.transfer("ana", "ben", 400).unwrap();
    assert_eq!(l.balance("ana"), Ok(600));
    assert_eq!(l.balance("ben"), Ok(400));
    assert_eq!(l.total(), 1000, "a transfer doesn't make or lose money");
}

#[test]
fn transfer_is_all_or_nothing() {
    let mut l = bank();
    l.deposit("ana", 100).unwrap();
    assert_eq!(l.transfer("ana", "ben", 101), Err(LedgerError::Insufficient { needed: 101, available: 100 }));
    assert_eq!(l.transfer("ana", "zed", 50), Err(LedgerError::NoSuchAccount("zed".into())));
    assert_eq!(l.transfer("ana", "ana", 50), Err(LedgerError::SameAccount));
    assert_eq!(l.balance("ana"), Ok(100));
    assert_eq!(l.balance("ben"), Ok(0));
    assert_eq!(l.history("ana").unwrap().len(), 1, "only the deposit");
}

#[test]
fn history_is_kept_in_order() {
    let mut l = bank();
    l.deposit("ana", 1000).unwrap();
    l.withdraw("ana", 100).unwrap();
    l.transfer("ana", "ben", 300).unwrap();
    assert_eq!(
        l.history("ana").unwrap(),
        [Entry::Deposit(1000), Entry::Withdrawal(100), Entry::TransferOut { to: "ben".into(), amount: 300 }]
    );
    assert_eq!(l.history("ben").unwrap(), [Entry::TransferIn { from: "ana".into(), amount: 300 }]);
}

#[test]
fn errors_have_messages() {
    let e = LedgerError::Insufficient { needed: 1050, available: 999 };
    assert_eq!(e.to_string(), "not enough money: needed £10.50, only £9.99 there");
    assert_eq!(LedgerError::NoSuchAccount("zed".into()).to_string(), "there's no account called zed");
    // it's a real error type: it works with ? in a function returning Box<dyn Error>
    let boxed: Box<dyn std::error::Error> = Box::new(LedgerError::ZeroAmount);
    assert_eq!(boxed.to_string(), "the amount must be more than zero");
}

#[test]
fn boss_overflow_never_wraps() {
    // u64::MAX pence is a lot, but adding one more must be an error, not a
    // wrap-around to zero (that's how real money bugs happen)
    let mut l = bank();
    l.deposit("ana", u64::MAX).unwrap();
    assert_eq!(l.deposit("ana", 1), Err(LedgerError::Overflow));
    assert_eq!(l.balance("ana"), Ok(u64::MAX));
    l.deposit("ben", 1).unwrap();
    assert_eq!(l.transfer("ben", "ana", 1), Err(LedgerError::Overflow));
    assert_eq!(l.balance("ben"), Ok(1), "and the failed transfer left ben alone");
    assert_eq!(l.total(), u64::MAX as u128 + 1);
}
