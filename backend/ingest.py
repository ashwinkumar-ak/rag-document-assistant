import os

from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import Chroma

PDF_FOLDER = "C:/Personal Projects/rag_pdf_chatbot/backend/data"

all_docs = []

splitter = RecursiveCharacterTextSplitter(
    chunk_size=800,
    chunk_overlap=100
)

for file in os.listdir(PDF_FOLDER):

    if file.endswith(".pdf"):

        path = os.path.join(PDF_FOLDER, file)

        loader = PyPDFLoader(path)

        pages = loader.load()

        docs = splitter.split_documents(pages)

        for doc in docs:
            doc.metadata = {
                "source": file,
                "page": doc.metadata.get("page", -1)
            }

        all_docs.extend(docs)

print("Total docs:", len(all_docs))

embedding = HuggingFaceEmbeddings(
    model_name="sentence-transformers/all-MiniLM-L6-v2"
)

db = Chroma.from_documents(
    documents=all_docs,
    embedding=embedding,
    persist_directory="chroma_db"
)

db.persist()

print("✅ Multi-PDF ingestion complete")