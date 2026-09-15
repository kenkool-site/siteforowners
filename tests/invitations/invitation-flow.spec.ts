import { expect, test, type APIRequestContext, type Page } from "playwright/test";

type FixtureManifest = {
  owners: {
    primary: { email: string; pin: string };
    secondary: { email: string; pin: string };
  };
  events: Record<
    "english" | "spanish" | "deadline" | "expired" | "offline" | "secondary" | "suppressed",
    { id: string; slug: string; title: string }
  >;
  retryableNotificationId: string;
};

type FixtureSnapshot = {
  rsvps: Array<{ eventId: string; primaryName: string; attending: boolean; partySize: number }>;
  notifications: Array<{ eventId: string; channel: "email" | "sms"; status: string }>;
  providerCalls: Array<{ channel: "email" | "sms"; eventId: string }>;
  fixtureSafety: { externalCredentialKeys: string[] };
};

let fixtures: FixtureManifest;

async function resetFixtures(request: APIRequestContext): Promise<FixtureManifest> {
  const response = await request.post("/api/invitations/e2e", { data: { action: "reset" } });
  expect(response.status()).toBe(200);
  return response.json() as Promise<FixtureManifest>;
}

async function snapshot(request: APIRequestContext): Promise<FixtureSnapshot> {
  const response = await request.get("/api/invitations/e2e");
  expect(response.status()).toBe(200);
  return response.json() as Promise<FixtureSnapshot>;
}

async function founderLogin(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByPlaceholder("Admin password").fill("invitation-e2e-founder");
  const authenticated = page.waitForResponse((response) => response.url().endsWith("/api/admin-auth"));
  await page.getByRole("button", { name: "Sign In" }).click();
  expect((await authenticated).status()).toBe(200);
}

async function ownerLogin(page: Page, email: string, pin: string): Promise<void> {
  await page.goto("/invitations/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("PIN").fill(pin);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/invitations(?:\/manage\/|$)/);
  if (page.url().includes("/invitations/manage/")) {
    await expect(page.getByText("No responses match these filters.")).toBeVisible();
  }
}

async function submitRsvp(
  page: Page,
  input: { name: string; email: string; partySize?: number; attending?: boolean },
): Promise<void> {
  await page.getByLabel("Your name").fill(input.name);
  await page.getByLabel(input.attending === false ? "No, I can’t attend" : "Yes, I’ll attend").check();
  if (input.attending !== false) {
    await page.getByRole("spinbutton", { name: "Total people" }).fill(String(input.partySize ?? 1));
  }
  await page.getByLabel("Email").fill(input.email);
  await page.getByRole("button", { name: /Send response|Update response/ }).click();
}

async function assertNoHorizontalScroll(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request }) => {
  fixtures = await resetFixtures(request);
  expect((await snapshot(request)).fixtureSafety.externalCredentialKeys).toEqual([]);
});

test("founder provisions, owner edits, and guest RSVPs without exceeding capacity", async ({ page, request }) => {
  await founderLogin(page);
  await page.goto("/admin/invitations/new");
  await page.getByLabel("Owner name").fill("Pilot Owner");
  await page.getByLabel("Owner email").fill("pilot@example.com");
  await page.getByLabel("Event title").fill("Pilot Celebration");
  await page.getByLabel("Start date and time").fill("2099-06-15T18:00");
  await page.getByRole("button", { name: "Create invitation" }).click();
  await expect(page.getByText("Invitation created")).toBeVisible();
  const ownerPin = (await page.locator("code").textContent())?.trim() ?? "";
  const editorHref = await page.getByRole("link", { name: "Open event editor" }).getAttribute("href");
  const eventId = editorHref?.split("/").pop() ?? "";
  const prepare = await request.post("/api/invitations/e2e", {
    data: { action: "attach-media", eventId },
  });
  expect(prepare.status()).toBe(200);

  await page.context().clearCookies();
  expect((await page.context().cookies()).some((cookie) => cookie.name === "admin_session")).toBe(false);
  await ownerLogin(page, "pilot@example.com", ownerPin);
  await page.getByLabel("Who are we celebrating?").fill("Ana and Luis");
  await page.getByLabel("Venue name").fill("Pilot Hall");
  await page.getByLabel("Address").fill("1 Test Plaza, Brooklyn, NY");
  await page.getByLabel("Map link").fill("https://maps.google.com/?q=Pilot+Hall");
  await page.getByLabel("Guest capacity").fill("2");
  const saved = page.waitForResponse((response) => response.url().includes(`/api/invitations/events/${eventId}`) && response.request().method() === "PATCH");
  await page.locator('[data-event-form="true"]').evaluate((form: HTMLFormElement) => form.requestSubmit());
  expect((await saved).status()).toBe(200);
  await expect(page.getByText("Changes saved")).toBeVisible();
  const previewLink = page.getByRole("link", { name: "Open guest preview" });
  await expect(previewLink).toHaveAttribute("href", `/invitations/preview/${eventId}`);
  const previewPage = await page.context().newPage();
  await previewPage.goto(`/invitations/preview/${eventId}`);
  await expect(previewPage.getByRole("heading", { name: "Pilot Celebration", level: 1 })).toBeVisible();
  await expect(previewPage.getByRole("img", { name: "Designed event invitation" })).toBeVisible();
  await expect(previewPage.getByRole("button", { name: "Send response" })).toBeDisabled();
  await expect(previewPage.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await previewPage.close();
  await page.getByRole("button", { name: "Publish invitation" }).click();
  await expect(page.getByText("Published", { exact: true }).first()).toBeVisible();

  const publicUrl = `/invite/${eventId ? `pilot-celebration-e2e-${eventId.slice(-4)}` : "missing"}`;
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(publicUrl);
  await expect(page.getByRole("img", { name: "Designed event invitation" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Guests celebrating" })).toBeVisible();
  await expect(page.getByLabel("Event video")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open map" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Add to Google Calendar" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Download calendar file" })).toBeVisible();
  await submitRsvp(page, { name: "Ana", email: "ana@example.com", partySize: 2 });
  await expect(page.getByText("Your response has been saved.")).toBeVisible();
  const firstResponseState = await snapshot(request);
  expect(firstResponseState.notifications).toContainEqual(expect.objectContaining({
    eventId,
    channel: "email",
    status: "sent",
  }));
  expect(firstResponseState.providerCalls).toContainEqual({ channel: "email", eventId });
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await submitRsvp(page, { name: "Luis", email: "luis@example.com", partySize: 1 });
  await expect(page.getByText("There is not enough remaining capacity for this party size.")).toBeVisible();
  await assertNoHorizontalScroll(page);
});

test("Spanish invitation copy stays localized behind the passcode gate", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/invite/${fixtures.events.spanish.slug}`);
  await expect(page.getByRole("heading", { name: "Le espera una invitación privada" })).toBeVisible();
  await page.getByLabel("Clave de la invitación").fill("wrong");
  await page.getByRole("button", { name: "Abrir invitación" }).click();
  await expect(page.getByText("La clave no coincide. Inténtelo de nuevo.")).toBeVisible();
  await page.getByLabel("Clave de la invitación").fill("2468");
  await page.getByRole("button", { name: "Abrir invitación" }).click();
  await expect(page.getByRole("heading", { name: fixtures.events.spanish.title })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Responder a esta invitación" })).toBeVisible();
  await assertNoHorizontalScroll(page);
});

test("a guest can decline by updating the saved private response", async ({ page, request }) => {
  await page.goto(`/invite/${fixtures.events.english.slug}`);
  await submitRsvp(page, { name: "Ana", email: "ana@example.com", partySize: 2 });
  await expect(page.getByText("Your response has been saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("You are securely updating an existing response.")).toBeVisible();
  await submitRsvp(page, { name: "Ana", email: "ana@example.com", attending: false });
  await expect(page.getByText("Your response has been saved.")).toBeVisible();
  const state = await snapshot(request);
  expect(state.rsvps).toContainEqual(expect.objectContaining({
    eventId: fixtures.events.english.id,
    primaryName: "Ana",
    attending: false,
    partySize: 0,
  }));
});

test("notification suppression never rolls back the saved RSVP or calls a provider", async ({ page, request }) => {
  await page.goto(`/invite/${fixtures.events.suppressed.slug}`);
  await submitRsvp(page, { name: "Nora", email: "nora@example.com" });
  await expect(page.getByText("Your response has been saved.")).toBeVisible();
  const state = await snapshot(request);
  expect(state.rsvps).toContainEqual(expect.objectContaining({
    eventId: fixtures.events.suppressed.id,
    primaryName: "Nora",
  }));
  expect(state.notifications).toContainEqual(expect.objectContaining({
    eventId: fixtures.events.suppressed.id,
    channel: "email",
    status: "suppressed",
  }));
  expect(state.providerCalls.filter((call) => call.eventId === fixtures.events.suppressed.id)).toEqual([]);
});

test("deadline, expiration, and offline lifecycle states reveal only the intended surface", async ({ page }) => {
  await page.goto(`/invite/${fixtures.events.deadline.slug}`);
  await expect(page.getByRole("heading", { name: "Responses are closed" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send response" })).toHaveCount(0);

  await page.goto(`/invite/${fixtures.events.expired.slug}`);
  await expect(page.getByRole("heading", { name: "This event has ended" })).toBeVisible();
  await expect(page.getByText(fixtures.events.expired.title)).toHaveCount(0);

  const response = await page.goto(`/invite/${fixtures.events.offline.slug}`);
  expect(response?.status()).toBe(404);
  await expect(page.getByText(fixtures.events.offline.title)).toHaveCount(0);
});

test("owners are denied cross-event access while the founder retains access", async ({ page }) => {
  expect((await page.goto(`/invitations/preview/${fixtures.events.english.id}`))?.status()).toBe(404);
  await ownerLogin(page, fixtures.owners.primary.email, fixtures.owners.primary.pin);
  const denied = await page.goto(`/invitations/manage/${fixtures.events.secondary.id}`);
  expect(denied?.status()).toBe(404);
  expect((await page.goto(`/invitations/preview/${fixtures.events.secondary.id}`))?.status()).toBe(404);
  await page.goto(`/invitations/preview/${fixtures.events.spanish.id}`);
  await expect(page.getByText("Vista previa — el envío de RSVP está desactivado.")).toBeVisible();

  await page.context().clearCookies();
  await founderLogin(page);
  await page.goto(`/admin/invitations/${fixtures.events.secondary.id}`);
  await expect(page.getByRole("heading", { name: fixtures.events.secondary.title, level: 1 })).toBeVisible();
  await expect(page.getByText("Founder controls").first()).toBeVisible();
  await page.goto(`/invitations/preview/${fixtures.events.secondary.id}`);
  await expect(page.getByRole("heading", { name: fixtures.events.secondary.title, level: 1 })).toBeVisible();
});

test("fixture-only media writes fail closed and founder retry uses the recording sender", async ({ page, request }) => {
  await ownerLogin(page, fixtures.owners.primary.email, fixtures.owners.primary.pin);
  const ownerRetry = await page.evaluate(async (notificationId) => (
    await fetch(`/api/invitations/admin/notifications/${notificationId}/retry`, { method: "POST" })
  ).status, fixtures.retryableNotificationId);
  expect(ownerRetry).toBe(401);
  await page.context().clearCookies();
  await founderLogin(page);
  const mediaStatus = await page.evaluate(async (eventId) => {
    const body = new FormData();
    body.set("kind", "cover");
    body.set("file", new File(["fixture"], "fixture.png", { type: "image/png" }));
    return (await fetch(`/api/invitations/events/${eventId}/media`, { method: "POST", body })).status;
  }, fixtures.events.english.id);
  expect(mediaStatus).toBe(503);

  const retry = await page.evaluate(async (notificationId) => (
    await fetch(`/api/invitations/admin/notifications/${notificationId}/retry`, { method: "POST" })
  ).status, fixtures.retryableNotificationId);
  expect(retry).toBe(200);
  const state = await snapshot(request);
  expect(state.notifications).toContainEqual(expect.objectContaining({ status: "sent" }));
  expect(state.providerCalls).toContainEqual({ channel: "email", eventId: fixtures.events.english.id });
});

test("desktop founder dashboard exposes filters, CSV, details, retry, and lifecycle controls", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await founderLogin(page);
  await page.goto(`/admin/invitations/${fixtures.events.english.id}`);
  await expect(page.getByLabel("Search responses")).toBeVisible();
  await expect(page.getByRole("link", { name: "Download CSV" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close RSVPs" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark expired" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Take offline" })).toBeVisible();
});
