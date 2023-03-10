use sea_orm_migration::prelude::*;

/// Hashes are to be stored as lowercase hex chars without a 0x prefix
#[allow(non_upper_case_globals)]
pub const Hash: ColumnType = ColumnType::String(Some(64));
/// Addresses are to be stored as lowercase hex chars without a 0x prefix
#[allow(non_upper_case_globals)]
pub const Address: ColumnType = ColumnType::String(Some(64));

/// 256-bit integer as base-10 digits: ceil(log_10(2^256))
const SIGNIFICANT_DIGITS_IN_256_BIT_INTEGER: u32 = 78;
/// A type to represent a U256 crypto currency scaled integer value with 2^18
/// scaling
#[allow(non_upper_case_globals)]
pub const Wei: ColumnType = ColumnType::Decimal(Some((SIGNIFICANT_DIGITS_IN_256_BIT_INTEGER, 0)));
