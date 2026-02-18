# 🤖 NexoBot MVP — Backend

El cerebro del bot de WhatsApp de **NexoFinanzas**.  
Gestión financiera para comercio informal en LATAM, directamente desde WhatsApp.

## Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Node.js 20+ / Express |
| **Database** | Supabase (PostgreSQL) |
| **NLP** | OpenAI GPT-4o-mini + Regex fast-parser |
| **OCR** | GPT-4 Vision (cédulas, facturas) |
| **Channel** | Meta WhatsApp Business API |
| **Deploy** | Render (Web Service) |

## Features (v1.0.0)

- 💬 **NLP bilingüe** — Español + Jopará (guaraní), regex-first con fallback OpenAI
- 📊 **NexoScore** — Credit scoring automático (cron 2am PY)
- 🟢 **GreenLight API** — Consulta de riesgo para financieras (`/api/greenlight`)
- 💱 **Multi-currency** — Conversión PYG ↔ USD en tiempo real
- 📸 **OCR** — Lectura de cédulas y facturas via GPT-4 Vision
- 🔔 **Reminders** — Cobro automático con escalado de tono (cron 9am PY)
- 📈 **Daily Summary** — Resumen diario por WhatsApp (cron 8pm PY)
- 👤 **Onboarding** — Registro completo con datos personales
- 🖥️ **Dashboard** — Panel web para comerciantes

## Estructura

```
nexobot-mvp/
├── src/
│   ├── server.js              # Express server (production-ready)
│   ├── config/
│   │   └── supabase.js        # Supabase client
│   ├── services/
│   │   ├── nlp.js             # NLP: regex + OpenAI
│   │   ├── bot.js             # Bot logic / command handler
│   │   ├── whatsapp.js        # WhatsApp API client
│   │   ├── scoring.js         # NexoScore calculation
│   │   ├── currency.js        # Multi-currency service
│   │   ├── ocr.js             # OCR (cédula + facturas)
│   │   ├── reminders.js       # Debt reminder cron
│   │   ├── dailySummary.js    # Daily summary cron
│   │   └── onboarding.js      # Onboarding flow
│   ├── models/
│   │   ├── merchant.js        # Merchant CRUD
│   │   ├── customer.js        # Customer CRUD
│   │   └── transaction.js     # Transaction CRUD
│   └── routes/
│       ├── webhook.js         # WhatsApp webhook
│       ├── dashboard.js       # Dashboard API
│       ├── score.js           # Score API (external)
│       └── greenlight.js      # GreenLight API
├── public/
│   ├── dashboard.html         # Merchant dashboard
│   └── nexocartera.html       # Portfolio view
├── supabase/
│   ├── schema.sql             # Full database schema
│   └── migration-*.sql        # Migration scripts
├── render.yaml                # Render deploy config
├── .env.example               # Environment template
├── package.json
└── README.md
```

## Quick Start (Local)

```bash
# 1. Clone and install
git clone https://github.com/peponka/nexobot-mvp.git
cd nexobot-mvp
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your API keys

# 3. Run database schema
# Go to Supabase SQL Editor → paste supabase/schema.sql → Run

# 4. Start dev server
npm run dev
```

## Deploy to Render

### Option A: One-Click (from render.yaml)

1. Push this repo to GitHub
2. Go to [Render Dashboard](https://dashboard.render.com)
3. **New → Blueprint** → connect your GitHub repo
4. Render reads `render.yaml` and creates the service
5. Add your environment variables in the Render dashboard

### Option B: Manual Setup

1. **New → Web Service** in Render
2. Connect your GitHub repo (`peponka/nexobot-mvp`)
3. Configure:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/health`
4. Add environment variables:

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_KEY` | Your Supabase anon key |
| `OPENAI_API_KEY` | OpenAI API key |
| `WHATSAPP_TOKEN` | Meta WhatsApp token |
| `WHATSAPP_VERIFY_TOKEN` | Webhook verify token |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp phone number ID |
| `NEXO_API_KEY` | API key for NexoScore consumers |
| `GREENLIGHT_API_KEY` | API key for GreenLight consumers |

### Configure WhatsApp Webhook

After deploying, update your Meta webhook URL:
```
https://your-app.onrender.com/webhook
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | — | Health check (Render) |
| `GET` | `/` | — | Service info |
| `GET/POST` | `/webhook` | Meta | WhatsApp webhook |
| `GET` | `/api/dashboard/merchants` | — | List merchants |
| `GET` | `/api/dashboard/:phone` | — | Merchant dashboard data |
| `GET` | `/api/score/:identifier` | `NEXO_API_KEY` | Get NexoScore |
| `GET` | `/api/greenlight/consult/:id` | `GREENLIGHT_API_KEY` | Risk consultation |
| `POST` | `/api/greenlight/batch-consult` | `GREENLIGHT_API_KEY` | Batch risk query |
| `POST` | `/api/simulate` | — | Test NLP (dev only) |

## License

MIT © NexoFinanzas
