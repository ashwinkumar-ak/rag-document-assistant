from sqlalchemy import Column, Integer, String, Text, DateTime
from datetime import datetime

from database import Base


class User(Base):

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)

    username = Column(String, unique=True, index=True)

    password = Column(String)


class ChatMessage(Base):

    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)

    role = Column(String)

    content = Column(Text)

    user_id = Column(Integer)

    timestamp = Column(DateTime, default=datetime.utcnow)