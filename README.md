# Gift & Card Scheduler

A full-stack application that helps you select, prepare, and send appropriate gifts and cards for birthdays, anniversaries, and holidays — while respecting budgets, delivery deadlines, and personal preferences.

## Features

- **Contact Management** — Store profiles with preferences, constraints, gift history, and per-contact default gift options (card, gift, flowers)
- **Auto Event Creation** — Adding a contact with dates automatically creates recurring events; deleting a contact removes all associated events
- **Bulk Import** — Import contacts from CSV files or vCard (.vcf) files exported from your phone
- **Event Tracking** — Birthdays, anniversaries, holidays, and other dates with configurable lead times and recurring support
- **Dark Mode** — Automatically follows your device's light/dark preference
- **Budget Management** — Category-based defaults with per-person overrides
- **Gift Recommendations** — Scored suggestions based on interests, budget, and delivery feasibility
- **Card Message Drafting** — Auto-generated messages in 5 tones (warm, formal, humorous, heartfelt, casual)
- **Approval Workflow** — Every purchase requires explicit approval before proceeding
- **Order Tracking** — Status management from ordered through delivered, with issue reporting
- **Audit Log** — Full history of all decisions, approvals, and changes
- **Emergency Stop** — Instantly disable all purchasing and cancel pending orders
- **Autonomy Controls** — Per-person and per-event-type rules (scaffolded for future auto-purchase)
- **Notifications** — Event reminders, approval requests, and delivery alerts

## Tech Stack

| Layer    | Technology                          |
|----------|-------------------------------------|
| Backend  | Node.js, Express, SQLite (better-sqlite3) |
| Frontend | React 18, Vite 5, Tailwind CSS 3   |
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

### Production

Build the client and serve everything from the Express server:

```bash
npm run build
npm start
```

Then open `http://localhost:3001`.

### Running Tests

```bash
npm test
```

Runs 23 Jest tests covering database initialization, CRUD operations, budgets, approvals, orders, audit logging, emergency stop, data integrity, and notifications.

## Project Structure

```
Gift-Scheduler/
├── server/
│   ├── src/
│   │   ├── index.js            # Express server entry point
│   │   ├── database.js         # SQLite schema and connection
│   │   ├── audit.js            # Audit logging helper
│   │   ├── routes/
│   │   │   ├── contacts.js     # Contact CRUD
│   │   │   ├── events.js       # Event CRUD
│   │   │   ├── budgets.js      # Budget management
│   │   │   ├── gifts.js        # Gift recommendation engine
│   │   │   ├── cards.js        # Card message drafting
│   │   │   ├── approvals.js    # Approval workflow
│   │   │   ├── orders.js       # Order tracking
│   │   │   ├── notifications.js# Notification system
│   │   │   ├── settings.js     # Global settings and autonomy
│   │   │   └── dashboard.js    # Dashboard aggregation
│   │   └── __tests__/
│   │       └── api.test.js     # Server tests
│   └── package.json
├── client/
│   ├── src/
│   │   ├── main.jsx            # React entry point
│   │   ├── App.jsx             # Layout, routing, navigation
│   │   ├── api.js              # API client
│   │   ├── index.css           # Tailwind base styles
│   │   └── pages/
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

1. **Add a contact** with at least one date (birthday, anniversary, or other) and set default gift options (card, gift, flowers)
2. **Events are created automatically** for each date you provide
3. **Generate gift recommendations** — the system scores and ranks options within budget
4. **Generate card messages** — choose a tone and pick a message
5. **Approve** the selected gift and card
6. **Place the order** — the system tracks status through delivery

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

| Method | Endpoint                        | Description                      |
|--------|---------------------------------|----------------------------------|
| GET    | `/api/dashboard`                | Dashboard summary                |
| GET    | `/api/contacts`                 | List contacts                    |
| POST   | `/api/contacts`                 | Create contact                   |
| GET    | `/api/contacts/:id`             | Contact detail with history      |
| PUT    | `/api/contacts/:id`             | Update contact                   |
| DELETE | `/api/contacts/:id`             | Delete contact (cascades events) |
| POST   | `/api/contacts/import`          | Bulk import contacts (CSV/vCard) |
| GET    | `/api/events`                   | List events (filterable)         |
| POST   | `/api/events`                   | Create event                     |
| GET    | `/api/events/:id`               | Event detail with recommendations|
| PUT    | `/api/events/:id`               | Update event                     |
| DELETE | `/api/events/:id`               | Delete event                     |
| GET    | `/api/budgets`                  | List budgets with overrides      |
| GET    | `/api/budgets/effective`        | Effective budget for contact     |
| PUT    | `/api/budgets/:id`              | Update default budget            |
| POST   | `/api/budgets/overrides`        | Set per-person budget override   |
| POST   | `/api/gifts/recommend/:eventId` | Generate gift recommendations    |
| GET    | `/api/gifts/event/:eventId`     | Get recommendations for event    |
| POST   | `/api/cards/generate/:eventId`  | Generate card messages           |
| GET    | `/api/cards/event/:eventId`     | Get card messages for event      |
| PUT    | `/api/cards/:id/select`         | Select a card message            |
| POST   | `/api/approvals`                | Submit approval                  |
| GET    | `/api/approvals/pending`        | List pending approvals           |
| POST   | `/api/orders`                   | Place order                      |
| GET    | `/api/orders`                   | List orders (filterable)         |
| PUT    | `/api/orders/:id/status`        | Update order status              |
| GET    | `/api/notifications`            | List notifications               |
| PUT    | `/api/notifications/read-all`   | Mark all as read                 |
| GET    | `/api/settings`                 | Get global settings              |
| POST   | `/api/settings/emergency-stop`  | Toggle emergency stop            |
| GET    | `/api/settings/audit`           | Query audit log                  |
| GET    | `/api/settings/autonomy`        | List autonomy rules              |
| POST   | `/api/settings/autonomy`        | Create autonomy rule             |

## License

ISC
