from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import HuggingFaceEmbeddings

import ollama
import json

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class QuestionRequest(BaseModel):
    question: str
    history: list = []

embedding = HuggingFaceEmbeddings(
    model_name="sentence-transformers/all-MiniLM-L6-v2"
)

vectorstore = Chroma(
    persist_directory="chroma_db",
    embedding_function=embedding
)

@app.post("/ask-stream")
def ask_stream(request: QuestionRequest):

    question = request.question
    history = request.history

    docs = vectorstore.similarity_search(question, k=3)

    context = "\n\n".join([d.page_content for d in docs])

    history_text = ""
    for msg in history[-5:]:
        history_text += f"{msg['role']}: {msg['content']}\n"

    prompt = f"""
You are a Kubernetes expert assistant.

Use ONLY the context below.

Context:
{context}

History:
{history_text}

Question:
{question}

Answer:
"""

    def generate():
        response = ollama.chat(
            model="llama3",
            messages=[{"role": "user", "content": prompt}],
            stream=True
        )

        for chunk in response:
            yield chunk["message"]["content"]

    return StreamingResponse(generate(), media_type="text/plain")

@app.post("/ask-sources")
def ask_sources(request: QuestionRequest):

    docs = vectorstore.similarity_search(request.question, k=3)

    sources = []

    for doc in docs:
        sources.append({
            "file": doc.metadata.get("source", "unknown.pdf"),
            "page": doc.metadata.get("page", -1),
            "snippet": doc.page_content[:150]
        })

    return {"sources": sources}