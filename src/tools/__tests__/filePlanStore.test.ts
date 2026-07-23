import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { FilePlanStore } from "../filePlanStore.js";

const TEST_PLANS_DIR = path.join(".agent", "plans");

describe("FilePlanStore", () => {
  let store: FilePlanStore;

  beforeEach(() => {
    // Clean up any leftover test data
    const dir = path.join(process.cwd(), TEST_PLANS_DIR);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    store = new FilePlanStore();
  });

  afterEach(() => {
    const dir = path.join(process.cwd(), TEST_PLANS_DIR);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  describe("updateTaskStatus", () => {
    it("returns false when taskId does not exist (no crash on null)", async () => {
      const result = await store.updateTaskStatus("nonexistent_task_id", "completed");
      expect(result).toBe(false);
    });

    it("updates status of an existing task", async () => {
      const plan = await store.savePlan("Test plan", "Plan content", ["Task 1", "Task 2"]);
      const { tasks } = await store.getPlan(plan.id);
      expect(tasks).toHaveLength(2);

      const result = await store.updateTaskStatus(tasks[0].id, "completed");
      expect(result).toBe(true);

      const updated = await store.getPlan(plan.id);
      expect(updated.tasks[0].status).toBe("completed");
      expect(updated.tasks[1].status).toBe("pending");
    });
  });

  describe("deleteTask", () => {
    it("returns false when taskId does not exist (no crash on null)", async () => {
      const result = await store.deleteTask("nonexistent_task_id");
      expect(result).toBe(false);
    });

    it("deletes an existing task", async () => {
      const plan = await store.savePlan("Test plan", "Plan content", ["Task A", "Task B", "Task C"]);
      const { tasks } = await store.getPlan(plan.id);
      expect(tasks).toHaveLength(3);

      const result = await store.deleteTask(tasks[1].id);
      expect(result).toBe(true);

      const updated = await store.getPlan(plan.id);
      expect(updated.tasks).toHaveLength(2);
      expect(updated.tasks[0].description).toBe("Task A");
      expect(updated.tasks[1].description).toBe("Task C");
    });
  });

  describe("savePlan / getPlan / listPlans", () => {
    it("saves and retrieves a plan", async () => {
      const plan = await store.savePlan("My task", "My plan content", ["Step 1", "Step 2"]);
      expect(plan.id).toBeDefined();
      expect(plan.taskDescription).toBe("My task");
      expect(plan.planContent).toBe("My plan content");
      expect(plan.status).toBe("active");

      const { plan: retrieved, tasks } = await store.getPlan(plan.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(plan.id);
      expect(tasks).toHaveLength(2);
    });

    it("returns null plan for unknown id", async () => {
      const { plan, tasks } = await store.getPlan("nonexistent");
      expect(plan).toBeNull();
      expect(tasks).toEqual([]);
    });

    it("lists plans", async () => {
      await store.savePlan("Plan 1", "Content 1", ["a"]);
      await store.savePlan("Plan 2", "Content 2", ["b"]);
      const plans = await store.listPlans(10);
      expect(plans.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("addTask", () => {
    it("adds a task to an existing plan", async () => {
      const plan = await store.savePlan("Test", "Content", ["Initial"]);
      const task = await store.addTask(plan.id, "Added task");
      expect(task).not.toBeNull();
      expect(task!.description).toBe("Added task");

      const { tasks } = await store.getPlan(plan.id);
      expect(tasks).toHaveLength(2);
      expect(tasks[1].description).toBe("Added task");
    });

    it("returns null for nonexistent plan", async () => {
      const task = await store.addTask("nonexistent_plan", "Task");
      expect(task).toBeNull();
    });
  });
});
