from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import HuggingFaceEmbeddings
import ollama

# Load embedding model
embedding = HuggingFaceEmbeddings(
    model_name="sentence-transformers/all-MiniLM-L6-v2"
)

# Load ChromaDB
vectorstore = Chroma(
    persist_directory="chroma_db",
    embedding_function=embedding
)

print("RAG Chatbot Ready!")
print("Type 'exit' to quit.")

while True:
    # User question
    question = input("\nAsk Question: ")

    if question.lower() == "exit":
        break

    # Retrieve relevant chunks
    docs = vectorstore.similarity_search(question, k=5)

    print("\nRetrieved Chunks:\n")

    context = ""

    for i, doc in enumerate(docs, start=1):
        print(f"\nChunk {i}")
        print(f"Source Page: {doc.metadata.get('page')}")
        print(doc.page_content[:300])

        context += doc.page_content + "\n"

    # Create prompt
    prompt = f"""
You are an expert Kubernetes assistant.

Use ONLY the provided context to answer the question.

Rules:
1. If answer is not present, say:
   "I could not find the answer in the provided PDF."
2. Keep answers clear and concise.
3. Explain in beginner-friendly language.

Context:
{context}

Question:
{question}

Answer:
"""

    # Send to Ollama
    response = ollama.chat(
        model="llama3",
        messages=[
            {
                "role": "user",
                "content": prompt
            }
        ]
    )

    print("\nAI Answer:\n")
    print(response['message']['content'])