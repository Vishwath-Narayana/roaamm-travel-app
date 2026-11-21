//! Crypto core. M0 ships only attachment encryption (AES-256-GCM) and hashing
//! so the crate, its tests and its WebAssembly build are wired into CI.
//! OpenMLS (RFC 9420) and SFrame key derivation land in M6 and M7.

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use sha2::{Digest, Sha256};

pub const KEY_LEN: usize = 32;
pub const NONCE_LEN: usize = 12;

#[derive(Debug, PartialEq, Eq)]
pub enum CryptoError {
    InvalidKey,
    Encrypt,
    Decrypt,
    Truncated,
}

/// Encrypts `plaintext`. Output is `nonce || ciphertext`. The caller supplies
/// a fresh random 12-byte nonce; a nonce must never be reused with the same key.
pub fn seal(key: &[u8], nonce: &[u8; NONCE_LEN], plaintext: &[u8]) -> Result<Vec<u8>, CryptoError> {
    if key.len() != KEY_LEN {
        return Err(CryptoError::InvalidKey);
    }
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let ct = cipher
        .encrypt(Nonce::from_slice(nonce), plaintext)
        .map_err(|_| CryptoError::Encrypt)?;
    let mut out = Vec::with_capacity(NONCE_LEN + ct.len());
    out.extend_from_slice(nonce);
    out.extend_from_slice(&ct);
    Ok(out)
}

pub fn open(key: &[u8], sealed: &[u8]) -> Result<Vec<u8>, CryptoError> {
    if key.len() != KEY_LEN {
        return Err(CryptoError::InvalidKey);
    }
    if sealed.len() < NONCE_LEN {
        return Err(CryptoError::Truncated);
    }
    let (nonce, ct) = sealed.split_at(NONCE_LEN);
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    cipher
        .decrypt(Nonce::from_slice(nonce), ct)
        .map_err(|_| CryptoError::Decrypt)
}

pub fn sha256_hex(data: &[u8]) -> String {
    Sha256::digest(data)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    /// Fresh random bytes for each test, so no key or nonce is ever hard-coded.
    fn random<const N: usize>() -> [u8; N] {
        let mut buf = [0u8; N];
        getrandom::getrandom(&mut buf).expect("system randomness");
        buf
    }

    #[test]
    fn round_trip() {
        let key = random::<KEY_LEN>();
        let nonce = random::<NONCE_LEN>();
        let sealed = seal(&key, &nonce, b"hello traveller").unwrap();
        assert_eq!(open(&key, &sealed).unwrap(), b"hello traveller");
    }

    #[test]
    fn tampering_is_detected() {
        let key = random::<KEY_LEN>();
        let nonce = random::<NONCE_LEN>();
        let mut sealed = seal(&key, &nonce, b"hello").unwrap();
        let last = sealed.len() - 1;
        sealed[last] ^= 1;
        assert_eq!(open(&key, &sealed), Err(CryptoError::Decrypt));
    }

    #[test]
    fn wrong_key_fails() {
        let key = random::<KEY_LEN>();
        let other_key = random::<KEY_LEN>();
        let nonce = random::<NONCE_LEN>();
        let sealed = seal(&key, &nonce, b"hello").unwrap();
        assert_eq!(open(&other_key, &sealed), Err(CryptoError::Decrypt));
    }

    #[test]
    fn rejects_bad_key_length_and_truncated_input() {
        let key = random::<KEY_LEN>();
        let nonce = random::<NONCE_LEN>();
        let short_key = random::<5>();
        assert_eq!(seal(&short_key, &nonce, b"x"), Err(CryptoError::InvalidKey));
        assert_eq!(open(&key, &random::<3>()), Err(CryptoError::Truncated));
    }

    #[test]
    fn sha256_known_vector() {
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    proptest! {
        #[test]
        fn any_plaintext_round_trips(data in proptest::collection::vec(any::<u8>(), 0..2048)) {
            let key = random::<KEY_LEN>();
            let nonce = random::<NONCE_LEN>();
            let sealed = seal(&key, &nonce, &data).unwrap();
            prop_assert_eq!(open(&key, &sealed).unwrap(), data);
        }
    }
}
