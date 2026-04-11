# @flexgate/proxy

Production-grade API gateway and reverse proxy — Go binary distributed via npm.

[![npm version](https://img.shields.io/npm/v/@flexgate/proxy)](https://www.npmjs.com/package/@flexgate/proxy)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Install

```bash
npm install -g @flexgate/proxy
# or run without installing:
npx @flexgate/proxy --version
```

The correct binary for your platform is downloaded automatically as an
`optionalDependency`. No compilation step required.

**Supported platforms:**

| OS | Arch | Package |
|----|------|---------|
| Linux | x86_64 | `@flexgate/proxy-linux-x64` |
| Linux | ARM64 | `@flexgate/proxy-linux-arm64` |
| macOS | x86_64 | `@flexgate/proxy-darwin-x64` |
| macOS | Apple Silicon | `@flexgate/proxy-darwin-arm64` |
| Windows | x86_64 | `@flexgate/proxy-win32-x64` |

## Quick start

```bash
# Start with default config
flexgate-proxy

# Start with a custom config file
flexgate-proxy --config /etc/flexgate/flexgate.yaml

# Print version
flexgate-proxy --version
```

## Configuration

FlexGate is configured via YAML. See the
[production config example](https://github.com/tapas100/flexgate-proxy/blob/main/deployments/production/flexgate.production.yaml)
for all available options.

```yaml
# flexgate.yaml
proxy:
  port: 8080
  admin_port: 9090

logging:
  level: info
  format: json
```

All config values can be overridden with environment variables:

```bash
FLEXGATE_PROXY_PORT=8080 \
FLEXGATE_STORE_POSTGRES_URL=postgres://user:pass@localhost/db \
flexgate-proxy
```

## Advanced

### Custom binary path

```bash
FLEXGATE_BINARY=/usr/local/bin/flexgate-proxy flexgate-proxy --version
```

### Build from source

```bash
git clone https://github.com/tapas100/flexgate-proxy
cd flexgate-proxy
make go-build   # requires Go 1.22+
./dist/go/flexgate-proxy --version
```

## Links

- [Documentation](https://github.com/tapas100/flexgate-proxy/tree/main/docs)
- [Production tuning guide](https://github.com/tapas100/flexgate-proxy/blob/main/docs/production-tuning.md)
- [Changelog](https://github.com/tapas100/flexgate-proxy/blob/main/CHANGELOG.md)
- [Issues](https://github.com/tapas100/flexgate-proxy/issues)
