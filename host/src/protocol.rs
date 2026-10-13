// PocketPad Binary Protocol Parser & Serializer

pub const PROTOCOL_MAGIC: u8 = 0x50; // 'P'
pub const PROTOCOL_VERSION: u8 = 0x01;

pub const PACKET_TYPE_INPUT: u8 = 0x01;
pub const PACKET_TYPE_PING: u8 = 0x02;
pub const PACKET_TYPE_PONG: u8 = 0x03;
pub const PACKET_TYPE_RUMBLE: u8 = 0x04;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RawInputPacket {
    pub sequence: u32,
    pub buttons: u16,
    pub left_trigger: u8,
    pub right_trigger: u8,
    pub thumb_lx: i16,
    pub thumb_ly: i16,
    pub thumb_rx: i16,
    pub thumb_ry: i16,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Packet {
    Input(RawInputPacket),
    Ping(u32),
    Pong(u32),
    Rumble { large_motor: u8, small_motor: u8 },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProtocolError {
    TooShort { expected: usize, actual: usize },
    UnexpectedLength { expected: usize, actual: usize },
    InvalidMagic(u8),
    UnsupportedVersion(u8),
    UnknownPacketType(u8),
}

impl std::fmt::Display for ProtocolError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::TooShort { expected, actual } => {
                write!(
                    f,
                    "Packet too short: expected {expected} bytes, got {actual}"
                )
            }
            Self::UnexpectedLength { expected, actual } => {
                write!(
                    f,
                    "Invalid packet length: expected {expected} bytes, got {actual}"
                )
            }
            Self::InvalidMagic(m) => write!(f, "Invalid protocol magic: 0x{m:02x} (expected 0x50)"),
            Self::UnsupportedVersion(v) => {
                write!(
                    f,
                    "Unsupported protocol version: {v} (expected {PROTOCOL_VERSION})"
                )
            }
            Self::UnknownPacketType(t) => write!(f, "Unknown packet type: 0x{t:02x}"),
        }
    }
}

impl std::error::Error for ProtocolError {}

pub struct Protocol;

impl Protocol {
    /// Decodes a binary packet from slice
    pub fn decode(bytes: &[u8]) -> Result<Packet, ProtocolError> {
        if bytes.len() < 3 {
            return Err(ProtocolError::TooShort {
                expected: 3,
                actual: bytes.len(),
            });
        }

        let magic = bytes[0];
        if magic != PROTOCOL_MAGIC {
            return Err(ProtocolError::InvalidMagic(magic));
        }

        let version = bytes[1];
        if version != PROTOCOL_VERSION {
            return Err(ProtocolError::UnsupportedVersion(version));
        }

        let packet_type = bytes[2];
        match packet_type {
            PACKET_TYPE_INPUT => {
                if bytes.len() < 19 {
                    return Err(ProtocolError::TooShort {
                        expected: 19,
                        actual: bytes.len(),
                    });
                }
                if bytes.len() != 19 {
                    return Err(ProtocolError::UnexpectedLength {
                        expected: 19,
                        actual: bytes.len(),
                    });
                }

                let sequence = u32::from_le_bytes([bytes[3], bytes[4], bytes[5], bytes[6]]);
                let buttons = u16::from_le_bytes([bytes[7], bytes[8]]);
                let left_trigger = bytes[9];
                let right_trigger = bytes[10];
                let thumb_lx = i16::from_le_bytes([bytes[11], bytes[12]]);
                let thumb_ly = i16::from_le_bytes([bytes[13], bytes[14]]);
                let thumb_rx = i16::from_le_bytes([bytes[15], bytes[16]]);
                let thumb_ry = i16::from_le_bytes([bytes[17], bytes[18]]);

                Ok(Packet::Input(RawInputPacket {
                    sequence,
                    buttons,
                    left_trigger,
                    right_trigger,
                    thumb_lx,
                    thumb_ly,
                    thumb_rx,
                    thumb_ry,
                }))
            }
            PACKET_TYPE_PING => {
                if bytes.len() < 7 {
                    return Err(ProtocolError::TooShort {
                        expected: 7,
                        actual: bytes.len(),
                    });
                }
                if bytes.len() != 7 {
                    return Err(ProtocolError::UnexpectedLength {
                        expected: 7,
                        actual: bytes.len(),
                    });
                }
                let timestamp = u32::from_le_bytes([bytes[3], bytes[4], bytes[5], bytes[6]]);
                Ok(Packet::Ping(timestamp))
            }
            PACKET_TYPE_PONG => {
                if bytes.len() < 7 {
                    return Err(ProtocolError::TooShort {
                        expected: 7,
                        actual: bytes.len(),
                    });
                }
                if bytes.len() != 7 {
                    return Err(ProtocolError::UnexpectedLength {
                        expected: 7,
                        actual: bytes.len(),
                    });
                }
                let timestamp = u32::from_le_bytes([bytes[3], bytes[4], bytes[5], bytes[6]]);
                Ok(Packet::Pong(timestamp))
            }
            PACKET_TYPE_RUMBLE => {
                if bytes.len() < 5 {
                    return Err(ProtocolError::TooShort {
                        expected: 5,
                        actual: bytes.len(),
                    });
                }
                if bytes.len() != 5 {
                    return Err(ProtocolError::UnexpectedLength {
                        expected: 5,
                        actual: bytes.len(),
                    });
                }
                Ok(Packet::Rumble {
                    large_motor: bytes[3],
                    small_motor: bytes[4],
                })
            }
            other => Err(ProtocolError::UnknownPacketType(other)),
        }
    }

    /// Encodes a ping packet into a 7-byte buffer (server keepalive).
    pub fn encode_ping(timestamp: u32) -> [u8; 7] {
        let ts_bytes = timestamp.to_le_bytes();
        [
            PROTOCOL_MAGIC,
            PROTOCOL_VERSION,
            PACKET_TYPE_PING,
            ts_bytes[0],
            ts_bytes[1],
            ts_bytes[2],
            ts_bytes[3],
        ]
    }

    /// Encodes a pong response packet into a 7-byte buffer
    pub fn encode_pong(timestamp: u32) -> [u8; 7] {
        let ts_bytes = timestamp.to_le_bytes();
        [
            PROTOCOL_MAGIC,
            PROTOCOL_VERSION,
            PACKET_TYPE_PONG,
            ts_bytes[0],
            ts_bytes[1],
            ts_bytes[2],
            ts_bytes[3],
        ]
    }

    /// Encodes a rumble packet into a 5-byte buffer
    pub fn encode_rumble(large_motor: u8, small_motor: u8) -> [u8; 5] {
        [
            PROTOCOL_MAGIC,
            PROTOCOL_VERSION,
            PACKET_TYPE_RUMBLE,
            large_motor,
            small_motor,
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_decode_valid_input_packet() {
        let mut buf = [0u8; 19];
        buf[0] = PROTOCOL_MAGIC;
        buf[1] = PROTOCOL_VERSION;
        buf[2] = PACKET_TYPE_INPUT;

        // Sequence = 42
        buf[3..7].copy_from_slice(&42u32.to_le_bytes());
        // Buttons = 0x1000 (A button)
        buf[7..9].copy_from_slice(&0x1000u16.to_le_bytes());
        // Left trigger = 128, Right trigger = 255
        buf[9] = 128;
        buf[10] = 255;
        // Sticks
        buf[11..13].copy_from_slice(&(-10000i16).to_le_bytes());
        buf[13..15].copy_from_slice(&20000i16.to_le_bytes());
        buf[15..17].copy_from_slice(&32767i16.to_le_bytes());
        buf[17..19].copy_from_slice(&(-32768i16).to_le_bytes());

        let res = Protocol::decode(&buf).expect("Should decode successfully");
        match res {
            Packet::Input(input) => {
                assert_eq!(input.sequence, 42);
                assert_eq!(input.buttons, 0x1000);
                assert_eq!(input.left_trigger, 128);
                assert_eq!(input.right_trigger, 255);
                assert_eq!(input.thumb_lx, -10000);
                assert_eq!(input.thumb_ly, 20000);
                assert_eq!(input.thumb_rx, 32767);
                assert_eq!(input.thumb_ry, -32768);
            }
            _ => panic!("Expected Input packet"),
        }
    }

    #[test]
    fn test_decode_ping_and_pong() {
        let ping_buf = [
            PROTOCOL_MAGIC,
            PROTOCOL_VERSION,
            PACKET_TYPE_PING,
            0xef,
            0xbe,
            0xad,
            0xde, // 0xdeadbeef
        ];
        let packet = Protocol::decode(&ping_buf).unwrap();
        assert_eq!(packet, Packet::Ping(0xdeadbeef));

        let pong_bytes = Protocol::encode_pong(0xdeadbeef);
        let decoded_pong = Protocol::decode(&pong_bytes).unwrap();
        assert_eq!(decoded_pong, Packet::Pong(0xdeadbeef));
    }

    #[test]
    fn test_encode_ping_round_trip() {
        let ping_bytes = Protocol::encode_ping(123456);
        assert_eq!(ping_bytes.len(), 7);
        let decoded = Protocol::decode(&ping_bytes).unwrap();
        assert_eq!(decoded, Packet::Ping(123456));
    }

    #[test]
    fn test_encode_decode_rumble() {
        let rumble_bytes = Protocol::encode_rumble(210, 85);
        assert_eq!(rumble_bytes.len(), 5);
        let decoded = Protocol::decode(&rumble_bytes).unwrap();
        assert_eq!(
            decoded,
            Packet::Rumble {
                large_motor: 210,
                small_motor: 85,
            }
        );
    }

    #[test]
    fn test_reject_short_slice() {
        let short = [PROTOCOL_MAGIC, PROTOCOL_VERSION];
        assert!(matches!(
            Protocol::decode(&short),
            Err(ProtocolError::TooShort { .. })
        ));

        let short_input = [PROTOCOL_MAGIC, PROTOCOL_VERSION, PACKET_TYPE_INPUT, 1, 2, 3];
        assert!(matches!(
            Protocol::decode(&short_input),
            Err(ProtocolError::TooShort {
                expected: 19,
                actual: 6
            })
        ));
    }

    #[test]
    fn test_reject_invalid_magic() {
        let bad_magic = [0x99, PROTOCOL_VERSION, PACKET_TYPE_INPUT];
        assert!(matches!(
            Protocol::decode(&bad_magic),
            Err(ProtocolError::InvalidMagic(0x99))
        ));
    }

    #[test]
    fn test_reject_unsupported_version() {
        let bad_version = [PROTOCOL_MAGIC, 0x99, PACKET_TYPE_INPUT];
        assert!(matches!(
            Protocol::decode(&bad_version),
            Err(ProtocolError::UnsupportedVersion(0x99))
        ));
    }

    #[test]
    fn test_reject_trailing_bytes() {
        let mut input = [0u8; 20];
        input[0] = PROTOCOL_MAGIC;
        input[1] = PROTOCOL_VERSION;
        input[2] = PACKET_TYPE_INPUT;
        assert!(matches!(
            Protocol::decode(&input),
            Err(ProtocolError::UnexpectedLength {
                expected: 19,
                actual: 20
            })
        ));
    }
}
