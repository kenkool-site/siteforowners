-- Adds per-tenant checkout mode and orders table.
-- v1 supports 'mockup' (default, unchanged behavior) and 'pickup'.
-- 'online' will be added later as a CHECK constraint alteration.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS checkout_mode text NOT NULL DEFAULT 'mockup'
  CHECK (checkout_mode IN ('mockup', 'pickup'));

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  items jsonb NOT NULL,
  subtotal_cents integer NOT NULL,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  customer_email text,
  customer_notes text,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'ready', 'picked_up', 'canceled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_tenant_id_created_at
  ON orders (tenant_id, created_at DESC);

-- Rate-limit support: look up orders by phone in the last N minutes.
CREATE INDEX IF NOT EXISTS idx_orders_tenant_phone_created_at
  ON orders (tenant_id, customer_phone, created_at DESC);

-- Service-role-only. The public /api/place-order uses the service role
-- via createAdminClient; there are no client-facing queries to this table.
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
-- No policies = deny-all for anon/authenticated; service role bypasses RLS.
