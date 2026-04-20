-- Booking settings per tenant
CREATE TABLE IF NOT EXISTS booking_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  preview_slug text NOT NULL,
  slot_duration integer DEFAULT 60, -- minutes: 30, 45, 60
  buffer_minutes integer DEFAULT 0, -- 0, 15, 30
  max_per_slot integer DEFAULT 1, -- concurrent bookings per slot
  advance_days integer DEFAULT 14, -- how far ahead customers can book
  -- Working hours: JSON object { "Monday": { "open": "10:00", "close": "19:00" }, "Sunday": null }
  working_hours jsonb,
  -- Blocked dates: array of ISO date strings ["2026-04-25", "2026-05-01"]
  blocked_dates text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id)
);

CREATE INDEX idx_booking_settings_tenant ON booking_settings (tenant_id);
CREATE INDEX idx_booking_settings_slug ON booking_settings (preview_slug);

-- Individual bookings
CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  preview_slug text NOT NULL,
  -- Booking details
  service_name text NOT NULL,
  service_price text,
  booking_date date NOT NULL,
  booking_time text NOT NULL, -- "10:00 AM"
  -- Customer info
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  customer_email text,
  customer_notes text,
  -- Status
  status text DEFAULT 'confirmed', -- confirmed, canceled, completed, no_show
  -- Metadata
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_bookings_tenant ON bookings (tenant_id);
CREATE INDEX idx_bookings_date ON bookings (booking_date);
CREATE INDEX idx_bookings_slug ON bookings (preview_slug);
CREATE INDEX idx_bookings_status ON bookings (status);
