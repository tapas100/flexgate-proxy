//! SSRF-safe URL / IP validator with DNS caching and stale-while-revalidate.
//!
//! # DNS strategy
//!
//! All DNS logic lives in this module (and its dependency [`DnsCache`]).
//! Go never resolves hostnames — it delegates every lookup to this sidecar.
//!
//! ## Cache-first with stale-while-revalidate
//!
//! ```text
//!  validate(url)
//!      │
//!      ├─ literal IP host → classify directly, no DNS
//!      │
//!      ├─ cache hit (fresh, staleness < 50%) → return immediately
//!      │
//!      ├─ cache hit (stale, staleness ≥ 50%) → return immediately
//!      │                                         + spawn bg refresh
//!      │
//!      └─ cache miss → live DNS → classify → insert → return
//! ```
//!
//! ## Metrics
//!
//! | Metric | Description |
//! |--------|-------------|
//! | `flexgate_security_dns_cache_hits_total` | Total cache hits |
//! | `flexgate_security_dns_cache_misses_total` | Total cache misses |
//! | `flexgate_security_dns_cache_stale_hits_total` | Hits on stale entries (SWR triggered) |
//! | `flexgate_security_dns_cache_evictions_total` | Entries evicted (TTL/LRU/idle) |
//! | `flexgate_security_dns_cache_entries` (gauge) | Live entry count |
//! | `flexgate_security_dns_swr_refreshes_total` | SWR background refreshes |
//! | `flexgate_security_dns_hit_latency_ms` (histogram) | Latency when cache hits |
//! | `flexgate_security_dns_miss_latency_ms` (histogram) | Latency when cache misses (DNS RTT) |
//! | `flexgate_security_dns_resolution_ms` (histogram) | Raw live DNS RTT |
//! | `flexgate_security_validations_total` (counter) | Validation outcomes by label |
//! | `flexgate_security_validation_latency_ms` (histogram) | End-to-end validation time |

use std::{
    net::{IpAddr, Ipv4Addr, Ipv6Addr},
    str::FromStr,
    sync::Arc,
    time::{Duration, Instant},
};

use hickory_resolver::{
    config::{ResolverConfig, ResolverOpts},
    TokioAsyncResolver,
};
use ipnet::IpNet;
use thiserror::Error;
use url::Url;

use crate::cache::{DnsCache, DEFAULT_DNS_TTL_SECS, DEFAULT_MAX_ENTRIES};

// ── errors ────────────────────────────────────────────────────────────────────

#[derive(Debug, Error)]
pub enum ValidationError {
    #[error("malformed URL: {0}")]
    MalformedUrl(#[from] url::ParseError),

    #[error("scheme not allowed: {0}")]
    ForbiddenScheme(String),

    #[error("missing or empty host")]
    MissingHost,

    #[error("IP address is in a blocked range: {0}")]
    BlockedIp(IpAddr),

    #[error("DNS resolution failed: {0}")]
    DnsFailure(String),

    #[error("DNS returned no addresses for host: {0}")]
    NoAddresses(String),

    #[error("DNS rebinding detected: second resolution returned blocked IP {0}")]
    DnsRebinding(IpAddr),
}

// ── blocked CIDR ranges ───────────────────────────────────────────────────────

fn build_blocked_ranges() -> Arc<[IpNet]> {
    let cidrs = [
        "0.0.0.0/8",          // this-network
        "10.0.0.0/8",         // RFC 1918 private
        "100.64.0.0/10",      // CGNAT (RFC 6598)
        "127.0.0.0/8",        // loopback
        "169.254.0.0/16",     // link-local / AWS IMDS
        "172.16.0.0/12",      // RFC 1918 private
        "192.0.0.0/24",       // IETF Protocol Assignments
        "192.0.2.0/24",       // TEST-NET-1
        "192.168.0.0/16",     // RFC 1918 private
        "198.18.0.0/15",      // benchmarking (RFC 2544)
        "198.51.100.0/24",    // TEST-NET-2
        "203.0.113.0/24",     // TEST-NET-3
        "224.0.0.0/4",        // multicast
        "240.0.0.0/4",        // reserved
        "255.255.255.255/32",
        "::1/128",            // IPv6 loopback
        "::/128",             // IPv6 unspecified
        "fc00::/7",           // IPv6 unique-local
        "fe80::/10",          // IPv6 link-local
        "ff00::/8",           // IPv6 multicast
        "100::/64",           // IPv6 discard (RFC 6666)
        "2001:db8::/32",      // documentation
        "64:ff9b::/96",       // IPv4-mapped (NAT64)
    ];
    cidrs
        .iter()
        .map(|s| IpNet::from_str(s).expect("built-in CIDR is always valid"))
        .collect::<Vec<_>>()
        .into()
}

// ── Validator ─────────────────────────────────────────────────────────────────

/// The main validator.  Cheap to clone — all fields are `Arc`-wrapped.
#[derive(Clone)]
pub struct Validator {
    resolver:     Arc<TokioAsyncResolver>,
    cache:        DnsCache,
    blocked:      Arc<[IpNet]>,
    rebind_check: bool,
    #[allow(dead_code)]  // retained for future rebind-timeout enforcement
    dns_timeout:  Duration,
}

impl Validator {
    /// Create a new [`Validator`].
    ///
    /// `max_cache_entries` and `dns_ttl_secs` control the DNS cache;
    /// pass `0` for either to use the defaults (8192 entries, 30 s TTL).
    pub fn new(
        rebind_check:      bool,
        dns_timeout_ms:    u64,
        max_cache_entries: u64,
        dns_ttl_secs:      u64,
    ) -> Self {
        let max_entries = if max_cache_entries == 0 { DEFAULT_MAX_ENTRIES } else { max_cache_entries };
        let ttl_secs    = if dns_ttl_secs == 0       { DEFAULT_DNS_TTL_SECS  } else { dns_ttl_secs  };

        let mut opts = ResolverOpts::default();
        opts.timeout        = Duration::from_millis(dns_timeout_ms);
        opts.attempts       = 2;
        opts.use_hosts_file = false;
        opts.ndots          = 0;

        let resolver = TokioAsyncResolver::tokio(
            ResolverConfig::cloudflare(),
            opts,
        );

        Self {
            resolver:     Arc::new(resolver),
            cache:        DnsCache::new(max_entries, ttl_secs),
            blocked:      build_blocked_ranges(),
            rebind_check,
            dns_timeout:  Duration::from_millis(dns_timeout_ms),
        }
    }

    /// Return a reference to the DNS cache (for the `/cache/stats` endpoint).
    pub fn cache(&self) -> &DnsCache {
        &self.cache
    }

    /// Validate a URL for SSRF safety.
    ///
    /// Returns `Ok(Vec<IpAddr>)` — the resolved addresses — on success.
    pub async fn validate(&self, raw_url: &str) -> Result<Vec<IpAddr>, ValidationError> {
        // 1. structural parse
        let url = Url::parse(raw_url)?;

        // 2. scheme check
        match url.scheme() {
            "http" | "https" => {}
            scheme => return Err(ValidationError::ForbiddenScheme(scheme.to_owned())),
        }

        // 3. host extraction
        let host = url
            .host_str()
            .filter(|h| !h.is_empty())
            .ok_or(ValidationError::MissingHost)?
            .to_lowercase();

        // 4. literal IP fast-path — no DNS, no cache
        if let Some(ip) = parse_literal_ip(&host) {
            self.check_ip(ip)?;
            return Ok(vec![ip]);
        }

        // 5. DNS resolution (cache-first, with SWR)
        let addrs = self.resolve(&host).await?;

        // 6. classify every resolved address
        for &ip in &addrs {
            self.check_ip(ip)?;
        }

        // 7. DNS rebinding protection
        if self.rebind_check && addrs.len() == 1 {
            let second = self.live_resolve(&host).await?;
            for &ip in &second {
                if self.is_blocked(ip) {
                    self.cache.invalidate(&host).await;
                    return Err(ValidationError::DnsRebinding(ip));
                }
            }
        }

        Ok(addrs)
    }

    // ── private helpers ───────────────────────────────────────────────────────

    fn check_ip(&self, ip: IpAddr) -> Result<(), ValidationError> {
        if self.is_blocked(ip) { Err(ValidationError::BlockedIp(ip)) } else { Ok(()) }
    }

    fn is_blocked(&self, ip: IpAddr) -> bool {
        self.blocked.iter().any(|net| net.contains(&ip))
    }

    /// Cache-first resolution with stale-while-revalidate.
    ///
    /// 1. Fresh cache hit  → return immediately, record hit latency
    /// 2. Stale cache hit  → return immediately + spawn background refresh
    /// 3. Cache miss       → live DNS, insert, record miss latency
    async fn resolve(&self, host: &str) -> Result<Vec<IpAddr>, ValidationError> {
        let t0 = Instant::now();

        if let Some((entry, is_stale)) = self.cache.get(host).await {
            let hit_ms = t0.elapsed().as_secs_f64() * 1000.0;
            metrics::histogram!("flexgate_security_dns_hit_latency_ms").record(hit_ms);

            if is_stale {
                // Stale-while-revalidate: spawn a background refresh so the
                // *next* request gets a fresh entry without waiting for DNS.
                self.cache.record_swr_refresh();
                let validator_clone = self.clone();
                let host_owned = host.to_owned();
                tokio::spawn(async move {
                    if let Ok(addrs) = validator_clone.live_resolve(&host_owned).await {
                        // Classify before inserting — don't cache blocked IPs.
                        let all_safe = addrs.iter().all(|&ip| !validator_clone.is_blocked(ip));
                        if all_safe {
                            validator_clone.cache.insert(&host_owned, addrs).await;
                        }
                    }
                });
            }

            return Ok((*entry.addrs).clone());
        }

        // Cache miss
        self.cache.record_miss();
        let addrs = self.live_resolve(host).await?;
        let miss_ms = t0.elapsed().as_secs_f64() * 1000.0;
        metrics::histogram!("flexgate_security_dns_miss_latency_ms").record(miss_ms);
        self.cache.insert(host, addrs.clone()).await;
        Ok(addrs)
    }

    /// Perform a live DNS lookup, bypassing the cache.
    pub async fn live_resolve(&self, host: &str) -> Result<Vec<IpAddr>, ValidationError> {
        let t0 = Instant::now();

        let lookup = self
            .resolver
            .lookup_ip(host)
            .await
            .map_err(|e| ValidationError::DnsFailure(e.to_string()))?;

        let elapsed_ms = t0.elapsed().as_secs_f64() * 1000.0;
        metrics::histogram!("flexgate_security_dns_resolution_ms").record(elapsed_ms);

        let addrs: Vec<IpAddr> = lookup.iter().collect();
        if addrs.is_empty() {
            return Err(ValidationError::NoAddresses(host.to_owned()));
        }
        Ok(addrs)
    }
}

/// Parse a host string as a literal IP address.
///
/// Handles plain IPv4 (`"1.2.3.4"`) and bracketed IPv6 (`"[::1]"`).
fn parse_literal_ip(host: &str) -> Option<IpAddr> {
    let trimmed = if host.starts_with('[') && host.ends_with(']') {
        &host[1..host.len() - 1]
    } else {
        host
    };
    if let Ok(v4) = trimmed.parse::<Ipv4Addr>() { return Some(IpAddr::V4(v4)); }
    if let Ok(v6) = trimmed.parse::<Ipv6Addr>() { return Some(IpAddr::V6(v6)); }
    None
}

// ── unit tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn v() -> Validator { Validator::new(false, 2000, 128, 30) }

    #[tokio::test]
    async fn blocks_loopback_literal() {
        let err = v().validate("http://127.0.0.1/secret").await.unwrap_err();
        assert!(matches!(err, ValidationError::BlockedIp(_)), "{err}");
    }

    #[tokio::test]
    async fn blocks_private_10() {
        assert!(matches!(
            v().validate("http://10.0.0.1/secret").await.unwrap_err(),
            ValidationError::BlockedIp(_)
        ));
    }

    #[tokio::test]
    async fn blocks_private_172() {
        assert!(matches!(
            v().validate("http://172.16.5.10/").await.unwrap_err(),
            ValidationError::BlockedIp(_)
        ));
    }

    #[tokio::test]
    async fn blocks_private_192_168() {
        assert!(matches!(
            v().validate("https://192.168.1.1/admin").await.unwrap_err(),
            ValidationError::BlockedIp(_)
        ));
    }

    #[tokio::test]
    async fn blocks_link_local_imds() {
        assert!(matches!(
            v().validate("http://169.254.169.254/latest/meta-data/").await.unwrap_err(),
            ValidationError::BlockedIp(_)
        ));
    }

    #[tokio::test]
    async fn blocks_cgnat() {
        assert!(matches!(
            v().validate("http://100.64.0.1/").await.unwrap_err(),
            ValidationError::BlockedIp(_)
        ));
    }

    #[tokio::test]
    async fn blocks_ipv6_loopback() {
        assert!(matches!(
            v().validate("http://[::1]/").await.unwrap_err(),
            ValidationError::BlockedIp(_)
        ));
    }

    #[tokio::test]
    async fn blocks_ipv6_link_local() {
        assert!(matches!(
            v().validate("http://[fe80::1]/").await.unwrap_err(),
            ValidationError::BlockedIp(_)
        ));
    }

    #[tokio::test]
    async fn blocks_forbidden_scheme_ftp() {
        assert!(matches!(
            v().validate("ftp://example.com/file").await.unwrap_err(),
            ValidationError::ForbiddenScheme(_)
        ));
    }

    #[tokio::test]
    async fn blocks_forbidden_scheme_file() {
        assert!(matches!(
            v().validate("file:///etc/passwd").await.unwrap_err(),
            ValidationError::ForbiddenScheme(_)
        ));
    }

    #[tokio::test]
    async fn blocks_malformed_url() {
        assert!(matches!(
            v().validate("not a url at all %%").await.unwrap_err(),
            ValidationError::MalformedUrl(_)
        ));
    }

    #[tokio::test]
    async fn allows_public_ipv4() {
        let result = v().validate("https://93.184.216.34/").await;
        assert!(result.is_ok(), "{result:?}");
    }

    #[tokio::test]
    async fn parse_literal_ip_ipv4() {
        let ip = parse_literal_ip("1.2.3.4").unwrap();
        assert_eq!(ip, IpAddr::V4(Ipv4Addr::new(1, 2, 3, 4)));
    }

    #[tokio::test]
    async fn parse_literal_ip_ipv6_bracketed() {
        let ip = parse_literal_ip("[2001:db8::1]").unwrap();
        assert_eq!(ip, IpAddr::V6("2001:db8::1".parse().unwrap()));
    }

    #[tokio::test]
    async fn parse_literal_ip_none_for_hostname() {
        assert!(parse_literal_ip("example.com").is_none());
    }

    // ── cache integration ─────────────────────────────────────────────────────

    #[tokio::test]
    async fn cache_hit_after_first_call() {
        // Manually prime the cache then verify a hit via validate().
        // moka's async Cache has eventual-consistency for entry_count(), so we
        // confirm the entry is present via get() (which flushes the write
        // buffer) rather than asserting on entry_count before the validate call.
        let val = Validator::new(false, 2000, 128, 30);
        let ip  = IpAddr::V4(Ipv4Addr::new(93, 184, 216, 34));

        val.cache().insert("example.com", vec![ip]).await;

        // Confirm the entry is visible to get() (flushes moka's internal buffer).
        let pre = val.cache().get("example.com").await;
        assert!(pre.is_some(), "entry should be in cache immediately after insert+get");

        // Resolve — should be a cache hit (hits counter was incremented by get() above).
        let result = val.validate("https://example.com/path").await.unwrap();
        assert!(result.contains(&ip));

        let stats = val.cache().stats();
        // get() above counted as a hit, validate()'s resolve() counted as another hit.
        assert!(stats.hits_total >= 2, "expected ≥2 hits, got {}", stats.hits_total);
        assert_eq!(stats.misses_total, 0);
        assert!(stats.hit_rate_pct == Some(100.0));
    }

    #[tokio::test]
    async fn validator_uses_configurable_cache_params() {
        let val = Validator::new(false, 500, 256, 120);
        let s = val.cache().stats();
        assert_eq!(s.max_capacity, 256);
        assert_eq!(s.ttl_secs, 120);
    }
}
