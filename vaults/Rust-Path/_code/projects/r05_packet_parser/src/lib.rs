//! R05 Packet Parser. The note "R05 Packet Parser" in the vault says what
//! each part must do; tests/r05_packet_parser.rs checks it (▶ in the Tests
//! sidebar). Replace each todo!() with your code.
//!
//! A packet, byte by byte:
//!
//!   0..2   magic: b"MH"
//!   2      version: 1
//!   3      kind: 0 ping, 1 text, 2 numbers
//!   4..6   payload length, big-endian u16
//!   6..    the payload: that many bytes
//!   last   checksum: every payload byte added up, wrapping at 256
//!
//! Payloads: a ping has none; text is UTF-8; numbers are big-endian u32s.
//! The bytes come from outside, so they may be short, long, or lying: every
//! mistake is an Err, never a panic.

// Delete this line once everything is written: it hides the warnings
// about things you haven't used yet.
#![allow(unused_variables, dead_code)]

use std::fmt;

pub const MAGIC: [u8; 2] = *b"MH";
pub const VERSION: u8 = 1;
const HEADER: usize = 6;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Packet {
    Ping,
    Text(String),
    Numbers(Vec<u32>),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ParseError {
    /// Fewer bytes than a header and a checksum
    TooShort,
    BadMagic,
    BadVersion(u8),
    UnknownKind(u8),
    /// The length in the header doesn't match the bytes there are
    LengthMismatch { declared: usize, actual: usize },
    BadChecksum { expected: u8, got: u8 },
    /// Text that isn't UTF-8
    BadUtf8,
    /// A ping with a payload, or numbers that aren't a whole number of u32s
    BadPayload,
    /// encode: more than 65535 payload bytes
    TooLong,
}

impl fmt::Display for ParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        todo!("a message for each kind of error: match self")
    }
}

impl std::error::Error for ParseError {}

/// Every byte added up, wrapping at 256
pub fn checksum(payload: &[u8]) -> u8 {
    todo!("fold with wrapping_add")
}

pub fn parse(bytes: &[u8]) -> Result<Packet, ParseError> {
    todo!("check the length before you index: bytes.get(..) or a length test first")
}

pub fn encode(packet: &Packet) -> Result<Vec<u8>, ParseError> {
    todo!("u16::try_from(len) says if it fits")
}
