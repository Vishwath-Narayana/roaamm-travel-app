//! Edge gateway. M0: health endpoint only. M5 adds WebSockets and Durable Objects.

use worker::*;

/// The only web origin allowed to read edge responses from a browser.
pub const WEB_ORIGIN: &str = "https://roaamm.plinthwell.com";

pub fn health_body() -> String {
    serde_json::json!({ "status": "ok", "service": "edge", "protocol": roaamm_protocol::PROTOCOL_VERSION })
        .to_string()
}

/// The `Access-Control-Allow-Origin` value for a request's `Origin` header:
/// the web app's origin when it matches exactly, otherwise none (so the
/// browser blocks other sites from reading the response).
pub fn cors_allow_origin(origin: Option<&str>) -> Option<&'static str> {
    match origin {
        Some(o) if o == WEB_ORIGIN => Some(WEB_ORIGIN),
        _ => None,
    }
}

#[event(fetch)]
async fn fetch(req: Request, _env: Env, _ctx: Context) -> Result<Response> {
    match req.path().as_str() {
        "/health" => {
            let mut res = Response::ok(health_body())?;
            let headers = res.headers_mut();
            headers.set("content-type", "application/json")?;
            headers.set("cache-control", "no-store")?;
            // The landing page's live status row measures this endpoint.
            let origin = req.headers().get("origin")?;
            if let Some(allowed) = cors_allow_origin(origin.as_deref()) {
                headers.set("access-control-allow-origin", allowed)?;
            }
            // Responses differ by Origin, so caches must key on it.
            headers.set("vary", "Origin")?;
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

    #[test]
    fn cors_allows_only_the_web_origin() {
        assert_eq!(
            cors_allow_origin(Some("https://roaamm.plinthwell.com")),
            Some(WEB_ORIGIN)
        );
        // Anything else, including look-alikes and other schemes, is refused.
        for other in [
            "http://roaamm.plinthwell.com",
            "https://roaamm.plinthwell.com.evil.example",
            "https://evil.example",
            "https://roaamm-status.plinthwell.com",
            "null",
            "",
        ] {
            assert_eq!(cors_allow_origin(Some(other)), None, "{other}");
        }
        assert_eq!(cors_allow_origin(None), None);
    }
}
