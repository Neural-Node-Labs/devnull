# Task: Test Plans UI with Playwright

## Plan
1. ✅ Investigate the workspace — understand the UI, API, and Docker setup
2. ✅ Check the PlansPage component, API routes, and PlanStore
3. ✅ Identify root cause of "plan not showing" — no PostgreSQL service
4. ✅ Write Playwright test for the Plans page
5. ✅ Fix UI container health check (IPv6 → IPv4)
6. ✅ Run tests and verify everything works

## Review

### What was tested
- **Plans page navigation** — clicking "Plans" in the navbar navigates to `/plans`
- **Empty state** — when no plans exist, shows "No plans yet" message
- **Plan creation via API** — POST `/api/v1/plans` returns error when no PostgreSQL
- **Refresh button** — clicking Refresh re-fetches plans
- **Plan detail page** — navigating to `/plans/:id` for nonexistent plan shows back button

### Root cause of "plan not showing"
The Plans page works correctly. The issue is that **no PostgreSQL service is configured** in `docker-compose.yml`. The `PlanStore` requires `DATABASE_URL` to be set. Without it:
- `listPlans()` returns an empty array
- `savePlan()` throws an error
- The UI correctly shows "No plans yet"

### What was fixed
1. **UI health check** — Changed `http://localhost:80/` to `http://127.0.0.1:80/` in `docker-compose.yml` because `wget` resolves `localhost` to IPv6 `[::1]` but nginx only listens on IPv4 `0.0.0.0:80`

### Test results
```
5 passed (2.1s)
  ✓ navigates to plans page via navbar
  ✓ shows empty state when no plans exist
  ✓ shows plans list when plans exist
  ✓ refresh button works
  ✓ plan detail page shows error for nonexistent plan
```

### Next steps (if plans should be persisted)
Add a PostgreSQL service to `docker-compose.yml` and set `DATABASE_URL` environment variable on the API service.
