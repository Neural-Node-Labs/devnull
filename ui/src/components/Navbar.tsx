import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const NAV_ITEMS: { to: string; label: string; adminOnly?: boolean }[] = [
  { to: "/", label: "Home" },
  { to: "/chat", label: "Chat" },
  { to: "/projects", label: "Projects" },
  { to: "/telemetry", label: "Telemetry" },
  { to: "/diagnostics", label: "Diagnostics" },
  { to: "/settings", label: "Settings" },
  { to: "/admin", label: "Admin", adminOnly: true },
];

export function Navbar() {
  const { isAuthenticated, isAdmin, user, logout } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

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
    </nav>
  );
}
