import React, {
  useState,
  useEffect
} from "react";

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
  // LOAD HISTORY
  // ======================================================

  useEffect(() => {

    if (token) {

      loadHistory();
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
          history: newChat
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
            history: newChat
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
        padding: "20px",
        fontFamily: "Arial"
      }}
    >

      <button
        onClick={logout}
        style={{
          float: "right",
          padding: "5px 10px"
        }}
      >
        Logout
      </button>

      <h1>
        📘 RAG Chatbot (Version 13.1)
      </h1>

      {/* PDF Upload */}

      <div
        style={{
          marginBottom: "20px"
        }}
      >

        <input
          type="file"
          accept=".pdf"
          onChange={(e) =>
            setSelectedFile(
              e.target.files[0]
            )
          }
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

      {/* CHAT */}

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

          <div
            key={index}
            style={{
              marginBottom: "10px"
            }}
          >

            <b>
              {msg.role === "user" ? `🧑 ${username}` : "🤖 AI"}: 
            </b> {msg.content}
            
          </div>
        ))}

      </div>

      {/* INPUT */}

      <input
        value={question}
        onChange={(e) =>
          setQuestion(e.target.value)
        }
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

      {/* SOURCES */}

      <div
        style={{
          marginTop: "20px"
        }}
      >

        <h3>
          📚 Sources
        </h3>

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

              <b>
                [Source {s.id}]
              </b>

              <br />

              <b>File:</b>
              {" "}
              {s.file}

              <br />

              <b>Page:</b>
              {" "}
              {s.page + 1}

              <p
                style={{
                  marginTop: "5px"
                }}
              >
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