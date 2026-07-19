import React, { useEffect, useState } from "react";
import { api } from "../api/client";

interface TelemetryEntry {
  timestamp?: string;
  data?: unknown;
  raw?: string;
}

export function TelemetryPage() {
  const [logFile, setLogFile] = useState("thinking");
  const [entries, setEntries] = useState<TelemetryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadTelemetry();
  }, [logFile]);

  const loadTelemetry = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getTelemetry(logFile, 100);
      if (res.success && res.data) {
        const data = res.data as any;
        setEntries(data.entries ?? []);
      } else {
        setError(res.error ?? "Failed to load telemetry");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const filteredEntries = searchQuery.trim()
    ? entries.filter((entry) => {
        const searchStr = searchQuery.toLowerCase();
        const content = entry.data
          ? JSON.stringify(entry.data).toLowerCase()
          : (entry.raw ?? "").toLowerCase();
        return content.includes(searchStr);
      })
    : entries;

  const logFiles = ["thinking", "llm", "sys"];

  const sectionStyle: React.CSSProperties = {
    background: "var(--color-card-bg)",
    border: "1px solid var(--color-border)",
    borderRadius: "10px",
    padding: "24px",
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "4px" }}>Telemetry</h1>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "14px", margin: 0 }}>
            View agent logs and telemetry data
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          {logFiles.map((file) => (
            <button
              key={file}
              onClick={() => setLogFile(file)}
              style={{
                padding: "6px 14px",
                borderRadius: "6px",
                border: logFile === file ? "2px solid var(--color-primary)" : "1px solid var(--color-border)",
                background: logFile === file ? "color-mix(in srgb, var(--color-primary) 10%, transparent)" : "transparent",
                color: logFile === file ? "var(--color-primary)" : "var(--color-text-secondary)",
                fontSize: "13px",
                fontWeight: logFile === file ? 600 : 400,
                cursor: "pointer",
                textTransform: "capitalize",
                transition: "all 0.15s ease",
              }}
            >
              {file}
            </button>
          ))}
          <button
            onClick={loadTelemetry}
            style={{
              padding: "6px 14px",
              borderRadius: "6px",
              border: "1px solid var(--color-border)",
              background: "transparent",
              color: "var(--color-text-secondary)",
              fontSize: "13px",
              cursor: "pointer",
              marginLeft: "8px",
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Search input */}
      <div style={{ marginBottom: "16px" }}>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search telemetry entries..."
          aria-label="Search telemetry"
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: "6px",
            border: "1px solid var(--color-border)",
            background: "var(--color-input-bg)",
            color: "var(--color-text)",
            fontSize: "14px",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* ReAct trace structure indicators */}
      <div
        style={{
          display: "flex",
          gap: "16px",
          marginBottom: "16px",
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            padding: "8px 14px",
            borderRadius: "6px",
            background: "color-mix(in srgb, var(--color-primary) 10%, transparent)",
            border: "1px solid var(--color-border)",
            fontSize: "12px",
            color: "var(--color-primary)",
            fontWeight: 500,
          }}
        >
          💭 Reason / Thought
        </div>
        <div
          style={{
            padding: "8px 14px",
            borderRadius: "6px",
            background: "color-mix(in srgb, var(--color-accent) 10%, transparent)",
            border: "1px solid var(--color-border)",
            fontSize: "12px",
            color: "var(--color-accent)",
            fontWeight: 500,
          }}
        >
          🔧 Action / Tool Call
        </div>
        <div
          style={{
            padding: "8px 14px",
            borderRadius: "6px",
            background: "color-mix(in srgb, var(--color-success) 10%, transparent)",
            border: "1px solid var(--color-border)",
            fontSize: "12px",
            color: "var(--color-success)",
            fontWeight: 500,
          }}
        >
          👁️ Observation / Result
        </div>
        <div
          style={{
            padding: "8px 14px",
            borderRadius: "6px",
            background: "color-mix(in srgb, var(--color-warning) 10%, transparent)",
            border: "1px solid var(--color-border)",
            fontSize: "12px",
            color: "var(--color-warning)",
            fontWeight: 500,
          }}
        >
          ⚡ Command Executed
        </div>
        <div
          style={{
            padding: "8px 14px",
            borderRadius: "6px",
            background: "color-mix(in srgb, var(--color-text-secondary) 10%, transparent)",
            border: "1px solid var(--color-border)",
            fontSize: "12px",
            color: "var(--color-text-secondary)",
            fontWeight: 500,
          }}
        >
          🔢 Token Usage
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: "10px 16px",
            borderRadius: "6px",
            marginBottom: "16px",
            fontSize: "13px",
            background: "color-mix(in srgb, var(--color-error) 15%, transparent)",
            color: "var(--color-error)",
          }}
        >
          {error}
        </div>
      )}

      <div style={sectionStyle}>
        {loading ? (
          <p style={{ color: "var(--color-text-secondary)", textAlign: "center", padding: "40px" }}>
            Loading telemetry data...
          </p>
        ) : filteredEntries.length === 0 ? (
          <p style={{ color: "var(--color-text-secondary)", textAlign: "center", padding: "40px" }}>
            {searchQuery.trim()
              ? `No entries matching "${searchQuery}" in "${logFile}"`
              : `No telemetry entries found for "${logFile}"`}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {filteredEntries.map((entry, i) => {
              // Determine entry type for labeling
              const contentStr = entry.data
                ? JSON.stringify(entry.data).toLowerCase()
                : (entry.raw ?? "").toLowerCase();
              let typeLabel = "entry";
              let typeColor = "var(--color-text-secondary)";
              if (contentStr.includes("reason") || contentStr.includes("thought") || contentStr.includes("think")) {
                typeLabel = "Reason";
                typeColor = "var(--color-primary)";
              } else if (contentStr.includes("action") || contentStr.includes("tool")) {
                typeLabel = "Action";
                typeColor = "var(--color-accent)";
              } else if (contentStr.includes("observation") || contentStr.includes("result") || contentStr.includes("output")) {
                typeLabel = "Observation";
                typeColor = "var(--color-success)";
              } else if (contentStr.includes("command") || contentStr.includes("exec") || contentStr.includes("run")) {
                typeLabel = "Command";
                typeColor = "var(--color-warning)";
              } else if (contentStr.includes("token") || contentStr.includes("usage") || contentStr.includes("cost")) {
                typeLabel = "Token Usage";
                typeColor = "var(--color-text-secondary)";
              }

              return (
                <div
                  key={i}
                  style={{
                    padding: "12px 16px",
                    borderRadius: "6px",
                    background: "var(--color-bg-secondary)",
                    fontSize: "13px",
                    lineHeight: "1.5",
                    borderLeft: `3px solid ${typeColor}`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "4px",
                    }}
                  >
                    {entry.timestamp && (
                      <span style={{ color: "var(--color-text-secondary)", fontSize: "11px", fontFamily: "monospace" }}>
                        {entry.timestamp}
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 600,
                        color: typeColor,
                        padding: "1px 6px",
                        borderRadius: "3px",
                        background: `color-mix(in srgb, ${typeColor} 15%, transparent)`,
                        textTransform: "uppercase",
                      }}
                    >
                      {typeLabel}
                    </span>
                  </div>
                  <pre style={{ margin: 0, whiteSpace: "pre-wrap", color: "var(--color-text)", fontFamily: "monospace", fontSize: "12px" }}>
                    {entry.data ? JSON.stringify(entry.data, null, 2) : entry.raw}
                  </pre>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

