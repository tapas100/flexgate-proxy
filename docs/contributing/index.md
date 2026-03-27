# Contributing

We welcome contributions! Here's how to get involved.

---

## Development Setup

```bash
git clone https://github.com/tapas100/flexgate-proxy.git
cd flexgate-proxy
npm install
cp .env.example .env      # fill in your DB / Redis URLs
npm run db:migrate
npm run dev               # starts with hot reload
```

---

## Project Structure

```
flexgate-proxy/
├── app.ts                  # Express app + route setup
├── bin/                    # CLI entry points
├── routes/                 # API route handlers
├── src/
│   ├── middleware/         # Rate limiting, auth, metrics
│   ├── routes/             # Additional API routes
│   ├── services/           # Business logic
│   ├── database/           # DB repositories
│   └── ai/                 # AI event types + templates
├── admin-ui/               # React admin dashboard
├── migrations/             # PostgreSQL migrations
├── scripts/                # Dev and ops scripts
├── docs/                   # This documentation site
└── __tests__/              # Integration tests
```

---

## Running Tests

```bash
# All tests
npm test

# Integration tests only
npm run test:integration

# With coverage
npm test -- --coverage
```

---

## Pull Request Guidelines

1. Branch from `dev` — not `main`
2. One feature or fix per PR
3. Add tests for new behaviour
4. Update docs if you change config / API / env vars
5. Run `npm run build` and `npm audit` before opening PR

---

## Reporting Issues

[Open an issue →](https://github.com/tapas100/flexgate-proxy/issues)

Please include:
- FlexGate version (`flexgate --version`)
- Node.js version (`node --version`)
- Steps to reproduce
- Expected vs actual behaviour
