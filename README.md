# POC Finder — Lead Intelligence Platform

A full-stack platform for finding decision makers (Points of Contact) at businesses scraped from Google Maps.

## 🚀 What It Does

```
User inputs search query → Apify scrapes Google Maps → Results saved to SQLite
     ↓
[Find POC] → Apollo.io API → Decision maker name, email, LinkedIn
[Qualify Lead] → OpenAI + web search → Company summary, score 1-10
[Export] → CSV download with all data
```

## 📦 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, Tailwind CSS |
| Backend | Python FastAPI |
| Database | SQLite (via SQLAlchemy async) |
| Scraping | Apify Google Maps Actor |
| POC Finding | Apollo.io People Search API |
| Qualification | OpenAI Responses API (gpt-4o + web search) |

## 🔑 API Keys Required

| Service | Where to Get | Cost |
|---------|-------------|------|
| **Apify** | [console.apify.com → Settings → Integrations](https://console.apify.com/settings/integrations) | Free tier |
| **Apollo.io** | [app.apollo.io → Settings → API Keys](https://app.apollo.io/#/settings/integrations/api-keys) | 50 free credits/month |
| **OpenAI** | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | ~$0.01 per qualification |

## 🛠️ Setup

### 1. Clone and Navigate
```bash
cd poc-finder
```

### 2. Backend Setup
```bash
cd backend
pip install -r requirements.txt
```

Create `backend/.env`:
```env
APIFY_API_TOKEN=your_apify_token_here
APOLLO_API_KEY=your_apollo_key_here
OPENAI_API_KEY=your_openai_key_here
```

### 3. Frontend Setup
```bash
cd frontend
npm install
```

The `.env.local` is pre-configured to point to `http://localhost:8000`.

## ▶️ Running

Open two terminals:

**Terminal 1 — Backend:**
```bash
cd backend
uvicorn main:app --reload --port 8000
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
```

Open **http://localhost:3000**

## 📖 Usage Guide

### Scraping Leads
1. Enter a search query (e.g. `"dental clinics in Mumbai"`)
2. Set max results (default 50, max ~500)
3. Click **Scrape Google Maps** — takes 1-3 minutes via Apify
4. Results appear in the table grouped by query in the sidebar

### Finding POC (Apollo.io)
1. Click the **⋮** menu on any row → **Find POC**
2. Or select multiple rows → **Find POC for X selected**
3. Apollo searches by domain (preferred) or company name
4. Contacts saved with name, title, email, LinkedIn, phone

### Qualifying Leads (AI)
1. Click the **⋮** menu on any row → **Qualify Lead**
2. OpenAI searches the web for the business
3. Returns: description, size, score (1-10), reasoning, any found contacts
4. Takes 5-15 seconds per lead

### Exporting
- Click **Export All** in the table footer
- Or select rows → **Export CSV** from bulk action bar
- CSV includes all lead data + contacts + qualification scores

### Settings
- Visit `/settings` to enter API keys (stored in local SQLite)
- Keys are masked on display; enter new value to update

## 📂 Project Structure

```
poc-finder/
├── backend/
│   ├── main.py              # FastAPI app + CORS
│   ├── database.py          # SQLAlchemy async engine
│   ├── models.py            # Lead, Contact, Qualification, Settings tables
│   ├── requirements.txt
│   ├── .env                 # API keys (git-ignored)
│   ├── services/
│   │   ├── apify_service.py   # Google Maps scraping
│   │   ├── apollo_service.py  # POC finding
│   │   └── openai_service.py  # Lead qualification
│   └── routers/
│       ├── scrape.py    # POST /api/scrape, GET /api/leads
│       ├── poc.py       # POST /api/leads/{id}/find-poc
│       ├── qualify.py   # POST /api/leads/{id}/qualify
│       ├── export.py    # GET /api/export/csv
│       └── settings.py  # GET/POST /api/settings
└── frontend/
    ├── app/
    │   ├── page.tsx           # Main dashboard
    │   ├── settings/page.tsx  # Settings page
    │   ├── layout.tsx
    │   └── globals.css        # Design system
    └── components/
        ├── LeadsTable.tsx     # Full table with filters, bulk actions
        ├── LeadDrawer.tsx     # Slide-in detail drawer
        ├── Toast.tsx          # Notification system
        ├── QueryProvider.tsx  # React Query wrapper
        └── api.ts             # Typed API client
```

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|---------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/api/scrape` | Run Google Maps scrape |
| `GET` | `/api/leads` | List leads (paginated) |
| `GET` | `/api/leads/stats` | Dashboard stats |
| `GET` | `/api/leads/queries` | List distinct search queries |
| `GET` | `/api/leads/{id}` | Get single lead with contacts |
| `DELETE` | `/api/leads/{id}` | Delete lead |
| `POST` | `/api/leads/{id}/find-poc` | Apollo POC lookup |
| `POST` | `/api/leads/bulk-find-poc` | Bulk Apollo lookup |
| `POST` | `/api/leads/{id}/qualify` | AI qualification |
| `POST` | `/api/leads/bulk-qualify` | Bulk AI qualification |
| `GET` | `/api/export/csv` | Export to CSV |
| `GET` | `/api/settings` | Get settings (masked) |
| `POST` | `/api/settings` | Save settings |
