# 🏛️ CivicSphere Karnataka · Multi-Agent Civic Operations Platform

> **Full-Stack Production Repository** structured for seamless decoupled deployment:
> - 🚀 **Backend API** &rarr; Deploy to **[Render](https://render.com)** (FastAPI / Uvicorn with CORS & Persistent State)
> - 🌐 **Frontend App** &rarr; Deploy to **[Vercel](https://vercel.com)** (Single Page Web Application)

---

## 📁 Repository Structure

```
nagarsetu-v2/
├── backend/                       <-- Deploy to RENDER (Python Web Service)
│   ├── main.py                    <-- Production FastAPI server with CORS & endpoints
│   ├── server.py                  <-- Zero-dependency local runner (Python stdlib)
│   ├── requirements.txt           <-- FastAPI, Uvicorn, Pydantic
│   ├── Procfile                   <-- Render process: uvicorn main:app --host 0.0.0.0 --port $PORT
│   ├── render.yaml                <-- 1-Click Render Blueprint configuration
│   ├── .env.example               <-- Port & CORS configuration
│   └── data/
│       └── seed_complaints.json   <-- Karnataka civic seed records
│
├── frontend/                      <-- Deploy to VERCEL (Static Web App)
│   ├── index.html                 <-- Primary UI entrypoint & dialogs
│   ├── css/styles.css             <-- Civic design system & animations
│   ├── js/
│   │   ├── config.js              <-- Dynamic API URL resolution (Localhost vs Render)
│   │   ├── api.js                 <-- REST client with offline fallback & caching
│   │   ├── app.js                 <-- Application controller & views
│   │   ├── agents.js              <-- 5-stage multi-agent triage engine
│   │   ├── data.js                <-- Municipal departments & boundary definitions
│   │   ├── map.js                 <-- Leaflet GIS & street search
│   │   └── voice.js               <-- Multilingual Web Speech assistant (EN/KN/HI)
│   ├── assets/                    <-- Icons, logos & sample images
│   └── vercel.json                <-- Vercel routing rules & CORS headers
│
├── vercel.json                    <-- Root fallback: allows deploying from repo root on Vercel
├── render.yaml                    <-- Root blueprint pointing to rootDir: backend
├── .gitignore                     <-- Python/OS cache exclusions
└── README.md                      <-- This deployment guide
```

---

## 🚀 Step 1: Push to GitHub

1. Open your terminal in this directory:
   ```bash
   git init
   git add .
   git commit -m "feat: CivicSphere decoupled backend (Render) and frontend (Vercel)"
   ```
2. Create a new repository on [GitHub](https://github.com/new) (e.g. `civicsphere-karnataka`).
3. Link your local repo and push:
   ```bash
   git remote add origin https://github.com/<YOUR_USERNAME>/civicsphere-karnataka.git
   git branch -M main
   git push -u origin main
   ```

---

## ⚡ Step 2: Deploy Backend to Render

### Option A: Using Render Blueprint (1-Click)
1. Go to your [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** &rarr; **Blueprint**.
3. Connect your GitHub repository `civicsphere-karnataka`.
4. Render will automatically detect [`render.yaml`](render.yaml) and configure the web service with:
   - **Root Directory**: `backend`
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Click **Apply**.
6. When deployment finishes, copy your Render Service URL (e.g. `https://civicsphere-api.onrender.com`).

### Option B: Manual Web Service
1. Click **New +** &rarr; **Web Service**.
2. Select your repository `civicsphere-karnataka`.
3. Set the following fields:
   - **Name**: `civicsphere-api`
   - **Root Directory**: `backend`
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Plan**: `Free`
4. Under **Environment Variables**, add:
   - `CORS_ORIGINS` = `*`
5. Click **Create Web Service**.
6. Copy your live backend URL (e.g. `https://civicsphere-api.onrender.com`).

---

## 🌐 Step 3: Deploy Frontend to Vercel

1. Go to your [Vercel Dashboard](https://vercel.com/dashboard).
2. Click **Add New...** &rarr; **Project**.
3. Import your GitHub repository `civicsphere-karnataka`.
4. In the **Configure Project** screen:
   - **Framework Preset**: `Other`
   - **Root Directory**: Click `Edit` and select `frontend` (or leave as root, since root `vercel.json` automatically redirects to `frontend`).
   - **Build Command**: Leave empty.
   - **Output Directory**: Leave empty (`.` or root).
5. Click **Deploy**.
6. Vercel will deploy your site in ~15 seconds and provide your live URL (e.g. `https://civicsphere-karnataka.vercel.app`).

---

## 🔗 Step 4: Connect Frontend to Your Render Backend

Once both are deployed:
1. Open your live Vercel website in the browser.
2. In the top navigation bar, click the **🔌 (API Settings)** button.
3. Paste your live Render backend URL (e.g. `https://civicsphere-api.onrender.com`).
4. Click **Save & Connect**.
5. The status indicator dot will turn 🟢 **Green**, confirming real-time connection to your live Render backend!

> [!TIP]
> **Render Free-Tier Sleep Resilience**:
> Render's free tier spins down after 15 minutes of inactivity. When a request arrives, it takes ~30-50s to wake up.
> CivicSphere includes **zero-crash offline resilience**: while Render is waking up, the frontend uses its local cache seamlessly so citizens can continue browsing without interruption.

---

## 💻 Local Development (Run on Your PC)

You can run both backend and frontend locally on your machine at any time:

### Start Backend (Port 8000)
```bash
# Option 1: Zero-dependency runner (runs directly with Python stdlib)
python backend/server.py 8000

# Option 2: FastAPI with Uvicorn (after pip install -r backend/requirements.txt)
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```

### Start Frontend (Port 8080)
```bash
python -m http.server 8080 --directory "frontend"
```

Open **[http://localhost:8080/](http://localhost:8080/)** in your browser. The frontend automatically detects `localhost` and connects to `http://localhost:8000` with zero configuration needed.

---

## 🛠️ REST API Endpoints Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Health check & uptime ping |
| `GET` | `/api/complaints` | List active complaints with filtering by department, status, or search query |
| `GET` | `/api/complaints/{id}` | Retrieve incident or Master Work Order by ID (`CMP-...`, `WO-...`) or phone |
| `POST` | `/api/complaints` | Ingest incident with 35m spatial deduplication & Karnataka boundary guard |
| `PATCH`| `/api/complaints/{id}/status` | Field crew dispatch (`IN_PROGRESS`) and AI resolution certification |
| `GET` | `/api/analytics` | Aggregated SLA compliance %, department distribution, and ward counts |
| `POST` | `/api/voice/intent` | Natural language voice intent classifier for multilingual speech assistant |
