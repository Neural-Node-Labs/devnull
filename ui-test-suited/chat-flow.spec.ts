import { test, expect } from "@playwright/test";

test.describe("Chat Flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Navigate to chat page — adjust selector to match actual nav structure
    const chatLink = page.getByRole("link", { name: /chat|Chat/i });
    if (await chatLink.isVisible()) {
      await chatLink.click();
    }
  });

  test("chat page has a message input field", async ({ page }) => {
    const input = page.getByRole("textbox", { name: /message|input|chat|task/i });
    await expect(input).toBeVisible();
  });

  test("chat page has a send/submit button", async ({ page }) => {
    const sendButton = page.getByRole("button", { name: /send|submit|go|ask/i });
    await expect(sendButton).toBeVisible();
  });

  test("typing in the input and submitting sends a message", async ({ page }) => {
    const input = page.getByRole("textbox", { name: /message|input|chat|task/i });
    await expect(input).toBeVisible();

    await input.fill("Hello, devnull!");
    const sendButton = page.getByRole("button", { name: /send|submit|go|ask/i });
    await sendButton.click();

    // Expect the message to appear in the chat history
    const messageBubble = page.locator("text=Hello, devnull!").first();
    await expect(messageBubble).toBeVisible({ timeout: 10_000 });
  });

  test("voice/listen button is present", async ({ page }) => {
    const voiceButton = page.getByRole("button", { name: /voice|listen|mic|microphone/i });
    await expect(voiceButton).toBeVisible();
  });

  test("file upload button is present for workspace upload", async ({ page }) => {
    const fileUpload = page.locator("input[type='file'], button:has-text('Upload'), button:has-text('upload')").first();
    await expect(fileUpload).toBeVisible();
  });

  test("chat history displays previous messages", async ({ page }) => {
    const input = page.getByRole("textbox", { name: /message|input|chat|task/i });
    await expect(input).toBeVisible();

    // Send a couple of messages
    await input.fill("First message");
    await page.getByRole("button", { name: /send|submit|go|ask/i }).click();

    await input.fill("Second message");
    await page.getByRole("button", { name: /send|submit|go|ask/i }).click();

    // Both messages should be visible in the chat history
    await expect(page.locator("text=First message").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=Second message").first()).toBeVisible({ timeout: 10_000 });
  });

  test("plan mode selector is present", async ({ page }) => {
    const planSelect = page.locator("select");
    await expect(planSelect).toBeVisible();
    // Default should be "Plan: Always" since we changed the default
    await expect(planSelect).toHaveValue("always");
  });

  test("plan is displayed after submitting a task with plan mode", async ({ page }) => {
    const input = page.getByRole("textbox", { name: /message|input|chat|task/i });
    await expect(input).toBeVisible();

    // Ensure plan mode is set to "always"
    const planSelect = page.locator("select");
    await planSelect.selectOption("always");

    await input.fill("List files in the current directory");
    const sendButton = page.getByRole("button", { name: /send|submit|go|ask/i });
    await sendButton.click();

    // Wait for the plan to be generated and displayed
    // The plan display has a purple border and shows "Plan for:" header
    const planHeader = page.locator("text=Plan for:").first();
    await expect(planHeader).toBeVisible({ timeout: 30_000 });

    // Approve and Reject buttons should be visible
    const approveButton = page.getByRole("button", { name: /approve/i });
    await expect(approveButton).toBeVisible();

    const rejectButton = page.getByRole("button", { name: /reject/i });
    await expect(rejectButton).toBeVisible();
  });

  test("rejecting a plan shows cancellation message", async ({ page }) => {
    const input = page.getByRole("textbox", { name: /message|input|chat|task/i });
    await expect(input).toBeVisible();

    // Ensure plan mode is set to "always"
    const planSelect = page.locator("select");
    await planSelect.selectOption("always");

    await input.fill("List files in the current directory");
    const sendButton = page.getByRole("button", { name: /send|submit|go|ask/i });
    await sendButton.click();

    // Wait for plan to appear
    const rejectButton = page.getByRole("button", { name: /reject/i });
    await expect(rejectButton).toBeVisible({ timeout: 30_000 });

    // Click reject
    await rejectButton.click();

    // Should see rejection message
    const rejectMessage = page.locator("text=Plan rejected").first();
    await expect(rejectMessage).toBeVisible({ timeout: 10_000 });
  });
});

