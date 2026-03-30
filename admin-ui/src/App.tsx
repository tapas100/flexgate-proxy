import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import Login from './components/Auth/Login';
import SSOCallback from './components/SSOCallback';
import ProtectedRoute from './components/Auth/ProtectedRoute';
import { initProcessors, getProcessorInfo } from './utils/metricsProcessor';
import Layout from './components/Layout/Layout';
import Dashboard from './pages/Dashboard';
import RoutesPage from './pages/Routes';
import RulesPage from './pages/Rules';
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
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<SSOCallback />} />
          
          {/* Protected routes */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Layout>
                  <Dashboard />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/routes"
            element={
              <ProtectedRoute>
                <Layout>
                  <RoutesPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/rules"
            element={
              <ProtectedRoute>
                <Layout>
                  <RulesPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/metrics"
            element={
              <ProtectedRoute>
                <Layout>
                  <Metrics />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/logs"
            element={
              <ProtectedRoute>
                <Layout>
                  <Logs />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/oauth"
            element={
              <ProtectedRoute>
                <Layout>
                  <OAuthProviders />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/webhooks"
            element={
              <ProtectedRoute>
                <Layout>
                  <Webhooks />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/webhooks/:id/details"
            element={
              <ProtectedRoute>
                <Layout>
                  <WebhookDetails />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings/*"
            element={
              <ProtectedRoute>
                <Layout>
                  <Settings />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/troubleshooting"
            element={
              <ProtectedRoute>
                <Layout>
                  <Troubleshooting />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/ai-testing"
            element={
              <ProtectedRoute>
                <Layout>
                  <AITesting />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/ai-incidents"
            element={
              <ProtectedRoute>
                <Layout>
                  <AIIncidents />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/ai-incidents/:id"
            element={
              <ProtectedRoute>
                <Layout>
                  <AIIncidentDetail />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/ai-analytics"
            element={
              <ProtectedRoute>
                <Layout>
                  <AIAnalytics />
                </Layout>
              </ProtectedRoute>
            }
          />
          
          {/* Default route */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;
