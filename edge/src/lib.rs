//! Edge gateway. M0: health endpoint only. M5 adds WebSockets and Durable Objects.

use worker::*;

pub fn health_body() -> String {
    serde_json::json!({ "status": "ok", "service": "edge", "protocol": roaamm_protocol::PROTOCOL_VERSION })
        .to_string()
}

#[event(fetch)]
async fn fetch(req: Request, _env: Env, _ctx: Context) -> Result<Response> {
    match req.path().as_str() {
        "/health" => {
            let mut res = Response::ok(health_body())?;
            res.headers_mut().set("content-type", "application/json")?;
            Ok(res)
        }
        _ => Response::error("not found", 404),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn health_body_is_valid_json_with_ok_status() {
        let v: serde_json::Value = serde_json::from_str(&health_body()).unwrap();
        assert_eq!(v["status"], "ok");
        assert_eq!(v["service"], "edge");
    }
}
