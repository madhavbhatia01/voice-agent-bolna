import json
import logging
from typing import Dict, Any

import httpx
from fastapi import FastAPI, Depends, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

import models
from database import SessionLocal, engine

# Setup Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

class Settings(BaseSettings):
    bolna_api_key: str = "your_bolna_api_key_here"
    bolna_agent_id: str = "your_agent_id_here"
    
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()

# Database initialization
models.Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Bolna Leads Dashboard API",
    description="Backend API to handle Bolna webhooks and manually trigger voice agent calls.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For production, limit this to actual frontend origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    """Dependency injects the database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class CallRequest(BaseModel):
    phone_number: str

@app.post("/call", summary="Initiate a Bolna Outbound Call")
async def make_call(call_req: CallRequest):
    """
    Triggers an outbound call using the Bolna API to the provided phone number.
    Uses async httpx client to prevent blocking the event loop.
    """
    url = "https://api.bolna.dev/call"
    
    payload = {
        "agent_id": settings.bolna_agent_id,
        "recipient_phone_number": call_req.phone_number
    }
    
    headers = {
        "Authorization": f"Bearer {settings.bolna_api_key}",
        "Content-Type": "application/json"
    }
    
    logger.info(f"Initiating call to {call_req.phone_number} using agent {settings.bolna_agent_id}")
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, headers=headers, timeout=15.0)
            
            # Raise exception for 4xx and 5xx status codes
            response.raise_for_status()
            
            result = response.json()
            logger.info(f"Bolna API call initiated successfully: {result}")
            return {"status": "success", "bolna_response": result}
            
    except httpx.HTTPStatusError as e:
        try:
            err_data = e.response.json()
            err_msg = err_data.get("message", e.response.text)
        except Exception:
            err_msg = e.response.text
            
        logger.error(f"Bolna API returned an error: {e.response.status_code} - {err_msg}")
        raise HTTPException(status_code=e.response.status_code, detail=str(err_msg))
    except httpx.RequestError as e:
        logger.error(f"Error connecting to Bolna API: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to connect to Bolna API")
    except Exception as e:
        logger.exception("Unexpected error during Bolna API Call attempt")
        raise HTTPException(status_code=500, detail="Internal server error")

def extract_nested_value(data: Dict[str, Any], keys: list, default: Any = None) -> Any:
    """Helper method to safely extract heavily nested dictionary values."""
    for key in keys:
        if isinstance(data, dict):
            data = data.get(key)
        else:
            return default
    return data if data is not None else default

@app.post("/webhook", summary="Receive Bolna Call Webhook")
async def receive_webhook(request: Request, db: Session = Depends(get_db)):
    """
    Receives call events from Bolna asynchronously.
    Parses complex nested JSON from custom extractions to form actionable leads.
    """
    try:
        payload = await request.json()
    except json.JSONDecodeError:
        logger.error("Failed to parse webhook JSON payload")
        raise HTTPException(status_code=400, detail="Invalid JSON payload")
    
    status = payload.get("status")
    error_message = payload.get("error_message")
    # logger.info(payload)
    # We only process valid, completed calls to prevent duplicate rows
    if status != "completed" or error_message is not None:
        logger.debug(f"Ignoring webhook (Status: {status}, Error: {error_message})")
        return {"status": "ignored", "reason": "Not a completed successful call"}
    
    execution_id = payload.get("id")
    if not execution_id:
        logger.warning("Received webhook missing an execution ID, discarding.")
        raise HTTPException(status_code=400, detail="Missing execution ID")
        
    phone_number = payload.get("user_number", "Unknown")
    duration = payload.get("conversation_duration", 0.0)
    
    # Read extractions explicitly from the new Bolna 'extracted_data' dictionary
    call_analytics = payload.get("extracted_data")
    
    # Fallback to old custom_extractions stringified JSON if new format is missing
    if not call_analytics:
        custom_ext = payload.get("custom_extractions", {})
        call_analytics_str = custom_ext.get("call_analytics_json", "{}")
        try:
            call_analytics = json.loads(call_analytics_str) if call_analytics_str else {}
        except Exception:
            logger.error(f"Failed to decode fallback custom_extractions.call_analytics_json for execution {execution_id}")
            call_analytics = {}
        
    # Standardize data extraction using safe getter helper
    customer_name = extract_nested_value(call_analytics, ["caller_info", "customer_name"])
    appointment_scheduled = extract_nested_value(call_analytics, ["call_metadata", "appointment_details", "appointment_scheduled"])
    preferred_date = extract_nested_value(call_analytics, ["call_metadata", "appointment_details", "preferred_date"])
    preferred_time = extract_nested_value(call_analytics, ["call_metadata", "appointment_details", "preferred_time_slot"])
    service_type = extract_nested_value(call_analytics, ["call_metadata", "service_preference", "service_type_selected"])
    call_summary = call_analytics.get("call_summary")
    
    try:
        # Save to DB - Check existence first for idempotency
        existing_lead = db.query(models.Lead).filter(models.Lead.execution_id == execution_id).first()
        if not existing_lead:
            db_lead = models.Lead(
                execution_id=execution_id,
                phone_number=phone_number,
                customer_name=customer_name,
                call_summary=call_summary,
                appointment_scheduled=appointment_scheduled,
                preferred_date=preferred_date,
                preferred_time=preferred_time,
                service_type=service_type,
                duration=duration
            )
            db.add(db_lead)
            db.commit()
            db.refresh(db_lead)
            logger.info(f"Successfully tracked new lead from Bolna: {execution_id}")
        else:
            logger.info(f"Lead {execution_id} already exists. Ignored.")
            
    except SQLAlchemyError as db_err:
        logger.error(f"Database error while saving lead: {str(db_err)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Database write failure")
    
    return {"status": "success"}

@app.get("/leads", summary="Fetch all scheduled leads")
def get_leads(db: Session = Depends(get_db)):
    """Retrieves all stored leads where the caller successfully scheduled an appointment."""
    try:
        leads = db.query(models.Lead).filter(models.Lead.appointment_scheduled.ilike("YES")).all()
        return leads
    except SQLAlchemyError as db_err:
        logger.error(f"Database error while fetching leads: {str(db_err)}")
        raise HTTPException(status_code=500, detail="Database fetch failure")
