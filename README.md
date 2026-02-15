# NexoBot MVP — Backend

El cerebro del bot de WhatsApp de NexoFinanzas.

## Stack
- **Runtime:** Node.js + Express
- **Database:** Supabase (PostgreSQL)
- **NLP:** OpenAI GPT-4o-mini
- **Channel:** Meta WhatsApp Business API
- **Deploy:** Ready for Render/Railway

## Estructura
```
nexobot-mvp/
├── src/
│   ├── server.js          # Express server + webhook
│   ├── config/
│   │   └── supabase.js    # Supabase client
│   ├── services/
│   │   ├── nlp.js         # NLP con OpenAI
│   │   ├── whatsapp.js    # WhatsApp API client
│   │   └── bot.js         # Bot logic / command handler
│   ├── models/
│   │   ├── merchant.js    # Merchant CRUD
│   │   ├── customer.js    # Customer CRUD
│   │   └── transaction.js # Transaction CRUD
│   └── routes/
│       └── webhook.js     # WhatsApp webhook routes
├── supabase/
│   └── schema.sql         # Database schema
├── .env.example
├── package.json
└── README.md
```

## Quick Start
```bash
cp .env.example .env
# Fill in your API keys
npm install
npm run dev
```

## Environment Variables
```
SUPABASE_URL=
SUPABASE_KEY=
OPENAI_API_KEY=
WHATSAPP_TOKEN=
WHATSAPP_VERIFY_TOKEN=
PORT=3000
```
