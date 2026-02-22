# 🦄 NexoBot — WhatsApp Financial Assistant for Paraguay's Informal Economy

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-6C5CE7?style=for-the-badge" alt="Version">
  <img src="https://img.shields.io/badge/node-18+-339933?style=for-the-badge&logo=node.js" alt="Node">
  <img src="https://img.shields.io/badge/WhatsApp-Bot-25D366?style=for-the-badge&logo=whatsapp" alt="WhatsApp">
  <img src="https://img.shields.io/badge/Supabase-DB-3ECF8E?style=for-the-badge&logo=supabase" alt="Supabase">
  <img src="https://img.shields.io/badge/tests-98%20passing-00D68F?style=for-the-badge" alt="Tests">
</p>

**NexoBot** is a WhatsApp-based financial assistant that helps small merchants in Paraguay manage their businesses with simple text and voice messages. It provides sales tracking, debt management, credit scoring, and automated insights — all without requiring literacy in traditional financial tools.

> 🇵🇾 Built for Paraguay's informal economy where 70% of commerce runs on trust and paper notebooks.

---

## 🚀 Features

### 📱 Core Bot (WhatsApp)
| Feature | Description |
|---|---|
| **Sales Tracking** | `"Vendí 500 mil a Carlos"` — register cash and credit sales |
| **Debt Management** | `"Cuánto me deben?"` — view all debtors with amounts |
| **Payments** | `"Cobré 300 de Pedro"` — record payments against debts |
| **Inventory** | `"Me llegó mercadería"` — track stock levels |
| **Reminders** | `"Recordále a Carlos"` — automated escalating debt reminders |
| **Smart Alerts** | Daily cash flow insights and collection opportunities at 10AM |
| **Daily Summary** | Automated business digest at 8PM |

### 🧠 Intelligence
| Feature | Description |
|---|---|
| **NexoScore** | Proprietary credit score (0-1000) based on merchant behavior |
| **OCR** | Scan cédulas (ID) and invoices/receipts with GPT-4 Vision |
| **NLP** | Natural language processing with regex fast-parser + OpenAI fallback |
| **Guaraní Support** | Understands Guaraní and Jopará (mixed language) |
| **Predictions** | Weekly sales predictions based on historical data |

### 💰 B2B Platform (API)
| Feature | Description |
|---|---|
| **GreenLight API** | Real-time credit authorization for financial institutions |
| **Score API** | Query NexoScore for any merchant by phone |
| **Partner Portal** | B2B dashboard with usage analytics and billing |
| **Billing** | Usage-based billing with tiered pricing |
| **Payments** | Stripe + Bancard integration for partner payments |

### 📊 Reporting & Export
| Feature | Description |
|---|---|
| **PDF Reports** | Professional monthly reports with KPIs and charts |
| **Excel Export** | Download sales and debtors as `.xlsx` with formatting |
| **Admin Dashboard** | Real-time metrics, health monitoring, live activity feed |

### 🔐 Security
| Feature | Description |
|---|---|
| **Rate Limiting** | Granular per-route limits (webhook, API, admin, export) |
| **PIN Auth** | 4-6 digit PIN for dashboard access |
| **API Keys** | Partner authentication for B2B endpoints |
| **Row Level Security** | Supabase RLS policies on all tables |
| **Helmet** | HTTP security headers |

---

## 📁 Project Structure

```
nexobot-mvp/
├── src/
│   ├── server.js              # Express server (entry point)
│   ├── config/
│   │   └── supabase.js        # Supabase client
│   ├── middleware/
│   │   └── rateLimit.js       # Rate limiting (in-memory)
│   ├── routes/
│   │   ├── webhook.js         # WhatsApp webhook (verify + receive)
│   │   ├── dashboard.js       # Merchant dashboard API
│   │   ├── score.js           # NexoScore API (B2B)
│   │   ├── greenlight.js      # Credit authorization API (B2B)
│   │   ├── billing.js         # Usage billing API
│   │   ├── payments.js        # Stripe/Bancard payments
│   │   ├── portal.js          # Partner portal API
│   │   ├── reports.js         # PDF report generation
│   │   ├── export.js          # Excel export
│   │   ├── admin.js           # Admin dashboard API
│   │   └── auth.js            # Authentication
│   └── services/
│       ├── bot.js             # Core message handler + intent routing
│       ├── nlp.js             # NLP engine (regex + OpenAI)
│       ├── whatsapp.js        # WhatsApp Cloud API client
│       ├── onboarding.js      # 8-step merchant onboarding
│       ├── ocr.js             # GPT-4V OCR for cédula/invoices
│       ├── receiptOcr.js      # Invoice photo handler
│       ├── scoring.js         # NexoScore calculation
│       ├── reminders.js       # Automated debt reminders
│       ├── dailySummary.js    # 8PM daily digest
│       ├── smartAlerts.js     # 10AM business insights
│       ├── reports.js         # PDF report generator
│       ├── excelExport.js     # Excel file generator
│       ├── referrals.js       # Referral program
│       ├── multiBusiness.js   # Multi-business management
│       ├── currency.js        # Multi-currency (PYG/USD)
│       ├── billing.js         # Usage metering
│       ├── guarani.js         # Guaraní language support
│       └── auth.js            # PIN authentication
├── public/
│   ├── index.html             # Merchant dashboard
│   ├── admin.html             # Admin command center
│   └── portal-partners.html   # B2B partner portal
├── supabase/
│   └── RUN-THIS-migration-all.sql  # Complete DB schema
├── tests/
│   └── core.test.js           # 98 automated tests
├── package.json
├── render.yaml                # Render deployment config
└── .env.example
```

---

## ⚡ Quick Start

### Prerequisites
- Node.js 18+
- Supabase account (free tier works)
- WhatsApp Business API access
- OpenAI API key (for OCR)

### 1. Clone & Install
```bash
git clone https://github.com/your-org/nexobot-mvp.git
cd nexobot-mvp
npm install
```

### 2. Environment Variables
```bash
cp .env.example .env
```

Required variables:
```env
# Server
PORT=3000
NODE_ENV=development

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key

# WhatsApp Business API
WHATSAPP_TOKEN=your-meta-token
WHATSAPP_PHONE_ID=your-phone-id
VERIFY_TOKEN=your-verify-token

# OpenAI (for OCR + NLP fallback)
OPENAI_API_KEY=sk-your-key

# Admin
ADMIN_KEY=change-this-in-production

# Optional
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### 3. Database Setup
Run the migration in Supabase SQL Editor:
```sql
-- Copy contents of supabase/RUN-THIS-migration-all.sql
```

### 4. Run
```bash
# Development
npm run dev

# Production
npm start
```

### 5. Run Tests
```bash
node tests/core.test.js
```

---

## 🌐 Deployment (Render)

The project includes `render.yaml` for one-click deployment:

1. Connect your GitHub repo to Render
2. Set environment variables in Render dashboard
3. Deploy — the service auto-starts on port 3000

**Live URL:** `https://nexobot-mvp-1.onrender.com`

---

## 📡 API Reference

### WhatsApp Webhook
```
GET  /webhook              # Meta verification
POST /webhook              # Receive messages
```

### NexoScore API (B2B)
```
GET  /api/score/:phone     # Get merchant score
     Headers: x-api-key: your-key
     Response: { phone, score, tier, business_name, ... }
```

### GreenLight API (B2B)
```
POST /api/greenlight/authorize
     Headers: x-api-key: your-key
     Body: { phone, amount, currency }
     Response: { authorized: true, decision, score, limit, ... }
```

### Export
```
GET  /api/export/:id/sales?month=0&year=2026    # Sales Excel
GET  /api/export/:id/debtors                     # Debtors Excel
GET  /api/reports/:id?month=0&year=2026          # PDF Report
```

### Admin
```
GET  /api/admin/metrics     # KPIs
GET  /api/admin/merchants   # Merchant list
GET  /api/admin/activity    # Charts + live feed
GET  /api/admin/intents     # Intent distribution
GET  /api/admin/health      # System health
     Headers: x-admin-key: your-key
```

---

## 🧪 Tests

98 automated tests covering:

| Area | Tests |
|---|---|
| NLP Intent Detection | 47 |
| Amount Parsing | 7 |
| PIN Validation | 8 |
| Currency Formatting | 7 |
| Billing Tiers | 7 |
| Referral Codes | 4 |
| Onboarding UI | 3 |
| Cédula Formatting | 3 |
| Guaraní Detection | 4 |
| Score Tiers | 8 |

```bash
$ node tests/core.test.js

✅ Passed: 98
❌ Failed: 0
📊 Total:  98
```

---

## 🏗 Architecture

```
┌─────────────┐    ┌──────────────┐    ┌───────────────┐
│  WhatsApp   │───▶│  NexoBot     │───▶│   Supabase    │
│  Cloud API  │◀───│  (Express)   │◀───│   (Postgres)  │
└─────────────┘    └──────┬───────┘    └───────────────┘
                          │
                    ┌─────┴─────┐
                    ▼           ▼
              ┌──────────┐ ┌──────────┐
              │  OpenAI  │ │  Stripe  │
              │ GPT-4V   │ │ Payments │
              └──────────┘ └──────────┘
```

**Message Flow:**
1. WhatsApp sends webhook → Express server
2. NLP engine classifies intent (regex first, GPT fallback)
3. Bot handler routes to appropriate service
4. Service queries/updates Supabase
5. Response sent back via WhatsApp Cloud API

---

## 🇵🇾 Paraguayan Context

NexoBot is specifically designed for Paraguay:
- **Language:** Spanish + Guaraní/Jopará
- **Currency:** Guaraníes (₲) with USD support
- **Amounts:** Understands "500 mil", "2 palos", "200K"
- **Identity:** Cédula Paraguaya (OCR recognition)
- **Business types:** Almacén, despensa, kiosco, etc.

---

## 📄 License

Proprietary — © 2026 NexoFinanzas. All rights reserved.

---

<p align="center">
  Built with 🦄 in Asunción, Paraguay
</p>
