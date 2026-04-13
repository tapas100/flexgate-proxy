mod cache;
mod validator;

use std::{net::SocketAddr, sync::Arc, time::{Duration, Instant}};

use axum::{
    extract::State,
    response::{IntoResponse, Json},
    routing::{get, post},
    Router,
};
use clap::Parser;
use metrics_exporter_prometheus::PrometheusBuilder;
use serde::{Deserialize, Serialize};
use tower_http::timeout::TimeoutLayer;
use tower_http::trace::TraceLayer;
use tracing::info;
use tracing_subscriber::EnvFilter;

use crate::validator::{ValidationError, Validator};

// ── CLI ───────────────────────────────────────────────────────────────────────

#[derive(Parser, Debug)]
#[command(
    name    = "flexgate-rust-security",
    version,
    about   = "FlexGate SSRF / URL validation sidecar"
)]
struct Cli {
    #[arg(long, env = "SECURITY_PORT", default_value = "9100")]
    port: u16,

    #[arg(long, env = "SECURITY_DNS_TIMEOUT_MS", default_value = "300")]
    dns_timeout_ms: u64,

    #[arg(long, env = "SECURITY_REBIND_CHECK", default_value = "true")]
    rebind_check: bool,

    #[arg(long, env = "SECURITY_LOG_FORMAT", default_value = "json")]
    log_format: String,

    #[arg(long, env = "SECURITY_METRICS_ADDR", default_value = "0.0.0.0:9101")]
    metrics_addr: String,

    /// TTL for DNS cache entries in seconds (0 = default 30 s).
    #[arg(long, env = "SECURITY_DNS_TTL_SECS", default_value = "30")]
    dns_ttl_secs: u64,

    /// Maximum number of DNS cache entries (0 = default 8192).
    #[arg(long, env = "SECURITY_DNS_CACHE_MAX", default_value = "8192")]
    dns_cache_max: u64,
}

// ── request / response ────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct ValidateRequest {
    url: String,
    #[serde(default)]
    client_ip: String,
}

#[derive(Debug, Serialize)]
struct ValidateResponse {
    allowed: bool,
    reason:  String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    resolved_ips: Vec<String>,
}

// ── shared state ──────────────────────────────────────────────────────────────

#[derive(Clone)]
struct AppState {
    validator: Arc<Validator>,
}

// ── handlers ──────────────────────────────────────────────────────────────────

/// POST /validate
///
/// Always 200 OK — callers inspect `allowed`.  Using 200 for blocked requests
/// avoids penalising the Go connection pool with 4xx non-retriable errors.
async fn handle_validate(
    State(state): State<AppState>,
    Json(req):    Json<ValidateRequest>,
) -> impl IntoResponse {
    let start = Instant::now();

    let _span = tracing::info_span!(
        "validate",
        url       = %req.url,
        client_ip = %req.client_ip,
    );

    let result     = state.validator.validate(&req.url).await;
    let latency_ms = start.elapsed().as_secs_f64() * 1000.0;
    metrics::histogram!("flexgate_security_validation_latency_ms").record(latency_ms);

    let resp = match result {
        Ok(ips) => {
            metrics::counter!("flexgate_security_validations_total", "result" => "allowed")
                .increment(1);
            info!(allowed = true, url = %req.url, latency_ms, "validation passed");
            ValidateResponse {
                allowed:      true,
                reason:       "ok".into(),
                resolved_ips: ips.iter().map(|ip| ip.to_string()).collect(),
            }
        }
        Err(ref e) => {
            let reason = e.to_string();
            let label = match e {
                ValidationError::BlockedIp(_)       => "blocked_ip",
                ValidationError::ForbiddenScheme(_) => "forbidden_scheme",
                ValidationError::MalformedUrl(_)    => "malformed_url",
                ValidationError::MissingHost        => "missing_host",
                ValidationError::DnsFailure(_)      => "dns_failure",
                ValidationError::NoAddresses(_)     => "no_addresses",
                ValidationError::DnsRebinding(_)    => "dns_rebinding",
            };
            metrics::counter!("flexgate_security_validations_total", "result" => label)
                .increment(1);
            info!(allowed = false, url = %req.url, %reason, latency_ms, "validation blocked");
            ValidateResponse { allowed: false, reason, resolved_ips: vec![] }
        }
    };

    Json(resp)
}

/// GET /health
async fn handle_health() -> impl IntoResponse {
    Json(serde_json::json!({ "status": "ok" }))
}

/// GET /cache/stats
///
/// Returns JSON snapshot of the DNS cache: entry count, capacity, TTL,
/// hit/miss/eviction counters, SWR refreshes, and computed hit-rate %.
async fn handle_cache_stats(
    State(state): State<AppState>,
) -> impl IntoResponse {
    Json(state.validator.cache().stats())
}

// ── router ────────────────────────────────────────────────────────────────────

fn build_router(state: AppState) -> Router {
    Router::new()
        .route("/validate",    post(handle_validate))
        .route("/health",      get(handle_health))
        .route("/cache/stats", get(handle_cache_stats))
        .layer(TraceLayer::new_for_http())
        .layer(TimeoutLayer::with_status_code(
            axum::http::StatusCode::REQUEST_TIMEOUT,
            Duration::from_millis(500),
        ))
        .with_state(state)
}

// ── main ──────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() {
    let cli = Cli::parse();

    // ── logging ──────────────────────────────────────────────────────────────
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    if cli.log_format == "pretty" {
        tracing_subscriber::fmt().with_env_filter(filter).with_target(false).init();
    } else {
        tracing_subscriber::fmt().json().with_env_filter(filter).with_target(false).init();
    }

    // ── Prometheus ───────────────────────────────────────────────────────────
    let metrics_addr: SocketAddr = cli
        .metrics_addr
        .parse()
        .expect("SECURITY_METRICS_ADDR must be a valid socket address");

    PrometheusBuilder::new()
        .with_http_listener(metrics_addr)
        .install()
        .expect("failed to install Prometheus recorder");

    info!(metrics_addr = %metrics_addr, "Prometheus metrics exporter started");

    // Pre-register all counters/gauges so they appear on the very first scrape
    // even before any request has arrived.
    metrics::counter!("flexgate_security_validations_total", "result" => "allowed").absolute(0);
    metrics::counter!("flexgate_security_validations_total", "result" => "blocked_ip").absolute(0);
    metrics::counter!("flexgate_security_validations_total", "result" => "dns_failure").absolute(0);

    // DNS cache metrics
    metrics::counter!("flexgate_security_dns_cache_hits_total").absolute(0);
    metrics::counter!("flexgate_security_dns_cache_misses_total").absolute(0);
    metrics::counter!("flexgate_security_dns_cache_stale_hits_total").absolute(0);
    metrics::counter!("flexgate_security_dns_cache_evictions_total").absolute(0);
    metrics::counter!("flexgate_security_dns_swr_refreshes_total").absolute(0);
    metrics::gauge!("flexgate_security_dns_cache_entries").set(0.0);

    // ── validator + state ────────────────────────────────────────────────────
    let validator = Validator::new(
        cli.rebind_check,
        cli.dns_timeout_ms,
        cli.dns_cache_max,
        cli.dns_ttl_secs,
    );
    let state = AppState { validator: Arc::new(validator) };

    // ── HTTP server ──────────────────────────────────────────────────────────
    let addr   = SocketAddr::from(([0, 0, 0, 0], cli.port));
    let router = build_router(state);

    info!(
        port           = cli.port,
        dns_timeout_ms = cli.dns_timeout_ms,
        dns_ttl_secs   = cli.dns_ttl_secs,
        dns_cache_max  = cli.dns_cache_max,
        rebind_check   = cli.rebind_check,
        "flexgate-rust-security starting"
    );

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("failed to bind TCP listener");

    axum::serve(listener, router)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("server error");
}

async fn shutdown_signal() {
    use tokio::signal;
    let ctrl_c = async { signal::ctrl_c().await.expect("CTRL+C handler failed") };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("SIGTERM handler failed")
            .recv()
            .await;
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c    => info!("received SIGINT  — shutting down"),
        _ = terminate => info!("received SIGTERM — shutting down"),
    }
}
