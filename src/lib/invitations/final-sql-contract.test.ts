import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = (name: string) => readFileSync(new URL(`../../../supabase/migrations/${name}.sql`, import.meta.url), "utf8").replace(/--[^\n]*/g, "").replace(/\s+/g, " ");

test("capacity updates enforce attendance inside the event UPDATE row lock", () => {
  const source = sql("044_invitation_final_safety");
  assert.match(source, /BEFORE UPDATE OF capacity ON public.invitation_events FOR EACH ROW/);
  assert.match(source, /NEW.capacity IS NOT NULL AND NEW.capacity IS DISTINCT FROM OLD.capacity/);
  assert.match(source, /FROM public.invitation_rsvps AS rsvp WHERE rsvp.event_id = NEW.id AND rsvp.attending/);
  assert.match(source, /NEW.capacity < v_attending.*INVITE_CAPACITY_BELOW_ATTENDANCE/);
});

for (const name of ["040_submit_invitation_rsvp", "043_administrative_invitation_rsvp"]) {
  test(`${name} uses valid SQL expressions and permits restorative edits above a legacy cap`, () => {
    const source = sql(name);
    assert.doesNotMatch(source, /pg_catalog\.(?:coalesce|greatest|least|nullif)\s*\(/i);
    const guard = source.slice(source.lastIndexOf("IF ", source.indexOf("INVITE_CAPACITY_REACHED")), source.indexOf("INVITE_CAPACITY_REACHED"));
    assert.match(guard, /NOT v_is_update OR p_party_size > CASE WHEN v_existing.attending THEN v_existing.party_size ELSE 0 END/);
    assert.match(guard, /p_attending.*v_attending_total \+ p_party_size > v_event.capacity/);
  });
}

test("notification counts qualify every column against RETURNS TABLE variable collisions", () => {
  const source = sql("042_invitation_notification_reservation");
  for (const count of Array.from(source.matchAll(/SELECT pg_catalog.count\(\*\).*?;/g))) {
    assert.match(count[0], /FROM public.invitation_notifications AS notification/);
    assert.match(count[0], /notification.event_id = /);
    assert.match(count[0], /notification.channel = /);
    assert.match(count[0], /notification.status IN /);
  }
});

test("direct media attachment locks the event, verifies scopes and returns the replaced path from that lock", () => {
  const source = sql("045_invitation_direct_media");
  assert.ok(source.indexOf("FOR UPDATE") < source.indexOf("IF p_kind = 'gallery'"));
  assert.match(source, /p_storage_path !~.*p_event_id::text/);
  assert.match(source, /media.id = p_media_id AND media.event_id = p_event_id/);
  assert.match(source, /insert_invitation_gallery_media/);
  assert.match(source, /RETURN v_old_path/);
  assert.match(source, /REVOKE ALL ON FUNCTION public.attach_invitation_media.*FROM PUBLIC, anon, authenticated/);
});
