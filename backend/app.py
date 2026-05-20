from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import HuggingFaceEmbeddings

from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter

import ollama
import json

from fastapi import UploadFile, File
import os

app = FastAPI()

DATA_PATH = "C:/Personal Projects/rag_pdf_chatbot/backend/data"

os.makedirs(DATA_PATH, exist_ok=True)

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

@app.post("/upload-pdf")
async def upload_pdf(file: UploadFile = File(...)):

    file_path = os.path.join(DATA_PATH, file.filename)

    # Save uploaded PDF
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)

    # Load PDF
    loader = PyPDFLoader(file_path)
    pages = loader.load()

    # Split
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=800,
        chunk_overlap=100
    )

    docs = splitter.split_documents(pages)

    # Metadata
    for doc in docs:
        doc.metadata = {
            "source": file.filename,
            "page": doc.metadata.get("page", -1)
        }

    # Add to existing vector DB
    vectorstore.add_documents(docs)

    return {
        "message": f"{file.filename} uploaded successfully",
        "chunks_added": len(docs)
    }