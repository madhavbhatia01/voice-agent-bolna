# Bolna AC Service Leads Dashboard

### 1. The Problem
AC servicing companies waste hours calling past customers right before summer to get bookings. It’s boring, repetitive work that ties up the team. Plus, taking notes on a call and manually logging appointment details usually leads to mistakes. The goal here is to put the whole calling and booking process on autopilot so the business owner can just look at a dashboard and know exactly where to send their technicians today, and prepare for the upcoming services.

### 2. The Workflow
* **Trigger:** An operator simply types a customer’s phone number into the web dashboard to kick off the outreach.
* **The Call:** The Bolna agent dials the customer, naturally pitches the seasonal AC service, and figures out what they need.
* **Extraction:** The agent pulls out four specific details from the chat: whether they want the service (yes/no), the type of service (basic or deep clean), their preferred date, and the time slot (morning/afternoon).
* **The Hand-off:** Bolna fires a webhook with that exact payload to my backend, which saves it straight into a SQLite database.
* **The Dashboard:** The web app immediately updates the "Upcoming Services" table with the new booking. It auto-sorts by date and actively highlights jobs due today or tomorrow so the dispatch team knows exactly what to prep for next.

### 3. The Outcome Metric
**Core Focus:** Business owners can get back to what they actually do best—delivering high-quality AC service—rather than wasting hours on repetitive calls or risking a bad reputation because they forgot about a booking.

***

This is a full-stack web application built to integrate with the Bolna Voice Agent API. It handles webhook callbacks, stores scheduled leads in a SQLite database, and displays them on a frontend dashboard.

The frontend consists of two main pages:
1. **Leads Dashboard (`index.html`)**: Real-time sorted views of your Upcoming and Past scheduled service appointments.
2. **Action Engine (`calls.html`)**: Interface to quickly trigger Bolna Voice Agent outbound calls.

## Starting the Backend Server

The backend requires the Bolna API credentials to make outbound calls. Make sure to open `backend/.env` and place your real credentials there:
```env
BOLNA_API_KEY=your_actual_bolna_key
BOLNA_AGENT_ID=your_actual_agent_id
```

Start the FastAPI server:
```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload
```
The API will run on `http://127.0.0.1:8000` and the database `leads.db` will automatically be updated with incoming webhooks.

## Starting the Frontend UI

1. Open a new terminal.
2. Start a simple static HTTP Server in the frontend folder:
```bash
cd frontend
python3 -m http.server 8080
```
3. Open `http://localhost:8080/index.html` in your web browser. You can seamlessly navigate to the Make Call page from the top navigation bar.

## Receiving Webhooks (Cloudflared Tunnel)

Bolna needs a public URL to send webhook events to. Because your backend runs locally, you must expose the **Backend** port (not the frontend). 

1. Stop any currently running tunnels.
2. Run a tunnel pointing to the FastAPI server:
```bash
cloudflared tunnel --url http://localhost:8000
```
3. Copy the generated Cloudflare URL (e.g. `https://your-tunnel.trycloudflare.com`) and paste `https://your-tunnel.trycloudflare.com/webhook` into your Bolna agent's integration settings.
