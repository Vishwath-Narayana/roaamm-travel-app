//! WebSocket frame types. Every frame carries `{v, type, id}`.
//! Ciphertext is opaque to the server: it only orders and stores it.

use serde::{Deserialize, Serialize};

pub const PROTOCOL_VERSION: u8 = 1;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientFrame {
    Hello { token: String, device_id: String },
    Ping,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerFrame {
    Welcome,
    Pong,
    Error { code: String },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Envelope<T> {
    pub v: u8,
    pub id: String,
    #[serde(flatten)]
    pub frame: T,
}

impl<T> Envelope<T> {
    pub fn new(id: impl Into<String>, frame: T) -> Self {
        Self {
            v: PROTOCOL_VERSION,
            id: id.into(),
            frame,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn client_frame_round_trips() {
        let env = Envelope::new("1", ClientFrame::Ping);
        let json = serde_json::to_string(&env).unwrap();
        assert_eq!(json, r#"{"v":1,"id":"1","type":"ping"}"#);
        let back: Envelope<ClientFrame> = serde_json::from_str(&json).unwrap();
        assert_eq!(back, env);
    }

    #[test]
    fn unknown_frame_type_is_rejected() {
        let res: Result<Envelope<ClientFrame>, _> =
            serde_json::from_str(r#"{"v":1,"id":"1","type":"nope"}"#);
        assert!(res.is_err());
    }

    #[test]
    fn server_error_carries_code() {
        let env = Envelope::new(
            "2",
            ServerFrame::Error {
                code: "rate_limited".into(),
            },
        );
        let json = serde_json::to_string(&env).unwrap();
        assert!(json.contains(r#""code":"rate_limited""#));
    }
}
