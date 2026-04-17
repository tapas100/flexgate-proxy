/**
 * TestStep  — Stage 5
 *
 * Fires a real proxy request the moment this step mounts (auto-run).
 * Shows:
 *   ① Status code + latency chips
 *   ② Response viewer  — pretty JSON OR raw text
 *   ③ Request log row  — method / path / status / latency / upstream / via
 *
 * Fallback chain (in useSetup):
 *   primary  → GET /<routePath>  (through FlexGate proxy)
 *   fallback → GET /api/test     (lightweight connectivity smoke-test)
 *
 * "Go to Dashboard" is enabled the moment a test result exists (even failure).
 * DO NOT depend on full logs system — log is synthetic, built from the probe.
 *
 * Isolation contract: zero imports outside src/setup/.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Stack,
  Alert,
  CircularProgress,
  Chip,
  Divider,
  IconButton,
  Collapse,
  Tooltip,
  Skeleton,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import NetworkCheckIcon from '@mui/icons-material/NetworkCheck';
import DashboardIcon from '@mui/icons-material/Dashboard';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import RefreshIcon from '@mui/icons-material/Refresh';
import type { RouteFormState, TestResult } from '../hooks/useSetup';

// ── prop types ────────────────────────────────────────────────────────────────

interface TestStepProps {
  routeForm: RouteFormState;
  onRunTest: () => Promise<void>;
  onBack: () => void;
  onComplete: () => Promise<void>;
  testLoading: boolean;
  testResult: TestResult | null;
  completeLoading: boolean;
  completeError: string | null;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function statusColor(
  code: number | null,
): 'success' | 'error' | 'warning' | 'default' {
  if (code === null) return 'default';
  if (code < 300) return 'success';
  if (code < 500) return 'warning';
  return 'error';
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

// ── LoadingSkeleton ───────────────────────────────────────────────────────────

const LoadingSkeleton: React.FC = () => (
  <Box>
    {/* status row */}
    <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
      <Skeleton variant="rounded" width={96} height={24} />
      <Skeleton variant="rounded" width={64} height={24} />
    </Stack>
    {/* response viewer */}
    <Paper variant="outlined" sx={{ borderRadius: 2, mb: 2, overflow: 'hidden' }}>
      <Box sx={{ px: 2, py: 1, bgcolor: 'grey.50', borderBottom: '1px solid', borderColor: 'divider' }}>
        <Skeleton width={100} height={16} />
      </Box>
      <Box sx={{ p: 2, bgcolor: '#1e1e1e' }}>
        {[80, 60, 95, 55, 70, 40].map((w, i) => (
          <Skeleton key={i} width={`${w}%`} height={14} sx={{ bgcolor: 'grey.700', mb: 0.5 }} />
        ))}
      </Box>
    </Paper>
    {/* log table */}
    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
      <Box sx={{ px: 2, py: 1, bgcolor: 'grey.50', borderBottom: '1px solid', borderColor: 'divider' }}>
        <Skeleton width={120} height={16} />
      </Box>
      <Box sx={{ px: 2, py: 1.5 }}>
        <Skeleton height={20} />
      </Box>
    </Paper>
  </Box>
);

// ── ResponseViewer ────────────────────────────────────────────────────────────

interface ResponseViewerProps {
  result: TestResult;
}

const ResponseViewer: React.FC<ResponseViewerProps> = ({ result }) => {
  const [copied, setCopied] = useState(false);

  const content =
    result.responseBody !== null
      ? prettyJson(result.responseBody)
      : result.rawBody ?? '(empty response)';

  const isJson = result.responseBody !== null;

  const handleCopy = () => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, mb: 2, overflow: 'hidden' }}>
      {/* toolbar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1,
          bgcolor: 'grey.50',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="caption" fontWeight={600} color="text.secondary">
            Response Body
          </Typography>
          <Chip
            label={isJson ? 'JSON' : 'TEXT'}
            size="small"
            variant="outlined"
            sx={{ fontSize: 10, height: 18, fontFamily: 'monospace' }}
          />
          {result.testedUrl && (
            <Tooltip title={result.testedUrl}>
              <Chip
                label={result.requestLog[0]?.via === 'fallback' ? 'via /api/test' : 'via proxy'}
                size="small"
                color={result.requestLog[0]?.via === 'fallback' ? 'warning' : 'primary'}
                variant="outlined"
                sx={{ fontSize: 10, height: 18 }}
              />
            </Tooltip>
          )}
        </Stack>
        <Tooltip title={copied ? 'Copied!' : 'Copy'}>
          <IconButton size="small" onClick={handleCopy}>
            <ContentCopyIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* code area */}
      <Box
        component="pre"
        sx={{
          m: 0,
          p: 2,
          fontSize: 12,
          fontFamily: '"Fira Code", "Cascadia Code", "Courier New", monospace',
          lineHeight: 1.65,
          overflowX: 'auto',
          maxHeight: 300,
          overflowY: 'auto',
          bgcolor: '#1e1e1e',
          color: '#d4d4d4',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {content}
      </Box>
    </Paper>
  );
};

// ── RequestLogTable ───────────────────────────────────────────────────────────

interface RequestLogTableProps {
  result: TestResult;
}

const RequestLogTable: React.FC<RequestLogTableProps> = ({ result }) => {
  const [open, setOpen] = useState(true);

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, mb: 2, overflow: 'hidden' }}>
      {/* header row — clickable to collapse */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1,
          bgcolor: 'grey.50',
          borderBottom: open ? '1px solid' : 'none',
          borderColor: 'divider',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={() => setOpen((v) => !v)}
      >
        <Typography variant="caption" fontWeight={600} color="text.secondary">
          Request Log&nbsp;
          <Box component="span" sx={{ color: 'text.disabled' }}>
            ({result.requestLog.length})
          </Box>
        </Typography>
        <IconButton size="small" tabIndex={-1}>
          {open ? (
            <ExpandLessIcon sx={{ fontSize: 16 }} />
          ) : (
            <ExpandMoreIcon sx={{ fontSize: 16 }} />
          )}
        </IconButton>
      </Box>

      <Collapse in={open}>
        <Box sx={{ overflowX: 'auto' }}>
          <Box
            component="table"
            sx={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 12,
              fontFamily: '"Fira Code", "Cascadia Code", monospace',
            }}
          >
            <Box component="thead">
              <Box component="tr">
                {['Time', 'Method', 'Path', 'Status', 'Latency', 'Via', 'Upstream'].map(
                  (h) => (
                    <Box
                      key={h}
                      component="th"
                      sx={{
                        textAlign: 'left',
                        px: 2,
                        py: 1,
                        fontSize: 11,
                        fontWeight: 600,
                        color: 'text.secondary',
                        fontFamily: 'inherit',
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        whiteSpace: 'nowrap',
                        bgcolor: 'grey.50',
                      }}
                    >
                      {h}
                    </Box>
                  ),
                )}
              </Box>
            </Box>

            <Box component="tbody">
              {result.requestLog.map((entry, i) => (
                <Box
                  key={i}
                  component="tr"
                  sx={{
                    '&:hover': { bgcolor: 'action.hover' },
                    borderBottom:
                      i < result.requestLog.length - 1 ? '1px solid' : 'none',
                    borderColor: 'divider',
                  }}
                >
                  {/* Time */}
                  <Box
                    component="td"
                    sx={{ px: 2, py: 1.25, color: 'text.secondary', whiteSpace: 'nowrap' }}
                  >
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </Box>

                  {/* Method */}
                  <Box component="td" sx={{ px: 2, py: 1.25 }}>
                    <Chip
                      label={entry.method}
                      size="small"
                      color="primary"
                      variant="outlined"
                      sx={{ fontSize: 11, height: 20 }}
                    />
                  </Box>

                  {/* Path */}
                  <Box
                    component="td"
                    sx={{ px: 2, py: 1.25, color: 'text.primary', fontFamily: 'monospace' }}
                  >
                    {entry.path}
                  </Box>

                  {/* Status */}
                  <Box component="td" sx={{ px: 2, py: 1.25 }}>
                    {entry.status !== null ? (
                      <Chip
                        label={entry.status}
                        size="small"
                        color={statusColor(entry.status)}
                        variant="filled"
                        sx={{ fontSize: 11, height: 20 }}
                      />
                    ) : (
                      <Typography variant="caption" color="text.disabled">
                        —
                      </Typography>
                    )}
                  </Box>

                  {/* Latency */}
                  <Box
                    component="td"
                    sx={{ px: 2, py: 1.25, color: 'text.secondary', whiteSpace: 'nowrap' }}
                  >
                    {entry.latencyMs !== null ? `${entry.latencyMs} ms` : '—'}
                  </Box>

                  {/* Via */}
                  <Box component="td" sx={{ px: 2, py: 1.25 }}>
                    <Chip
                      label={entry.via}
                      size="small"
                      color={entry.via === 'proxy' ? 'primary' : 'warning'}
                      variant="outlined"
                      sx={{ fontSize: 10, height: 18 }}
                    />
                  </Box>

                  {/* Upstream */}
                  <Box
                    component="td"
                    sx={{
                      px: 2,
                      py: 1.25,
                      color: 'text.secondary',
                      maxWidth: 200,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <Tooltip title={entry.upstream} placement="top">
                      <span>{entry.upstream}</span>
                    </Tooltip>
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      </Collapse>
    </Paper>
  );
};

// ── TestStep ──────────────────────────────────────────────────────────────────

const TestStep: React.FC<TestStepProps> = ({
  routeForm,
  onRunTest,
  onBack,
  onComplete,
  testLoading,
  testResult,
  completeLoading,
  completeError,
}) => {
  // Auto-run the test once when this step first mounts.
  const didAutoRun = useRef(false);
  useEffect(() => {
    if (!didAutoRun.current && !testResult && !testLoading) {
      didAutoRun.current = true;
      onRunTest();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const canComplete = testResult !== null;

  // Derived header state
  const headerBg = testResult?.ok
    ? 'success.main'
    : testResult && !testResult.ok
    ? 'error.main'
    : 'primary.main';

  const headerTitle = testLoading
    ? 'Running test…'
    : testResult?.ok
    ? 'Route is live!'
    : testResult
    ? 'Test failed'
    : 'Test your route';

  const headerSub = testLoading
    ? 'Sending a real request through your proxy route…'
    : testResult?.ok
    ? 'End-to-end connectivity confirmed. Ready for the dashboard.'
    : testResult
    ? 'Something went wrong. You can still open the dashboard and troubleshoot.'
    : 'Verifying connectivity…';

  return (
    <Box sx={{ width: '100%' }}>

      {/* ── Header ── */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 1 }}>
        <Box
          sx={{
            width: 48,
            height: 48,
            borderRadius: 2,
            bgcolor: headerBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            flexShrink: 0,
            transition: 'background-color 0.4s',
          }}
        >
          {testLoading ? (
            <CircularProgress size={22} sx={{ color: 'white' }} />
          ) : testResult?.ok ? (
            <CheckCircleIcon />
          ) : testResult ? (
            <ErrorIcon />
          ) : (
            <NetworkCheckIcon />
          )}
        </Box>
        <Box>
          <Typography variant="h5" fontWeight={700} lineHeight={1.3}>
            {headerTitle}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {headerSub}
          </Typography>
        </Box>
      </Box>

      <Box sx={{ my: 3 }} />

      {/* ── Route summary ── */}
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 3 }}>
        <Typography variant="caption" color="text.secondary" display="block" mb={1}>
          Route under test
        </Typography>
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          flexWrap="wrap"
          sx={{ gap: 1 }}
        >
          <Chip label="GET" size="small" color="primary" variant="outlined" />
          <Typography variant="body2" fontFamily="monospace">
            {routeForm.routePath}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            →
          </Typography>
          <Typography
            variant="body2"
            fontFamily="monospace"
            color="text.secondary"
            sx={{ wordBreak: 'break-all' }}
          >
            {routeForm.upstreamUrl}
          </Typography>
        </Stack>
      </Paper>

      {/* ── Loading skeleton ── */}
      {testLoading && <LoadingSkeleton />}

      {/* ── Result panels (shown after test completes) ── */}
      {!testLoading && testResult && (
        <Box data-testid="setup-test-result">

          {/* Status + latency chips */}
          <Stack
            direction="row"
            spacing={1.5}
            alignItems="center"
            flexWrap="wrap"
            sx={{ mb: 2, gap: 1 }}
          >
            <Chip
              icon={testResult.ok ? <CheckCircleIcon /> : <ErrorIcon />}
              label={
                testResult.statusCode !== null
                  ? `HTTP ${testResult.statusCode}`
                  : 'No response'
              }
              color={statusColor(testResult.statusCode)}
              size="small"
              variant="filled"
            />
            {testResult.latencyMs !== null && (
              <Chip
                label={`${testResult.latencyMs} ms`}
                size="small"
                variant="outlined"
                sx={{ fontFamily: 'monospace' }}
              />
            )}
            {testResult.errorMessage && (
              <Typography variant="caption" color="error.main">
                {testResult.errorMessage}
              </Typography>
            )}
          </Stack>

          {/* Response viewer */}
          <ResponseViewer result={testResult} />

          {/* Request log */}
          <RequestLogTable result={testResult} />

        </Box>
      )}

      {/* ── Advisories ── */}
      {!testLoading && testResult && !testResult.ok && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {testResult.requestLog[0]?.via === 'fallback'
            ? 'Could not reach your proxy route — used /api/test as a fallback. Check that FlexGate is running and the route path is correct.'
            : 'Test did not succeed. You can finish setup and troubleshoot from the dashboard.'}
        </Alert>
      )}

      {completeError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {completeError}
        </Alert>
      )}

      <Divider sx={{ mb: 3 }} />

      {/* ── Navigation ── */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Button
          variant="outlined"
          onClick={onBack}
          disabled={testLoading || completeLoading}
          data-testid="setup-test-back"
        >
          Back
        </Button>

        <Stack direction="row" spacing={1.5}>
          {/* Re-run */}
          <Button
            variant="outlined"
            startIcon={
              testLoading ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <RefreshIcon />
              )
            }
            disabled={testLoading || completeLoading}
            onClick={onRunTest}
            data-testid="setup-run-test"
          >
            {testLoading ? 'Testing…' : 'Re-run'}
          </Button>

          {/* Go to Dashboard */}
          <Button
            variant="contained"
            size="large"
            disabled={!canComplete || completeLoading || testLoading}
            onClick={onComplete}
            data-testid="setup-complete"
            startIcon={
              completeLoading ? (
                <CircularProgress size={18} color="inherit" />
              ) : (
                <DashboardIcon />
              )
            }
            sx={{ minWidth: 180, fontWeight: 700 }}
          >
            {completeLoading ? 'Finishing…' : 'Go to Dashboard'}
          </Button>
        </Stack>
      </Box>
    </Box>
  );
};

export default TestStep;
