import { test, expect } from "@playwright/test";

const UI_BASE = "http://localhost:8080";

async function login(page: any) {
  await page.goto(`${UI_BASE}/login`);
  await page.fill("#username", "admin");
  await page.fill("#password", "admin1234");
  await page.click("button[type='submit']");
  await page.waitForURL("**/");
}

test.describe("Chat Flow", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto(`${UI_BASE}/chat`);
    await page.waitForSelector("h1");
  });

  test("chat page has a message input field", async ({ page }) => {
    const input = page.locator("textarea[aria-label='Message input']");
    await expect(input).toBeVisible();
  });

  test("chat page has a send/submit button", async ({ page }) => {
    const sendButton = page.locator("button:has-text('Send')");
    await expect(sendButton).toBeVisible();
  });

  test("typing in the input and submitting sends a message", async ({ page }) => {
    const input = page.locator("textarea[aria-label='Message input']");
    await expect(input).toBeVisible();

    await input.fill("Hello, devnull!");
    const sendButton = page.locator("button:has-text('Send')");
    await sendButton.click();

    // Expect the message to appear in the chat history
    const messageBubble = page.locator("text=Hello, devnull!").first();
    await expect(messageBubble).toBeVisible({ timeout: 10_000 });
  });

  test("voice/listen button is present", async ({ page }) => {
    const voiceButton = page.locator("button:has-text('Voice')");
    await expect(voiceButton).toBeVisible();
  });

  test("upload button is present", async ({ page }) => {
    const uploadButton = page.locator("button:has-text('Upload')");
    await expect(uploadButton).toBeVisible();
  });

  test("chat history displays previous messages", async ({ page }) => {
    const input = page.locator("textarea[aria-label='Message input']");
    await expect(input).toBeVisible();

    // Send a couple of messages
    await input.fill("First message");
    await page.locator("button:has-text('Send')").click();

    await input.fill("Second message");
    await page.locator("button:has-text('Send')").click();

    // Both messages should be visible in the chat history
    await expect(page.locator("text=First message").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=Second message").first()).toBeVisible({ timeout: 10_000 });
  });

  test("plan mode selector is present", async ({ page }) => {
    const planSelect = page.locator("select[aria-label='Plan mode']");
    await expect(planSelect).toBeVisible();
    // Default should be "Plan: Always"
    await expect(planSelect).toHaveValue("always");
  });

  test("options toggle shows advanced settings", async ({ page }) => {
    const optionsButton = page.locator("button:has-text('Options')");
    await expect(optionsButton).toBeVisible();
    await optionsButton.click();

    // Advanced options should now be visible
    await expect(page.locator("text=Lean token mode")).toBeVisible();
    await expect(page.locator("text=Isolated workspace")).toBeVisible();
    await expect(page.locator("text=Max iterations")).toBeVisible();
  });

  test("new chat button appears after sending a message", async ({ page }) => {
    const input = page.locator("textarea[aria-label='Message input']");
    await input.fill("Test message");
    await page.locator("button:has-text('Send')").click();

    // New chat button should appear
    await expect(page.locator("button:has-text('New chat')")).toBeVisible({ timeout: 10_000 });
  });

  test("chat page shows empty state initially", async ({ page }) => {
    await expect(page.locator("text=Send a message to start chatting with devnull")).toBeVisible();
  });
});
