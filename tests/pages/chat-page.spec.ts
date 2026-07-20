import { test, expect } from "@playwright/test";
import { UI_BASE, loginAsAdmin } from "./helpers";

test.describe("Chat Page (/chat)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${UI_BASE}/chat`);
    await page.waitForLoadState("networkidle");
  });

  test("renders the chat page with title", async ({ page }) => {
    await expect(page.locator("h1")).toHaveText("Chat");
  });

  test("shows empty state initially", async ({ page }) => {
    await expect(page.locator("text=Send a message to start chatting with devnull")).toBeVisible();
  });

  test("has a message input field", async ({ page }) => {
    const input = page.locator("textarea[aria-label='Message input']");
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute("placeholder", "Type your message here...");
  });

  test("has a send button", async ({ page }) => {
    const sendButton = page.locator("button:has-text('Send')");
    await expect(sendButton).toBeVisible();
    // Send button should be disabled when input is empty
    await expect(sendButton).toBeDisabled();
  });

  test("typing enables the send button", async ({ page }) => {
    const input = page.locator("textarea[aria-label='Message input']");
    const sendButton = page.locator("button:has-text('Send')");
    await expect(sendButton).toBeDisabled();
    await input.fill("Hello");
    await expect(sendButton).toBeEnabled();
  });

  test("has plan mode selector", async ({ page }) => {
    const planSelect = page.locator("select[aria-label='Plan mode']");
    await expect(planSelect).toBeVisible();
    // Default should be "Plan: Always"
    await expect(planSelect).toHaveValue("always");
  });

  test("plan mode selector has all three options", async ({ page }) => {
    const planSelect = page.locator("select[aria-label='Plan mode']");
    const options = await planSelect.locator("option").allTextContents();
    expect(options).toContain("Plan: Always");
    expect(options).toContain("Plan: Auto");
    expect(options).toContain("Plan: Never");
  });

  test("has voice button", async ({ page }) => {
    const voiceButton = page.locator("button:has-text('Voice')");
    await expect(voiceButton).toBeVisible();
  });

  test("has upload button", async ({ page }) => {
    const uploadButton = page.locator("button:has-text('Upload')");
    await expect(uploadButton).toBeVisible();
  });

  test("has options toggle button", async ({ page }) => {
    const optionsButton = page.locator("button:has-text('Options')");
    await expect(optionsButton).toBeVisible();
  });

  test("options toggle shows advanced settings", async ({ page }) => {
    const optionsButton = page.locator("button:has-text('Options')");
    await optionsButton.click();
    // Advanced options should now be visible
    await expect(page.locator("text=Full context mode")).toBeVisible();
    await expect(page.locator("text=Phase planning")).toBeVisible();
    await expect(page.locator("text=Isolated workspace")).toBeVisible();
    await expect(page.locator("text=Max iterations")).toBeVisible();
  });

  test("options toggle hides advanced settings on second click", async ({ page }) => {
    const optionsButton = page.locator("button:has-text('Options')");
    await optionsButton.click();
    await expect(page.locator("text=Full context mode")).toBeVisible();
    await optionsButton.click();
    await expect(page.locator("text=Full context mode")).not.toBeVisible();
  });

  test("new chat button appears after sending a message", async ({ page }) => {
    const input = page.locator("textarea[aria-label='Message input']");
    await input.fill("Test message");
    await page.locator("button:has-text('Send')").click();
    // New chat button should appear after sending
    await expect(page.locator("button:has-text('New chat')")).toBeVisible({ timeout: 10_000 });
  });

  test("chat messages area has role='log' for accessibility", async ({ page }) => {
    const logArea = page.locator("div[role='log']");
    await expect(logArea).toBeVisible();
    await expect(logArea).toHaveAttribute("aria-live", "polite");
  });

  test("sending a message shows user message in chat", async ({ page }) => {
    const input = page.locator("textarea[aria-label='Message input']");
    await input.fill("Hello, devnull!");
    await page.locator("button:has-text('Send')").click();
    // The user message should appear in the chat
    await expect(page.locator("text=Hello, devnull!").first()).toBeVisible({ timeout: 15_000 });
  });

  test("shows thinking indicator while waiting for response", async ({ page }) => {
    const input = page.locator("textarea[aria-label='Message input']");
    await input.fill("Test message");
    await page.locator("button:has-text('Send')").click();
    // Should show "Thinking..." with a cancel button
    await expect(page.locator("text=Thinking...")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("button:has-text('Cancel')")).toBeVisible();
  });

  test("cancel button aborts in-flight request", async ({ page }) => {
    const input = page.locator("textarea[aria-label='Message input']");
    await input.fill("Test message");
    await page.locator("button:has-text('Send')").click();
    await expect(page.locator("button:has-text('Cancel')")).toBeVisible({ timeout: 5_000 });
    await page.locator("button:has-text('Cancel')").click();
    // Should show cancellation message
    await expect(page.locator("text=Request cancelled")).toBeVisible({ timeout: 5_000 });
  });

  test("enter key sends message", async ({ page }) => {
    const input = page.locator("textarea[aria-label='Message input']");
    await input.fill("Enter test");
    await input.press("Enter");
    await expect(page.locator("text=Enter test").first()).toBeVisible({ timeout: 15_000 });
  });

  test("shift+enter inserts newline instead of sending", async ({ page }) => {
    const input = page.locator("textarea[aria-label='Message input']");
    await input.fill("Line 1");
    await input.press("Shift+Enter");
    await input.fill("Line 2");
    // The textarea should contain a newline
    const value = await input.inputValue();
    expect(value).toContain("Line 1");
    expect(value).toContain("Line 2");
  });
});
