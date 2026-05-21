import React, { useState, useEffect } from "react";

function App() {

  const [question, setQuestion] = useState("");
  const [chat, setChat] = useState([]);
  const [sources, setSources] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);

  useEffect(() => {

    loadHistory();

  }, []);

  const loadHistory = async () => {

    const response = await fetch(
      "http://127.0.0.1:8000/chat-history"
    );

    const data = await response.json();

    setChat(data);
  };

  const uploadPDF = async () => {

  if (!selectedFile) {
    alert("Please select a PDF");
    return;
  }

  const formData = new FormData();
  formData.append("file", selectedFile);

  const response = await fetch("http://127.0.0.1:8000/upload-pdf", {
    method: "POST",
    body: formData
  });

  const data = await response.json();

  alert(data.message);
};

  const askQuestion = async () => {

  if (!question.trim()) return;

  const newChat = [...chat, { role: "user", content: question }];
  setChat(newChat);

  // create assistant placeholder
  setChat(prev => [
    ...prev,
    { role: "assistant", content: "" }
  ]);

  const response = await fetch("http://127.0.0.1:8000/ask-stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      question,
      history: newChat
    })
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let answer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    answer += decoder.decode(value, { stream: true });

    setChat(prev => {
      const updated = [...prev];
      updated[updated.length - 1] = {
        role: "assistant",
        content: answer
      };
      return updated;
    });
  }

  // fetch sources separately
  const res = await fetch("http://127.0.0.1:8000/ask-sources", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, history: newChat })
  });

  const data = await res.json();
  setSources(data.sources || []);

  setQuestion("");
};

  return (
    <div style={{ padding: "20px", fontFamily: "Arial" }}>

      <h1>📘 RAG Chatbot (Version 8)</h1>

      {/* CHAT BOX */}
      <div
        style={{
          border: "1px solid #ccc",
          height: "400px",
          overflowY: "scroll",
          padding: "10px",
          marginBottom: "10px"
        }}
      >
        {chat.map((msg, index) => (
          <div key={index} style={{ marginBottom: "10px" }}>
            <b>{msg.role}:</b> {msg.content}
          </div>
        ))}
      </div>

    <div style={{ marginBottom: "20px" }}>
      <input
        type="file"
        accept=".pdf"
        onChange={(e) => setSelectedFile(e.target.files[0])}
      />
    
      <button
        onClick={uploadPDF}
        style={{
          marginLeft: "10px",
          padding: "5px 10px"
        }}
      >
        Upload PDF
      </button>
    </div>

      {/* INPUT */}
      <input
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Ask something..."
        style={{
          width: "400px",
          padding: "10px"
        }}
      />

      <button
        onClick={askQuestion}
        style={{
          marginLeft: "10px",
          padding: "10px"
        }}
      >
        Send
      </button>

      {/* SOURCES SECTION */}
      <div style={{ marginTop: "20px" }}>
        <h3>📚 Sources</h3>

        {sources.length === 0 ? (
          <p>No sources yet</p>
        ) : (
          sources.map((s, index) => (
            <div
              key={index}
              style={{
                border: "1px solid #ddd",
                padding: "10px",
                marginBottom: "10px",
                borderRadius: "5px"
              }}
            >
            
              <b>[Source {s.id}]</b><br />
            
              <b>File:</b> {s.file}<br />
            
              <b>Page:</b> {s.page + 1}<br />
            
              <p style={{ marginTop: "5px" }}>
                {s.snippet}
              </p>
            
            </div>
          ))
        )}
      </div>

    </div>
  );
}

export default App;