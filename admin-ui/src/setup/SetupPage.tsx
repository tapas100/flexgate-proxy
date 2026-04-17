/**
 * SetupPage
 *
 * Full-screen, sidebar-free wizard that orchestrates all setup steps.
 *
 * On completion (Stage 8):
 *   1. POST /api/setup/complete  (completeSetup — sets isSetupComplete=true,
 *                                 persists mode + selectedStack, writes auth token)
 *   2. markSetupComplete()       (flips SetupGuard bypass flag)
 *   3. Brief 600 ms success splash
 *   4. Mode-aware redirect:
 *        benchmark mode → /benchmarks
 *        full mode      → /dashboard
 *
 * Isolation contract:
 *   - Imports ONLY from src/setup/** — zero coupling to existing app code.
 *   - Does NOT use Layout, Sidebar, Header, or any existing component.
 *   - Navigation out is via react-router-dom's useNavigate (already a dep).
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Typography,
  Stepper,
  Step,
  StepLabel,
  Paper,
  LinearProgress,
  useTheme,
  useMediaQuery,
  Fade,
  Chip,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HexagonIcon from '@mui/icons-material/Hexagon';
import BugReportIcon from '@mui/icons-material/BugReport';
import { useSetup } from './hooks/useSetup';
import { markSetupComplete } from './SetupGuard';
import { useSetupContext } from './SetupStatusContext';
import WelcomeStep from './components/WelcomeStep';
import ModeStep from './components/ModeStep';
import DependenciesStep from './components/DependenciesStep';
import BenchmarkScenariosStep from './components/BenchmarkScenariosStep';
import SetupExecutionStep from './components/SetupExecutionStep';
import RouteStep from './components/RouteStep';
import TestStep from './components/TestStep';
import InstallDepsStep from './components/InstallDepsStep';

// ── Step metadata ─────────────────────────────────────────────────────────────

const STEP_LABELS = ['Welcome', 'Setup Mode', 'Dependencies', 'Install', 'Benchmarks', 'Execution', 'First Route', 'Test & Finish'];

// ── SetupPage ─────────────────────────────────────────────────────────────────

const SetupPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isSmall = useMediaQuery(theme.breakpoints.down('sm'));
  const [redirecting, setRedirecting] = useState(false);

  const setup = useSetup();
  const { refresh: refreshSetupStatus } = useSetupContext();

  /**
   * /setup/full entry point (Stage 11.5 — Upgrade flow).
   *
   * When the user arrives via the "Upgrade to Full Mode" CTA, we land on
   * /setup/full.  We want to pre-select "full" mode and skip the Welcome
   * step so they land directly on the Mode step with Full pre-chosen.
   *
   * This runs once on mount.  It must fire AFTER useSetup() initialises
   * (which is synchronous), so useEffect with [] is the right place.
   */
  useEffect(() => {
    if (location.pathname === '/setup/full') {
      setup.setSelectedMode('full');
      // Advance past Welcome (step 0) to Mode (step 1).
      setup.goNext();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — one-shot on mount only

  /**
   * Called by TestStep's "Go to Dashboard" button.
   *
   * Sequence:
   *   1. POST /api/setup/complete  → sets isSetupComplete=true, writes token to localStorage
   *   2. markSetupComplete()       → flips SetupGuard bypass so guard
   *                                  never redirects back to /setup
   *   3. Show 600 ms success splash
   *   4. navigate based on mode:
   *        benchmark → /benchmarks
   *        full      → /dashboard
   */
  const handleComplete = async () => {
    try {
      await setup.completeSetup();
    } catch {
      // completeSetup sets completeError internally; stay on page.
      return;
    }

    // Prevent SetupGuard from bouncing us back to /setup during the transition.
    markSetupComplete();

    // Refresh the global SetupStatusContext so FeatureGuard sees
    // phase==='complete' immediately — without this it stays 'required'
    // and renders the lock screen on the dashboard.
    await refreshSetupStatus();

    // Brief success splash so the user sees confirmation before leaving.
    setRedirecting(true);
    setTimeout(() => {
      // Prefer the server-provided redirect target; fall back to client-side
      // mode derivation so the button always navigates somewhere sensible.
      const destination =
        setup.redirectTo ??
        (setup.selectedMode === 'benchmark' ? '/benchmarks' : '/dashboard');
      navigate(destination, { replace: true });
    }, 600);
  };

  const progress =
    redirecting
      ? 100
      : (setup.currentStepIndex / (setup.totalSteps - 1)) * 100;

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'grey.50',
      }}
      data-testid="setup-page"
    >
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <Box
        sx={{
          px: { xs: 3, sm: 5 },
          py: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          bgcolor: 'white',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <HexagonIcon sx={{ color: 'primary.main', fontSize: 28 }} />
        <Typography variant="h6" fontWeight={700} letterSpacing={-0.3}>
          FlexGate
        </Typography>
        <Typography
          variant="caption"
          sx={{
            ml: 1,
            px: 1,
            py: 0.25,
            bgcolor: 'primary.50',
            color: 'primary.main',
            borderRadius: 1,
            fontWeight: 600,
            border: '1px solid',
            borderColor: 'primary.200',
          }}
        >
          Setup
        </Typography>

        {/* Dev mode badge — only shown on localhost */}
        {setup.isDevMode && (
          <Chip
            icon={<BugReportIcon sx={{ fontSize: '14px !important' }} />}
            label="DEV MODE"
            size="small"
            color="warning"
            variant="outlined"
            sx={{ ml: 1, fontSize: 11, height: 22, fontWeight: 700 }}
          />
        )}
      </Box>

      {/* ── Progress bar ─────────────────────────────────────────────────── */}
      <LinearProgress
        variant="determinate"
        value={progress}
        sx={{ height: 3 }}
      />

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          gap: 0,
        }}
      >
        {/* Left panel — stepper (hidden on xs) */}
        {!isSmall && (
          <Box
            sx={{
              width: 240,
              flexShrink: 0,
              bgcolor: 'white',
              borderRight: '1px solid',
              borderColor: 'divider',
              display: 'flex',
              flexDirection: 'column',
              pt: 6,
              px: 3,
            }}
          >
            <Typography
              variant="overline"
              color="text.secondary"
              sx={{ mb: 2, letterSpacing: 1.5 }}
            >
              Setup steps
            </Typography>

            <Stepper
              activeStep={setup.currentStepIndex}
              orientation="vertical"
              sx={{
                '& .MuiStepConnector-line': { minHeight: 24 },
              }}
            >
              {STEP_LABELS.map((label) => (
                <Step key={label}>
                  <StepLabel>{label}</StepLabel>
                </Step>
              ))}
            </Stepper>

            <Box sx={{ mt: 'auto', pb: 4 }}>
              <Typography variant="caption" color="text.disabled">
                Step {setup.currentStepIndex + 1} of {setup.totalSteps}
              </Typography>
            </Box>
          </Box>
        )}

        {/* Right panel — active step */}
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            justifyContent: 'center',
            alignItems: { xs: 'flex-start', md: 'center' },
            p: { xs: 3, sm: 5, md: 6 },
          }}
        >
          <Box sx={{ width: '100%', maxWidth: 640 }}>
            {/* Mobile-only step indicator */}
            {isSmall && (
              <Typography
                variant="caption"
                color="text.secondary"
                display="block"
                mb={3}
              >
                Step {setup.currentStepIndex + 1} of {setup.totalSteps} —{' '}
                {STEP_LABELS[setup.currentStepIndex]}
              </Typography>
            )}

            <Paper
              elevation={0}
              variant="outlined"
              sx={{ p: { xs: 3, sm: 4 }, borderRadius: 3, overflow: 'hidden' }}
            >
              <Fade
                key={setup.currentStep}
                in
                timeout={280}
                style={{ display: 'block' }}
              >
                <Box>
                  {setup.currentStep === 'welcome' && (
                    <WelcomeStep
                      form={setup.welcomeForm}
                      onChange={setup.setWelcomeForm}
                      onNext={setup.goNext}
                      isDevMode={setup.isDevMode}
                    />
                  )}

                  {setup.currentStep === 'mode' && (
                    <ModeStep
                      selectedMode={setup.selectedMode}
                      onSelect={setup.setSelectedMode}
                      onNext={setup.saveMode}
                      onBack={setup.goBack}
                      saving={setup.modeLoading}
                      saveError={setup.modeError}
                    />
                  )}

                  {setup.currentStep === 'dependencies' && (
                    <DependenciesStep
                      selectedMode={setup.selectedMode}
                      depsSelection={setup.depsSelection}
                      onToggle={setup.setDepAction}
                      onNext={setup.saveDeps}
                      onBack={setup.goBack}
                      saving={setup.saveDepsLoading}
                      saveError={setup.saveDepsError}
                      detectionReport={setup.detectionReport}
                      detectLoading={setup.detectLoading}
                      detectError={setup.detectError}
                    />
                  )}

                  {setup.currentStep === 'install' && (
                    <InstallDepsStep
                      deps={setup.installDeps}
                      onInstall={setup.installDep}
                      onSkip={setup.skipInstallDep}
                      onNext={setup.goNext}
                      onBack={setup.goBack}
                    />
                  )}

                  {setup.currentStep === 'benchmarks' && (
                    <BenchmarkScenariosStep
                      depsSelection={setup.depsSelection}
                      scenarioSelection={setup.scenarioSelection}
                      onToggle={setup.toggleScenario}
                      onNext={setup.saveBenchmarks}
                      onBack={setup.goBack}
                      saving={setup.saveBenchmarksLoading}
                      saveError={setup.saveBenchmarksError}
                    />
                  )}

                  {setup.currentStep === 'execution' && (
                    <SetupExecutionStep
                      execState={setup.execState}
                      onStart={setup.startRun}
                      onNext={setup.goNext}
                      onBack={setup.goBack}
                      onEvent={setup.dispatchRunEvent}
                    />
                  )}

                  {setup.currentStep === 'route' && (
                    <RouteStep
                      form={setup.routeForm}
                      onChange={setup.setRouteForm}
                      onSave={setup.saveRoute}
                      onNext={setup.goNext}
                      onBack={setup.goBack}
                      saveLoading={setup.saveLoading}
                      saveError={setup.saveError}
                      savedRouteId={setup.savedRouteId}
                      isDevMode={setup.isDevMode}
                    />
                  )}

                  {setup.currentStep === 'test' && (
                    <TestStep
                      routeForm={setup.routeForm}
                      onRunTest={setup.runTest}
                      onBack={setup.goBack}
                      onComplete={handleComplete}
                      testLoading={setup.testLoading}
                      testResult={setup.testResult}
                      completeLoading={setup.completeLoading}
                      completeError={setup.completeError}
                    />
                  )}
                </Box>
              </Fade>
            </Paper>
          </Box>
        </Box>
      </Box>

      {/* ── Success splash (shown briefly before redirect) ─────────────── */}
      <Fade in={redirecting} timeout={300}>
        <Box
          sx={{
            position: 'fixed',
            inset: 0,
            zIndex: 2000,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            bgcolor: 'background.default',
          }}
        >
          <CheckCircleIcon sx={{ fontSize: 64, color: 'success.main' }} />
          <Typography variant="h5" fontWeight={700}>
            Setup complete!
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {setup.selectedMode === 'benchmark'
              ? 'Taking you to the benchmarks…'
              : 'Taking you to the dashboard…'}
          </Typography>
        </Box>
      </Fade>
    </Box>
  );
};

export default SetupPage;
