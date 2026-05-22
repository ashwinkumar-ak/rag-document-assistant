from sqlalchemy import Column, ForeignKey, Integer, String, Text, DateTime
from datetime import datetime
from sqlalchemy.orm import relationship

from database import Base


class User(Base):

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)

    username = Column(String, unique=True, index=True)

    password = Column(String)

    sessions = relationship(
        "ChatSession",
        back_populates="user",
        cascade="all, delete"
    )

# ======================================================
# CHAT SESSION
# ======================================================

class ChatSession(Base):

    __tablename__ = "chat_sessions"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    title = Column(
        String,
        default="New Chat"
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )

    user_id = Column(
        Integer,
        ForeignKey("users.id")
    )

    user = relationship(
        "User",
        back_populates="sessions"
    )

    messages = relationship(
        "ChatMessage",
        back_populates="session",
        cascade="all, delete"
    )

class ChatMessage(Base):

    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True)

    role = Column(String)

    content = Column(Text)

    timestamp = Column(
        DateTime,
        default=datetime.utcnow
    )

    user_id = Column(
        Integer,
        ForeignKey("users.id")
    )

    session_id = Column(
        Integer,
        ForeignKey("chat_sessions.id")
    )

    session = relationship(
        "ChatSession",
        back_populates="messages"
    )