import test from "node:test";
import assert from "node:assert/strict";
import { partitionTenants, clientStats, type Tenant } from "./tenants";

function tenant(overrides: Partial<Tenant>): Tenant {
  return {
    id: "t",
    business_name: "Biz",
    owner_name: "Owner",
    phone: null,
    email: null,
    preview_slug: "slug",
    subdomain: "sub",
    custom_domain: null,
    site_published: true,
    subscription_status: "trialing",
    is_demo: true,
    created_at: "2026-06-01T00:00:00Z",
    ...overrides,
  };
}

test("partitionTenants splits real clients (is_demo false) from live demos", () => {
  const real = tenant({ id: "r", is_demo: false, subscription_status: "active" });
  const demo = tenant({ id: "d", is_demo: true });
  const { clients, demos } = partitionTenants([real, demo]);
  assert.deepEqual(clients.map((t) => t.id), ["r"]);
  assert.deepEqual(demos.map((t) => t.id), ["d"]);
});

test("clientStats counts active clients, live sites, and MRR over clients only", () => {
  const clients: Tenant[] = [
    tenant({ id: "a", is_demo: false, subscription_status: "active", site_published: true }),
    tenant({ id: "b", is_demo: false, subscription_status: "past_due", site_published: true }),
    tenant({ id: "c", is_demo: false, subscription_status: "canceled", site_published: false }),
  ];
  const stats = clientStats(clients);
  assert.equal(stats.activeClients, 1);
  assert.equal(stats.sitesLive, 2);
  assert.equal(stats.mrr, 50);
});
