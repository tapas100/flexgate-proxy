import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
// ── Setup (Stage 1) — isolated pre-layer, does not affect existing routes ──
import SetupGuard from './setup/SetupGuard';
import SetupPage from './setup/SetupPage';
import { SetupStatusProvider } from './setup/SetupStatusContext';
import { FeatureGuard } from './setup/FeatureGuard';
import { ModeProvider } from './context/ModeContext';
import { ModeRedirect } from './components/routing/ModeRedirect';
import LiteDashboard from './pages/LiteDashboard';
import LiteRoutesPage from './pages/LiteRoutesPage';
// ─────────────────────────────────────────────────────────────────────────────
import Login from './components/Auth/Login';
import SSOCallback from './components/SSOCallback';
import ProtectedRoute from './components/Auth/ProtectedRoute';
import { initProcessors, getProcessorInfo } from './utils/metricsProcessor';
import Layout from './components/Layout/Layout';
import Dashboard from './pages/Dashboard';
import RoutesPage from './pages/Routes';
import Metrics from './pages/Metrics';
import Logs from './pages/Logs';
import OAuthProviders from './pages/OAuthProviders';
import Webhooks from './pages/Webhooks';
import WebhookDetails from './pages/WebhookDetails';
import Settings from './pages/Settings';
import Troubleshooting from './pages/Troubleshooting';
import AITesting from './pages/AITesting';
import AIIncidents from './pages/AIIncidents';
import AIIncidentDetail from './pages/AIIncidentDetail';
import AIAnalytics from './pages/AIAnalytics';
import BenchmarkDashboard from './pages/BenchmarkDashboard';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
});

function App() {
  // Initialize WASM and Web Workers on app startup
  useEffect(() => {
    const init = async () => {
      console.log('🚀 Initializing metrics processors...');
      await initProcessors();
      const info = getProcessorInfo();
      console.log(`✅ Metrics Processor initialized:`, info);
      
      // Log performance badge
      if (info.wasmAvailable) {
        console.log('🔥 WASM enabled - 20x performance boost!');
      } else if (info.workerAvailable) {
        console.log('⚡ Web Worker enabled - 3x performance boost!');
      } else {
        console.log('📊 Using synchronous processing');
      }
    };
    init();
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <SetupStatusProvider>
          <ModeProvider>
          {/* SetupGuard: checks /api/setup/status once on mount.
              If isSetupComplete===false it redirects every path to /setup.
              On error or complete it renders children unchanged.
              It never wraps, replaces, or alters any existing route. */}
          <SetupGuard>
            <Routes>
            {/* ── Setup route (public, no ProtectedRoute) ── */}
            <Route path="/setup" element={<SetupPage />} />
            {/* /setup/mode, /setup/dependencies, /setup/benchmarks, /setup/execution are named aliases — SetupPage drives step state internally */}
            <Route path="/setup/mode" element={<SetupPage />} />
            <Route path="/setup/dependencies" element={<SetupPage />} />
            <Route path="/setup/benchmarks" element={<SetupPage />} />
            <Route path="/setup/execution" element={<SetupPage />} />
            {/* /setup/full — upgrade entry point from Lite mode; SetupPage reads ?mode=full */}
            <Route path="/setup/full" element={<SetupPage />} />

            {/* Public routes */}
            <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<SSOCallback />} />
          
          {/* Protected routes */}
          <Route
            path="/routes"
            element={
              <ProtectedRoute>
                {/* Full mode → full route management; Lite/benchmark → read-only view */}
                <FeatureGuard requiredMode="full" redirect={false}>
                  <Layout>
                    <RoutesPage />
                  </Layout>
                </FeatureGuard>
              </ProtectedRoute>
            }
          />
          {/* Lite route management — read-only, upgrade-teaser page */}
          <Route
            path="/routes/lite"
            element={
              <ProtectedRoute>
                <FeatureGuard requiredMode="benchmark">
                  <Layout>
                    <LiteRoutesPage />
                  </Layout>
                </FeatureGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/metrics"
            element={
              <ProtectedRoute>
                <FeatureGuard requiredMode="full" redirect>
                  <Layout>
                    <Metrics />
                  </Layout>
                </FeatureGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/logs"
            element={
              <ProtectedRoute>
                <FeatureGuard requiredMode="full" redirect>
                  <Layout>
                    <Logs />
                  </Layout>
                </FeatureGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/oauth"
            element={
              <ProtectedRoute>
                <FeatureGuard requiredMode="full" redirect>
                  <Layout>
                    <OAuthProviders />
                  </Layout>
                </FeatureGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/webhooks"
            element={
              <ProtectedRoute>
                <FeatureGuard requiredMode="full" redirect>
                  <Layout>
                    <Webhooks />
                  </Layout>
                </FeatureGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/webhooks/:id/details"
            element={
              <ProtectedRoute>
                <FeatureGuard requiredMode="full" redirect>
                  <Layout>
                    <WebhookDetails />
                  </Layout>
                </FeatureGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings/*"
            element={
              <ProtectedRoute>
                <FeatureGuard requiredMode="full" redirect>
                  <Layout>
                    <Settings />
                  </Layout>
                </FeatureGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/troubleshooting"
            element={
              <ProtectedRoute>
                <FeatureGuard requiredMode="full" redirect>
                  <Layout>
                    <Troubleshooting />
                  </Layout>
                </FeatureGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/ai-testing"
            element={
              <ProtectedRoute>
                <FeatureGuard requiredMode="full" redirect>
                  <Layout>
                    <AITesting />
                  </Layout>
                </FeatureGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/ai-incidents"
            element={
              <ProtectedRoute>
                <FeatureGuard requiredMode="full" redirect>
                  <Layout>
                    <AIIncidents />
                  </Layout>
                </FeatureGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/ai-incidents/:id"
            element={
              <ProtectedRoute>
                <FeatureGuard requiredMode="full" redirect>
                  <Layout>
                    <AIIncidentDetail />
                  </Layout>
                </FeatureGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/ai-analytics"
            element={
              <ProtectedRoute>
                <FeatureGuard requiredMode="full" redirect>
                  <Layout>
                    <AIAnalytics />
                  </Layout>
                </FeatureGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/benchmarks"
            element={
              <ProtectedRoute>
                <FeatureGuard requiredMode="any">
                  <Layout>
                    <BenchmarkDashboard />
                  </Layout>
                </FeatureGuard>
              </ProtectedRoute>
            }
          />

          {/* ── Lite Mode home (/lite) ── */}
          <Route
            path="/lite"
            element={
              <ProtectedRoute>
                <FeatureGuard requiredMode="benchmark">
                  <Layout>
                    <LiteDashboard />
                  </Layout>
                </FeatureGuard>
              </ProtectedRoute>
            }
          />

          {/* ── Mode-aware default redirects ── */}
          {/*   /            → homeRoute (/lite or /dashboard)         */}
          {/*   *            → homeRoute (unknown paths fall here too)  */}
          {/*   /dashboard   → if lite user, redirect to /lite          */}
          {/*   /lite        → if full user, redirect to /dashboard      */}
          <Route path="/" element={<ModeRedirect />} />
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <FeatureGuard requiredMode="full" redirect>
                <Layout>
                  <Dashboard />
                </Layout>
              </FeatureGuard>
            </ProtectedRoute>
          } />
          <Route path="*" element={<ModeRedirect />} />
            </Routes>
          </SetupGuard>
          </ModeProvider>
        </SetupStatusProvider>
      </Router>
    </ThemeProvider>
  );
}

export default App;
