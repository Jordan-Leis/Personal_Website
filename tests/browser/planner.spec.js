import { test, expect } from "@playwright/test";

// Signed out, the planner pages must show only the sign-in gate. The Supabase client
// is stubbed so this never touches the real project.
const stub = `export function createClient() {
  return {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithOAuth: async () => { window.__signin = true; return {}; },
      signOut: async () => ({}),
    },
    rpc: async () => ({ data: false, error: null }),
    from: () => { throw new Error("data must not load while signed out"); },
  };
}`;

test.beforeEach(async ({ page }) => {
  await page.route("**/@supabase/supabase-js@*/**", (r) => r.fulfill({ contentType: "application/javascript", body: stub }));
});

for (const path of ["/to-do/", "/schedule/"]) {
  test(`${path} shows only the sign-in gate when signed out`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(path);
    await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
    await expect(page.locator("#board, #week")).toHaveCount(0);
    await page.getByRole("button", { name: "Sign in with Google" }).click();
    expect(await page.evaluate(() => window.__signin)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test("privacy policy and terms pages exist", async ({ page }) => {
  await page.goto("/privacy-policy/");
  await expect(page.getByRole("heading", { name: "Jordan Planner Privacy Policy" })).toBeVisible();
  await page.goto("/tos/");
  await expect(page.getByRole("heading", { name: "Jordan Planner Terms of Service" })).toBeVisible();
});
