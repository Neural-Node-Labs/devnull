$content = @'

---

## 11. Project Store Name Deduplication

**File:** `src/api/projectStore.ts`

The project store checks for duplicate project names before adding or updating projects, and also deduplicates filesystem slugs to avoid folder collisions.

### Logic (addProject — name dedup)

```typescript
export function addProject(name: string): AddProjectResult {
  const trimmedName = name.trim();
  if (!trimmedName) return { error: "Project name is required" };

  const projects = load();
  if (projects.some((p) => p.name.toLowerCase() === trimmedName.toLowerCase())) {
    return { error: `A project named "${trimmedName}" already exists` };
  }

  // ... create project ...
}
```

### Logic (uniqueSlug — filesystem dedup)

```typescript
function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "project";
}

function uniqueSlug(base: string, taken: Set<string>): string {
  const isFree = (candidate: string) =>
    !taken.has(candidate) && !fs.existsSync(path.join(PROJECTS_ROOT, candidate));
  if (isFree(base)) return base;
  let n = 2;
  while (!isFree(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
```

### Logic (updateProject — name dedup)

```typescript
export function updateProject(id: string, updates: UpdateProjectInput): AddProjectResult {
  const projects = load();
  const project = projects.find((p) => p.id === id);
  if (!project) return { error: "Project not found" };

  if (updates.name !== undefined) {
    const trimmedName = updates.name.trim();
    if (!trimmedName) return { error: "Project name is required" };
    if (projects.some((p) => p.id !== id && p.name.toLowerCase() === trimmedName.toLowerCase())) {
      return { error: `A project named "${trimmedName}" already exists` };
    }
    project.name = trimmedName;
  }
  // ...
}
```

### Key Details

- **Two-layer dedup:** Project names are checked for uniqueness in the metadata store (case-insensitive). Filesystem slugs are checked for uniqueness on disk (since slugify can produce collisions from different names).
- **Case-insensitive name comparison:** Uses `.toLowerCase()` for both add and update checks.
- **Self-exclusion in update:** The `updateProject` check excludes the current project (`p.id !== id`) so renaming to the same name is allowed.
- **Slug collision resolution:** `uniqueSlug` appends `-2`, `-3`, etc. until the folder name doesn't collide with any existing project's folder or an orphaned directory on disk.
- **Edge case — empty slug:** If the name is all non-alphanumeric characters (emoji, punctuation), `slugify` returns `"project"` as fallback.

### Flow

```
addProject("My Project")
        |
        v
  Check projects.some(p => p.name.toLowerCase() === "my project")
        |
        v
  If duplicate -> error "already exists"
  If unique:
        |
        v
  slugify("My Project") -> "my-project"
  uniqueSlug("my-project", takenSlugs) -> "my-project" or "my-project-2"
        |
        v
  Create folder at PROJECTS_ROOT/<slug>
  Save to projects.json
```

'@

Add-Content -Path 'dup.md' -Value $content
Write-Host "Step 4 done. Size: $((Get-Item dup.md).Length)"
