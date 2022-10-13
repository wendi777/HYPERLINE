use std::error::Error;
use std::fmt::{Debug, Display, Formatter};
use std::{alloc, mem};

use crunchy::unroll;

const TO_HEX_CHARS: &[u8; 16] = b"0123456789abcdef";
const FROM_HEX_CHARS: [u8; 256] = [
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
];

pub const fn is_h160<const S: usize>(data: &[u8; S]) -> bool {
    assert!(S <= 32);
    if S <= 20 {
        true
    } else {
        let mut z = data[0];

        if S >= 22 {
            z |= data[1];
        }
        if S >= 23 {
            z |= data[2];
        }
        if S >= 24 {
            z |= data[3];
        }
        if S >= 25 {
            z |= data[4];
        }
        if S >= 26 {
            z |= data[5];
        }
        if S >= 27 {
            z |= data[6];
        }
        if S >= 28 {
            z |= data[7];
        }
        if S >= 29 {
            z |= data[8];
        }
        if S >= 30 {
            z |= data[9];
        }
        if S >= 31 {
            z |= data[10];
        }
        if S == 32 {
            z |= data[11];
        }

        z == 0
    }
}

pub fn format_h160_raw(data: &[u8; 20]) -> String {
    unsafe {
        let encoded: *mut u8 =
            alloc::alloc(alloc::Layout::from_size_align(40, 1).unwrap_unchecked());
        unroll! {
            for i in 0..20 {
                let byte = data[i] as usize;
                *encoded.offset(i as isize * 2) = TO_HEX_CHARS[byte >> 4];
                *encoded.offset(i as isize * 2 + 1) = TO_HEX_CHARS[byte & 0x0F];
            }
        }

        String::from_raw_parts(encoded, 40, 40)
    }
}

pub fn format_h256_raw(data: &[u8; 32]) -> String {
    unsafe {
        let encoded: *mut u8 =
            alloc::alloc(alloc::Layout::from_size_align(64, 1).unwrap_unchecked());
        unroll! {
            for i in 0..32 {
                let byte = data[i] as usize;
                *encoded.offset(i as isize * 2) = TO_HEX_CHARS[byte >> 4];
                *encoded.offset(i as isize * 2 + 1) = TO_HEX_CHARS[byte & 0x0F];
            }
        }

        String::from_raw_parts(encoded, 64, 64)
    }
}

pub const fn parse_h256_raw<const L: usize>(
    data: &[u8; L],
) -> Result<[u8; 32], InvalidHexCharacter> {
    unsafe {
        let mut decoded: [u8; 32] = mem::transmute::<[mem::MaybeUninit<u8>; 32], [u8; 32]>(
            [mem::MaybeUninit::uninit(); 32],
        );
        let offset = 32 - L / 2;
        unroll! {
            for i in 0..32 {
                if i * 2 + 1 < L {
                    let a = FROM_HEX_CHARS[data[i * 2] as usize];
                    if a == 0xff {
                        return Err(InvalidHexCharacter {
                            value: data[i * 2],
                            index: i * 2,
                        });
                    }
                    let b = FROM_HEX_CHARS[data[i * 2 + 1] as usize];
                    if b == 0xff {
                        return Err(InvalidHexCharacter {
                            value: data[i * 2 + 1],
                            index: i * 2 + 1,
                        });
                    }
                    decoded[offset + i] = (a << 4) | b;
                }
            }
        }
        Ok(decoded)
    }
}

pub struct InvalidHexCharacter {
    pub value: u8,
    pub index: usize,
}

impl Debug for InvalidHexCharacter {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        Display::fmt(self, f)
    }
}

impl Display for InvalidHexCharacter {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "Invalid character '{}' at index {}",
            self.value as char, self.index
        )
    }
}

impl Error for InvalidHexCharacter {}

#[cfg(test)]
mod test {
    #[test]
    fn is_h160() {
        let v: [u8; 32] = [
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xfa, 0xd1,
            0xc9, 0x44, 0x69, 0x70, 0x08, 0x33, 0x71, 0x7f, 0xa8, 0xa3, 0x01, 0x72, 0x78, 0xbc,
            0x1c, 0xa8, 0x03, 0x1c,
        ];
        assert!(super::is_h160(&v));

        let v: [u8; 32] = [
            0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xfa, 0xd1,
            0xc9, 0x44, 0x69, 0x70, 0x08, 0x33, 0x71, 0x7f, 0xa8, 0xa3, 0x01, 0x72, 0x78, 0xbc,
            0x1c, 0xa8, 0x03, 0x1c,
        ];
        assert!(!super::is_h160(&v));
    }

    #[test]
    fn format_h160() {
        let v: [u8; 20] = [
            0xfa, 0xd1, 0xc9, 0x44, 0x69, 0x70, 0x08, 0x33, 0x71, 0x7f, 0xa8, 0xa3, 0x01, 0x72,
            0x78, 0xbc, 0x1c, 0xa8, 0x03, 0x1c,
        ];
        let s = super::format_h160_raw(&v);
        assert_eq!(&s, "fad1c94469700833717fa8a3017278bc1ca8031c");
    }

    #[test]
    fn format_h256() {
        let v: [u8; 32] = [
            0x00, 0x56, 0xfa, 0xd1, 0xc9, 0x44, 0x69, 0x70, 0x08, 0x33, 0x71, 0x7f, 0xa8, 0xa3,
            0x01, 0x72, 0x78, 0xbc, 0x1c, 0xa8, 0x03, 0x1c, 0xab, 0x01, 0x30, 0x74, 0x4a, 0x44,
            0xaa, 0x43, 0x00, 0x00,
        ];
        let s = super::format_h256_raw(&v);
        assert_eq!(
            &s,
            "0056fad1c94469700833717fa8a3017278bc1ca8031cab0130744a44aa430000"
        )
    }

    #[test]
    fn parse_h256() {
        assert_eq!(
            super::parse_h256_raw::<64>(
                b"0056Fad1c94469700833717fa8a3017278Bc1ca8031CAB0130744a44aa430000"
            )
            .unwrap(),
            [
                0x00, 0x56, 0xfa, 0xd1, 0xc9, 0x44, 0x69, 0x70, 0x08, 0x33, 0x71, 0x7f, 0xa8, 0xa3,
                0x01, 0x72, 0x78, 0xbc, 0x1c, 0xa8, 0x03, 0x1c, 0xab, 0x01, 0x30, 0x74, 0x4a, 0x44,
                0xaa, 0x43, 0x00, 0x00,
            ]
        );

        assert_eq!(
            super::parse_h256_raw::<40>(b"fad1c94469700833717fa8a3017278bc1ca8031c").unwrap(),
            [
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xfa, 0xd1,
                0xc9, 0x44, 0x69, 0x70, 0x08, 0x33, 0x71, 0x7f, 0xa8, 0xa3, 0x01, 0x72, 0x78, 0xbc,
                0x1c, 0xa8, 0x03, 0x1c,
            ]
        )
    }

    #[test]
    fn parse_h256_err() {
        let res = super::parse_h256_raw(
            b"005xfad1c94469700833717fa8a3017278bc1ca8031cab0130744a44aa430000",
        );
        assert!(matches!(
            res.unwrap_err(),
            super::InvalidHexCharacter {
                value: 120,
                index: 3
            }
        ))
    }
}
