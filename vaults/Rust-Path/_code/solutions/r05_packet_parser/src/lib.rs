//! R05 Packet Parser: the finished version.
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
        match self {
            ParseError::TooShort => write!(f, "too short to be a packet"),
            ParseError::BadMagic => write!(f, "not a packet (wrong magic bytes)"),
            ParseError::BadVersion(v) => write!(f, "version {v} isn't supported"),
            ParseError::UnknownKind(k) => write!(f, "unknown kind {k}"),
            ParseError::LengthMismatch { declared, actual } => write!(f, "says {declared} payload bytes, has {actual}"),
            ParseError::BadChecksum { expected, got } => write!(f, "checksum {got}, should be {expected}"),
            ParseError::BadUtf8 => write!(f, "the text isn't UTF-8"),
            ParseError::BadPayload => write!(f, "the payload doesn't fit its kind"),
            ParseError::TooLong => write!(f, "the payload is over 65535 bytes"),
        }
    }
}

impl std::error::Error for ParseError {}

/// Every byte added up, wrapping at 256
pub fn checksum(payload: &[u8]) -> u8 {
    payload.iter().fold(0u8, |sum, &b| sum.wrapping_add(b))
}

pub fn parse(bytes: &[u8]) -> Result<Packet, ParseError> {
    if bytes.len() < HEADER + 1 {
        return Err(ParseError::TooShort);
    }
    if bytes[0..2] != MAGIC {
        return Err(ParseError::BadMagic);
    }
    if bytes[2] != VERSION {
        return Err(ParseError::BadVersion(bytes[2]));
    }
    let kind = bytes[3];
    let declared = u16::from_be_bytes([bytes[4], bytes[5]]) as usize;
    // everything between the header and the checksum byte
    let actual = bytes.len() - HEADER - 1;
    if declared != actual {
        return Err(ParseError::LengthMismatch { declared, actual });
    }
    let payload = &bytes[HEADER..HEADER + declared];
    let got = bytes[bytes.len() - 1];
    let expected = checksum(payload);
    if got != expected {
        return Err(ParseError::BadChecksum { expected, got });
    }
    match kind {
        0 if payload.is_empty() => Ok(Packet::Ping),
        0 => Err(ParseError::BadPayload),
        1 => String::from_utf8(payload.to_vec()).map(Packet::Text).map_err(|_| ParseError::BadUtf8),
        2 => {
            if !payload.len().is_multiple_of(4) {
                return Err(ParseError::BadPayload);
            }
            let nums = payload
                .chunks_exact(4)
                .map(|c| u32::from_be_bytes([c[0], c[1], c[2], c[3]]))
                .collect();
            Ok(Packet::Numbers(nums))
        }
        k => Err(ParseError::UnknownKind(k)),
    }
}

pub fn encode(packet: &Packet) -> Result<Vec<u8>, ParseError> {
    let (kind, payload): (u8, Vec<u8>) = match packet {
        Packet::Ping => (0, Vec::new()),
        Packet::Text(s) => (1, s.as_bytes().to_vec()),
        Packet::Numbers(v) => (2, v.iter().flat_map(|n| n.to_be_bytes()).collect()),
    };
    let len = u16::try_from(payload.len()).map_err(|_| ParseError::TooLong)?;
    let mut out = Vec::with_capacity(HEADER + payload.len() + 1);
    out.extend_from_slice(&MAGIC);
    out.push(VERSION);
    out.push(kind);
    out.extend_from_slice(&len.to_be_bytes());
    out.extend_from_slice(&payload);
    out.push(checksum(&payload));
    Ok(out)
}
