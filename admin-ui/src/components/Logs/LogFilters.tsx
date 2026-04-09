import React from 'react';
import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  OutlinedInput,
  Chip,
  TextField,
  ToggleButtonGroup,
  ToggleButton,
  FormControlLabel,
  Checkbox,
  SelectChangeEvent,
} from '@mui/material';
import { Search } from '@mui/icons-material';
import { LogLevel, LogSource, LogFilter } from '../../types';

interface LogFiltersProps {
  filter: LogFilter;
  onChange: (filter: LogFilter) => void;
}

const LOG_LEVELS: LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];
const LOG_SOURCES: LogSource[] = ['proxy', 'auth', 'metrics', 'admin', 'system'];
const TIME_RANGES = [
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1H' },
  { value: '6h', label: '6H' },
  { value: '24h', label: '24H' },
  { value: '7d', label: '7D' },
];

const LogFilters: React.FC<LogFiltersProps> = ({ filter, onChange }) => {
  const handleLevelsChange = (event: SelectChangeEvent<LogLevel[]>) => {
    const value = event.target.value;
    onChange({
      ...filter,
      levels: typeof value === 'string' ? (value.split(',') as LogLevel[]) : value,
    });
  };

  const handleSourcesChange = (event: SelectChangeEvent<LogSource[]>) => {
    const value = event.target.value;
    onChange({
      ...filter,
      sources: typeof value === 'string' ? (value.split(',') as LogSource[]) : value,
    });
  };

  const handleTimeRangeChange = (_: React.MouseEvent<HTMLElement>, newValue: string | null) => {
    if (newValue) {
      onChange({
        ...filter,
        timeRange: newValue as any,
      });
    }
  };

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...filter,
      searchQuery: event.target.value,
    });
  };

  const handleRegexChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...filter,
      isRegex: event.target.checked,
    });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 2 }}>
      {/* Top Row: Levels, Sources, Time Range */}
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Log Levels */}
        <FormControl sx={{ minWidth: 200 }} size="small">
          <InputLabel>Levels</InputLabel>
          <Select
            multiple
            value={filter.levels}
            onChange={handleLevelsChange}
            input={<OutlinedInput label="Levels" />}
            renderValue={(selected) => (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {selected.map((value) => (
                  <Chip key={value} label={value} size="small" />
                ))}
              </Box>
            )}
          >
            {LOG_LEVELS.map((level) => (
              <MenuItem key={level} value={level}>
                {level}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Log Sources */}
        <FormControl sx={{ minWidth: 200 }} size="small">
          <InputLabel>Sources</InputLabel>
          <Select
            multiple
            value={filter.sources}
            onChange={handleSourcesChange}
            input={<OutlinedInput label="Sources" />}
            renderValue={(selected) => (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {selected.map((value) => (
                  <Chip key={value} label={value} size="small" />
                ))}
              </Box>
            )}
          >
            {LOG_SOURCES.map((source) => (
              <MenuItem key={source} value={source}>
                {source}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Time Range */}
        <ToggleButtonGroup
          value={filter.timeRange}
          exclusive
          onChange={handleTimeRangeChange}
          size="small"
        >
          {TIME_RANGES.map((range) => (
            <ToggleButton key={range.value} value={range.value}>
              {range.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      {/* Bottom Row: Search */}
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Search logs..."
          value={filter.searchQuery}
          onChange={handleSearchChange}
          InputProps={{
            startAdornment: <Search sx={{ mr: 1, color: 'action.active' }} />,
          }}
        />
        <FormControlLabel
          control={<Checkbox checked={filter.isRegex} onChange={handleRegexChange} size="small" />}
          label="Regex"
        />
      </Box>
    </Box>
  );
};

export default LogFilters;
