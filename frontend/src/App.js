import React, {
  useState,
  useEffect
} from "react";

import { Document, Page } from "react-pdf";

import { pdfjs } from "react-pdf";


import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc =
  `${process.env.PUBLIC_URL}/pdf.worker.min.js`;

function App() {

  // ======================================================
  // AUTH
  // ======================================================

  const [username, setUsername] = useState(
    localStorage.getItem("username") || ""
  );

  const [password, setPassword] = useState("");

  const [token, setToken] = useState(
    localStorage.getItem("token")
  );

  const [isLogin, setIsLogin] = useState(true);
  

  // ======================================================
  // CHAT
  // ======================================================

  const [question, setQuestion] = useState("");

  const [chat, setChat] = useState([]);

  const [sources, setSources] = useState([]);

  const [selectedFile, setSelectedFile] = useState(null);


  // ======================================================
  // PDF MANAGEMENT
  // ======================================================

  const [pdfs, setPdfs] = useState([]);

  // ======================================================
  // PDF SPECIFIC SEARCH
  // ======================================================

  const [selectedPDFs, setSelectedPDFs] = useState([]);

  // ======================================================
  // PDF PREVIEW
  // ======================================================

  const [selectedSource, setSelectedSource] = useState(null);
  // Higlight line
  const [numPages, setNumPages] = useState(null);

  // ======================================================
  // LOAD HISTORY
  // ======================================================

  useEffect(() => {

  if (token) {

    loadHistory();

    loadPDFs();
  }

  }, [token]);

  // ======================================================
  // AUTH
  // ======================================================

  const handleAuth = async () => {

    const endpoint = isLogin
      ? "login"
      : "signup";

    const response = await fetch(
      `http://127.0.0.1:8000/${endpoint}`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json"
        },
        body: JSON.stringify({
          username,
          password
        })
      }
    );

    const data = await response.json();

    // LOGIN

    if (isLogin) {

      if (data.token) {

        localStorage.setItem(
          "token",
          data.token
        );
      
        localStorage.setItem(
          "username",
          username
        );
      
        setToken(data.token);
      
        alert("Login successful");
      }

    } else {

      alert(data.message);
    }
  };

  // ======================================================
  // LOGOUT
  // ======================================================

  const logout = () => {

    localStorage.removeItem("token");

    localStorage.removeItem("username");

    setToken(null);

    setChat([]);
  };

  // ======================================================
  // LOAD HISTORY
  // ======================================================

  const loadHistory = async () => {

    const storedToken =
      localStorage.getItem("token");

    if (!storedToken) return;

    const response = await fetch(
      "http://127.0.0.1:8000/chat-history",
      {
        method: "GET",
        headers: {
          "Authorization":
            `Bearer ${storedToken}`
        }
      }
    );

    if (response.status !== 200) {

      return;
    }

    const data = await response.json();

    setChat(data);
    };

  // ======================================================
  // LOAD PDF
  // ======================================================
    const loadPDFs = async () => {

    const response = await fetch(
      "http://127.0.0.1:8000/my-pdfs",
      {
        headers: {
          "Authorization":
            `Bearer ${token}`
        }
      }
    );

    const data = await response.json();

    setPdfs(data);
  };

  // ======================================================
  // PDF SPECIFIC SEARCH
  // ======================================================  


  const togglePDF = (pdf) => {

  if (selectedPDFs.includes(pdf)) {

    setSelectedPDFs(
      selectedPDFs.filter(
        p => p !== pdf
      )
    );

  } else {

    setSelectedPDFs([
      ...selectedPDFs,
      pdf]);
    }
  };

  // ======================================================
  // ASK QUESTION
  // ======================================================

  const askQuestion = async () => {

    if (!question.trim()) return;

    const newChat = [
      ...chat,
      {
        role: "user",
        content: question
      }
    ];

    setChat(newChat);

    const assistantIndex =
      newChat.length;

    setChat(prev => [
      ...prev,
      {
        role: "assistant",
        content: ""
      }
    ]);

    // STREAM

    const response = await fetch(
      "http://127.0.0.1:8000/ask-stream",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
          "Authorization":
            `Bearer ${token}`
        },
        body: JSON.stringify({
          question,
          history: newChat,
          selected_pdfs: selectedPDFs
        })
      }
    );

    const reader =
      response.body.getReader();

    const decoder =
      new TextDecoder();

    let answer = "";

    while (true) {

      const {
        value,
        done
      } = await reader.read();

      if (done) break;

      const chunk =
        decoder.decode(value);

      answer += chunk;

      setChat(prev => {

        const updated = [...prev];

        updated[assistantIndex] = {
          role: "assistant",
          content: answer
        };

        return updated;
      });
    }

    // SOURCES

    const sourceResponse =
      await fetch(
        "http://127.0.0.1:8000/ask-sources",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
            "Authorization":
              `Bearer ${token}`
          },
          body: JSON.stringify({
            question,
            history: newChat,
            selected_pdfs: selectedPDFs
          })
        }
      );

    const sourceData =
      await sourceResponse.json();

    setSources(
      sourceData.sources || []
    );

    setQuestion("");
  };

  // ======================================================
  // UPLOAD PDF
  // ======================================================

  const uploadPDF = async () => {

    if (!selectedFile) {

      alert("Please select PDF");

      return;
    }

    const formData =
      new FormData();

    formData.append(
      "file",
      selectedFile
    );

    const response = await fetch(
    "http://127.0.0.1:8000/upload-pdf",
    {
      method: "POST",
      headers: {
        "Authorization":
          `Bearer ${token}`
      },
      body: formData
    }
  );

    const data = await response.json();

    alert(data.message);

    loadPDFs();
  };

  // ======================================================
  // DELETE PDF
  // ======================================================

  const deletePDF = async (filename) => {

  const response = await fetch(
    `http://127.0.0.1:8000/delete-pdf/${filename}`,
    {
      method: "DELETE",
      headers: {
        "Authorization":
          `Bearer ${token}`
      }
    }
  );

  const data = await response.json();

  alert(data.message);

  loadPDFs();
  };

  // ======================================================
  // AUTH SCREEN
  // ======================================================

  if (!token) {

    return (

      <div
        style={{
          padding: "50px",
          fontFamily: "Arial"
        }}
      >

        <h1>
          {isLogin
            ? "Login"
            : "Signup"}
        </h1>

        <input
          placeholder="Username"
          value={username}
          onChange={(e) =>
            setUsername(e.target.value)
          }
          style={{
            display: "block",
            marginBottom: "10px",
            padding: "10px",
            width: "300px"
          }}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) =>
            setPassword(e.target.value)
          }
          style={{
            display: "block",
            marginBottom: "10px",
            padding: "10px",
            width: "300px"
          }}
        />

        <button
          onClick={handleAuth}
          style={{
            padding: "10px 20px"
          }}
        >
          {isLogin
            ? "Login"
            : "Signup"}
        </button>

        <p
          style={{
            marginTop: "20px",
            cursor: "pointer",
            color: "blue"
          }}
          onClick={() =>
            setIsLogin(!isLogin)
          }
        >
          {isLogin
            ? "Create account"
            : "Already have account?"}
        </p>

      </div>
    );
  }

  // ======================================================
  // MAIN UI
  // ======================================================

 return (

  <div
    style={{
      background: "#f4f7fb",
      minHeight: "100vh",
      padding: "20px",
      fontFamily: "Arial"
    }}
  >

    {/* HEADER */}

    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "20px",
        background: "white",
        padding: "20px",
        borderRadius: "12px",
        boxShadow: "0 2px 10px rgba(0,0,0,0.08)"
      }}
    >

      <div>

        <h1
          style={{
            margin: 0,
            color: "#1e293b"
          }}
        >
          📘 RAG PDF Chatbot
        </h1>

        <p
          style={{
            marginTop: "5px",
            color: "#64748b"
          }}
        >
          Welcome, {username}
        </p>

      </div>

      <button
        onClick={logout}
        style={{
          background: "#ef4444",
          color: "white",
          border: "none",
          padding: "10px 18px",
          borderRadius: "8px",
          cursor: "pointer",
          fontWeight: "bold"
        }}
      >
        Logout
      </button>

    </div>

    {/* MAIN GRID */}

    <div
      style={{
        display: "grid",
        gridTemplateColumns: "320px 1fr",
        gap: "20px"
      }}
    >

      {/* LEFT PANEL */}

      <div>

        {/* PDF Upload */}

        <div
          style={{
            background: "white",
            padding: "20px",
            borderRadius: "12px",
            marginBottom: "20px",
            boxShadow: "0 2px 10px rgba(0,0,0,0.08)"
          }}
        >

          <h3
            style={{
              marginTop: 0
            }}
          >
            📤 Upload PDF
          </h3>

          <input
            type="file"
            accept=".pdf"
            onChange={(e) =>
              setSelectedFile(
                e.target.files[0]
              )
            }
            style={{
              marginBottom: "10px"
            }}
          />

          <button
            onClick={uploadPDF}
            style={{
              width: "100%",
              background: "#2563eb",
              color: "white",
              border: "none",
              padding: "10px",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: "bold"
            }}
          >
            Upload PDF
          </button>

        </div>

        {/* PDF LIST */}

        <div
          style={{
            background: "white",
            padding: "20px",
            borderRadius: "12px",
            boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
            maxHeight: "650px",
            overflowY: "auto"
          }}
        >

          <h3
            style={{
              marginTop: 0
            }}
          >
            📁 My PDFs
          </h3>

          {pdfs.length === 0 ? (

            <p>No PDFs uploaded</p>

          ) : (

            pdfs.map((pdf, index) => (

              <div
                key={index}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: "10px",
                  padding: "10px",
                  marginBottom: "10px",
                  background:
                    selectedPDFs.includes(pdf)
                      ? "#dbeafe"
                      : "#fff"
                }}
              >

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}
                >

                  <div>

                    <input
                      type="checkbox"
                      checked={
                        selectedPDFs.includes(pdf)
                      }
                      onChange={() =>
                        togglePDF(pdf)
                      }
                    />

                    <span
                      style={{
                        marginLeft: "8px",
                        fontSize: "14px",
                        wordBreak: "break-word"
                      }}
                    >
                      {pdf}
                    </span>

                  </div>

                  <button
                    onClick={() =>
                      deletePDF(pdf)
                    }
                    style={{
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "16px"
                    }}
                  >
                    ❌
                  </button>

                </div>

              </div>
            ))
          )}

        </div>

      </div>

      {/* RIGHT PANEL */}

      <div>

        {/* CHAT WINDOW */}

        <div
          style={{
            background: "white",
            borderRadius: "12px",
            padding: "20px",
            boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
            marginBottom: "20px"
          }}
        >

          <h3
            style={{
              marginTop: 0
            }}
          >
            💬 Chat
          </h3>

          <div
            style={{
              height: "450px",
              overflowY: "auto",
              padding: "10px",
              background: "#f8fafc",
              borderRadius: "10px",
              border: "1px solid #e2e8f0"
            }}
          >

            {chat.map((msg, index) => (

              <div
                key={index}
                style={{
                  display: "flex",
                  justifyContent:
                    msg.role === "user"
                      ? "flex-end"
                      : "flex-start",
                  marginBottom: "15px"
                }}
              >

                <div
                  style={{
                    maxWidth: "75%",
                    padding: "12px",
                    borderRadius: "12px",
                    background:
                      msg.role === "user"
                        ? "#2563eb"
                        : "#e2e8f0",
                    color:
                      msg.role === "user"
                        ? "white"
                        : "black"
                  }}
                >

                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: "bold",
                      marginBottom: "5px"
                    }}
                  >
                    {msg.role === "user"
                      ? username
                      : "AI Assistant"}
                  </div>

                  <div>
                    {msg.content}
                  </div>

                </div>

              </div>
            ))}

          </div>

          {/* INPUT */}

          <div
            style={{
              display: "flex",
              marginTop: "15px",
              gap: "10px"
            }}
          >

            <input
              value={question}
              onChange={(e) =>
                setQuestion(e.target.value)
              }
              placeholder="Ask something about your PDFs..."
              style={{
                flex: 1,
                padding: "14px",
                borderRadius: "10px",
                border: "1px solid #cbd5e1",
                fontSize: "15px"
              }}
            />

            <button
              onClick={askQuestion}
              style={{
                background: "#2563eb",
                color: "white",
                border: "none",
                padding: "0 25px",
                borderRadius: "10px",
                cursor: "pointer",
                fontWeight: "bold"
              }}
            >
              Send
            </button>

          </div>

        </div>

        {/* SOURCES */}

        <div
          style={{
            background: "white",
            padding: "20px",
            borderRadius: "12px",
            boxShadow: "0 2px 10px rgba(0,0,0,0.08)"
          }}
        >

          <h3
            style={{
              marginTop: 0
            }}
          >
            📚 Sources
          </h3>

          {sources.length === 0 ? (

            <p>No sources yet</p>

          ) : (

            sources.map((s, index) => (

              <div
                key={`${s.source}-${index}`}
                onClick={() =>
                  setSelectedSource(s)
                }
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: "10px",
                  padding: "15px",
                  marginBottom: "12px",
                  cursor: "pointer",
                  transition: "0.2s",
                  background: "#f8fafc"
                }}
              >

                <div
                  style={{
                    fontWeight: "bold",
                    color: "#2563eb",
                    marginBottom: "8px"
                  }}
                >
                  [Source {index + 1}]
                </div>

                <div>
                  <b>📄 File:</b> {s.file}
                </div>

                <div
                  style={{
                    marginTop: "5px"
                  }}
                >
                  <b>📖 Page:</b> {s.page + 1}
                </div>

                <p
                  style={{
                    marginTop: "10px",
                    color: "#475569",
                    lineHeight: "1.5"
                  }}
                >
                  {s.snippet}
                </p>

              </div>
            ))
          )}

        </div>

      </div>

    </div>

    {/* PDF MODAL */}

    {selectedSource && (

      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          background: "rgba(0,0,0,0.7)",
          zIndex: 999,
          overflow: "auto"
        }}
      >

        <div
          style={{
            width: "85%",
            margin: "30px auto",
            background: "white",
            borderRadius: "12px",
            padding: "20px",
            position: "relative"
          }}
        >

          <button
            onClick={() =>
              setSelectedSource(null)
            }
            style={{
              position: "absolute",
              right: "20px",
              top: "20px",
              border: "none",
              background: "#ef4444",
              color: "white",
              padding: "8px 12px",
              borderRadius: "8px",
              cursor: "pointer"
            }}
          >
            Close
          </button>

          <h2>
            {selectedSource.source}
          </h2>

          <p>
            📖 Page:
            {" "}
            {selectedSource.page + 1}
          </p>

          <div
            style={{
              overflow: "auto",
              maxHeight: "80vh",
              border: "1px solid #ddd",
              borderRadius: "10px",
              padding: "10px"
            }}
          >

            <Document
              file={
                `http://127.0.0.1:8000/pdf/${username}/${selectedSource.source}`
              }
              onLoadSuccess={({ numPages }) =>
                setNumPages(numPages)
              }
              loading="Loading PDF..."
            >

              <Page
                pageNumber={
                  selectedSource.page + 1
                }
                width={900}
              />

            </Document>

          </div>

        </div>

      </div>
    )}

  </div>
);
}

export default App;