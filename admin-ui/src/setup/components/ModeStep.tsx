/**
 * ModeStep — Stage 4
 *
 * Step 1 of the setup wizard (between Welcome and Route).
 * Lets the operator choose their installation profile:
 *
 *   ⚡ Benchmark Mode  — lightweight, no DB required, fast onboarding
 *   🚀 Full Platform   — PostgreSQL + Redis + NATS + full admin dashboard
 *
 * Interaction:
 *   - Clicking a card selects it (visual highlight).
 *   - "Continue" button calls onNext; disabled until a mode is chosen.
 *   - "Back" link returns to WelcomeStep.
 *
 * API integration:
 *   - On Continue the parent (SetupPage / useSetup) calls
 *     POST /api/setup/mode  { mode: "benchmark" | "full" }
 *     before advancing the step index.
 *
 * Isolation contract:
 *   - No imports from existing app code outside src/setup/.
 *   - No Layout, Sidebar, or Header.
 */

import React from 'react';
import {
  Box,
  Typography,
  Button,
  Grid,
  Chip,
  Fade,
  CircularProgress,
} from '@mui/material';
import BoltIcon from '@mui/icons-material/Bolt';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import StorageIcon from '@mui/icons-material/Storage';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';

// ── types ─────────────────────────────────────────────────────────────────────

export type SetupMode = 'benchmark' | 'full';

interface ModeStepProps {
  selectedMode: SetupMode | null;
  onSelect: (mode: SetupMode) => void;
  onNext: () => void;
  onBack: () => void;
  /** True while POST /api/setup/mode is in-flight. */
  saving?: boolean;
  /** Error from POST /api/setup/mode, if any. */
  saveError?: string | null;
}

// ── card metadata ─────────────────────────────────────────────────────────────

interface ModeCard {
  id: SetupMode;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  title: string;
  tagline: string;
  badge: string;
  badgeColor: 'success' | 'primary';
  includes: { label: string; available: boolean }[];
  accentBorder: string;
  accentBg: string;
  recommended?: boolean;
}

const MODE_CARDS: ModeCard[] = [
  {
    id: 'benchmark',
    icon: <BoltIcon sx={{ fontSize: 28 }} />,
    iconBg: 'rgba(255, 167, 38, 0.12)',
    iconColor: '#f57c00',
    title: 'Benchmark Mode',
    tagline: 'Try FlexGate in minutes — no database needed.',
    badge: '⚡ Quick Start',
    badgeColor: 'success',
    includes: [
      { label: 'Proxy engine',        available: true  },
      { label: 'k6 benchmarks',       available: true  },
      { label: 'Live metrics',        available: true  },
      { label: 'Admin dashboard',     available: true  },
      { label: 'PostgreSQL',          available: false },
      { label: 'Redis',               available: false },
      { label: 'NATS messaging',      available: false },
    ],
    accentBorder: 'rgba(245, 124, 0, 0.40)',
    accentBg: 'rgba(255, 167, 38, 0.04)',
  },
  {
    id: 'full',
    icon: <RocketLaunchIcon sx={{ fontSize: 28 }} />,
    iconBg: 'rgba(25, 118, 210, 0.12)',
    iconColor: '#1565c0',
    title: 'Full Platform Mode',
    tagline: 'Production-ready: persistent storage, pub/sub, and full routing.',
    badge: '🚀 Recommended',
    badgeColor: 'primary',
    recommended: true,
    includes: [
      { label: 'Proxy engine',        available: true  },
      { label: 'k6 benchmarks',       available: true  },
      { label: 'Live metrics',        available: true  },
      { label: 'Admin dashboard',     available: true  },
      { label: 'PostgreSQL',          available: true  },
      { label: 'Redis',               available: true  },
      { label: 'NATS messaging',      available: true  },
    ],
    accentBorder: 'rgba(21, 101, 192, 0.40)',
    accentBg: 'rgba(25, 118, 210, 0.04)',
  },
];

// ── component ─────────────────────────────────────────────────────────────────

const ModeStep: React.FC<ModeStepProps> = ({
  selectedMode,
  onSelect,
  onNext,
  onBack,
  saving = false,
  saveError = null,
}) => {
  return (
    <Box sx={{ width: '100%' }}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <Box sx={{ mb: 4 }}>
        <Box
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 52,
            height: 52,
            borderRadius: '14px',
            bgcolor: 'rgba(25,118,210,0.10)',
            color: 'primary.main',
            mb: 2,
          }}
        >
          <StorageIcon sx={{ fontSize: 26 }} />
        </Box>
        <Typography variant="h5" fontWeight={800} letterSpacing={-0.4} sx={{ mb: 0.75 }}>
          Choose your setup
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 460 }}>
          Pick the profile that fits your needs. You can always switch later.
        </Typography>
      </Box>

      {/* ── Mode cards ──────────────────────────────────────────────────── */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {MODE_CARDS.map((card, idx) => {
          const isSelected = selectedMode === card.id;
          return (
            <Grid size={{ xs: 12, sm: 6 }} key={card.id}>
              <Fade in timeout={200 + idx * 80}>
                <Box
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  onClick={() => onSelect(card.id)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(card.id)}
                  sx={{
                    position: 'relative',
                    p: 2.5,
                    borderRadius: 2.5,
                    border: '2px solid',
                    borderColor: isSelected ? card.accentBorder : 'divider',
                    bgcolor: isSelected ? card.accentBg : 'background.paper',
                    cursor: 'pointer',
                    transition: 'border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease, transform 0.15s ease',
                    outline: 'none',
                    height: '100%',
                    boxShadow: isSelected ? `0 0 0 3px ${card.accentBorder}` : 'none',
                    transform: isSelected ? 'translateY(-2px)' : 'none',
                    '&:hover': {
                      borderColor: card.accentBorder,
                      bgcolor: card.accentBg,
                      transform: 'translateY(-2px)',
                      boxShadow: `0 4px 16px ${card.accentBorder}`,
                    },
                    '&:focus-visible': {
                      boxShadow: `0 0 0 3px ${card.accentBorder}`,
                    },
                  }}
                >
                  {/* Selected tick */}
                  {isSelected && (
                    <Box
                      sx={{
                        position: 'absolute',
                        top: 12,
                        right: 12,
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        bgcolor: card.iconColor,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <CheckCircleIcon sx={{ fontSize: 22, color: 'white' }} />
                    </Box>
                  )}

                  {/* Icon + badge row */}
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 2 }}>
                    <Box
                      sx={{
                        width: 48,
                        height: 48,
                        borderRadius: '12px',
                        bgcolor: card.iconBg,
                        color: card.iconColor,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {card.icon}
                    </Box>
                    <Box sx={{ pt: 0.25 }}>
                      <Typography variant="subtitle1" fontWeight={700} sx={{ lineHeight: 1.3 }}>
                        {card.title}
                      </Typography>
                      <Chip
                        label={card.badge}
                        size="small"
                        color={card.badgeColor}
                        variant="outlined"
                        sx={{ mt: 0.5, fontSize: 10, height: 20, fontWeight: 600, letterSpacing: 0.2 }}
                      />
                    </Box>
                  </Box>

                  {/* Tagline */}
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mb: 2, lineHeight: 1.55, minHeight: 40 }}
                  >
                    {card.tagline}
                  </Typography>

                  {/* Includes list */}
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.6 }}>
                    {card.includes.map((item) => (
                      <Box
                        key={item.label}
                        sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}
                      >
                        {item.available ? (
                          <CheckIcon
                            sx={{ fontSize: 14, color: card.iconColor, flexShrink: 0 }}
                          />
                        ) : (
                          <CloseIcon
                            sx={{ fontSize: 14, color: 'text.disabled', flexShrink: 0 }}
                          />
                        )}
                        <Typography
                          variant="caption"
                          sx={{
                            color: item.available ? 'text.primary' : 'text.disabled',
                            fontWeight: item.available ? 500 : 400,
                            lineHeight: 1.4,
                          }}
                        >
                          {item.label}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>
              </Fade>
            </Grid>
          );
        })}
      </Grid>

      {/* ── Save error ───────────────────────────────────────────────────── */}
      {saveError && (
        <Typography
          variant="caption"
          color="error"
          sx={{ display: 'block', mb: 2, pl: 0.5 }}
        >
          {saveError}
        </Typography>
      )}

      {/* ── Action row ───────────────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
        <Button
          variant="text"
          size="small"
          startIcon={<ArrowBackIcon />}
          onClick={onBack}
          disabled={saving}
          sx={{ color: 'text.secondary', minWidth: 0 }}
        >
          Back
        </Button>

        <Button
          variant="contained"
          size="large"
          endIcon={saving ? undefined : <ArrowForwardIcon />}
          onClick={onNext}
          disabled={!selectedMode || saving}
          sx={{
            ml: 'auto',
            px: 4,
            fontWeight: 700,
            boxShadow: 'none',
            '&:hover': { boxShadow: '0 4px 12px rgba(25,118,210,0.30)' },
          }}
        >
          {saving ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={16} color="inherit" />
              Saving…
            </Box>
          ) : (
            'Continue'
          )}
        </Button>
      </Box>

      {/* ── Soft hint ────────────────────────────────────────────────────── */}
      {!selectedMode && (
        <Typography
          variant="caption"
          color="text.disabled"
          sx={{ display: 'block', mt: 1.5, textAlign: 'right' }}
        >
          Select a mode above to continue
        </Typography>
      )}
    </Box>
  );
};

export default ModeStep;
export type { ModeStepProps };
