/**
 * SetupExecutionStep
 *
 * Stage 7 — Setup Execution
 *
 * Drives POST /api/setup/run then subscribes to GET /api/setup/run/stream
 * and renders:
 *   - Overall progress bar (0-100%)
 *   - Task list with per-task status icons
 *   - Scrolling log panel with timestamped lines
 *
 * Auto-starts when the step becomes visible.
 * On EventDone → shows a success state and enables the Continue button.
 * On fatal error → shows an error banner with a Retry button.
 */

import React, { useCallback, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  LinearProgress,
  Button,
  Divider,
  Chip,
  Fade,
  Alert,
  CircularProgress,
  Paper,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import CancelIcon from '@mui/icons-material/Cancel';
import SkipNextIcon from '@mui/icons-material/SkipNext';

// ── SSE event types (mirrors runner.EventType) ────────────────────────────────

export type RunEventType =
  | 'connected'
  | 'started'
  | 'task_begin'
  | 'task_done'
  | 'task_skip'
  | 'task_fail'
  | 'log'
  | 'progress'
  | 'done'
  | 'error';

export type TaskStatus = 'pending' | 'running' | 'done' | 'skipped' | 'failed';

export interface RunEvent {
  type: RunEventType;
  taskId?: string;
  taskName?: string;
  status?: TaskStatus;
  message?: string;
  progress?: number;
  fatal?: boolean;
  timestamp: string;
}

// ── Local state shapes ────────────────────────────────────────────────────────

export interface TaskState {
  id: string;
  name: string;
  status: TaskStatus;
}

export interface LogLine {
  ts: string;
  taskId?: string;
  message: string;
  level: 'info' | 'error' | 'skip';
}

// ── ExecutionState (exported for useSetup) ────────────────────────────────────

export type RunPhase = 'idle' | 'running' | 'done' | 'error';

export interface ExecutionState {
  phase: RunPhase;
  progress: number;       // 0-100
  tasks: TaskState[];
  logs: LogLine[];
  errorMessage: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function apiUrl(path: string): string {
  const base = (process.env.REACT_APP_API_URL ?? '').replace(/\/$/, '');
  return `${base}${path}`;
}

function taskStatusIcon(status: TaskStatus) {
  switch (status) {
    case 'done':    return <CheckCircleIcon sx={{ color: 'success.main' }} fontSize="small" />;
    case 'running': return <CircularProgress size={16} thickness={5} />;
    case 'skipped': return <SkipNextIcon sx={{ color: 'text.disabled' }} fontSize="small" />;
    case 'failed':  return <CancelIcon sx={{ color: 'error.main' }} fontSize="small" />;
    default:        return <RadioButtonUncheckedIcon sx={{ color: 'text.disabled' }} fontSize="small" />;
  }
}

function taskStatusChip(status: TaskStatus) {
  switch (status) {
    case 'done':    return <Chip label="done"    size="small" color="success" variant="outlined" sx={{ height: 18, fontSize: 11 }} />;
    case 'running': return <Chip label="running" size="small" color="primary" variant="outlined" sx={{ height: 18, fontSize: 11 }} />;
    case 'skipped': return <Chip label="skipped" size="small" variant="outlined" sx={{ height: 18, fontSize: 11, color: 'text.disabled' }} />;
    case 'failed':  return <Chip label="failed"  size="small" color="error"   variant="outlined" sx={{ height: 18, fontSize: 11 }} />;
    default:        return null;
  }
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface SetupExecutionStepProps {
  /** Controlled execution state — managed by useSetup. */
  execState: ExecutionState;
  /** Called by this component to start the run (POST /api/setup/run). */
  onStart: () => void;
  /** Called when run finishes successfully and user clicks Continue. */
  onNext: () => void;
  /** Called when user clicks Back (only available when idle). */
  onBack: () => void;
  /** Called to deliver a new event into the controlled state. */
  onEvent: (e: RunEvent) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

const SetupExecutionStep: React.FC<SetupExecutionStepProps> = ({
  execState,
  onStart,
  onNext,
  onBack,
  onEvent,
}) => {
  const { phase, progress, tasks, logs, errorMessage } = execState;

  // Auto-scroll the log panel
  const logEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  // Open SSE stream when phase transitions to 'running'
  const esRef = useRef<EventSource | null>(null);
  useEffect(() => {
    if (phase !== 'running') return;

    const es = new EventSource(apiUrl('/api/setup/run/stream'));
    esRef.current = es;

    // Track whether we received a clean 'done' event so onerror can
    // distinguish a normal stream-close from a real connection failure.
    let receivedDone = false;

    const handle = (raw: MessageEvent) => {
      try {
        const e: RunEvent = JSON.parse(raw.data);
        if (e.type === 'done') receivedDone = true;
        onEvent(e);
      } catch { /* ignore malformed */ }
    };

    const SSE_EVENTS: RunEventType[] = [
      'connected', 'started', 'task_begin', 'task_done',
      'task_skip', 'task_fail', 'log', 'progress', 'done', 'error',
    ];
    for (const t of SSE_EVENTS) {
      es.addEventListener(t, handle);
    }

    es.onerror = () => {
      // After a clean 'done' the server closes the connection, which
      // triggers onerror in EventSource — that is expected, not an error.
      if (receivedDone) {
        es.close();
        return;
      }
      onEvent({
        type: 'error',
        message: 'SSE connection lost',
        fatal: true,
        timestamp: new Date().toISOString(),
      });
      es.close();
    };

    return () => {
      for (const t of SSE_EVENTS) {
        es.removeEventListener(t, handle);
      }
      es.close();
      esRef.current = null;
    };
  }, [phase, onEvent]);

  // Auto-start when component mounts (phase is idle)
  const startedRef = useRef(false);
  useEffect(() => {
    if (phase === 'idle' && !startedRef.current) {
      startedRef.current = true;
      onStart();
    }
  }, [phase, onStart]);

  const handleRetry = useCallback(() => {
    startedRef.current = false;
    onStart();
  }, [onStart]);

  return (
    <Box>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <Fade in timeout={200}>
        <Box mb={3}>
          <Typography variant="h5" fontWeight={700} gutterBottom>
            Running Setup
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Verifying your environment and writing the initial configuration.
            This usually takes a few seconds.
          </Typography>
        </Box>
      </Fade>

      {/* ── Overall progress ─────────────────────────────────────────────── */}
      <Box mb={3}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.75}>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>
            {phase === 'done'
              ? 'Complete'
              : phase === 'error'
              ? 'Failed'
              : phase === 'running'
              ? 'Running…'
              : 'Starting…'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {progress}%
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={progress}
          color={phase === 'error' ? 'error' : phase === 'done' ? 'success' : 'primary'}
          sx={{ height: 6, borderRadius: 3 }}
        />
      </Box>

      {/* ── Task list ─────────────────────────────────────────────────────── */}
      {tasks.length > 0 && (
        <Paper variant="outlined" sx={{ mb: 3, borderRadius: 2, overflow: 'hidden' }}>
          <List dense disablePadding>
            {tasks.map((t, idx) => (
              <ListItem
                key={t.id}
                divider={idx < tasks.length - 1}
                sx={{
                  py: 1,
                  bgcolor:
                    t.status === 'running'
                      ? 'primary.50'
                      : t.status === 'failed'
                      ? 'error.50'
                      : 'transparent',
                  transition: 'background-color 0.2s',
                }}
              >
                <ListItemIcon sx={{ minWidth: 32 }}>
                  {taskStatusIcon(t.status)}
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Typography
                      variant="body2"
                      fontWeight={t.status === 'running' ? 600 : 400}
                      color={t.status === 'pending' ? 'text.disabled' : 'text.primary'}
                    >
                      {t.name}
                    </Typography>
                  }
                />
                {taskStatusChip(t.status)}
              </ListItem>
            ))}
          </List>
        </Paper>
      )}

      {/* ── Log panel ─────────────────────────────────────────────────────── */}
      {logs.length > 0 && (
        <Paper
          variant="outlined"
          sx={{
            mb: 3,
            borderRadius: 2,
            bgcolor: 'grey.950',
            overflow: 'hidden',
          }}
        >
          <Box
            sx={{
              px: 1.5,
              py: 0.75,
              borderBottom: '1px solid',
              borderColor: 'divider',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <Typography
              variant="overline"
              sx={{ fontSize: 11, letterSpacing: 1, color: 'text.secondary' }}
            >
              Output
            </Typography>
            {phase === 'running' && (
              <CircularProgress size={10} thickness={5} sx={{ ml: 0.5 }} />
            )}
          </Box>
          <Box
            sx={{
              maxHeight: 240,
              overflowY: 'auto',
              p: 1.5,
              fontFamily: 'monospace',
              fontSize: 12,
              lineHeight: 1.6,
            }}
          >
            {logs.map((line, i) => (
              <Box
                key={i}
                sx={{
                  color:
                    line.level === 'error'
                      ? 'error.main'
                      : line.level === 'skip'
                      ? 'text.disabled'
                      : 'text.primary',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                <Box
                  component="span"
                  sx={{ color: 'text.disabled', userSelect: 'none', mr: 1.5 }}
                >
                  {line.ts.slice(11, 19)}
                </Box>
                {line.message}
              </Box>
            ))}
            <div ref={logEndRef} />
          </Box>
        </Paper>
      )}

      {/* ── Error banner ──────────────────────────────────────────────────── */}
      {phase === 'error' && errorMessage && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            <Button size="small" color="error" onClick={handleRetry}>
              Retry
            </Button>
          }
        >
          {errorMessage}
        </Alert>
      )}

      {/* ── Success banner ────────────────────────────────────────────────── */}
      {phase === 'done' && (
        <Fade in timeout={400}>
          <Alert severity="success" sx={{ mb: 2 }} icon={<CheckCircleIcon />}>
            Setup ran successfully — your environment is ready.
          </Alert>
        </Fade>
      )}

      {/* ── Action row ───────────────────────────────────────────────────── */}
      <Divider sx={{ mb: 2.5 }} />
      <Box display="flex" alignItems="center">
        <Button
          variant="text"
          onClick={onBack}
          disabled={phase === 'running'}
          sx={{ color: 'text.secondary' }}
        >
          Back
        </Button>

        <Button
          variant="contained"
          onClick={onNext}
          disabled={phase !== 'done'}
          sx={{ ml: 'auto', minWidth: 120 }}
        >
          Continue
        </Button>
      </Box>
    </Box>
  );
};

export default SetupExecutionStep;
