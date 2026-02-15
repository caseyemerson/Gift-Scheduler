# Gift & Card Scheduler

A full-stack application that helps you select, prepare, and send appropriate gifts and cards for birthdays, anniversaries, and holidays — while respecting budgets, delivery deadlines, and personal preferences.

## Features

- **Authentication & Authorization** — JWT-based login with role-based access control (admin/user roles); first-run setup flow creates the admin account
- **Contact Management** — Store profiles with preferences, constraints, gift history, and per-contact default gift options (card, gift, flowers)
- **Auto Event Creation** — Adding a contact with dates automatically creates recurring events; deleting a contact removes all associated events
- **Bulk Import** — Import contacts from CSV files or vCard (.vcf) files exported from your phone
- **Event Tracking** — Birthdays, anniversaries, holidays, and other dates with configurable lead times and recurring support
- **Dark Mode** — Automatically follows your device's light/dark preference
- **Budget Management** — Category-based defaults with per-person overrides
- **Integrations** — Connect to retailers (Amazon, Etsy, Walmart), florists (1-800-Flowers, SendFlowers, Avas Flowers), Google Shopping, and LLM providers (Claude, ChatGPT, Gemini) via the Settings page
- **Gift Recommendations** — Scored suggestions from retailer APIs or built-in catalog, based on interests, budget, and delivery feasibility
- **Card Message Drafting** — AI-generated or template-based messages in 5 tones (warm, formal, humorous, heartfelt, casual)
- **Approval Workflow** — Every purchase requires explicit approval before proceeding
- **Order Tracking** — Status management from ordered through delivered, with issue reporting
- **Audit Log** — Full history of all decisions, approvals, and changes
- **Emergency Stop** — Instantly disable all purchasing and cancel pending orders
- **Autonomy Controls** — Per-person and per-event-type rules (scaffolded for future auto-purchase)
- **Notifications** — Event reminders, approval requests, and delivery alerts
- **Backup & Restore** — Export all data as JSON or download the raw SQLite file; restore from a JSON backup via the Settings page (admin only)

## Tech Stack

| Layer    | Technology                          |
|----------|-------------------------------------|
| Backend  | Node.js, Express, SQLite (better-sqlite3) |
| Frontend | React 18, Vite 5, Tailwind CSS 3   |
| Auth     | JWT (jsonwebtoken), bcryptjs        |
| Testing  | Jest                                |

## Prerequisites

- Node.js 18 or later
- npm 9 or later

## Installation

```bash
# Clone the repository
git clone https://github.com/caseyemerson/Gift-Scheduler.git
cd Gift-Scheduler

# Install root dependencies
npm install

# Install server dependencies
cd server && npm install && cd ..

# Install client dependencies
cd client && npm install && cd ..
```

## Usage

### Development

Start both the API server and the React dev server with a single command:

```bash
npm run dev
```

This runs:
- **API server** on `http://localhost:3001`
- **React client** on `http://localhost:5173` (proxies `/api` requests to the server)

Open `http://localhost:5173` in your browser.

### First Run — Account Setup

On the first launch, you'll be prompted to create an admin account. This account has full access to all features including backup/restore, settings changes, emergency stop, and order creation.

### Production

Build the client and serve everything from the Express server:

```bash
# Set a persistent JWT secret (required for production)
export AUTH_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")

npm run build
npm start
```

Then open `http://localhost:3001`.

### Running Tests

```bash
npm test
```

## Security

### Authentication

All API endpoints (except `/api/health` and `/api/auth/*`) require a valid JWT token sent via the `Authorization: Bearer <token>` header. The frontend handles this automatically after login.

### Role-Based Authorization

| Role    | Access Level |
|---------|-------------|
| `admin` | Full access — all CRUD, settings, backup/restore, emergency stop, order creation |
| `user`  | Read/write access to contacts, events, budgets, gifts, cards, approvals |

Admin-only operations:
- Backup export, download, and restore
- Emergency stop activation/deactivation
- Global settings changes
- Autonomy rule management
- Order creation

### Rate Limiting

All API endpoints are rate-limited to prevent brute force attacks and resource exhaustion:

| Scope | Limit | Window |
|-------|-------|--------|
| General API | 200 requests | 15 minutes |
| Auth (login/setup) | 15 requests | 15 minutes |
| Sensitive (backup, emergency stop, orders) | 10 requests | 15 minutes |

### Backup Security

Backup operations have layered protections:
- **Authentication** — Admin role required for export, download, and restore
- **Confirmation header** — All backup operations require `X-Confirm-Action: backup` header
- **Re-authentication** — Restore operations require the admin's current password
- **No path disclosure** — Database file path is not exposed in any API response

### Data Protection

- **PII sanitization in audit logs** — Email, phone, birthday, anniversary, and other dates are redacted from audit log entries (logged as `[redacted]`)
- **Audit log access** — Restricted to admin users only
- **Approval enforcement** — Orders cannot be created without a valid, approved approval record
- **Settings key allowlist** — Only known setting keys can be modified via the API
- **Import batch limits** — Bulk contact imports are capped at 500 contacts per request

### Security Headers

- **Content Security Policy** — Restricts script sources to same-origin, blocks object embeds and framing
- **CORS** — Restricted to the application's own origin (configurable via `ALLOWED_ORIGIN` env var)
- **Helmet.js** — Sets HSTS, X-Frame-Options, X-Content-Type-Options, and other security headers

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTH_SECRET` | Production | Secret key for signing JWT tokens. If unset, a random key is generated (sessions won't persist across restarts) |
| `ALLOWED_ORIGIN` | No | CORS allowed origin. Defaults to `http://localhost:5173` in development, same-origin in production |
| `PORT` | No | Server port (default: 3001) |
| `DB_PATH` | No | SQLite database file path (default: `server/gift_scheduler.db`) |
| `NODE_ENV` | No | Set to `production` for production builds |

## Project Structure

```
Gift-Scheduler/
├── server/
│   ├── src/
│   │   ├── index.js            # Express server entry point
│   │   ├── database.js         # SQLite schema and connection
│   │   ├── middleware.js       # Auth middleware (requireAuth, requireAdmin)
│   │   ├── audit.js            # Audit logging helper
│   │   ├── routes/
│   │   │   ├── auth.js         # Authentication (login, setup, password)
│   │   │   ├── contacts.js     # Contact CRUD
│   │   │   ├── events.js       # Event CRUD
│   │   │   ├── budgets.js      # Budget management
│   │   │   ├── gifts.js        # Gift recommendation engine
│   │   │   ├── cards.js        # Card message drafting
│   │   │   ├── approvals.js    # Approval workflow
│   │   │   ├── orders.js       # Order tracking (admin: create)
│   │   │   ├── notifications.js# Notification system
│   │   │   ├── settings.js     # Global settings (admin: modify)
│   │   │   ├── integrations.js # Integration status and config
│   │   │   ├── backup.js       # Backup/restore (admin only)
│   │   │   └── dashboard.js    # Dashboard aggregation
│   │   └── __tests__/
│   │       └── api.test.js     # Server tests
│   └── package.json
├── client/
│   ├── src/
│   │   ├── main.jsx            # React entry point
│   │   ├── App.jsx             # Layout, routing, auth state
│   │   ├── api.js              # API client with JWT handling
│   │   ├── index.css           # Tailwind base styles
│   │   └── pages/
│   │       ├── Login.jsx       # Login and first-run setup
│   │       ├── Dashboard.jsx
│   │       ├── Contacts.jsx
│   │       ├── ContactDetail.jsx
│   │       ├── Events.jsx
│   │       ├── EventDetail.jsx # Core workflow page
│   │       ├── Budgets.jsx
│   │       ├── Orders.jsx
│   │       ├── Settings.jsx
│   │       └── AuditLog.jsx
│   └── package.json
└── package.json                # Root scripts
```

## Typical Workflow

1. **Create an account** on first launch (admin setup)
2. **Add a contact** with at least one date (birthday, anniversary, or other) and set default gift options (card, gift, flowers)
3. **Events are created automatically** for each date you provide
4. **Generate gift recommendations** — the system scores and ranks options within budget
5. **Generate card messages** — choose a tone and pick a message
6. **Approve** the selected gift and card
7. **Place the order** — the system tracks status through delivery

You can also **bulk import** contacts from a CSV file or a vCard (.vcf) file exported from your phone. Events are auto-created for any imported contacts that have dates.

## Default Budgets

| Category    | Default |
|-------------|---------|
| Birthday    | $30     |
| Anniversary | $50     |
| Holiday     | $30     |
| Other       | $20     |

Budgets can be changed globally or overridden per contact.

## API Endpoints

### Public Endpoints

| Method | Endpoint                        | Description                      |
|--------|---------------------------------|----------------------------------|
| GET    | `/api/health`                   | Health check                     |
| GET    | `/api/auth/status`              | Auth status (setup required?)    |
| POST   | `/api/auth/setup`               | Create first admin account       |
| POST   | `/api/auth/login`               | Authenticate and get JWT token   |

### Authenticated Endpoints

All endpoints below require `Authorization: Bearer <token>` header.

| Method | Endpoint                        | Description                      | Role     |
|--------|---------------------------------|----------------------------------|----------|
| PUT    | `/api/auth/password`            | Change password                  | Any      |
| POST   | `/api/auth/users`               | Create new user                  | Admin    |
| GET    | `/api/dashboard`                | Dashboard summary                | Any      |
| GET    | `/api/contacts`                 | List contacts                    | Any      |
| POST   | `/api/contacts`                 | Create contact                   | Any      |
| GET    | `/api/contacts/:id`             | Contact detail with history      | Any      |
| PUT    | `/api/contacts/:id`             | Update contact                   | Any      |
| DELETE | `/api/contacts/:id`             | Delete contact (cascades events) | Any      |
| POST   | `/api/contacts/import`          | Bulk import contacts (CSV/vCard) | Any      |
| GET    | `/api/events`                   | List events (filterable)         | Any      |
| POST   | `/api/events`                   | Create event                     | Any      |
| GET    | `/api/events/:id`               | Event detail with recommendations| Any      |
| PUT    | `/api/events/:id`               | Update event                     | Any      |
| DELETE | `/api/events/:id`               | Delete event                     | Any      |
| GET    | `/api/budgets`                  | List budgets with overrides      | Any      |
| GET    | `/api/budgets/effective`        | Effective budget for contact     | Any      |
| PUT    | `/api/budgets/:id`              | Update default budget            | Any      |
| POST   | `/api/budgets/overrides`        | Set per-person budget override   | Any      |
| POST   | `/api/gifts/recommend/:eventId` | Generate gift recommendations    | Any      |
| GET    | `/api/gifts/event/:eventId`     | Get recommendations for event    | Any      |
| POST   | `/api/cards/generate/:eventId`  | Generate card messages           | Any      |
| GET    | `/api/cards/event/:eventId`     | Get card messages for event      | Any      |
| PUT    | `/api/cards/:id/select`         | Select a card message            | Any      |
| POST   | `/api/approvals`                | Submit approval                  | Any      |
| GET    | `/api/approvals/pending`        | List pending approvals           | Any      |
| POST   | `/api/orders`                   | Place order                      | Admin    |
| GET    | `/api/orders`                   | List orders (filterable)         | Any      |
| PUT    | `/api/orders/:id/status`        | Update order status              | Any      |
| GET    | `/api/notifications`            | List notifications               | Any      |
| PUT    | `/api/notifications/read-all`   | Mark all as read                 | Any      |
| GET    | `/api/settings`                 | Get global settings              | Any      |
| PUT    | `/api/settings/:key`            | Update a setting                 | Admin    |
| POST   | `/api/settings/emergency-stop`  | Toggle emergency stop            | Admin    |
| GET    | `/api/settings/audit`           | Query audit log                  | Admin    |
| GET    | `/api/settings/autonomy`        | List autonomy rules              | Any      |
| POST   | `/api/settings/autonomy`        | Create autonomy rule             | Admin    |
| PUT    | `/api/settings/autonomy/:id`    | Update autonomy rule             | Admin    |
| GET    | `/api/integrations`             | List all integration statuses    | Any      |
| GET    | `/api/integrations/:provider`   | Get status for one provider      | Any      |
| GET    | `/api/backup/export`            | Export all data as JSON file     | Admin    |
| GET    | `/api/backup/download`          | Download raw SQLite database     | Admin    |
| POST   | `/api/backup/restore`           | Restore from JSON backup         | Admin    |
| GET    | `/api/backup/status`            | Database size and row counts     | Any      |

## Integrations

Gift Scheduler can optionally connect to external services. All integrations are configured via environment variables (set in Railway or a local `.env` file). When no keys are configured, the app uses its built-in mock catalog and message templates.

| Category         | Services                          | Purpose                                  |
|------------------|-----------------------------------|------------------------------------------|
| Retailers        | Amazon, Etsy, Walmart             | Product search, pricing, and ordering    |
| Florists         | 1-800-Flowers, SendFlowers, Avas Flowers | Browse and order flower arrangements |
| Aggregator       | Google Shopping                   | Cross-retailer product comparison        |
| LLM Providers    | Claude, ChatGPT, Gemini, OpenAI-compatible | AI-generated card messages      |

See [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) for full setup instructions, environment variable reference, OAuth connector architecture, API usage estimates, and security details.

### Quick Environment Variable Reference

```bash
# Authentication
AUTH_SECRET=             # JWT signing secret (generate for production)
ALLOWED_ORIGIN=          # CORS origin (optional)

# Retailers
AMAZON_API_KEY=          AMAZON_API_SECRET=       AMAZON_PARTNER_TAG=
ETSY_API_KEY=
WALMART_API_KEY=

# Florists
FLOWERS1800_API_KEY=
SENDFLOWERS_API_KEY=
AVASFLOWERS_API_KEY=

# Shopping aggregator
GOOGLE_SHOPPING_API_KEY= GOOGLE_SHOPPING_ENGINE_ID=

# LLM (configure one)
LLM_PROVIDER=            # claude | openai | gemini | openai_compatible
ANTHROPIC_API_KEY=       ANTHROPIC_MODEL=
OPENAI_API_KEY=          OPENAI_MODEL=
GEMINI_API_KEY=          GEMINI_MODEL=
OPENAI_COMPATIBLE_BASE_URL= OPENAI_COMPATIBLE_API_KEY= OPENAI_COMPATIBLE_MODEL=
```

## License

ISC
