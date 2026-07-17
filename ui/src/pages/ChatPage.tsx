import React, { useState, useRef, useEffect } from "react";
import { api } from "../api/client";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

export function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [planMode, setPlanMode] = useState<"auto" | "always" | "never">("always");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Keep the newest message in view as the conversation grows
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  const handleNewChat = () => {
    if (messages.length > 0 && !confirm("Start a new chat? The current conversation will be cleared.")) return;
    setMessages([]);
    setInput("");
    setError(null);
    setCurrentPlan(null);
    setSessionId(null);
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage: ChatMessage = {
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setError(null);
    setCurrentPlan(null);
    setSessionId(null);

    try {
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const res = await api.chat(userMessage.content, planMode, controller.signal);
      if (res.success && res.data) {
        const data = res.data as any;

        if (data.plan) {
          setCurrentPlan(data.plan);
          setSessionId(data.sessionId ?? null);
          setMessages((prev) => [
            ...prev,
            {
              role: "system",
              content: `📋 Plan generated:\n${data.plan}`,
              timestamp: new Date(),
            },
          ]);
        }

        if (data.result) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: data.result,
              timestamp: new Date(),
            },
          ]);
        }
      } else {
        setError(res.error ?? "Request failed");
        setMessages((prev) => [
          ...prev,
          {
            role: "system",
            content: `❌ Error: ${res.error ?? "Request failed"}`,
            timestamp: new Date(),
          },
        ]);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setMessages((prev) => [
          ...prev,
          { role: "system", content: "⏹️ Request cancelled", timestamp: new Date() },
        ]);
      } else {
        const msg = err instanceof Error ? err.message : "An error occurred";
        setError(msg);
        setMessages((prev) => [
          ...prev,
          {
            role: "system",
            content: `❌ Error: ${msg}`,
            timestamp: new Date(),
          },
        ]);
      }
    } finally {
      abortControllerRef.current = null;
      setLoading(false);
    }
  };

  const handleCancel = () => {
    abortControllerRef.current?.abort();
  };

  const handleApprovePlan = async () => {
    if (!sessionId || loading) return;
    setLoading(true);
    try {
      const res = await api.executePlan(sessionId);
      if (res.success && res.data) {
        const data = res.data as any;
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.result ?? "Plan executed successfully",
            timestamp: new Date(),
          },
        ]);
        setCurrentPlan(null);
        setSessionId(null);
      } else {
        setError(res.error ?? "Execution failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleRejectPlan = () => {
    setMessages((prev) => [
      ...prev,
      {
        role: "system",
        content: "❌ Plan rejected",
        timestamp: new Date(),
      },
    ]);
    setCurrentPlan(null);
    setSessionId(null);
  };

  const handleVoiceToggle = () => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      setError("Speech recognition is not supported in this browser");
      return;
    }
    setIsListening(!isListening);
    // In a real implementation, this would use the Web Speech API
    if (!isListening) {
      setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: "🎤 Listening... (speech recognition would start here)",
          timestamp: new Date(),
        },
      ]);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: `📎 File uploaded: ${files[0].name}`,
          timestamp: new Date(),
        },
      ]);
    }
    // Reset the input so the same file can be uploaded again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const sectionStyle: React.CSSProperties = {
    background: "var(--color-card-bg)",
    border: "1px solid var(--color-border)",
    borderRadius: "10px",
    padding: "24px",
    marginBottom: "16px",
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700, margin: 0 }}>Chat</h1>
        {messages.length > 0 && (
          <button
            onClick={handleNewChat}
            style={{
              padding: "6px 14px",
              borderRadius: "6px",
              border: "1px solid var(--color-border)",
              background: "transparent",
              color: "var(--color-text-secondary)",
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            + New chat
          </button>
        )}
      </div>

      {/* Chat messages */}
      <div
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
        style={{
          ...sectionStyle,
          maxHeight: "480px",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        {messages.length === 0 ? (
          <p style={{ color: "var(--color-text-secondary)", textAlign: "center", padding: "40px" }}>
            Send a message to start chatting with devnull
          </p>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              style={{
                padding: "12px 16px",
                borderRadius: "8px",
                background:
                  msg.role === "user"
                    ? "color-mix(in srgb, var(--color-primary) 10%, transparent)"
                    : msg.role === "system"
                    ? "color-mix(in srgb, var(--color-accent) 10%, transparent)"
                    : "var(--color-bg-secondary)",
                alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "80%",
              }}
            >
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "var(--color-text-secondary)",
                  marginBottom: "4px",
                  display: "block",
                }}
              >
                {msg.role === "user" ? "You" : msg.role === "assistant" ? "devnull" : "System"}
              </span>
              <p style={{ margin: 0, fontSize: "14px", lineHeight: "1.5", whiteSpace: "pre-wrap" }}>
                {msg.content}
              </p>
              <span
                style={{
                  fontSize: "10px",
                  color: "var(--color-text-secondary)",
                  marginTop: "4px",
                  display: "block",
                }}
              >
                {msg.timestamp.toLocaleTimeString()}
              </span>
            </div>
          ))
        )}
        {loading && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              padding: "12px 16px",
              borderRadius: "8px",
              background: "var(--color-bg-secondary)",
              alignSelf: "flex-start",
              color: "var(--color-text-secondary)",
              fontSize: "14px",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="devnull-spinner" aria-hidden="true" />
              Thinking...
            </span>
            <button
              onClick={handleCancel}
              style={{
                background: "transparent",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-secondary)",
                borderRadius: "6px",
                padding: "4px 10px",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Plan display */}
      {currentPlan && (
        <div
          style={{
            ...sectionStyle,
            borderColor: "var(--color-accent)",
            borderWidth: "2px",
          }}
        >
          <h3
            style={{
              fontSize: "14px",
              fontWeight: 600,
              marginBottom: "12px",
              color: "var(--color-accent)",
            }}
          >
            Plan for: {messages.find((m) => m.role === "user")?.content ?? "Task"}
          </h3>
          <pre
            style={{
              background: "var(--color-bg-secondary)",
              padding: "16px",
              borderRadius: "6px",
              fontSize: "13px",
              lineHeight: "1.5",
              overflowX: "auto",
              whiteSpace: "pre-wrap",
              color: "var(--color-text)",
              margin: 0,
              maxHeight: "300px",
              overflowY: "auto",
            }}
          >
            {currentPlan}
          </pre>
          <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
            <button
              onClick={handleApprovePlan}
              disabled={loading}
              style={{
                padding: "8px 20px",
                borderRadius: "6px",
                border: "none",
                background: loading ? "var(--color-text-secondary)" : "var(--color-success)",
                color: "#fff",
                fontSize: "13px",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Executing..." : "Approve"}
            </button>
            <button
              onClick={handleRejectPlan}
              disabled={loading}
              style={{
                padding: "8px 20px",
                borderRadius: "6px",
                border: "1px solid var(--color-error)",
                background: "transparent",
                color: "var(--color-error)",
                fontSize: "13px",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              Reject
            </button>
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div
          style={{
            ...sectionStyle,
            borderColor: "var(--color-error)",
          }}
        >
          <p style={{ color: "var(--color-error)", fontSize: "13px", margin: 0 }}>{error}</p>
        </div>
      )}

      {/* Input area */}
      <div style={sectionStyle}>
        <div style={{ display: "flex", gap: "8px", marginBottom: "12px", alignItems: "center" }}>
          {/* Plan mode selector */}
          <select
            value={planMode}
            onChange={(e) => setPlanMode(e.target.value as "auto" | "always" | "never")}
            style={{
              padding: "6px 10px",
              borderRadius: "6px",
              border: "1px solid var(--color-border)",
              background: "var(--color-input-bg)",
              color: "var(--color-text)",
              fontSize: "13px",
              outline: "none",
            }}
            aria-label="Plan mode"
          >
            <option value="always">Plan: Always</option>
            <option value="auto">Plan: Auto</option>
            <option value="never">Plan: Never</option>
          </select>

          {/* Voice button */}
          <button
            onClick={handleVoiceToggle}
            style={{
              padding: "6px 12px",
              borderRadius: "6px",
              border: "1px solid var(--color-border)",
              background: isListening ? "color-mix(in srgb, var(--color-error) 20%, transparent)" : "transparent",
              color: isListening ? "var(--color-error)" : "var(--color-text-secondary)",
              fontSize: "13px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
            title={isListening ? "Stop listening" : "Voice input"}
          >
            🎤 {isListening ? "Listening..." : "Voice"}
          </button>

          {/* File upload button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: "6px 12px",
              borderRadius: "6px",
              border: "1px solid var(--color-border)",
              background: "transparent",
              color: "var(--color-text-secondary)",
              fontSize: "13px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
            title="Upload file to workspace"
          >
            📎 Upload
          </button>
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileUpload}
            style={{ display: "none" }}
          />
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Type your message here..."
            rows={3}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: "6px",
              border: "1px solid var(--color-border)",
              background: "var(--color-input-bg)",
              color: "var(--color-text)",
              fontSize: "14px",
              fontFamily: "inherit",
              resize: "none",
              outline: "none",
            }}
            aria-label="Message input"
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            style={{
              padding: "10px 20px",
              borderRadius: "6px",
              border: "none",
              background: loading || !input.trim() ? "var(--color-text-secondary)" : "var(--color-primary)",
              color: "#fff",
              fontSize: "14px",
              fontWeight: 600,
              cursor: loading || !input.trim() ? "not-allowed" : "pointer",
              alignSelf: "flex-end",
              transition: "background 0.15s ease",
            }}
          >
            {loading ? "..." : "Send"}
          </button>
        </div>
        <p style={{ margin: "8px 0 0", fontSize: "11px", color: "var(--color-text-secondary)" }}>
          Enter to send · Shift+Enter for a new line
        </p>
      </div>
    </div>
  );
}

