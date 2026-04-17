/**
 * ModeRedirect
 *
 * Stage 11 — Mode-Based Dashboards, Stage 2: Routing
 *
 * Handles all mode-aware redirect decisions so App.tsx stays declarative.
 *
 * Rules:
 *   isResolved === false  → render null (SetupGuard's spinner covers this)
 *   mode === 'lite'       → /lite
 *   mode === 'full'       → /dashboard
 *   mode === 'unknown'    → /setup  (not configured yet; SetupGuard also
 *                                    handles this, belt-and-suspenders)
 *
 * Cross-mode trespass:
 *   A lite user landing on /dashboard → redirected to /lite
 *   A full user landing on /lite      → redirected to /dashboard
 *   These are handled via the wildcard route in App.tsx calling this
 *   component, and via the explicit /dashboard and /lite catch routes.
 *
 * Usage (App.tsx):
 *   <Route path="/" element={<ModeRedirect />} />
 *   <Route path="*" element={<ModeRedirect />} />
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useMode } from '../../context/ModeContext';

const LITE_PREFIX = '/lite';

/**
 * Paths that are Full-mode only.
 * A Lite user landing on any of these (e.g. via back-button or direct URL)
 * is redirected to /lite by the wildcard * route → ModeRedirect.
 *
 * Note: /benchmarks is intentionally absent — it is mode="any" and
 * accessible to both Lite and Full users.
 */
const FULL_PREFIXES = [
  '/dashboard',
  // '/routes' is intentionally absent — Lite users have a read-only view at
  // /routes/lite, and /routes itself shows a mode-gated screen (not a silent redirect).
  '/metrics',
  '/logs',
  '/oauth',
  '/webhooks',
  '/settings',
  '/troubleshooting',
  '/ai-testing',
  '/ai-incidents',
  '/ai-analytics',
];

export function ModeRedirect() {
  const { homeRoute, isResolved, isLite, isFull } = useMode();
  const { pathname } = useLocation();

  // Still loading — SetupGuard's spinner is covering the screen.
  if (!isResolved) return null;

  // Cross-mode trespass: lite user hitting a full-only path.
  if (isLite && FULL_PREFIXES.some((p) => pathname.startsWith(p))) {
    return <Navigate to={LITE_PREFIX} replace />;
  }

  // Cross-mode trespass: full user hitting /lite.
  if (isFull && pathname.startsWith(LITE_PREFIX)) {
    return <Navigate to="/dashboard" replace />;
  }

  // Default: send to the mode's home.
  return <Navigate to={homeRoute} replace />;
}
