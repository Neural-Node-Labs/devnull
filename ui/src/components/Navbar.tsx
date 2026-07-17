import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function Navbar() {
  const { isAuthenticated, isAdmin, user, logout } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) return null;

  const isActive = (path: string) => location.pathname === path;

  const linkStyle = (path: string): React.CSSProperties => ({
    color: isActive(path) ? "var(--color-primary)" : "var(--color-sidebar-text)",
    textDecoration: "none",
    padding: "8px 16px",
    borderRadius: "6px",
    fontSize: "14px",
    fontWeight: isActive(path) ? 600 : 400,
    background: isActive(path) ? "var(--color-sidebar-hover)" : "transparent",
    transition: "all 0.15s ease",
  });

  return (
    <nav
      style={{
        background: "var(--color-nav-bg)",
        borderBottom: "1px solid var(--color-border)",
        padding: "0 24px",
        display: "flex",
        alignItems: "center",
        height: "56px",
        gap: "4px",
      }}
    >
      <Link
        to="/"
        style={{
          fontWeight: 700,
          fontSize: "18px",
          color: "var(--color-text)",
          textDecoration: "none",
          marginRight: "24px",
        }}
      >
        devnull
      </Link>

      <div style={{ display: "flex", gap: "4px", flex: 1 }}>
        <Link to="/" style={linkStyle("/")}>Home</Link>
        <Link to="/chat" style={linkStyle("/chat")}>Chat</Link>
        <Link to="/projects" style={linkStyle("/projects")}>Projects</Link>
        <Link to="/telemetry" style={linkStyle("/telemetry")}>Telemetry</Link>
        <Link to="/diagnostics" style={linkStyle("/diagnostics")}>Diagnostics</Link>
        <Link to="/settings" style={linkStyle("/settings")}>Settings</Link>
        {isAdmin && (
          <Link to="/admin" style={linkStyle("/admin")}>Admin</Link>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <span
          style={{
            color: "var(--color-text-secondary)",
            fontSize: "13px",
          }}
        >
          {user?.username}
          {user?.role === "admin" && (
            <span style={{
              background: "var(--color-primary)",
              color: "#fff",
              fontSize: "10px",
              padding: "2px 6px",
              borderRadius: "4px",
              marginLeft: "6px",
              fontWeight: 600,
            }}>
              ADMIN
            </span>
          )}
        </span>
        <button
          onClick={() => logout()}
          style={{
            background: "transparent",
            border: "1px solid var(--color-border)",
            color: "var(--color-text-secondary)",
            padding: "6px 14px",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "13px",
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--color-error)";
            e.currentTarget.style.color = "var(--color-error)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--color-border)";
            e.currentTarget.style.color = "var(--color-text-secondary)";
          }}
        >
          Logout
        </button>
      </div>
    </nav>
  );
}
