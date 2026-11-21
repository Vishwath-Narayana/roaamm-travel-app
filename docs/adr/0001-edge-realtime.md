# ADR 0001: Real-time on Cloudflare Workers and Durable Objects

Status: accepted

## Context
The product needs 50,000 concurrent WebSocket connections with low latency worldwide, on free tiers, with strict per-room message order.

## Decision
Run the real-time path as a Rust (WebAssembly) Worker with SQLite-backed Durable Objects: one Session DO per user, one Room DO per conversation. Use the Hibernation API for idle sockets.

## Consequences
- Strict order per room comes from single-threaded Durable Object execution, with no broker to run.
- Idle connections cost no compute. Cost, not capacity, is the limit at scale.
- Risk: `workers-rs` may lack a Durable Object or hibernation API. Fallback: a thin TypeScript wrapper class around the Rust logic, recorded in a new ADR.
