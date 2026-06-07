-- Split the single link into a dedicated booking URL + an Instagram handle/URL.
ALTER TABLE marketing_leads RENAME COLUMN business_link TO booking_url;
ALTER TABLE marketing_leads ADD COLUMN IF NOT EXISTS instagram_url text;
