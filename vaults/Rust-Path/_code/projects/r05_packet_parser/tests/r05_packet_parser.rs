//! R05's tests. Work through them from the top.

use r05_packet_parser::{checksum, encode, parse, Packet, ParseError};

// "MH", version 1, kind 1 (text), length 2, "hi", checksum 'h' + 'i' = 209
const HI: [u8; 9] = [b'M', b'H', 1, 1, 0, 2, b'h', b'i', 209];

#[test]
fn checksum_adds_up_and_wraps() {
    assert_eq!(checksum(b"hi"), 209);
    assert_eq!(checksum(&[200, 100]), 44);
    assert_eq!(checksum(&[]), 0);
}

#[test]
fn parses_a_text_packet() {
    assert_eq!(parse(&HI), Ok(Packet::Text("hi".into())));
}

#[test]
fn parses_ping_and_numbers() {
    assert_eq!(parse(&[b'M', b'H', 1, 0, 0, 0, 0]), Ok(Packet::Ping));
    let nums = [b'M', b'H', 1, 2, 0, 8, 0, 0, 1, 0, 0, 0, 0, 7, 8];
    assert_eq!(parse(&nums), Ok(Packet::Numbers(vec![256, 7])));
}

#[test]
fn rejects_bad_headers() {
    assert_eq!(parse(&[b'M', b'H', 1]), Err(ParseError::TooShort));
    assert_eq!(parse(&[b'X', b'H', 1, 0, 0, 0, 0]), Err(ParseError::BadMagic));
    assert_eq!(parse(&[b'M', b'H', 9, 0, 0, 0, 0]), Err(ParseError::BadVersion(9)));
    assert_eq!(parse(&[b'M', b'H', 1, 7, 0, 0, 0]), Err(ParseError::UnknownKind(7)));
}

#[test]
fn rejects_bad_payloads() {
    let mut bad = HI;
    bad[8] = 0;
    assert_eq!(parse(&bad), Err(ParseError::BadChecksum { expected: 209, got: 0 }));
    // 0xff alone isn't UTF-8
    assert_eq!(parse(&[b'M', b'H', 1, 1, 0, 1, 0xff, 0xff]), Err(ParseError::BadUtf8));
    // a ping can't carry anything; numbers come in fours
    assert_eq!(parse(&[b'M', b'H', 1, 0, 0, 1, 5, 5]), Err(ParseError::BadPayload));
    assert_eq!(parse(&[b'M', b'H', 1, 2, 0, 3, 1, 1, 1, 3]), Err(ParseError::BadPayload));
}

#[test]
fn encode_is_the_reverse_of_parse() {
    assert_eq!(encode(&Packet::Text("hi".into())).unwrap(), HI);
    for p in [Packet::Ping, Packet::Text("héllo, wörld".into()), Packet::Numbers(vec![0, 1, u32::MAX])] {
        assert_eq!(parse(&encode(&p).unwrap()), Ok(p));
    }
}

#[test]
fn errors_have_messages() {
    assert_eq!(ParseError::LengthMismatch { declared: 10, actual: 3 }.to_string(), "says 10 payload bytes, has 3");
    assert_eq!(ParseError::BadVersion(2).to_string(), "version 2 isn't supported");
}

#[test]
fn boss_bytes_that_lie() {
    // the header promises 65535 bytes; there are 2. A parser that trusts the
    // length reads past the end: in C that's a heartbleed, in Rust a panic.
    // It must be an Err.
    let liar = [b'M', b'H', 1, 1, 0xff, 0xff, b'h', b'i', 209];
    assert_eq!(parse(&liar), Err(ParseError::LengthMismatch { declared: 65535, actual: 2 }));
    // every cut-off piece of a good packet is an Err, never a panic
    let good = encode(&Packet::Numbers(vec![1, 2, 3])).unwrap();
    for n in 0..good.len() {
        assert!(parse(&good[..n]).is_err(), "{n} bytes");
    }
    // too much to fit the u16 length
    assert_eq!(encode(&Packet::Text("x".repeat(65536))), Err(ParseError::TooLong));
    assert!(encode(&Packet::Text("x".repeat(65535))).is_ok());
    // and 20000 random packets, from a tiny random number generator, don't panic
    let mut seed: u32 = 12345;
    let mut next = || { seed = seed.wrapping_mul(1103515245).wrapping_add(12345); (seed >> 16) as u8 };
    for _ in 0..20000 {
        let len = next() as usize % 16;
        let mut bytes: Vec<u8> = (0..len).map(|_| next()).collect();
        if len >= 3 { bytes[0] = b'M'; bytes[1] = b'H'; bytes[2] = 1; }
        let _ = parse(&bytes);
    }
}
