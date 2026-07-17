import { useState } from 'react';

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

// Mock data — will be replaced with real API calls
const MOCK_PROJECTS: Project[] = [
  { id: '1', name: 'devnull', path: 'C:\\Users\\sjnue\\Downloads\\devnull', active: true, includeInLlm: true },
  { id: '2', name: 'test-project', path: 'C:\\Users\\sjnue\\Downloads\\test-project', active: false, includeInLlm: false },
];

const MOCK_FILES: WorkspaceFile[] = [
  { name: 'src', path: 'src', size: 0, isDir: true },
  { name: 'package.json', path: 'package.json', size: 1024, isDir: false },
  { name: 'tsconfig.json', path: 'tsconfig.json', size: 512, isDir: false },
  { name: 'README.md', path: 'README.md', size: 256, isDir: false },
];

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>(MOCK_PROJECTS);
  const [selectedProject, setSelectedProject] = useState<Project | null>(
    MOCK_PROJECTS.find((p) => p.active) || null
  );
  const [workspaceFiles] = useState<WorkspaceFile[]>(MOCK_FILES);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [formName, setFormName] = useState('');
  const [formPath, setFormPath] = useState('');

  const handleAdd = () => {
    if (!formName.trim() || !formPath.trim()) return;
    const newProject: Project = {
      id: String(Date.now()),
      name: formName.trim(),
      path: formPath.trim(),
      active: false,
      includeInLlm: false,
    };
    setProjects((prev) => [...prev, newProject]);
    setFormName('');
    setFormPath('');
    setShowAddForm(false);
  };

  const handleUpdate = () => {
    if (!editProject || !formName.trim() || !formPath.trim()) return;
    setProjects((prev) =>
      prev.map((p) =>
        p.id === editProject.id
          ? { ...p, name: formName.trim(), path: formPath.trim() }
          : p
      )
    );
    setEditProject(null);
    setFormName('');
    setFormPath('');
  };

  const handleDelete = (id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id));
    if (selectedProject?.id === id) setSelectedProject(null);
  };

  const handleSelectActive = (id: string) => {
    setProjects((prev) =>
      prev.map((p) => ({ ...p, active: p.id === id }))
    );
    const proj = projects.find((p) => p.id === id) || null;
    setSelectedProject(proj);
  };

  const toggleIncludeInLlm = (id: string) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, includeInLlm: !p.includeInLlm } : p
      )
    );
  };

  const startEdit = (p: Project) => {
    setEditProject(p);
    setFormName(p.name);
    setFormPath(p.path);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-gray-800 p-4">
        <h2 className="text-lg font-semibold">Projects</h2>
        <p className="text-sm text-gray-500">Manage projects and workspace files</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Project list */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
              Projects
            </h3>
            <button
              onClick={() => { setShowAddForm(true); setEditProject(null); setFormName(''); setFormPath(''); }}
              className="px-3 py-1.5 text-sm rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition-colors"
            >
              + Add Project
            </button>
          </div>

          {/* Add/Edit form */}
          {(showAddForm || editProject) && (
            <div className="mb-4 p-4 bg-gray-900 rounded-xl border border-gray-700 space-y-3">
              <h4 className="text-sm font-medium text-gray-300">
                {editProject ? 'Edit Project' : 'New Project'}
              </h4>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Project name"
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-purple-500 text-sm"
              />
              <input
                type="text"
                value={formPath}
                onChange={(e) => setFormPath(e.target.value)}
                placeholder="Project path (e.g. C:\\projects\\my-app)"
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-purple-500 text-sm"
              />
              <div className="flex gap-2">
                <button
                  onClick={editProject ? handleUpdate : handleAdd}
                  className="px-4 py-1.5 text-sm rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition-colors"
                >
                  {editProject ? 'Update' : 'Add'}
                </button>
                <button
                  onClick={() => { setShowAddForm(false); setEditProject(null); }}
                  className="px-4 py-1.5 text-sm rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Project cards */}
          <div className="space-y-2">
            {projects.map((p) => (
              <div
                key={p.id}
                className={`p-4 rounded-xl border transition-colors ${
                  p.active
                    ? 'bg-purple-600/10 border-purple-600/30'
                    : 'bg-gray-900 border-gray-800 hover:border-gray-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleSelectActive(p.id)}
                      className={`w-4 h-4 rounded-full border-2 transition-colors ${
                        p.active
                          ? 'border-purple-500 bg-purple-500'
                          : 'border-gray-600 hover:border-gray-500'
                      }`}
                      title={p.active ? 'Active project' : 'Set as active'}
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-200">{p.name}</p>
                      <p className="text-xs text-gray-500 font-mono">{p.path}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Include in LLM toggle */}
                    <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={p.includeInLlm}
                        onChange={() => toggleIncludeInLlm(p.id)}
                        className="rounded bg-gray-800 border-gray-600 text-purple-500 focus:ring-purple-500"
                      />
                      LLM context
                    </label>
                    <button
                      onClick={() => startEdit(p)}
                      className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700 text-gray-400 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="px-2 py-1 text-xs rounded bg-red-900/50 hover:bg-red-800 text-red-400 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Workspace browser */}
        {selectedProject && (
          <div>
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">
              Workspace: {selectedProject.name}
            </h3>
            <div className="bg-gray-900 rounded-xl border border-gray-800">
              <div className="p-3 border-b border-gray-800 flex items-center justify-between">
                <p className="text-xs text-gray-500 font-mono">{selectedProject.path}</p>
                <button className="px-3 py-1 text-xs rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 transition-colors">
                  ⬇ Download ZIP
                </button>
              </div>
              <div className="divide-y divide-gray-800">
                {workspaceFiles.map((f) => (
                  <div
                    key={f.path}
                    className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span>{f.isDir ? '📁' : '📄'}</span>
                      <span className="text-sm text-gray-300">{f.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {!f.isDir && (
                        <span className="text-xs text-gray-600">
                          {f.size > 1024 ? `${(f.size / 1024).toFixed(1)} KB` : `${f.size} B`}
                        </span>
                      )}
                      <button className="text-xs text-red-400 hover:text-red-300 transition-colors">
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
