import React, { useState } from "react";

interface Project {
  id: string;
  name: string;
  path: string;
  active: boolean;
  includeInLlm: boolean;
}

interface WorkspaceFile {
  name: string;
  path: string;
  size: number;
  isDir: boolean;
}

// Mock data — will be replaced with real API calls once the backend exposes
// project endpoints (see review notes: /api/v1/projects is not yet implemented).
const MOCK_PROJECTS: Project[] = [
  { id: "1", name: "devnull", path: "C:\\Users\\sjnue\\Downloads\\devnull", active: true, includeInLlm: true },
  { id: "2", name: "test-project", path: "C:\\Users\\sjnue\\Downloads\\test-project", active: false, includeInLlm: false },
];

const MOCK_FILES: WorkspaceFile[] = [
  { name: "src", path: "src", size: 0, isDir: true },
  { name: "package.json", path: "package.json", size: 1024, isDir: false },
  { name: "tsconfig.json", path: "tsconfig.json", size: 512, isDir: false },
  { name: "README.md", path: "README.md", size: 256, isDir: false },
];

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>(MOCK_PROJECTS);
  const [selectedProject, setSelectedProject] = useState<Project | null>(
    MOCK_PROJECTS.find((p) => p.active) || null
  );
  const [workspaceFiles] = useState<WorkspaceFile[]>(MOCK_FILES);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [formName, setFormName] = useState("");
  const [formPath, setFormPath] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const showMessage = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const closeForm = () => {
    setShowAddForm(false);
    setEditProject(null);
    setFormName("");
    setFormPath("");
    setFormError(null);
  };

  const handleAdd = () => {
    if (!formName.trim() || !formPath.trim()) {
      setFormError("Name and path are both required.");
      return;
    }
    if (projects.some((p) => p.name.toLowerCase() === formName.trim().toLowerCase())) {
      setFormError("A project with this name already exists.");
      return;
    }
    const newProject: Project = {
      id: String(Date.now()),
      name: formName.trim(),
      path: formPath.trim(),
      active: false,
      includeInLlm: false,
    };
    setProjects((prev) => [...prev, newProject]);
    showMessage("success", `Project "${newProject.name}" added`);
    closeForm();
  };

  const handleUpdate = () => {
    if (!editProject) return;
    if (!formName.trim() || !formPath.trim()) {
      setFormError("Name and path are both required.");
      return;
    }
    setProjects((prev) =>
      prev.map((p) =>
        p.id === editProject.id ? { ...p, name: formName.trim(), path: formPath.trim() } : p
      )
    );
    setSelectedProject((prev) =>
      prev && prev.id === editProject.id ? { ...prev, name: formName.trim(), path: formPath.trim() } : prev
    );
    showMessage("success", "Project updated");
    closeForm();
  };

  const handleDelete = (id: string) => {
    const target = projects.find((p) => p.id === id);
    if (!target) return;
    if (!confirm(`Delete "${target.name}"? This won't remove files on disk, only devnull's reference to it.`)) return;
    setProjects((prev) => prev.filter((p) => p.id !== id));
    if (selectedProject?.id === id) setSelectedProject(null);
    showMessage("success", `Project "${target.name}" removed`);
  };

  const handleSelectActive = (id: string) => {
    setProjects((prev) => prev.map((p) => ({ ...p, active: p.id === id })));
    const proj = projects.find((p) => p.id === id) || null;
    setSelectedProject(proj ? { ...proj, active: true } : null);
  };

  const toggleIncludeInLlm = (id: string) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, includeInLlm: !p.includeInLlm } : p))
    );
  };

  const startEdit = (p: Project) => {
    setShowAddForm(false);
    setEditProject(p);
    setFormName(p.name);
    setFormPath(p.path);
    setFormError(null);
  };

  // ─── Styles (matches the rest of the app's theme system) ─────────────────

  const sectionStyle: React.CSSProperties = {
    background: "var(--color-card-bg)",
    border: "1px solid var(--color-border)",
    borderRadius: "10px",
    padding: "24px",
    marginBottom: "24px",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: "6px",
    border: "1px solid var(--color-border)",
    background: "var(--color-input-bg)",
    color: "var(--color-text)",
    fontSize: "14px",
    outline: "none",
    boxSizing: "border-box",
  };

  const btnStyle = (variant: "primary" | "danger" | "ghost" = "primary"): React.CSSProperties => ({
    padding: "8px 16px",
    borderRadius: "6px",
    border: variant === "ghost" ? "1px solid var(--color-border)" : "none",
    background:
      variant === "primary" ? "var(--color-primary)" : variant === "danger" ? "var(--color-error)" : "transparent",
    color: variant === "ghost" ? "var(--color-text-secondary)" : "#fff",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.15s ease",
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "4px" }}>Projects</h1>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "14px", margin: 0 }}>
            Manage projects and browse their workspace files
          </p>
        </div>
        <button
          onClick={() => {
            setEditProject(null);
            setFormName("");
            setFormPath("");
            setFormError(null);
            setShowAddForm(true);
          }}
          style={btnStyle("primary")}
        >
          + Add project
        </button>
      </div>

      {message && (
        <div
          style={{
            padding: "10px 16px",
            borderRadius: "6px",
            marginBottom: "16px",
            fontSize: "13px",
            fontWeight: 500,
            background:
              message.type === "success"
                ? "color-mix(in srgb, var(--color-success) 15%, transparent)"
                : "color-mix(in srgb, var(--color-error) 15%, transparent)",
            color: message.type === "success" ? "var(--color-success)" : "var(--color-error)",
          }}
          role="status"
        >
          {message.text}
        </div>
      )}

      {/* Add/Edit form */}
      {(showAddForm || editProject) && (
        <div style={{ ...sectionStyle, borderColor: "var(--color-primary)" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px" }}>
            {editProject ? "Edit project" : "New project"}
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxWidth: "480px" }}>
            <div>
              <label htmlFor="proj-name" style={{ display: "block", marginBottom: "6px", fontSize: "13px", color: "var(--color-text-secondary)" }}>
                Project name
              </label>
              <input
                id="proj-name"
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. devnull"
                style={inputStyle}
                autoFocus
              />
            </div>
            <div>
              <label htmlFor="proj-path" style={{ display: "block", marginBottom: "6px", fontSize: "13px", color: "var(--color-text-secondary)" }}>
                Workspace path
              </label>
              <input
                id="proj-path"
                type="text"
                value={formPath}
                onChange={(e) => setFormPath(e.target.value)}
                placeholder="C:\projects\my-app"
                style={{ ...inputStyle, fontFamily: "monospace" }}
              />
            </div>
            {formError && (
              <p style={{ color: "var(--color-error)", fontSize: "13px", margin: 0 }}>{formError}</p>
            )}
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={editProject ? handleUpdate : handleAdd} style={btnStyle("primary")}>
                {editProject ? "Save changes" : "Add project"}
              </button>
              <button onClick={closeForm} style={btnStyle("ghost")}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Project list */}
      {projects.length === 0 ? (
        <div style={{ ...sectionStyle, textAlign: "center", padding: "48px 24px" }}>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "14px", marginBottom: "16px" }}>
            No projects yet. Add one to give devnull a workspace to operate in.
          </p>
          <button onClick={() => setShowAddForm(true)} style={{ ...btnStyle("primary"), margin: "0 auto" }}>
            + Add project
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "24px" }}>
          {projects.map((p) => (
            <div
              key={p.id}
              style={{
                ...sectionStyle,
                marginBottom: 0,
                padding: "16px 20px",
                borderColor: p.active ? "var(--color-primary)" : "var(--color-border)",
                background: p.active
                  ? "color-mix(in srgb, var(--color-primary) 6%, var(--color-card-bg))"
                  : "var(--color-card-bg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
                <button
                  onClick={() => handleSelectActive(p.id)}
                  aria-label={p.active ? `${p.name} is the active project` : `Set ${p.name} as active project`}
                  aria-pressed={p.active}
                  style={{
                    flexShrink: 0,
                    width: "16px",
                    height: "16px",
                    borderRadius: "50%",
                    border: p.active ? "5px solid var(--color-primary)" : "2px solid var(--color-border)",
                    background: "transparent",
                    cursor: "pointer",
                    padding: 0,
                  }}
                  title={p.active ? "Active project" : "Set as active"}
                />
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: "14px", fontWeight: 600 }}>
                    {p.name}
                    {p.active && (
                      <span
                        style={{
                          marginLeft: "8px",
                          fontSize: "10px",
                          fontWeight: 700,
                          color: "var(--color-primary)",
                          background: "color-mix(in srgb, var(--color-primary) 15%, transparent)",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          textTransform: "uppercase",
                        }}
                      >
                        Active
                      </span>
                    )}
                  </p>
                  <p
                    style={{
                      margin: "2px 0 0",
                      fontSize: "12px",
                      color: "var(--color-text-secondary)",
                      fontFamily: "monospace",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={p.path}
                  >
                    {p.path}
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "16px", flexShrink: 0 }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "12px",
                    color: "var(--color-text-secondary)",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={p.includeInLlm}
                    onChange={() => toggleIncludeInLlm(p.id)}
                  />
                  Include in LLM context
                </label>
                <button onClick={() => startEdit(p)} style={btnStyle("ghost")}>
                  Edit
                </button>
                <button onClick={() => handleDelete(p.id)} style={btnStyle("danger")}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Workspace browser */}
      {selectedProject && (
        <div>
          <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "12px" }}>
            Workspace: {selectedProject.name}
          </h2>
          <div style={sectionStyle}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "12px",
                paddingBottom: "12px",
                borderBottom: "1px solid var(--color-border)",
              }}
            >
              <p style={{ margin: 0, fontSize: "12px", fontFamily: "monospace", color: "var(--color-text-secondary)" }}>
                {selectedProject.path}
              </p>
              <button style={btnStyle("ghost")}>⬇ Download ZIP</button>
            </div>
            {workspaceFiles.length === 0 ? (
              <p style={{ color: "var(--color-text-secondary)", fontSize: "13px", textAlign: "center", padding: "24px" }}>
                This workspace has no files yet.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {workspaceFiles.map((f) => (
                  <div
                    key={f.path}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 4px",
                      borderBottom: "1px solid var(--color-border)",
                      fontSize: "13px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span aria-hidden="true">{f.isDir ? "📁" : "📄"}</span>
                      <span>{f.name}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      {!f.isDir && (
                        <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
                          {f.size > 1024 ? `${(f.size / 1024).toFixed(1)} KB` : `${f.size} B`}
                        </span>
                      )}
                      <button
                        style={{ background: "none", border: "none", color: "var(--color-error)", fontSize: "12px", cursor: "pointer" }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

