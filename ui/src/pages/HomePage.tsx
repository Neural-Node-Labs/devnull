import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
// Import your logo image asset here (adjust path based on your folder structure)
import devnullLogo from "../assets/devnull-logo-x.png";

interface HealthInfo {
  version: string;
  uptime: number;
}

export function HomePage() {
  const { user, isAdmin } = useAuth();
  const [health, setHealth] = useState<HealthInfo | null>(null);

  useEffect(() => {
    api.health().then((res) => {
      if (res.success && res.data) {
        setHealth(res.data as HealthInfo);
      }
    });
  }, []);

  const formatUptime = (seconds: number): string => {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const parts: string[] = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    return parts.join(" ") || "<1m";
  };

  const cards = [
    { title: "Chat", desc: "Send tasks to the devnull agent", link: "/chat", icon: "💬" },
    { title: "Projects", desc: "Manage workspaces and active project", link: "/projects", icon: "📁" },
    { title: "Telemetry", desc: "View agent logs and telemetry data", link: "/telemetry", icon: "📊" },
    { title: "Diagnostics", desc: "Run health checks and view loaded skills", link: "/diagnostics", icon: "🩺" },
    { title: "Settings", desc: "Manage preferences, themes, and users", link: "/settings", icon: "⚙️" },
    ...(isAdmin ? [{ title: "Admin", desc: "User management and system admin", link: "/admin", icon: "👑" }] : []),
  ];

  return (
    <div>
      {/* Welcome Header Section with Image Background */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          marginBottom: "32px",
          // Blends the X-Men logo as a background image with a dark gradient mask for text legibility
          backgroundImage: `linear-gradient(90deg, rgba(11, 6, 22, 0.9) 30%, rgba(147, 51, 234, 0.2) 100%), url(${devnullLogo})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          padding: "40px 32px",
          borderRadius: "12px",
          border: "1px solid var(--color-border)",
          boxShadow: "inset 0 0 20px rgba(0, 0, 0, 0.6)"
        }}
      >
        <div>
          <h1 style={{ fontSize: "32px", fontWeight: 800, marginBottom: "8px", margin: 0, textShadow: "0 2px 4px rgba(0,0,0,0.8)" }}>
            Welcome, {user?.username}
          </h1>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "16px", margin: "6px 0 0 0", textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>
            devnull agent dashboard — Mutant Protocol Active
          </p>
        </div>
      </div>

      {health && (
        <div
          style={{
            display: "flex",
            gap: "16px",
            marginBottom: "32px",
            flexWrap: "wrap",
          }}
        >
          <InfoBadge label="API Version" value={health.version} />
          <InfoBadge label="Uptime" value={formatUptime(health.uptime)} />
          <InfoBadge label="Status" value="Online" color="var(--color-success)" />
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: "16px",
         }}
       >
        {cards.map((card) => (
          <Link
            key={card.link}
            to={card.link}
            style={{
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div
              style={{
                background: "var(--color-card-bg)",
                border: "1px solid var(--color-border)",
                borderRadius: "10px",
                padding: "24px",
                transition: "border-color 0.15s ease, transform 0.15s ease",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--color-primary)";
                e.currentTarget.style.transform = "translateY(-2px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--color-border)";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <div style={{ fontSize: "32px", marginBottom: "12px" }}>{card.icon}</div>
              <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "6px" }}>
                {card.title}
              </h3>
              <p style={{ color: "var(--color-text-secondary)", fontSize: "13px", margin: 0 }}>
                {card.desc}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function InfoBadge({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div
      style={{
        background: "var(--color-card-bg)",
        border: "1px solid var(--color-border)",
        borderRadius: "8px",
        padding: "12px 20px",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
      }}
    >
      <span style={{ fontSize: "11px", color: "var(--color-text-secondary)", fontWeight: 500 }}>
        {label}
      </span>
      <span style={{ fontSize: "16px", fontWeight: 600, color: color ?? "var(--color-text)" }}>
        {value}
      </span>
    </div>
  );
}