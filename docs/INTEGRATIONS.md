# Integrations Architecture

This document describes how Gift Scheduler connects to external services — retailers, florists, shopping aggregators, and LLM providers — and how credentials are managed securely.

## Table of Contents

- [Overview](#overview)
- [Environment Variables Reference](#environment-variables-reference)
- [Retailer Integrations](#retailer-integrations)
- [Florist Integrations](#florist-integrations)
- [Shopping Aggregator Integration](#shopping-aggregator-integration)
- [LLM Provider Integration](#llm-provider-integration)
- [In-App Secret Entry](#in-app-secret-entry)
- [OAuth Connector Architecture](#oauth-connector-architecture)
- [API Usage Estimates](#api-usage-estimates)
- [Security Considerations](#security-considerations)

---

## Overview

Gift Scheduler integrates with four categories of external services:

| Category             | Services                            | Purpose                                      |
|----------------------|-------------------------------------|----------------------------------------------|
| **Retailers**        | Amazon, Etsy, Walmart               | Search products, check prices, place orders  |
| **Florists**         | 1-800-Flowers, SendFlowers, Avas Flowers | Browse and order flower arrangements    |
| **Aggregators**      | Google Shopping                      | Cross-retailer product search and comparison |
| **LLM Providers**    | Claude, ChatGPT, Gemini, OpenAI-compatible | Generate personalized card messages    |

Each integration can be configured via **environment variables** (for Railway / server deployments) or through the **Settings > Integrations** panel in the app.

---

## Environment Variables Reference

Set these in Railway (dashboard or CLI) or in a local `.env` file. All are optional — the app falls back to its built-in mock catalog and template messages when no external services are configured.

### Retailers

| Variable                     | Description                                      | Example                    |
|------------------------------|--------------------------------------------------|----------------------------|
| `AMAZON_API_KEY`             | Amazon Product Advertising API access key        | `AKIAIOSFODNN7...`         |
| `AMAZON_API_SECRET`          | Amazon Product Advertising API secret key        | `wJalrXUtnFEMI/K7...`     |
| `AMAZON_PARTNER_TAG`         | Amazon Associates partner/tracking tag           | `giftscheduler-20`         |
| `ETSY_API_KEY`               | Etsy Open API key (v3)                           | `abc123def456...`          |
| `WALMART_API_KEY`            | Walmart Affiliate API client ID                  | `a1b2c3d4-e5f6...`        |

### Florists

| Variable                     | Description                                      | Example                    |
|------------------------------|--------------------------------------------------|----------------------------|
| `FLOWERS1800_API_KEY`        | 1-800-Flowers API key                            | `fl-abc123...`             |
| `SENDFLOWERS_API_KEY`        | SendFlowers API key                              | `sf-xyz789...`             |
| `AVASFLOWERS_API_KEY`        | Avas Flowers API key                             | `av-def456...`             |

### Shopping Aggregator

| Variable                     | Description                                      | Example                    |
|------------------------------|--------------------------------------------------|----------------------------|
| `GOOGLE_SHOPPING_API_KEY`    | Google Shopping (Content API / SerpAPI) key      | `AIzaSy...`                |
| `GOOGLE_SHOPPING_ENGINE_ID`  | Custom search engine ID (if using Programmable Search) | `017576662...`       |

### LLM Provider

Only configure **one** LLM provider. The app checks them in this order: Claude, ChatGPT, Gemini, then generic OpenAI-compatible.

| Variable                     | Description                                      | Example                    |
|------------------------------|--------------------------------------------------|----------------------------|
| `LLM_PROVIDER`               | Force a specific provider: `claude`, `openai`, `gemini`, or `openai_compatible` | `claude` |
| `ANTHROPIC_API_KEY`          | Anthropic API key (for Claude)                   | `sk-ant-api03-...`         |
| `ANTHROPIC_MODEL`            | Claude model ID (default: `claude-sonnet-4-5-20250929`) | `claude-sonnet-4-5-20250929` |
| `OPENAI_API_KEY`             | OpenAI API key (for ChatGPT)                     | `sk-proj-...`              |
| `OPENAI_MODEL`               | OpenAI model ID (default: `gpt-4o`)              | `gpt-4o`                   |
| `GEMINI_API_KEY`             | Google Gemini API key                             | `AIzaSy...`                |
| `GEMINI_MODEL`               | Gemini model ID (default: `gemini-2.0-flash`)    | `gemini-2.0-flash`         |
| `OPENAI_COMPATIBLE_BASE_URL` | Base URL for any OpenAI-compatible API           | `https://api.together.xyz/v1` |
| `OPENAI_COMPATIBLE_API_KEY`  | API key for the OpenAI-compatible endpoint       | `tok_...`                  |
| `OPENAI_COMPATIBLE_MODEL`    | Model ID for the OpenAI-compatible endpoint      | `meta-llama/Llama-3-70b`  |

### Infrastructure

| Variable       | Description                                         | Example                    |
|----------------|-----------------------------------------------------|----------------------------|
| `PORT`         | Server port (Railway sets this automatically)       | `3001`                     |
| `DB_PATH`      | Path to SQLite database file                        | `/data/gift_scheduler.db`  |
| `NODE_ENV`     | Node environment                                    | `production`               |

---

## Retailer Integrations

### Amazon Product Advertising API

**What it does:** Search Amazon's catalog by keyword, get prices, availability, delivery estimates, and product images.

**Setup:**
1. Sign up for [Amazon Associates](https://affiliate-program.amazon.com/)
2. Create Product Advertising API credentials in the Associates dashboard
3. Set `AMAZON_API_KEY`, `AMAZON_API_SECRET`, and `AMAZON_PARTNER_TAG`

**How Gift Scheduler uses it:**
- `POST /api/gifts/recommend/:eventId` queries Amazon for products matching the contact's interests and budget
- Results include real prices, stock status, and Prime delivery estimates
- Product URLs use the partner tag for attribution

**Rate limits:** 1 request per second per API key (more than sufficient for personal use).

### Etsy Open API (v3)

**What it does:** Search Etsy's marketplace for handmade, vintage, and unique gifts.

**Setup:**
1. Register an app at [Etsy Developer Portal](https://www.etsy.com/developers)
2. Request an API key (v3 keystring)
3. Set `ETSY_API_KEY`

**How Gift Scheduler uses it:**
- Searches active Etsy listings by keyword, category, and price range
- Good for personalized, handmade, or unique gift options
- Returns shop name, ratings, and estimated shipping

**Rate limits:** 10 requests per second. Very generous for personal use.

### Walmart Affiliate API

**What it does:** Search Walmart's product catalog, get pricing and availability.

**Setup:**
1. Sign up at [Walmart Affiliate Program](https://affiliates.walmart.com/)
2. Get an API client ID from the Walmart Developer portal
3. Set `WALMART_API_KEY`

**How Gift Scheduler uses it:**
- Searches products by keyword with price range filters
- Good for budget-friendly gift options with in-store pickup availability
- Returns pricing, availability, and customer ratings

**Rate limits:** 5 requests per second. More than enough.

### Fallback Behavior

When no retailer API keys are configured, the gift recommendation engine uses its **built-in mock catalog** of 24 curated gift items across birthday, anniversary, and holiday categories. The mock catalog provides a fully functional experience for browsing and planning, but without real-time pricing or stock data.

---

## Florist Integrations

Florist integrations enable ordering flower arrangements directly through Gift Scheduler. When a contact's default gift options include "flowers," these services provide real product listings, pricing, and delivery scheduling.

### 1-800-Flowers

**What it does:** Browse and order flower arrangements, plants, and floral gift baskets.

**Setup:**
1. Sign up for the [1-800-Flowers Affiliate Program](https://www.1800flowers.com/affiliate-program)
2. Obtain an API key from the developer portal
3. Set `FLOWERS1800_API_KEY`

**How Gift Scheduler uses it:**
- Searches flower arrangements by occasion (birthday, anniversary, sympathy, etc.)
- Filters by price range to stay within budget
- Provides delivery date options and same-day delivery availability

**Rate limits:** Generous for personal use.

### SendFlowers

**What it does:** Browse and order flower deliveries with nationwide shipping.

**Setup:**
1. Sign up for the [SendFlowers Affiliate Program](https://www.sendflowers.com/affiliate)
2. Obtain an API key
3. Set `SENDFLOWERS_API_KEY`

**How Gift Scheduler uses it:**
- Searches floral products by category and price
- Good for budget-friendly flower delivery options
- Returns arrangement details, pricing, and delivery windows

### Avas Flowers

**What it does:** Order hand-delivered floral arrangements from local florists.

**Setup:**
1. Sign up for the [Avas Flowers Affiliate Program](https://www.avasflowers.net/affiliate)
2. Obtain an API key
3. Set `AVASFLOWERS_API_KEY`

**How Gift Scheduler uses it:**
- Searches arrangements with a focus on hand-delivery by local florists
- Good for same-day and next-day delivery options
- Returns arrangement details, pricing, and local availability

### Fallback Behavior

When no florist API keys are configured, flower recommendations are not available through external services. Contacts with "flowers" as a default gift option will see general gift recommendations from the retailer catalog instead.

---

## Shopping Aggregator Integration

### Google Shopping

**What it does:** Search across multiple retailers simultaneously. Returns product listings with prices, retailers, and links from across the web.

**Setup:**

There are two approaches:

**Option A — Google Programmable Search Engine (free tier available):**
1. Create a [Programmable Search Engine](https://programmablesearchengine.google.com/) restricted to shopping sites
2. Enable the [Custom Search JSON API](https://developers.google.com/custom-search/v1/overview)
3. Set `GOOGLE_SHOPPING_API_KEY` and `GOOGLE_SHOPPING_ENGINE_ID`

**Option B — SerpAPI (simpler, paid):**
1. Sign up at [SerpAPI](https://serpapi.com/)
2. Use the Google Shopping endpoint
3. Set `GOOGLE_SHOPPING_API_KEY` (SerpAPI key)

**How Gift Scheduler uses it:**
- When generating recommendations, aggregator results supplement individual retailer results
- Provides price comparison data across retailers
- Helps discover products not available through direct retailer APIs

**Rate limits:** 100 queries/day on the free Programmable Search tier. Well within personal use estimates.

### Fallback Behavior

When no aggregator key is configured, the app only searches retailers that have individual API keys set. If no retailer keys are set either, the mock catalog is used.

---

## LLM Provider Integration

### How Card Message Generation Works

Currently, `POST /api/cards/generate/:eventId` uses hardcoded templates in `server/src/routes/cards.js`. When an LLM provider is configured, the generation flow changes:

1. The app builds a prompt with the contact's name, relationship, event type, selected tones, and any preferences
2. The prompt is sent to the configured LLM provider
3. The LLM returns personalized card messages
4. Messages are saved to the `card_messages` table as usual

If the LLM call fails (network error, rate limit, invalid key), the app **falls back to the template system** so card generation never breaks.

### Claude (Anthropic)

**Setup:**
1. Get an API key from [Anthropic Console](https://console.anthropic.com/)
2. Set `ANTHROPIC_API_KEY`
3. Optionally set `ANTHROPIC_MODEL` (default: `claude-sonnet-4-5-20250929`)

**API format:** Anthropic Messages API (`POST https://api.anthropic.com/v1/messages`)

### ChatGPT (OpenAI)

**Setup:**
1. Get an API key from [OpenAI Platform](https://platform.openai.com/)
2. Set `OPENAI_API_KEY`
3. Optionally set `OPENAI_MODEL` (default: `gpt-4o`)

**API format:** OpenAI Chat Completions API (`POST https://api.openai.com/v1/chat/completions`)

### Gemini (Google)

**Setup:**
1. Get an API key from [Google AI Studio](https://aistudio.google.com/apikey)
2. Set `GEMINI_API_KEY`
3. Optionally set `GEMINI_MODEL` (default: `gemini-2.0-flash`)

**API format:** Gemini API (`POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`)

### Generic OpenAI-Compatible

For self-hosted models (Ollama, vLLM) or alternative providers (Together AI, Groq, Mistral) that implement the OpenAI chat completions format.

**Setup:**
1. Set `OPENAI_COMPATIBLE_BASE_URL` to the provider's base URL
2. Set `OPENAI_COMPATIBLE_API_KEY`
3. Set `OPENAI_COMPATIBLE_MODEL`

**API format:** OpenAI Chat Completions format (`POST {base_url}/chat/completions`)

### Provider Priority

If `LLM_PROVIDER` is set, that provider is used exclusively. Otherwise the app checks for API keys in this order and uses the first one found:

1. `ANTHROPIC_API_KEY` → Claude
2. `OPENAI_API_KEY` → ChatGPT
3. `GEMINI_API_KEY` → Gemini
4. `OPENAI_COMPATIBLE_API_KEY` + `OPENAI_COMPATIBLE_BASE_URL` → Generic
5. No key found → Template fallback

### Fallback Behavior

When no LLM key is configured, the app uses its built-in template system with 2 messages per tone across 3 event types (birthday, anniversary, holiday) for 5 tones. This provides 10 template options per event, which is functional but not personalized.

---

## In-App Secret Entry

> **Current status:** Not yet implemented. This section describes the planned architecture.

### Problem

Environment variables work well for technical users deploying on Railway, but some users may prefer to configure integrations from within the app's Settings page without accessing a terminal or deployment dashboard.

### Architecture

#### Encrypted Secrets Table

A dedicated `integration_secrets` table stores credentials encrypted at rest:

```sql
CREATE TABLE IF NOT EXISTS integration_secrets (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL UNIQUE,        -- 'amazon', 'etsy', 'walmart', 'google_shopping', 'llm'
  credentials TEXT NOT NULL,            -- AES-256-GCM encrypted JSON blob
  iv TEXT NOT NULL,                     -- Initialization vector for decryption
  auth_tag TEXT NOT NULL,               -- Authentication tag for tamper detection
  status TEXT DEFAULT 'configured',     -- 'configured', 'verified', 'error'
  last_verified_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

#### Encryption Key

The encryption key is derived from a `SECRETS_ENCRYPTION_KEY` environment variable (the only secret that must be set outside the app). This is a single secret that protects all stored credentials:

```
SECRETS_ENCRYPTION_KEY=a-random-64-character-hex-string
```

Generate one with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

#### API Endpoints

```
GET    /api/integrations              — List all configured integrations (status only, no secrets)
GET    /api/integrations/:provider    — Get integration status and masked credentials
PUT    /api/integrations/:provider    — Save or update credentials (encrypted before storage)
DELETE /api/integrations/:provider    — Remove stored credentials
POST   /api/integrations/:provider/verify — Test that credentials work (makes a lightweight API call)
```

#### Credential Priority

Environment variables take precedence over in-app secrets. This means:
1. If `AMAZON_API_KEY` is set as an env var, the app uses it regardless of what's in the database
2. If no env var is set, the app checks `integration_secrets` for that provider
3. If neither exists, the mock/template fallback is used

This lets Railway users keep using env vars while in-app users can configure from the UI.

#### Masked Display

The `GET /api/integrations/:provider` endpoint returns masked credentials for display:

```json
{
  "provider": "amazon",
  "status": "verified",
  "credentials": {
    "api_key": "AKIA...N7EX",
    "api_secret": "wJal...K7MD",
    "partner_tag": "giftscheduler-20"
  },
  "last_verified_at": "2026-02-15T10:30:00Z"
}
```

Only the first 4 and last 4 characters of each secret are shown. The full value is never sent to the browser after initial entry.

#### Audit Logging

All credential operations are logged to the audit trail, but the log entries contain only metadata (provider name, action, timestamp) — never the actual secret values.

---

## OAuth Connector Architecture

> **Current status:** Not yet implemented. This section describes the planned architecture for "Connect with..." style integrations.

### Concept

Instead of entering API keys manually, users click a "Connect" button that redirects to the retailer's authorization page — similar to how Claude Code connects to GitHub or how Railway connects to GitHub.

### How OAuth Connectors Work

```
┌─────────────┐     1. Click "Connect"      ┌─────────────────┐
│             │  ─────────────────────────▶  │                 │
│  Gift       │                              │  Retailer       │
│  Scheduler  │  2. Redirect to retailer     │  (Amazon, Etsy, │
│  Settings   │     authorization page       │   Walmart)      │
│  Page       │                              │                 │
│             │  ◀─────────────────────────  │                 │
│             │  3. User approves access     │                 │
│             │                              │                 │
│             │  4. Retailer redirects back  │                 │
│             │     with authorization code  │                 │
└─────────────┘                              └─────────────────┘
       │
       │  5. Server exchanges code for
       │     access + refresh tokens
       ▼
┌─────────────┐
│  Encrypted  │  6. Tokens stored encrypted
│  Secrets    │     in integration_secrets
│  Table      │     table
└─────────────┘
```

### OAuth Flow Steps

1. **User clicks "Connect to Etsy"** in Settings > Integrations
2. **Server generates an authorization URL** with the app's client ID and a CSRF state token
3. **User is redirected to Etsy** and logs into their account
4. **User approves permissions** (e.g., "Gift Scheduler wants to: search listings, view prices")
5. **Etsy redirects back** to `https://your-app.railway.app/api/integrations/etsy/callback` with an authorization code
6. **Server exchanges the code** for access and refresh tokens via a server-to-server call
7. **Tokens are encrypted** and stored in `integration_secrets`
8. **User sees "Connected"** status in the Settings page

### OAuth Support by Retailer

| Retailer  | OAuth Support | Notes                                                     |
|-----------|---------------|-----------------------------------------------------------|
| Amazon    | Limited       | Product Advertising API uses API keys, not OAuth. Amazon Login (OAuth) is for user identity, not product search. Keys must be entered manually. |
| Etsy      | Full (OAuth 2.0) | Best candidate for OAuth connector. Supports PKCE flow. Scopes: `listings_r` for search, `transactions_r` for order history. |
| Walmart   | None          | Affiliate API uses simple API key authentication. Keys must be entered manually. |
| Google    | Full (OAuth 2.0) | Google Shopping Content API supports OAuth. Scopes: `content` for product search. |

### Token Refresh

OAuth tokens expire. The app handles this transparently:

1. Before each API call, check if the access token is expired
2. If expired, use the refresh token to get a new access token
3. Store the new tokens encrypted
4. If the refresh token is also expired, mark the integration as `status: 'expired'` and prompt the user to reconnect

### Required Environment Variables for OAuth

These are set once during app registration with each provider and don't change per user:

| Variable                      | Description                                  |
|-------------------------------|----------------------------------------------|
| `ETSY_CLIENT_ID`              | Etsy OAuth app client ID                     |
| `ETSY_CLIENT_SECRET`          | Etsy OAuth app client secret                 |
| `GOOGLE_OAUTH_CLIENT_ID`      | Google OAuth client ID                       |
| `GOOGLE_OAUTH_CLIENT_SECRET`  | Google OAuth client secret                   |
| `OAUTH_REDIRECT_BASE_URL`     | Base URL for OAuth callbacks (e.g., `https://your-app.railway.app`) |

---

## API Usage Estimates

Gift Scheduler is a personal-use application. Based on realistic usage patterns:

### Event Volume

| Scenario       | Events/Year | Peak Month | Avg/Day (Peak) | Avg/Day (Normal) |
|----------------|-------------|------------|-----------------|-------------------|
| Light use      | 20          | December (3) | ~0.1          | ~0.05             |
| Moderate use   | 50          | April/Dec (5 each) | ~0.2    | ~0.1              |
| Heavy use      | 200         | December (40) | ~1.3         | ~0.5              |

### API Calls per Event

Each event triggers at most:

| Action                        | Retailer API Calls | Florist API Calls | Aggregator Calls | LLM Calls |
|-------------------------------|-------------------|-------------------|-------------------|-----------|
| Generate gift recommendations | 1-3 per retailer  | 1-3 per florist   | 1                 | 0         |
| Generate card messages        | 0                 | 0                 | 0                 | 1         |
| Check delivery status         | 1                 | 1                 | 0                 | 0         |
| **Total per event**           | **2-4**           | **2-4**           | **1**             | **1**     |

### Monthly Cost Estimates (Moderate Use — 50 events/year)

| Service              | Calls/Month | Cost/Call        | Monthly Cost   |
|----------------------|-------------|------------------|----------------|
| Amazon PA API        | ~15         | Free (with Associates) | $0         |
| Etsy API             | ~15         | Free tier        | $0             |
| Walmart API          | ~15         | Free             | $0             |
| 1-800-Flowers        | ~5          | Free (affiliate) | $0             |
| SendFlowers          | ~5          | Free (affiliate) | $0             |
| Avas Flowers         | ~5          | Free (affiliate) | $0             |
| Google Shopping      | ~5          | Free (100/day)   | $0             |
| Claude (Sonnet)      | ~5          | ~$0.01/call      | ~$0.05         |
| OpenAI (GPT-4o)      | ~5          | ~$0.01/call      | ~$0.05         |
| **Total**            |             |                  | **~$0.05/mo**  |

The cost is effectively negligible for personal use. Even in the heaviest month, total LLM costs would be well under $1.

---

## Security Considerations

### Secrets That Never Touch the Repo

The following are always excluded from version control (via `.gitignore`):
- `.env` file (local development secrets)
- `*.db` / `*.sqlite` files (may contain encrypted credentials in `integration_secrets`)

### Defense in Depth

| Layer                | Protection                                                    |
|----------------------|---------------------------------------------------------------|
| **Git**              | `.env` and database files in `.gitignore`                     |
| **Environment**      | Secrets stored as Railway env vars, injected at runtime       |
| **Database**         | In-app secrets encrypted with AES-256-GCM before storage     |
| **API responses**    | Credentials masked (first 4 + last 4 chars only)             |
| **Audit log**        | Credential operations logged without secret values            |
| **Helmet**           | Security headers (CSP, HSTS, etc.) via Express middleware     |
| **OAuth**            | Server-side token exchange; tokens never exposed to browser   |

### What You Need to Keep Secret

| Secret                       | Where to Store                | Notes                          |
|------------------------------|-------------------------------|--------------------------------|
| Retailer API keys            | Railway env vars or in-app    | Per-service credentials        |
| Florist API keys             | Railway env vars or in-app    | Per-service credentials        |
| LLM API key                  | Railway env vars or in-app    | One provider at a time         |
| OAuth client secrets         | Railway env vars only         | Never in-app (app-level, not user-level) |
| `SECRETS_ENCRYPTION_KEY`     | Railway env vars only         | Protects all in-app secrets    |

### Rotating Credentials

If a key is compromised:
1. Revoke the key at the provider's dashboard
2. Generate a new key
3. Update the Railway environment variable or re-enter in the app
4. The `POST /api/integrations/:provider/verify` endpoint confirms the new key works
