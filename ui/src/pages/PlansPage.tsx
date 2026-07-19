import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

interface Plan {
  id: string;
  taskDescription: string;
  planContent: string;
  status: "active" | "completed" | "cancelled";
  createdAt: string;
  updatedAt: string;
}

export function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/plans", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("devnull_auth_token")}`,
        },
      });
      const json = await res.json();
      if (json.success && json.data) {
        setPlans(json.data.plans ?? []);
      } else {
        setError(json.error ?? "Failed to load plans");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "var(--color-primary)";
      case "completed":
        return "var(--color-success)";
      case "cancelled":
        return "var(--color-error)";
      default:
        return "var(--color-text-secondary)";
    }
  };

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
          <h1 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "4px" }}>Plans</h1>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "14px", margin: 0 }}>
            View and manage plans created by devnull
          </p>
        </div>
        <button
          onClick={loadPlans}
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
          Refresh
        </button>
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
            Loading plans...
          </p>
        ) : plans.length === 0 ? (
          <p style={{ color: "var(--color-text-secondary)", textAlign: "center", padding: "40px" }}>
            No plans yet. Plans are created when devnull generates a plan for a task.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {plans.map((plan) => (
              <div
                key={plan.id}
                onClick={() => navigate(`/plans/${plan.id}`)}
                style={{
                  padding: "16px",
                  borderRadius: "8px",
                  background: "var(--color-bg-secondary)",
                  cursor: "pointer",
                  transition: "background 0.15s ease",
                  border: "1px solid var(--color-border)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                  <h3 style={{ fontSize: "15px", fontWeight: 600, margin: 0, color: "var(--color-text)" }}>
                    {plan.taskDescription}
                  </h3>
                  <span
                    style={{
                      padding: "2px 10px",
                      borderRadius: "12px",
                      fontSize: "11px",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      background: `color-mix(in srgb, ${getStatusColor(plan.status)} 15%, transparent)`,
                      color: getStatusColor(plan.status),
                      flexShrink: 0,
                    }}
                  >
                    {plan.status}
                  </span>
                </div>
                <p
                  style={{
                    fontSize: "13px",
                    color: "var(--color-text-secondary)",
                    margin: "0 0 8px",
                    lineHeight: "1.4",
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {plan.planContent}
                </p>
                <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>
                  Created: {new Date(plan.createdAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
