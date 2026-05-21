from sqlalchemy import Column, Integer, String, Text, DateTime
from datetime import datetime

from database import Base

class ChatMessage(Base):

    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)

    role = Column(String)

    content = Column(Text)

    timestamp = Column(DateTime, default=datetime.utcnow)