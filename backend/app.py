from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter

from rank_bm25 import BM25Okapi

import ollama
import os

# -------------------------------
# FASTAPI SETUP
# -------------------------------

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------------
# DATA FOLDER
# -------------------------------

DATA_PATH = "C:/Personal Projects/rag_pdf_chatbot/backend/data"
os.makedirs(DATA_PATH, exist_ok=True)

# -------------------------------
# REQUEST MODEL
# -------------------------------

class QuestionRequest(BaseModel):
    question: str
    history: list = []

# -------------------------------
# EMBEDDING MODEL
# -------------------------------

embedding = HuggingFaceEmbeddings(
    model_name="sentence-transformers/all-MiniLM-L6-v2"
)

# -------------------------------
# CHROMA DB
# -------------------------------

vectorstore = Chroma(
    persist_directory="C:/Personal Projects/rag_pdf_chatbot/backend/chroma_db",
    embedding_function=embedding
)

# -------------------------------
# BM25 SETUP
# -------------------------------

def load_bm25():

    global all_docs
    global all_metadatas
    global bm25

    all_docs_data = vectorstore.get()

    all_docs = all_docs_data["documents"]
    all_metadatas = all_docs_data["metadatas"]

    tokenized_docs = [doc.split(" ") for doc in all_docs]

    bm25 = BM25Okapi(tokenized_docs)

# Initial BM25 load
load_bm25()

# -------------------------------
# HYBRID SEARCH
# -------------------------------

def hybrid_search(query, k=3):

    # VECTOR SEARCH
    vector_results = vectorstore.similarity_search(query, k=k)

    # BM25 SEARCH
    tokenized_query = query.split(" ")

    bm25_scores = bm25.get_scores(tokenized_query)

    top_indices = sorted(
        range(len(bm25_scores)),
        key=lambda i: bm25_scores[i],
        reverse=True
    )[:k]

    bm25_results = []

    for idx in top_indices:
        bm25_results.append({
            "page_content": all_docs[idx],
            "metadata": all_metadatas[idx]
        })

    # COMBINE RESULTS
    combined = []

    # Vector results
    for doc in vector_results:
        combined.append({
            "page_content": doc.page_content,
            "metadata": doc.metadata
        })

    # BM25 results
    combined.extend(bm25_results)

    # Remove duplicates
    unique_docs = []
    seen = set()

    for doc in combined:

        content = doc["page_content"]

        if content not in seen:
            seen.add(content)
            unique_docs.append(doc)

    # Add citation ids
    final_docs = []

    for idx, doc in enumerate(unique_docs[:k]):

        final_docs.append({
            "id": idx + 1,
            "page_content": doc["page_content"],
            "metadata": doc["metadata"]
        })

    return final_docs

# -------------------------------
# STREAMING CHAT API
# -------------------------------

@app.post("/ask-stream")
def ask_stream(request: QuestionRequest):

    question = request.question
    history = request.history

    docs = hybrid_search(question, k=3)

    # Build context
    context = ""

    for doc in docs:
        context += f"""
[Source {doc['id']}]
{doc['page_content']}

"""

    # Chat history
    history_text = ""

    for msg in history[-5:]:
        history_text += f"{msg['role']}: {msg['content']}\n"

    # Prompt
    prompt = f"""
You are a helpful AI assistant.

Use ONLY the provided context.

IMPORTANT:
- Whenever you use information from a source,
  cite it using [Source X]
- Example:
  Kubernetes uses Pods [Source 1]

Context:
{context}

Conversation:
{history_text}

Question:
{question}

Answer:
"""

    def generate():

        response = ollama.chat(
            model="llama3",
            messages=[{
                "role": "user",
                "content": prompt
            }],
            stream=True
        )

        for chunk in response:

            token = chunk["message"]["content"]

            if token:
                yield token

    return StreamingResponse(
        generate(),
        media_type="text/plain"
    )

# -------------------------------
# SOURCES API
# -------------------------------

@app.post("/ask-sources")
def ask_sources(request: QuestionRequest):

    docs = hybrid_search(request.question, k=3)

    sources = []

    for doc in docs:

        sources.append({
            "id": doc["id"],
            "file": doc["metadata"].get("source", "unknown.pdf"),
            "page": doc["metadata"].get("page", -1),
            "snippet": doc["page_content"][:150]
        })

    return {"sources": sources}

# -------------------------------
# PDF UPLOAD API
# -------------------------------

@app.post("/upload-pdf")
async def upload_pdf(file: UploadFile = File(...)):

    file_path = os.path.join(DATA_PATH, file.filename)

    # Save file
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)

    # Load PDF
    loader = PyPDFLoader(file_path)

    pages = loader.load()

    # Split text
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

    # Add to vector DB
    vectorstore.add_documents(docs)

    # Reload BM25 index
    load_bm25()

    return {
        "message": f"{file.filename} uploaded successfully",
        "chunks_added": len(docs)
    }