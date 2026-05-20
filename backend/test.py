from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import HuggingFaceEmbeddings

embedding = HuggingFaceEmbeddings(
    model_name="sentence-transformers/all-MiniLM-L6-v2"
)

db = Chroma(
    persist_directory="chroma_db",
    embedding_function=embedding
)

results = db.similarity_search("pod", k=3)

print(len(results))
for r in results:
    print(r.page_content[:200])
    print(r.metadata)