//! Money type and currency-aware arithmetic.
//!
//! Single source of truth for monetary precision. Must agree with
//! `src/utils/money.ts::formatMoney`.

#[cfg(test)]
use rust_decimal::prelude::FromPrimitive;
use rust_decimal::{Decimal, RoundingStrategy};
use rust_decimal_macros::dec;
use serde::{Deserialize, Serialize};

pub const MAX_FINANCIAL_AMOUNT: Decimal = dec!(1_000_000_000_000);
pub const MONEY_EPSILON: Money = Money(dec!(0.01));
pub const MONEY_STRICT_EPSILON: Money = Money(dec!(0.001));

pub fn split_partner_amount_50(amount: Decimal) -> (Decimal, Decimal) {
    split_partner_amount_50_by_currency(amount, "IQD")
}

pub fn split_partner_amount_50_by_currency(amount: Decimal, currency: &str) -> (Decimal, Decimal) {
    let scale = currency_scale(currency).unwrap_or_else(|_| {
        eprintln!(
            "[fajir-alwadi][CRITICAL-4] split_partner_amount_50_by_currency received \
             unknown currency '{}'; defaulting to IQD scale (0 dp). This is a bug.",
            currency
        );
        0u32
    });
    let half = (amount / dec!(2)).round_dp_with_strategy(scale, RoundingStrategy::ToZero);
    let remainder = amount - (half * dec!(2));
    if remainder.is_zero() {
        (half, half)
    } else {
        (half + remainder, half)
    }
}

pub fn currency_scale(currency: &str) -> Result<u32, String> {
    match currency {
        "IQD" => Ok(0),
        "USD" => Ok(2),
        other => Err(format!(
            "عملة غير مدعومة: '{other}'. العملات المسموحة هي 'IQD' و 'USD' فقط."
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn property_split_preserves_total(amount: Decimal, currency: &str) -> bool {
        let (a, b) = split_partner_amount_50_by_currency(amount, currency);
        a + b == amount
    }

    #[test]
    fn test_split_50_preserves_total_iqd() {
        for amount in [0i64, 1, 2, 3, 100, 999, 1_000_000, 10_000_001] {
            assert!(
                property_split_preserves_total(Decimal::from(amount), "IQD"),
                "IQD split failed for amount {amount}"
            );
        }
    }

    #[test]
    fn test_split_50_preserves_total_usd() {
        use rust_decimal_macros::dec;
        for amount in [dec!(0), dec!(1.00), dec!(1.01), dec!(100.99), dec!(999.999)] {
            assert!(
                property_split_preserves_total(amount, "USD"),
                "USD split failed for amount {amount}"
            );
        }
    }

    #[test]
    fn test_split_50_odd_iqd_remainder_to_first_partner() {
        let (a, b) = split_partner_amount_50_by_currency(Decimal::from(3), "IQD");
        assert_eq!(a, Decimal::from(2));
        assert_eq!(b, Decimal::from(1));
    }

    #[test]
    fn test_split_50_shares_are_fair_not_only_total_preserving() {
        for (amount, currency, smallest_unit) in [
            (dec!(10), "IQD", dec!(1)),
            (dec!(10000001), "IQD", dec!(1)),
            (dec!(10.03), "USD", dec!(0.01)),
            (dec!(-999999.99), "USD", dec!(0.01)),
        ] {
            let (first, second) = split_partner_amount_50_by_currency(amount, currency);
            assert_eq!(first + second, amount);
            assert!(
                (first - second).abs() <= smallest_unit,
                "unfair split for {amount} {currency}: {first} / {second}"
            );
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Default)]
pub struct Money(pub Decimal);

impl Money {
    pub fn zero() -> Self {
        Money(Decimal::ZERO)
    }
    pub fn from_i64(v: i64) -> Self {
        Money(Decimal::from(v))
    }
    pub fn from_usize(v: usize) -> Self {
        Money(Decimal::from(v as u64))
    }
    pub fn is_zero(&self) -> bool {
        self.0.is_zero()
    }
    pub fn is_positive(&self) -> bool {
        self.0.is_sign_positive() && !self.0.is_zero()
    }
    pub fn is_negative(&self) -> bool {
        self.0.is_sign_negative()
    }
    pub fn abs(&self) -> Self {
        Money(self.0.abs())
    }
    pub fn min(self, other: Self) -> Self {
        Money(self.0.min(other.0))
    }
    pub fn max(self, other: Self) -> Self {
        Money(self.0.max(other.0))
    }
    pub fn trunc(&self) -> Self {
        Money(self.0.trunc())
    }
    pub fn floor(&self) -> Self {
        Money(self.0.floor())
    }
    pub fn round_dp(&self, dp: u32) -> Self {
        Money(self.0.round_dp(dp))
    }
}

impl std::fmt::Display for Money {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(f)
    }
}

impl Serialize for Money {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        if s.is_human_readable() {
            s.serialize_str(&self.0.normalize().to_string())
        } else {
            let mut state = s.serialize_struct("Money", 1)?;
            state.serialize_field("value", &self.0.normalize().to_string())?;
            state.end()
        }
    }
}

impl<'de> Deserialize<'de> for Money {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        struct MoneyVisitor;
        impl<'de> serde::de::Visitor<'de> for MoneyVisitor {
            type Value = Money;
            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("a monetary amount as a decimal string or integer")
            }
            fn visit_str<E: serde::de::Error>(self, value: &str) -> Result<Money, E> {
                value
                    .parse::<Decimal>()
                    .map(Money)
                    .map_err(serde::de::Error::custom)
            }
            fn visit_i64<E: serde::de::Error>(self, value: i64) -> Result<Money, E> {
                Ok(Money(Decimal::from(value)))
            }
            fn visit_u64<E: serde::de::Error>(self, value: u64) -> Result<Money, E> {
                Ok(Money(Decimal::from(value)))
            }
            fn visit_f64<E: serde::de::Error>(self, _value: f64) -> Result<Money, E> {
                Err(serde::de::Error::custom(
                    "monetary values must be serialized as strings or integers, not floats",
                ))
            }
        }
        if d.is_human_readable() {
            d.deserialize_any(MoneyVisitor)
        } else {
            d.deserialize_struct("Money", &["value"], MoneyVisitor)
        }
    }
}

impl std::ops::Add for Money {
    type Output = Self;
    fn add(self, rhs: Self) -> Self {
        Money(self.0 + rhs.0)
    }
}

impl std::ops::Sub for Money {
    type Output = Self;
    fn sub(self, rhs: Self) -> Self {
        Money(self.0 - rhs.0)
    }
}

impl std::ops::Mul for Money {
    type Output = Self;
    fn mul(self, rhs: Self) -> Self {
        Money(self.0 * rhs.0)
    }
}

impl std::ops::Div for Money {
    type Output = Self;
    fn div(self, rhs: Self) -> Self {
        if rhs.is_zero() {
            Money::zero()
        } else {
            Money(self.0 / rhs.0)
        }
    }
}

impl std::ops::AddAssign for Money {
    fn add_assign(&mut self, rhs: Self) {
        self.0 += rhs.0;
    }
}

impl std::ops::SubAssign for Money {
    fn sub_assign(&mut self, rhs: Self) {
        self.0 -= rhs.0;
    }
}

impl rusqlite::types::FromSql for Money {
    fn column_result(value: rusqlite::types::ValueRef<'_>) -> rusqlite::types::FromSqlResult<Self> {
        match value {
            rusqlite::types::ValueRef::Real(value) => {
                #[cfg(test)]
                {
                    Decimal::from_f64(value)
                        .map(Money)
                        .ok_or(rusqlite::types::FromSqlError::InvalidType)
                }
                #[cfg(not(test))]
                {
                    let _ = value;
                    Err(rusqlite::types::FromSqlError::InvalidType)
                }
            }
            rusqlite::types::ValueRef::Integer(i) => Ok(Money(Decimal::from(i))),
            rusqlite::types::ValueRef::Text(s) => {
                let str_val = std::str::from_utf8(s)
                    .map_err(|_| rusqlite::types::FromSqlError::InvalidType)?;
                str_val
                    .parse::<Decimal>()
                    .map(Money)
                    .map_err(|_| rusqlite::types::FromSqlError::InvalidType)
            }
            _ => Err(rusqlite::types::FromSqlError::InvalidType),
        }
    }
}

impl std::ops::Neg for Money {
    type Output = Self;
    fn neg(self) -> Self {
        Money(-self.0)
    }
}

impl std::str::FromStr for Money {
    type Err = rust_decimal::Error;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Ok(Money(s.parse::<Decimal>()?))
    }
}

impl std::iter::Sum for Money {
    fn sum<I: Iterator<Item = Self>>(iter: I) -> Self {
        Money(iter.map(|m| m.0).sum())
    }
}

impl rusqlite::types::ToSql for Money {
    fn to_sql(&self) -> rusqlite::Result<rusqlite::types::ToSqlOutput<'_>> {
        Ok(rusqlite::types::ToSqlOutput::Owned(
            rusqlite::types::Value::Text(self.0.to_string()),
        ))
    }
}
