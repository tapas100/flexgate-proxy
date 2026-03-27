# CLI Reference

The `flexgate` CLI manages your gateway from the terminal.

## Installation

```bash
npm install -g flexgate-proxy
flexgate --version
```

---

## Commands

### `flexgate init`

Generate a starter `config/flexgate.json` interactively.

```bash
flexgate init
```

Options:

| Flag | Description |
|------|-------------|
| `--force` | Overwrite existing config |
| `--minimal` | Generate minimal config only |

---

### `flexgate start`

Start the gateway using your config file.

```bash
flexgate start
# or with a custom config path
flexgate start --config /path/to/config.json
```

Options:

| Flag | Default | Description |
|------|---------|-------------|
| `--config` | `config/flexgate.json` | Path to config file |
| `--port` | `3001` | Override gateway port |
| `--log-level` | `info` | Log verbosity |

---

### `flexgate migrate`

Run pending database migrations.

```bash
flexgate migrate
```

---

### `flexgate status`

Check the health of all services.

```bash
flexgate status
```

Example output:

```
FlexGate Status
───────────────
✅ Gateway        running   :3001
✅ Admin UI       running   :3000
✅ PostgreSQL     connected
✅ Redis          connected
⚠️  NATS          not running (using polling fallback)
```

---

### `flexgate --help`

```bash
flexgate --help
flexgate <command> --help
```
