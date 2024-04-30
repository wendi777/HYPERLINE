//! The correct settings shape is defined in the TypeScript SDK metadata. While the the exact shape
//! and validations it defines are not applied here, we should mirror them.
//! ANY CHANGES HERE NEED TO BE REFLECTED IN THE TYPESCRIPT SDK.

use std::{
    fmt,
    fmt::{Debug, Display, Formatter},
    marker::PhantomData,
};

use hyperlane_core::{config::StrOrInt, utils::hex_or_base58_to_h256, HyperlaneMessage, H256};
use serde::{
    de::{Error, SeqAccess, Visitor},
    Deserialize, Deserializer,
};

/// Defines a set of patterns for determining if a message should or should not
/// be relayed. This is useful for determine if a message matches a given set or
/// rules.
///
/// Valid options for each of the tuple elements are
/// - wildcard "*"
/// - single value in decimal or hex (must start with `0x`) format
/// - list of values in decimal or hex format
#[derive(Debug, Default, Clone)]
pub struct MatchingList(Option<Vec<ListElement>>);

#[derive(Debug, Clone, PartialEq)]
enum Filter<T> {
    Wildcard,
    Enumerated(Vec<T>),
}

impl<T> Default for Filter<T> {
    fn default() -> Self {
        Self::Wildcard
    }
}

impl<T: PartialEq> Filter<T> {
    fn matches(&self, v: &T) -> bool {
        match self {
            Filter::Wildcard => true,
            Filter::Enumerated(list) => list.iter().any(|i| i == v),
        }
    }
}

impl<T: Debug> Display for Filter<T> {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        match self {
            Self::Wildcard => write!(f, "*"),
            Self::Enumerated(l) if l.len() == 1 => write!(f, "{:?}", l[0]),
            Self::Enumerated(l) => {
                write!(f, "[")?;
                for i in l {
                    write!(f, "{i:?},")?;
                }
                write!(f, "]")
            }
        }
    }
}

struct MatchingListVisitor;
impl<'de> Visitor<'de> for MatchingListVisitor {
    type Value = MatchingList;

    fn expecting(&self, fmt: &mut Formatter) -> fmt::Result {
        write!(fmt, "an optional list of matching rules")
    }

    fn visit_none<E>(self) -> Result<Self::Value, E>
    where
        E: Error,
    {
        Ok(MatchingList(None))
    }

    fn visit_some<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        let list: Vec<ListElement> = deserializer.deserialize_seq(MatchingListArrayVisitor)?;
        Ok(if list.is_empty() {
            // this allows for empty matching lists to be treated as if no matching list was set
            MatchingList(None)
        } else {
            MatchingList(Some(list))
        })
    }
}

struct MatchingListArrayVisitor;
impl<'de> Visitor<'de> for MatchingListArrayVisitor {
    type Value = Vec<ListElement>;

    fn expecting(&self, fmt: &mut Formatter) -> fmt::Result {
        write!(fmt, "a list of matching rules")
    }

    fn visit_seq<A>(self, mut seq: A) -> Result<Self::Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        let mut rules = seq.size_hint().map(Vec::with_capacity).unwrap_or_default();
        while let Some(rule) = seq.next_element::<ListElement>()? {
            rules.push(rule);
        }
        Ok(rules)
    }
}

struct FilterVisitor<T>(PhantomData<T>);
impl<'de> Visitor<'de> for FilterVisitor<u32> {
    type Value = Filter<u32>;

    fn expecting(&self, fmt: &mut Formatter) -> fmt::Result {
        write!(fmt, "Expecting either a wildcard \"*\", decimal/hex value string, or list of decimal/hex value strings")
    }

    fn visit_u32<E>(self, v: u32) -> Result<Self::Value, E>
    where
        E: Error,
    {
        Ok(Self::Value::Enumerated(vec![v]))
    }

    fn visit_u64<E>(self, v: u64) -> Result<Self::Value, E>
    where
        E: Error,
    {
        if v <= u32::MAX as u64 {
            Ok(Self::Value::Enumerated(vec![v as u32]))
        } else {
            Err(E::custom("Domain Id must fit within a u32 value"))
        }
    }

    fn visit_str<E>(self, v: &str) -> Result<Self::Value, E>
    where
        E: Error,
    {
        Ok(if v == "*" {
            Self::Value::Wildcard
        } else {
            Self::Value::Enumerated(vec![v.parse::<u32>().map_err(to_serde_err)?])
        })
    }

    fn visit_seq<A>(self, mut seq: A) -> Result<Self::Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        let mut values = Vec::new();
        while let Some(i) = seq.next_element::<StrOrInt>()? {
            values.push(i.try_into().map_err(to_serde_err)?);
        }
        Ok(Self::Value::Enumerated(values))
    }
}

impl<'de> Visitor<'de> for FilterVisitor<H256> {
    type Value = Filter<H256>;

    fn expecting(&self, fmt: &mut Formatter) -> fmt::Result {
        write!(
            fmt,
            "Expecting either a wildcard \"*\", hex/base58 address string, or list of hex/base58 address strings"
        )
    }

    fn visit_str<E>(self, v: &str) -> Result<Self::Value, E>
    where
        E: Error,
    {
        Ok(if v == "*" {
            Self::Value::Wildcard
        } else {
            Self::Value::Enumerated(vec![parse_addr(v)?])
        })
    }

    fn visit_seq<A>(self, mut seq: A) -> Result<Self::Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        let mut values = Vec::new();
        while let Some(i) = seq.next_element::<String>()? {
            values.push(parse_addr(&i)?)
        }
        Ok(Self::Value::Enumerated(values))
    }
}

impl<'de> Deserialize<'de> for MatchingList {
    fn deserialize<D>(d: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        d.deserialize_option(MatchingListVisitor)
    }
}

impl<'de> Deserialize<'de> for Filter<u32> {
    fn deserialize<D>(d: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        d.deserialize_any(FilterVisitor::<u32>(Default::default()))
    }
}

impl<'de> Deserialize<'de> for Filter<H256> {
    fn deserialize<D>(d: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        d.deserialize_any(FilterVisitor::<H256>(Default::default()))
    }
}

#[derive(Debug, Deserialize, Clone)]
#[serde(tag = "type")]
struct ListElement {
    #[serde(default, rename = "origindomain")]
    origin_domain: Filter<u32>,
    #[serde(default, rename = "senderaddress")]
    sender_address: Filter<H256>,
    #[serde(default, rename = "destinationdomain")]
    destination_domain: Filter<u32>,
    #[serde(default, rename = "recipientaddress")]
    recipient_address: Filter<H256>,
}

impl Display for ListElement {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "{{originDomain: {}, senderAddress: {}, destinationDomain: {}, recipientAddress: {}}}",
            self.origin_domain,
            self.sender_address,
            self.destination_domain,
            self.recipient_address
        )
    }
}

#[derive(Copy, Clone, Debug)]
struct MatchInfo<'a> {
    src_domain: u32,
    src_addr: &'a H256,
    dst_domain: u32,
    dst_addr: &'a H256,
}

impl<'a> From<&'a HyperlaneMessage> for MatchInfo<'a> {
    fn from(msg: &'a HyperlaneMessage) -> Self {
        Self {
            src_domain: msg.origin,
            src_addr: &msg.sender,
            dst_domain: msg.destination,
            dst_addr: &msg.recipient,
        }
    }
}

impl MatchingList {
    /// Check if a message matches any of the rules.
    /// - `default`: What to return if the the matching list is empty.
    pub fn msg_matches(&self, msg: &HyperlaneMessage, default: bool) -> bool {
        self.matches(msg.into(), default)
    }

    /// Check if a message matches any of the rules.
    /// - `default`: What to return if the the matching list is empty.
    fn matches(&self, info: MatchInfo, default: bool) -> bool {
        if let Some(rules) = &self.0 {
            matches_any_rule(rules.iter(), info)
        } else {
            default
        }
    }
}

fn matches_any_rule<'a>(mut rules: impl Iterator<Item = &'a ListElement>, info: MatchInfo) -> bool {
    rules.any(|rule| {
        rule.origin_domain.matches(&info.src_domain)
            && rule.sender_address.matches(info.src_addr)
            && rule.destination_domain.matches(&info.dst_domain)
            && rule.recipient_address.matches(info.dst_addr)
    })
}

impl Display for MatchingList {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        if let Some(wl) = &self.0 {
            write!(f, "[")?;
            for i in wl {
                write!(f, "{i},")?;
            }
            write!(f, "]")
        } else {
            write!(f, "null")
        }
    }
}

fn to_serde_err<IE: ToString, OE: Error>(e: IE) -> OE {
    OE::custom(e.to_string())
}

fn parse_addr<E: Error>(addr_str: &str) -> Result<H256, E> {
    hex_or_base58_to_h256(addr_str).map_err(to_serde_err)
}
