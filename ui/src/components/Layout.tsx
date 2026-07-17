import React from "react";
import { Outlet } from "react-router-dom";
import { Navbar } from "./Navbar";

export function Layout() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--color-bg)",
        color: "var(--color-text)",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <Navbar />
      <main style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto" }}>
        <Outlet />
      </main>
    </div>
  );
}
