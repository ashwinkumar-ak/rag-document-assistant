from fastapi import (
    FastAPI,
    UploadFile,
    File,
    Header,
    HTTPException
)

from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from pydantic import BaseModel

from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.document_loaders import PyPDFLoader

from langchain_text_splitters import (
    RecursiveCharacterTextSplitter
)

from rank_bm25 import BM25Okapi

from jose import jwt, JWTError

from passlib.context import CryptContext

import ollama
import os

from database import SessionLocal, engine
from models import Base, ChatMessage, User

# ======================================================
# APP
# ======================================================

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ======================================================
# DATABASE
# ======================================================

Base.metadata.create_all(bind=engine)

# ======================================================
# CONSTANTS
# ======================================================

DATA_PATH = "data"

os.makedirs(DATA_PATH, exist_ok=True)

SECRET_KEY = "SUPER_SECRET_KEY"

ALGORITHM = "HS256"

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto"
)

# ======================================================
# REQUEST MODELS
# ======================================================

class AuthRequest(BaseModel):

    username: str

    password: str


class QuestionRequest(BaseModel):

    question: str

    history: list = []

    selected_pdfs: list = []

# ======================================================
# EMBEDDINGS
# ======================================================

embedding = HuggingFaceEmbeddings(
    model_name="sentence-transformers/all-MiniLM-L6-v2"
)

# ======================================================
# CHROMA
# ======================================================

def get_vectorstore(username):

    path = f"chroma_db/{username}"

    os.makedirs(path, exist_ok=True)

    return Chroma(
        persist_directory=path,
        embedding_function=embedding
    )


# ======================================================
# BM25
# ======================================================

def load_bm25(vectorstore):

    data = vectorstore.get()

    docs = data["documents"]

    metadatas = data["metadatas"]

    return docs, metadatas

# ======================================================
# HYBRID SEARCH
# ======================================================

def hybrid_search(query, vectorstore, selected_pdfs=None, k=3):

    docs, metadatas = load_bm25(
    vectorstore
    )

    # FILTER PDFs

    if selected_pdfs:

        filtered_docs = []

        filtered_metadatas = []

        for doc, metadata in zip(
            docs,
            metadatas
        ):

            if metadata.get("source") in selected_pdfs:

                filtered_docs.append(doc)

                filtered_metadatas.append(metadata)

        docs = filtered_docs

        metadatas = filtered_metadatas

    # BUILD BM25

    tokenized = [
        doc.split()
        for doc in docs
    ]

    bm25 = BM25Okapi(tokenized)

    # VECTOR SEARCH

    all_vector_results = vectorstore.similarity_search(
    query,
    k=20
    )

    vector_results = []

    for doc in all_vector_results:

        if not selected_pdfs:

            vector_results.append(doc)

        elif doc.metadata.get("source") in selected_pdfs:

            vector_results.append(doc)

    vector_results = vector_results[:k]

    # BM25

    scores = bm25.get_scores(
        query.split()
    )

    top_indices = sorted(
        range(len(scores)),
        key=lambda i: scores[i],
        reverse=True
    )[:k]

    bm25_results = []

    for idx in top_indices:

        bm25_results.append({
            "page_content": docs[idx],
            "metadata": metadatas[idx]
        })

    # COMBINE

    combined = []

    for doc in vector_results:

        combined.append({
            "page_content": doc.page_content,
            "metadata": doc.metadata
        })

    combined.extend(bm25_results)

    # REMOVE DUPLICATES

    unique_docs = []

    seen = set()

    for doc in combined:

        content = doc["page_content"]

        if content not in seen:

            seen.add(content)

            unique_docs.append(doc)

    # ADD IDS

    final_docs = []

    for idx, doc in enumerate(unique_docs[:k]):

        final_docs.append({
            "id": idx + 1,
            "page_content": doc["page_content"],
            "metadata": doc["metadata"]
        })

    return final_docs

# ======================================================
# AUTH HELPERS
# ======================================================

def get_token(authorization: str):

    if not authorization:

        raise HTTPException(
            status_code=401,
            detail="Missing token"
        )

    return authorization.replace(
        "Bearer ",
        ""
    )


def get_user(token: str):

    try:

        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )

        return payload

    except JWTError:

        raise HTTPException(
            status_code=401,
            detail="Invalid token"
        )

# ======================================================
# SIGNUP
# ======================================================

@app.post("/signup")
def signup(req: AuthRequest):

    db = SessionLocal()

    existing = db.query(User).filter(
        User.username == req.username
    ).first()

    if existing:

        raise HTTPException(
            status_code=400,
            detail="User already exists"
        )

    user = User(
        username=req.username,
        password=pwd_context.hash(req.password)
    )

    db.add(user)

    db.commit()

    db.close()

    return {
        "message": "Signup successful"
    }

# ======================================================
# LOGIN
# ======================================================

@app.post("/login")
def login(req: AuthRequest):

    db = SessionLocal()

    user = db.query(User).filter(
        User.username == req.username
    ).first()

    if not user:

        raise HTTPException(
            status_code=401,
            detail="Invalid username"
        )

    valid = pwd_context.verify(
        req.password,
        user.password
    )

    if not valid:

        raise HTTPException(
            status_code=401,
            detail="Invalid password"
        )

    token = jwt.encode(
        {
            "user_id": user.id,
            "username": user.username
        },
        SECRET_KEY,
        algorithm=ALGORITHM
    )

    db.close()

    return {
        "token": token
    }

# ======================================================
# ASK STREAM
# ======================================================

@app.post("/ask-stream")
def ask_stream(
    req: QuestionRequest,
    authorization: str = Header(None)
):

    token = get_token(authorization)

    user = get_user(token)

    user_id = user["user_id"]

    vectorstore = get_vectorstore(user["username"])

    db = SessionLocal()

    # SAVE USER MESSAGE

    db.add(
        ChatMessage(
            role="user",
            content=req.question,
            user_id=user_id
        )
    )

    db.commit()

    # SEARCH

    docs = hybrid_search(
    req.question,
    vectorstore,
    req.selected_pdfs
    )

    # CONTEXT

    context = ""

    for doc in docs:

        context += f"""
[Source {doc['id']}]
{doc['page_content']}

"""

    # HISTORY

    history_text = ""

    for msg in req.history[-5:]:

        history_text += f"""
{msg['role']}: {msg['content']}
"""

    # PROMPT

    prompt = f"""
You are a helpful AI assistant.

Use ONLY the provided context.

IMPORTANT:
- Cite sources using [Source X]

Context:
{context}

Conversation:
{history_text}

Question:
{req.question}

Answer:
"""

    def generate():

        full_answer = ""

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

                full_answer += token

                yield token

        # SAVE AI MESSAGE

        db.add(
            ChatMessage(
                role="assistant",
                content=full_answer,
                user_id=user_id
            )
        )

        db.commit()

        db.close()

    return StreamingResponse(
        generate(),
        media_type="text/plain"
    )

# ======================================================
# SOURCES
# ======================================================

@app.post("/ask-sources")
def ask_sources(
    req: QuestionRequest,
    authorization: str = Header(None)
):

    token = get_token(authorization)

    user = get_user(token)

    vectorstore = get_vectorstore(user["username"])

    docs = hybrid_search(
    req.question,
    vectorstore,
    req.selected_pdfs
    )

    sources = []

    for doc in docs:

        sources.append({
            "id": doc["id"],
            "file": doc["metadata"].get(
                "source",
                "unknown.pdf"
            ),
            "page": doc["metadata"].get(
                "page",
                -1
            ),
            "snippet": doc["page_content"][:150]
        })

    return {
        "sources": sources
    }

# ======================================================
# CHAT HISTORY
# ======================================================

@app.get("/chat-history")
def history(
    authorization: str = Header(None)
):

    token = get_token(authorization)

    user = get_user(token)

    db = SessionLocal()

    messages = db.query(ChatMessage).filter(
        ChatMessage.user_id == user["user_id"]
    ).all()

    result = []

    for msg in messages:

        result.append({
            "role": msg.role,
            "content": msg.content,
            "timestamp": str(msg.timestamp)
        })

    db.close()

    return result

# ======================================================
# PDF UPLOAD
# ======================================================

@app.post("/upload-pdf")
async def upload_pdf(
    file: UploadFile = File(...),
    authorization: str = Header(None)
):
    
    
    token = get_token(authorization)

    user = get_user(token)


    user_id = user["user_id"]

    username = user["username"]

    user_folder = f"data/{username}"

    os.makedirs(user_folder, exist_ok=True)

    file_path = os.path.join(
        user_folder,
        file.filename
    )

    with open(file_path, "wb") as f:

        content = await file.read()

        f.write(content)

    vectorstore = get_vectorstore(user["username"])

    # LOAD PDF

    loader = PyPDFLoader(file_path)

    pages = loader.load()

    # SPLIT

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=800,
        chunk_overlap=100
    )

    docs = splitter.split_documents(pages)

    # METADATA

    for doc in docs:

        doc.metadata = {
            "source": file.filename,
            "page": doc.metadata.get(
                "page",
                -1
            )
        }

    # STORE

    vectorstore.add_documents(docs)

    # RELOAD BM25

    return {
        "message": f"{file.filename} uploaded",
        "chunks_added": len(docs)
    }

# ======================================================
# MY PDF
# ======================================================

@app.get("/my-pdfs")
def my_pdfs(
    authorization: str = Header(None)
):

    token = get_token(authorization)

    user = get_user(token)

    username = user["username"]

    user_folder = f"data/{username}"

    if not os.path.exists(user_folder):

        return []

    files = os.listdir(user_folder)

    pdfs = []

    for file in files:

        if file.endswith(".pdf"):

            pdfs.append(file)

    return pdfs

# ======================================================
# DELETE PDF
# ======================================================

@app.delete("/delete-pdf/{filename}")
def delete_pdf(
    filename: str,
    authorization: str = Header(None)
):

    token = get_token(authorization)

    user = get_user(token)

    username = user["username"]

    user_folder = f"data/{username}"

    file_path = os.path.join(
        user_folder,
        filename
    )

    # DELETE FILE

    if os.path.exists(file_path):

        os.remove(file_path)

    # DELETE VECTOR DB

    vectorstore = get_vectorstore(username)

    data = vectorstore.get()

    ids_to_delete = []

    for idx, metadata in enumerate(
        data["metadatas"]
    ):

        if metadata.get("source") == filename:

            ids_to_delete.append(
                data["ids"][idx]
            )

    if ids_to_delete:

        vectorstore.delete(
            ids=ids_to_delete
        )

    return {
        "message": f"{filename} deleted"
    }