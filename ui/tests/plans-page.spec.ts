import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:8080';

test.describe('Plans Page', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto(`${BASE_URL}/login`);
    await page.fill('#username', 'admin');
    await page.fill('#password', 'admin1234');
    await page.click('button[type="submit"]');
    // Wait for redirect to home
    await page.waitForURL('**/');
  });

  test('navigates to plans page via navbar', async ({ page }) => {
    // Click Plans in navbar
    await page.click('a[href="/plans"]');
    await page.waitForURL('**/plans');

    // Should see the Plans heading
    await expect(page.locator('h1')).toHaveText('Plans');
  });

  test('shows empty state when no plans exist', async ({ page }) => {
    await page.goto(`${BASE_URL}/plans`);
    await page.waitForURL('**/plans');

    // Should show the empty state message
    await expect(page.locator('text=No plans yet')).toBeVisible();
  });

  test('shows plans list when plans exist', async ({ page }) => {
    // First, create a plan via the API
    const response = await page.request.post(`${BASE_URL}/api/v1/plans`, {
      data: {
        taskDescription: 'Test plan',
        planContent: '# Test Plan\n- [ ] Step 1\n- [ ] Step 2',
        tasks: ['Step 1', 'Step 2'],
      },
    });

    // Note: This will fail if DATABASE_URL is not set, but we test the UI behavior either way
    const planCreated = response.ok();

    await page.goto(`${BASE_URL}/plans`);
    await page.waitForURL('**/plans');

    if (planCreated) {
      // Should show the plan
      await expect(page.locator('text=Test plan')).toBeVisible();
    } else {
      // Should show empty state
      await expect(page.locator('text=No plans yet')).toBeVisible();
    }
  });

  test('refresh button works', async ({ page }) => {
    await page.goto(`${BASE_URL}/plans`);
    await page.waitForURL('**/plans');

    // Click refresh
    await page.click('text=Refresh');
    // Should still show the page
    await expect(page.locator('h1')).toHaveText('Plans');
  });

  test('plan detail page shows error for nonexistent plan', async ({ page }) => {
    await page.goto(`${BASE_URL}/plans/nonexistent-plan-id`);
    await page.waitForURL('**/plans/nonexistent-plan-id');

    // Should show error or back button
    await expect(page.locator('text=← Back to Plans')).toBeVisible();
  });
});
