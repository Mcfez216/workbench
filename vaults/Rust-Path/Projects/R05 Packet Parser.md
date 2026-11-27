---
phase: 6
tags: [rust, project, security]
time: 2-3 hours
---
# R05 Packet Parser

> [!abstract] Why this matters
> Parsers of untrusted bytes are where security bugs live: Heartbleed was a parser that believed a length field. You'll write one that can't be tricked: every short, long or lying input is an `Err`, never a panic and never a read past the end.

## The format

| Bytes | What |
|---|---|
| 0-1 | `MH` (the "magic": says this is one of ours) |
| 2 | version: `1` |
| 3 | kind: `0` ping, `1` text, `2` numbers |
| 4-5 | payload length, big-endian `u16` |
| 6... | the payload: that many bytes |
| last | checksum: the payload bytes added up, wrapping at 256 |

A ping has no payload. Text is UTF-8. Numbers are big-endian `u32`s, 4 bytes each.

## What you'll build

`checksum(payload)`, `parse(bytes) -> Result<Packet, ParseError>`, `encode(packet) -> Result<Vec<u8>, ParseError>`, and `Display` for `ParseError`.

## How to start

Tests sidebar → **R05 Packet Parser** → ▶. Code: `_code/projects/r05_packet_parser/`. Read [[6.07 What Rust Protects You From]] and [[6.06 Fuzzing Rust]] first.

## Hints

> [!tip]- Hint 1: check the length before you look
> `bytes[3]` on a 2-byte slice panics. Check `bytes.len()` first, once, for the smallest packet there is (6 header bytes and a checksum), then index freely.

> [!tip]- Hint 2: big-endian
> `u16::from_be_bytes([bytes[4], bytes[5]])`. Going the other way, `n.to_be_bytes()`.

> [!tip]- Hint 3: compare the length with what's there
> The payload is everything between the header and the last byte: `bytes.len() - 6 - 1` bytes. If the header says something else, it's `LengthMismatch`, before you slice anything.

> [!tip]- Hint 4: numbers
> `payload.chunks_exact(4)` gives 4-byte pieces. Check `payload.len().is_multiple_of(4)` first, or the leftover bytes are silently dropped.

> [!tip]- Hint 5: too long to encode
> `u16::try_from(payload.len())` is `Err` if the length doesn't fit in 16 bits.

> [!boss] Boss fight
> `boss_bytes_that_lie`: a header claiming 65535 bytes with 2 there, every cut-off piece of a good packet, and 20000 random packets. Nothing may panic. When it passes, try the real thing: `cargo fuzz` from [[6.06 Fuzzing Rust]] on your `parse`.

> [!sith] The dark side
> Trusting the length field. `&bytes[6..6 + declared]` panics in Rust when `declared` is a lie; in C, the same line reads whatever memory comes next and sends it to the attacker.

## Check yourself

> [!question]- Why must a parser check the declared length against the real length before slicing?
> Because the declared length comes from the input, and the input can lie. Slicing with a lying length panics in Rust (a crash an attacker can cause) and, in C, reads memory past the buffer, which is how Heartbleed leaked secrets.

> [!question]- What does chunks_exact(4) do with leftover bytes, and why check first?
> It skips them: they're only available through .remainder(). Without a check that the length is a multiple of 4, a malformed payload would be accepted with its last bytes silently ignored.

Done? Write a line in [[Rust Done Log]]. You've finished the projects: tell someone.
