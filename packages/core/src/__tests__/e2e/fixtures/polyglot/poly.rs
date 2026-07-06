# E11: unsupported extension (.rs). Same expectation as poly.go — zero symbols,
# zero imports. The indexer skips the file silently.

[package]
name = "poly"
version = "0.1.0"

pub fn poly_rust(n: i32) -> i32 {
    n + 2
}

pub struct PolyRs {
    pub id: i32,
}
