//! DNS resolution cache — TTL-based with LRU eviction, stale-while-revalidate,
//! and full Prometheus metrics.
//!
//! # Design
//!
//! ```text
//!  resolve(host)
//!      │
//!      ├─ cache hit (fresh)    → return immediately        ~0 µs
//!      │
//!      ├─ cache hit (stale)    → return stale + spawn
//!      │   stale-while-        background refresh         ~0 µs (caller)
//!      │   revalidate          async refresh              ~DNS RTT (bg)
//!      │
//!      └─ cache miss           → live DNS + insert        ~DNS RTT
//! ```
//!
//! # Eviction
//!
//! moka evicts via:
//!   1. **Time-to-live** — entry removed when it exceeds [`DNS_TTL`].
//!   2. **Time-to-idle** — entry removed when unread for 2× TTL.
//!   3. **Capacity LRU** — when the cache is full, the least-recently-used
//!      entry is evicted.  The eviction listener increments a Prometheus
//!      counter so operators can detect cache pressure.
//!
//! # Stale-while-revalidate
//!
//! When an entry is between 50–100% of its TTL ("stale window"), the cached
//! value is returned immediately and a background task refreshes it.  This
//! eliminates the latency spike that occurs when a popular entry expires.

use std::{
    net::IpAddr,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};

use moka::future::Cache;

/// Maximum number of distinct hostnames to cache (default, overridable).
pub const DEFAULT_MAX_ENTRIES: u64 = 8_192;

/// Default DNS result TTL — 30 s is conservative; most DNS TTLs are ≥ 60 s.
/// Keeping this short limits the rebinding attack window.
pub const DEFAULT_DNS_TTL_SECS: u64 = 30;

// ── per-entry value ───────────────────────────────────────────────────────────

/// A cached DNS result, together with the instant it was inserted.
///
/// Storing the insert time lets us implement stale-while-revalidate:
/// entries in the "stale window" (50%–100% of TTL) are returned immediately
/// while a background task refreshes them asynchronously.
#[derive(Clone, Debug)]
pub struct CachedEntry {
    /// The resolved IP addresses.
    pub addrs: Arc<Vec<IpAddr>>,
    /// When this entry was inserted into the cache.
    pub inserted_at: Instant,
    /// The TTL this entry was inserted with (may differ if changed at runtime).
    pub ttl: Duration,
}

impl CachedEntry {
    fn new(addrs: Vec<IpAddr>, ttl: Duration) -> Self {
        Self {
            addrs: Arc::new(addrs),
            inserted_at: Instant::now(),
            ttl,
        }
    }

    /// Age of this entry.
    pub fn age(&self) -> Duration {
        self.inserted_at.elapsed()
    }

    /// Fraction of TTL consumed (0.0 = fresh, 1.0 = expired).
    pub fn staleness(&self) -> f64 {
        let age = self.age().as_secs_f64();
        let ttl = self.ttl.as_secs_f64();
        if ttl == 0.0 { 1.0 } else { (age / ttl).min(1.0) }
    }

    /// True when this entry is in the stale-while-revalidate window (> 50% TTL used).
    pub fn is_stale(&self) -> bool {
        self.staleness() > 0.5
    }
}

// ── stats snapshot ────────────────────────────────────────────────────────────

/// A point-in-time snapshot of cache statistics.
/// Returned by [`DnsCache::stats`] and served at `GET /cache/stats`.
#[derive(Debug, Clone, serde::Serialize)]
pub struct CacheStats {
    /// Current number of entries in the cache.
    pub entry_count: u64,
    /// Maximum allowed entries.
    pub max_capacity: u64,
    /// Configured TTL in seconds.
    pub ttl_secs: u64,
    /// Total cache hits since startup.
    pub hits_total: u64,
    /// Total cache misses since startup.
    pub misses_total: u64,
    /// Total entries evicted since startup (TTL + LRU + idle).
    pub evictions_total: u64,
    /// Total stale-while-revalidate background refreshes triggered.
    pub swr_refreshes_total: u64,
    /// Cache hit rate as a percentage (0–100), or null if no requests yet.
    pub hit_rate_pct: Option<f64>,
}

// ── cache ─────────────────────────────────────────────────────────────────────

/// Thread-safe, async DNS result cache.
///
/// Clone is cheap — all inner state is `Arc`-wrapped.
#[derive(Clone, Debug)]
pub struct DnsCache {
    inner:        Cache<Arc<str>, CachedEntry>,
    ttl:          Duration,
    max_capacity: u64,
    // Counters are stored outside moka so we can read them cheaply.
    hits:         Arc<AtomicU64>,
    misses:       Arc<AtomicU64>,
    evictions:    Arc<AtomicU64>,
    swr_refreshes: Arc<AtomicU64>,
}

impl DnsCache {
    /// Create a cache with the given capacity and TTL.
    pub fn new(max_entries: u64, ttl_secs: u64) -> Self {
        let ttl          = Duration::from_secs(ttl_secs);
        let idle_ttl     = Duration::from_secs(ttl_secs * 2);

        let evictions = Arc::new(AtomicU64::new(0));
        let ev_clone  = Arc::clone(&evictions);

        let inner = Cache::builder()
            .max_capacity(max_entries)
            .time_to_live(ttl)
            .time_to_idle(idle_ttl)
            // Eviction listener: fired for TTL, idle, and capacity evictions.
            // We increment our counter and emit a Prometheus counter.
            .eviction_listener(move |_key, _val, _cause| {
                ev_clone.fetch_add(1, Ordering::Relaxed);
                metrics::counter!("flexgate_security_dns_cache_evictions_total")
                    .increment(1);
            })
            .build();

        Self {
            inner,
            ttl,
            max_capacity: max_entries,
            hits:          Arc::new(AtomicU64::new(0)),
            misses:        Arc::new(AtomicU64::new(0)),
            evictions,
            swr_refreshes: Arc::new(AtomicU64::new(0)),
        }
    }

    // ── read ──────────────────────────────────────────────────────────────────

    /// Look up `host`.
    ///
    /// Returns `(entry, is_stale)`.  A stale entry is still valid but the
    /// caller should trigger a background refresh via [`DnsCache::refresh_bg`].
    ///
    /// Returns `None` on a complete miss.
    pub async fn get(&self, host: &str) -> Option<(CachedEntry, bool)> {
        let entry = self.inner.get(host).await?;
        let stale = entry.is_stale();
        if stale {
            // Stale hit — record as a hit (data returned) but also track SWR.
            metrics::counter!("flexgate_security_dns_cache_stale_hits_total").increment(1);
        }
        self.hits.fetch_add(1, Ordering::Relaxed);
        metrics::counter!("flexgate_security_dns_cache_hits_total").increment(1);
        Some((entry, stale))
    }

    /// Record a cache miss (called by the resolver when `get` returns `None`).
    pub fn record_miss(&self) {
        self.misses.fetch_add(1, Ordering::Relaxed);
        metrics::counter!("flexgate_security_dns_cache_misses_total").increment(1);
    }

    // ── write ─────────────────────────────────────────────────────────────────

    /// Insert resolved addresses for `host`.
    ///
    /// The key is interned as an `Arc<str>` so repeated inserts for the same
    /// hostname share the allocation.
    pub async fn insert(&self, host: &str, addrs: Vec<IpAddr>) {
        let key: Arc<str> = Arc::from(host);
        let entry = CachedEntry::new(addrs, self.ttl);
        self.inner.insert(key, entry).await;
        // Update cache-size gauge after write.
        metrics::gauge!("flexgate_security_dns_cache_entries")
            .set(self.inner.entry_count() as f64);
    }

    /// Invalidate a single hostname (e.g. after DNS rebinding detection).
    pub async fn invalidate(&self, host: &str) {
        self.inner.invalidate(host).await;
        metrics::gauge!("flexgate_security_dns_cache_entries")
            .set(self.inner.entry_count() as f64);
    }

    // ── stale-while-revalidate ────────────────────────────────────────────────

    /// Record that a stale-while-revalidate background refresh was triggered.
    pub fn record_swr_refresh(&self) {
        self.swr_refreshes.fetch_add(1, Ordering::Relaxed);
        metrics::counter!("flexgate_security_dns_swr_refreshes_total").increment(1);
    }

    // ── stats ─────────────────────────────────────────────────────────────────

    /// Return a point-in-time snapshot of cache statistics.
    pub fn stats(&self) -> CacheStats {
        let hits      = self.hits.load(Ordering::Relaxed);
        let misses    = self.misses.load(Ordering::Relaxed);
        let total     = hits + misses;
        let hit_rate  = if total == 0 { None } else { Some(hits as f64 / total as f64 * 100.0) };

        CacheStats {
            entry_count:      self.inner.entry_count(),
            max_capacity:     self.max_capacity,
            ttl_secs:         self.ttl.as_secs(),
            hits_total:       hits,
            misses_total:     misses,
            evictions_total:  self.evictions.load(Ordering::Relaxed),
            swr_refreshes_total: self.swr_refreshes.load(Ordering::Relaxed),
            hit_rate_pct:     hit_rate,
        }
    }

    /// Current entry count.
    #[allow(dead_code)]
    pub fn len(&self) -> u64 {
        self.inner.entry_count()
    }

    /// Configured TTL.
    #[allow(dead_code)]
    pub fn ttl(&self) -> Duration {
        self.ttl
    }

    /// Configured max capacity.
    #[allow(dead_code)]
    pub fn max_capacity(&self) -> u64 {
        self.max_capacity
    }
}

impl Default for DnsCache {
    fn default() -> Self {
        Self::new(DEFAULT_MAX_ENTRIES, DEFAULT_DNS_TTL_SECS)
    }
}

// ── unit tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::{IpAddr, Ipv4Addr};

    fn cache() -> DnsCache { DnsCache::new(128, 30) }

    #[tokio::test]
    async fn insert_and_get() {
        let c = cache();
        let addrs = vec![IpAddr::V4(Ipv4Addr::new(93, 184, 216, 34))];
        c.insert("example.com", addrs.clone()).await;

        let (entry, _stale) = c.get("example.com").await.expect("should be cached");
        assert_eq!(*entry.addrs, addrs);
    }

    #[tokio::test]
    async fn miss_returns_none() {
        let c = cache();
        assert!(c.get("not-in-cache.example.com").await.is_none());
    }

    #[tokio::test]
    async fn invalidate_removes_entry() {
        let c = cache();
        c.insert("cloudflare.com", vec![IpAddr::V4(Ipv4Addr::new(1, 1, 1, 1))]).await;
        c.invalidate("cloudflare.com").await;
        assert!(c.get("cloudflare.com").await.is_none());
    }

    #[tokio::test]
    async fn hit_rate_tracking() {
        let c = cache();
        c.insert("a.example.com", vec![IpAddr::V4(Ipv4Addr::new(1, 2, 3, 4))]).await;

        // 1 miss
        c.record_miss();
        assert!(c.get("missing.example.com").await.is_none());

        // 2 hits
        c.get("a.example.com").await.unwrap();
        c.get("a.example.com").await.unwrap();

        let stats = c.stats();
        assert_eq!(stats.hits_total, 2);
        assert_eq!(stats.misses_total, 1);
        let hr = stats.hit_rate_pct.unwrap();
        assert!((hr - 66.66).abs() < 1.0, "hit rate {hr:.2}% ≠ ~66%");
    }

    #[tokio::test]
    async fn stats_reports_capacity() {
        let c = DnsCache::new(512, 60);
        let s = c.stats();
        assert_eq!(s.max_capacity, 512);
        assert_eq!(s.ttl_secs, 60);
        assert_eq!(s.entry_count, 0);
    }

    #[tokio::test]
    async fn staleness_fresh_entry() {
        let entry = CachedEntry::new(
            vec![IpAddr::V4(Ipv4Addr::new(1, 1, 1, 1))],
            Duration::from_secs(60),
        );
        // Freshly inserted — age ≈ 0, staleness ≈ 0, not stale.
        assert!(entry.staleness() < 0.1, "staleness={:.3}", entry.staleness());
        assert!(!entry.is_stale());
    }

    #[tokio::test]
    async fn swr_counter_increments() {
        let c = cache();
        c.record_swr_refresh();
        c.record_swr_refresh();
        assert_eq!(c.stats().swr_refreshes_total, 2);
    }
}
