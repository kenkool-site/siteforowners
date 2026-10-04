import { revalidatePath } from "next/cache";

/**
 * Both guest-facing invitation routes read from the same underlying event
 * record. Call this after any write that changes what either page renders
 * (RSVP, comments, event details, lifecycle status, media) — without it, a
 * change would not show up on the live page for up to an hour
 * (revalidate = 3600 on both pages).
 */
export function revalidateInvitationPage(slug: string): void {
  revalidatePath(`/invite/${slug}`);
  revalidatePath(`/invite/${slug}/memories`);
}
