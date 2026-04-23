# Bolna AC Service Leads Dashboard

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
