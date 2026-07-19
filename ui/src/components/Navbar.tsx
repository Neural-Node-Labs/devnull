import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
// 1. Import your logo image asset here (adjust path based on your folder structure)
import devnullLogo from "../assets/devnull-logo-x.png";

const NAV_ITEMS: { to: string; label: string; adminOnly?: boolean }[] = [
  { to: "/", label: "Home" },
  { to: "/chat", label: "Chat" },
  { to: "/projects", label: "Projects" },
  { to: "/telemetry", label: "Telemetry" },
  { to: "/plans", label: "Plans" },
  { to: "/diagnostics", label: "Diagnostics" },
  { to: "/settings", label: "Settings" },
  { to: "/admin", label: "Admin", adminOnly: true },
];

export function Navbar() {
  const { isAuthenticated, isAdmin, user, logout } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  if (!isAuthenticated) return null;

  const isActive = (path: string) => location.pathname === path;
  const items = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

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

  const UserBadge = (
    <span style={{ color: "var(--color-text-secondary)", fontSize: "13px" }}>
      {user?.username}
      {user?.role === "admin" && (
        <span
          style={{
            background: "var(--color-primary)",
            color: "#fff",
            fontSize: "10px",
            padding: "2px 6px",
            borderRadius: "4px",
            marginLeft: "6px",
            fontWeight: 600,
          }}
        >
          ADMIN
        </span>
      )}
    </span>
  );

  const LogoutButton = (
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
  );

  return (
    <nav
      style={{
        background: "var(--color-nav-bg)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <div
        style={{
          padding: "0 24px",
          display: "flex",
          alignItems: "center",
          height: "56px",
          gap: "4px",
        }}
      >
        {/* Clickable Logo Wrapper Container */}
        <button
          onClick={() => setInfoOpen(true)}
          title="View DEVNULL Protocol Information"
          style={{
            display: "flex",
            alignItems: "center",
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "zoom-in",
            marginRight: "16px",
            outline: "none"
          }}
        >
          {/* Larger Logo Element occupying the space */}
          <img
            src={devnullLogo}
            alt="DEVNULL Mutant Protocol"
            style={{
              width: "56px",
              height: "56px",
              objectFit: "contain",
              filter: "drop-shadow(0 0 4px rgba(147, 51, 234, 0.5))"
            }}
          />
        </button>

        {/* Full link row — hidden below the responsive breakpoint (see index.css) */}
        <div className="devnull-nav-links" style={{ display: "flex", gap: "4px", flex: 1 }}>
          {items.map((item) => (
            <Link key={item.to} to={item.to} style={linkStyle(item.to)}>
              {item.label}
            </Link>
          ))}
        </div>

        {/* User info + logout — hidden below the breakpoint, moved into the mobile panel */}
        <div className="devnull-nav-user" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {UserBadge}
          {LogoutButton}
        </div>

        {/* Hamburger — only shown below the responsive breakpoint */}
        <button
          className="devnull-nav-toggle"
          onClick={() => setMobileOpen((v) => !v)}
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
          style={{
            marginLeft: "auto",
            background: "transparent",
            border: "1px solid var(--color-border)",
            borderRadius: "6px",
            color: "var(--color-text)",
            width: "36px",
            height: "36px",
            cursor: "pointer",
            fontSize: "18px",
            lineHeight: 1,
          }}
        >
          {mobileOpen ? "✕" : "☰"}
        </button>
      </div>

      {/* Mobile dropdown panel */}
      {mobileOpen && (
        <div
          className="devnull-nav-mobile-panel"
          style={{
            borderTop: "1px solid var(--color-border)",
            padding: "12px 16px",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              style={{ ...linkStyle(item.to), padding: "10px 12px" }}
            >
              {item.label}
            </Link>
          ))}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: "8px",
              paddingTop: "12px",
              borderTop: "1px solid var(--color-border)",
            }}
          >
            {UserBadge}
            {LogoutButton}
          </div>
        </div>
      )}

      {/* Immersive Info & Zoom Modal */}
      {infoOpen && (
        <div
          onClick={() => setInfoOpen(false)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(11, 6, 22, 0.85)",
            backdropFilter: "blur(8px)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 9999,
            padding: "20px"
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--color-card-bg, #1e1e2e)",
              border: "1px solid var(--color-primary, #9333ea)",
              borderRadius: "16px",
              padding: "32px",
              maxWidth: "750px", // Expanded slightly to balance the massive logo layout
              width: "100%",
              boxShadow: "0 10px 40px rgba(147, 51, 234, 0.3)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "24px",
              position: "relative"
            }}
          >
            {/* Close Modal Trigger */}
            <button
              onClick={() => setInfoOpen(false)}
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                background: "transparent",
                border: "none",
                color: "var(--color-text-secondary, #a6adc8)",
                fontSize: "20px",
                cursor: "pointer",
              }}
            >
              ✕
            </button>

            {/* Zoomed Logo Display — Resized 4 times larger (From 160px up to 640px max-constrained to 100% viewport width) */}
            <img
              src={devnullLogo}
              alt="DEVNULL Large Protocol Logo"
              style={{
                width: "100%",
                maxWidth: "640px",
                height: "auto",
                maxHeight: "60vh",
                objectFit: "contain",
                filter: "drop-shadow(0 0 24px rgba(147, 51, 234, 0.75))",
              }}
            />

            {/* Structured Project Metadata */}
            <div style={{ textAlign: "center", width: "100%" }}>
              <h2 style={{ fontSize: "24px", fontWeight: 800, margin: "0 0 4px 0", color: "var(--color-text, #cdd6f4)" }}>
                Neural Node Labs
              </h2>
              <p style={{ fontSize: "14px", color: "var(--color-primary, #9333ea)", fontWeight: 600, margin: "0 0 20px 0" }}>
                By: Sir John Nueva
              </p>

              <div
                style={{
                  textAlign: "left",
                  background: "rgba(0, 0, 0, 0.2)",
                  padding: "18px",
                  borderRadius: "8px",
                  border: "1px solid var(--color-border, #313244)",
                  fontSize: "14px",
                  lineHeight: "1.6",
                  color: "var(--color-text-secondary, #a6adc8)"
                }}
              >
                <strong>DEVNULL</strong> is a ReAct CLI agent with hot-pluggable role skills
                (Programmer, Architect, Tester, DevOps, SecOps, Kubernetes Expert, Docker Expert,
                Performance Tester, Pentester, RCA, Analyst, Filesystem Management, Playwright UI Tester).
                It runs against DeepSeek by default, executes real tools against the local workspace
                and remote systems (SSH, GitHub, Docker deploy, Playwright), and operates under a standing
                engineering protocol (<code>agent/devnull.md</code>) covering plan mode, subagent delegation,
                self-improvement, and verification-before-done.
              </div>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}