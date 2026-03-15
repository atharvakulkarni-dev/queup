# QueUp — Complete Deployment Guide
## How to go live in under 30 minutes

---

## 📁 Project Structure

```
queup/
├── backend/
│   ├── server.js       ← Express API server
│   ├── db.js           ← SQLite database + schema
│   ├── auth.js         ← JWT authentication
│   ├── package.json
│   └── .env.example    ← Copy to .env and edit
└── frontend/
    └── public/
        └── index.html  ← Complete single-page app
```

---

## 🖥️ Run Locally (Development)

### Step 1 — Install dependencies
```bash
cd queup/backend
npm install
```

### Step 2 — Set up environment
```bash
cp .env.example .env
# Edit .env and set a strong JWT_SECRET
```

### Step 3 — Start the server
```bash
npm start
# Server runs at http://localhost:3000
```

Open your browser to **http://localhost:3000** — the full app loads!

---

## 🚀 Deploy to Railway (Easiest — Free tier available)

Railway is the simplest way to get QueUp live with a real URL.

### Step 1 — Push to GitHub
```bash
git init
git add .
git commit -m "Initial QueUp setup"
# Create a repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/queup.git
git push -u origin main
```

### Step 2 — Deploy on Railway
1. Go to **railway.app** and sign up (free)
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your `queup` repo
4. Set the **Root Directory** to `backend`
5. Add environment variable:
   - `JWT_SECRET` = any long random string (e.g. `my-super-secret-queup-key-2026`)
6. Railway auto-detects Node.js and deploys!

### Step 3 — Get your live URL
Railway gives you a URL like `queup-production.railway.app` — that's your live app!

---

## 🌐 Deploy to Render (Also free)

1. Go to **render.com** → New → Web Service
2. Connect your GitHub repo
3. Root directory: `backend`
4. Build command: `npm install`
5. Start command: `node server.js`
6. Add env var: `JWT_SECRET=your-secret-here`
7. Click Deploy → get your live URL

---

## ☁️ Deploy to a VPS (DigitalOcean / AWS / Hetzner)

For more control and a custom domain:

```bash
# On your server (Ubuntu)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone your repo
git clone https://github.com/YOUR_USERNAME/queup.git
cd queup/backend
npm install

# Create .env
echo "JWT_SECRET=your-long-secret-here" > .env
echo "PORT=3000" >> .env

# Install PM2 (keeps server running)
sudo npm install -g pm2
pm2 start server.js --name queup
pm2 startup   # auto-start on reboot
pm2 save
```

### Add Nginx reverse proxy (for port 80)
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Add SSL (free with Let's Encrypt)
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

---

## 🔒 Production Checklist

Before going live, do these:

- [ ] Change `JWT_SECRET` to a long random string (32+ chars)
- [ ] Set `NODE_ENV=production` in .env
- [ ] Backup your `queup.db` file regularly (this is your database)
- [ ] Consider using a managed database (Turso, PlanetScale) for scale
- [ ] Add a custom domain
- [ ] Enable HTTPS (SSL)

---

## 📡 API Reference

All API calls go to `YOUR_DOMAIN/api/...`

### Public (no auth needed)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/shops/search?q=barber&city=Pune` | Search shops |
| GET | `/api/shops/:slug` | Get shop details, queue, services |
| GET | `/api/shops/:slug/queue` | Live queue status |
| POST | `/api/shops/:slug/queue/join` | Join queue |
| GET | `/api/token/:id/status` | Check token status |
| GET | `/api/shops/:slug/slots?date=2026-03-15` | Available slots |
| POST | `/api/shops/:slug/bookings` | Book a slot |
| POST | `/api/shops/:slug/reviews` | Leave a review |

### Owner (JWT required)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create owner account |
| POST | `/api/auth/login` | Sign in |
| GET | `/api/auth/me` | Get profile |
| GET | `/api/shops/mine` | My shops |
| POST | `/api/shops` | Create shop |
| PUT | `/api/shops/:id` | Update shop |
| GET | `/api/shops/:id/stats` | Dashboard stats |
| POST | `/api/shops/:id/queue/next` | Call next customer |
| GET | `/api/shops/:id/bookings?date=...` | View bookings |
| POST | `/api/shops/:id/toggle` | Open/close shop |

---

## 🌟 Features Included

**For Customers:**
- Search and discover local shops
- Join live queue digitally — get a token number
- Book time slots in advance
- Check real-time queue status
- See busy hours heatmap
- Smart suggestions for quiet times
- Leave reviews and ratings
- Live token status page (auto-refreshes every 30s)

**For Shop Owners:**
- Easy 5-step onboarding
- Live queue management (call next, skip)
- Today's bookings view
- Daily stats (served, waiting, bookings, rating)
- Toggle open/close and queue on/off
- Busy hours insights with real data
- 7-day served customers chart
- Shareable shop link + QR code
- Settings page to edit shop info

---

## 💡 Tips for Growing QueUp

1. **Add more shops manually** — Use the API to seed initial shops for your city
2. **Print QR codes** — Put them on shop windows: "Scan to join our queue"
3. **WhatsApp notifications** — Integrate Twilio or WhatsApp Business API for "your turn" alerts
4. **Google Maps integration** — Show shop locations on a map using Google Maps JS API
5. **Payments** — Add Razorpay for advance booking deposits
6. **SMS** — Use Fast2SMS or Msg91 for OTP verification and queue alerts

---

## 🆘 Common Issues

**"Cannot find module 'better-sqlite3'"**
```bash
npm install
```

**Port already in use**
```bash
PORT=3001 node server.js
```

**Database locked error**
```bash
# WAL mode is already enabled — restart the server
```

**CORS errors in browser**
- The server has CORS enabled for all origins
- For production, update CORS in server.js to your domain only

---

Built with ❤️ for local businesses. Happy queuing!
