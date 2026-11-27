---
phase: 4
tags: [rust, project, security]
time: 2 hours
---
# R03 Bank Ledger

> [!abstract] Why this matters
> Money code has to be exactly right. You'll keep money in whole pence (never floats), refuse anything that would overflow, and make transfers all-or-nothing. These are the same rules real payment systems follow.

## What you'll build

| Part | Does |
|---|---|
| `pounds(pence)` | `1234` → `"£12.34"` |
| `open(name)` | a new, empty account; a name already used is an error |
| `deposit`, `withdraw` | change the balance, give back the new one. Zero, too little money, or an overflow are errors |
| `transfer(from, to, amount)` | moves money. **All or nothing**: if anything's wrong, neither account changes |
| `history(name)` | everything that happened, oldest first, as `Entry` values |
| `total()` | all the money in the bank, as a `u128` |

## How to start

Tests sidebar → **R03 Bank Ledger** → ▶. Code: `_code/projects/r03_bank_ledger/`.

## Hints

> [!tip]- Hint 1: why u64 pence
> `0.1 + 0.2` is `0.30000000000000004` in floating point. A bank can't round away a penny. Whole numbers of pence are exact.

> [!tip]- Hint 2: checked arithmetic
> `a.checked_add(b)` is `Some(sum)`, or `None` if it would overflow. `checked_sub` is `None` if it would go below zero. `.ok_or(LedgerError::Overflow)?` turns that into your error. See [[6.07 What Rust Protects You From]].

> [!tip]- Hint 3: all or nothing
> Do every check first (both accounts exist, enough money, no overflow), working out both new balances. Only then change anything. If you take money out of `from` and then find `to` doesn't exist, you've lost money.

> [!tip]- Hint 4: borrowing two accounts
> You can't hold `&mut` to two values in one `HashMap` at once. Get the numbers you need with `&self` first, then change one account, let that borrow end, then change the other. See [[2.03 The Borrowing Rules]].

> [!boss] Boss fight
> `boss_overflow_never_wraps`: an account holding `u64::MAX` pence. One more penny must be an error. In C, it would quietly wrap to zero; in Rust's debug builds it panics; in release builds it wraps. Only `checked_add` gets it right every time.

> [!sith] The dark side
> `balance + amount` with plain `+`. It works in every test you'd think of, and fails only for the case an attacker tries first.

## Check yourself

> [!question]- Why does transfer check everything before changing anything?
> So a failure can't leave the ledger half-changed: money taken from one account but never added to the other. Checking first, then changing, makes the operation all-or-nothing.

> [!question]- What does plain + do on a u64 overflow in Rust?
> In a debug build it panics ("attempt to add with overflow"); in a release build it wraps around silently. checked_add, saturating_add or wrapping_add say exactly which you want.

Done? Write a line in [[Rust Done Log]]. Next: [[R04 Route Planner]]
