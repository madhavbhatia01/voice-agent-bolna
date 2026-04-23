from sqlalchemy import Column, Integer, String, Float
from database import Base

class Lead(Base):
    __tablename__ = "leads"

    id = Column(Integer, primary_key=True, index=True)
    execution_id = Column(String, unique=True, index=True)
    phone_number = Column(String, index=True)
    customer_name = Column(String)
    call_summary = Column(String)
    appointment_scheduled = Column(String)
    service_type = Column(String)
    preferred_date = Column(String)
    preferred_time = Column(String)
    duration = Column(Float)
