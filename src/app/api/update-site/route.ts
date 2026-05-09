import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  validateDepositSettings,
  type DepositSettingsInput,
  type DepositSettingsValue,
} from "@/lib/validation/deposit-settings";
import { collectInvalidServiceImageErrors } from "@/lib/validation/service-image-url";
import {
  isGalleryVideoUrl,
  normalizeGalleryVideoTitle as normalizeGalleryVideoTitleValue,
} from "@/lib/video/gallery-video";

function normalizeGalleryVideoTitle(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  const normalized = normalizeGalleryVideoTitleValue(value);
  return normalized || null;
}

export async function POST(request: NextRequest) {
  try {
    const adminPassword = process.env.ADMIN_PASSWORD;
    const sessionCookie = request.cookies.get("admin_session")?.value;
    if (!adminPassword || sessionCookie !== adminPassword) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: unknown = await request.json();
    if (!(body !== null && typeof body === "object" && !Array.isArray(body))) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { slug, updates } = body as Record<string, unknown>;

    if (typeof slug !== "string" || !(updates !== null && typeof updates === "object" && !Array.isArray(updates))) {
      return NextResponse.json({ error: "slug and updates required" }, { status: 400 });
    }

    const updateFields = updates as Record<string, unknown>;

    if (updateFields.services !== undefined) {
      const imageErrors = collectInvalidServiceImageErrors(updateFields.services);
      if (imageErrors.length > 0) {
        return NextResponse.json(
          { error: "Validation failed", errors: imageErrors },
          { status: 400 },
        );
      }
    }

    const supabase = createAdminClient();

    // Get current preview
    const { data: current, error: fetchError } = await supabase
      .from("previews")
      .select("*")
      .eq("slug", slug)
      .single();

    if (fetchError || !current) {
      return NextResponse.json({ error: "Preview not found" }, { status: 404 });
    }

    // Build the update object — only allow specific fields
    const allowed: Record<string, unknown> = {};

    if (updateFields.business_name !== undefined) allowed.business_name = updateFields.business_name;
    if (updateFields.phone !== undefined) allowed.phone = updateFields.phone;
    if (updateFields.address !== undefined) allowed.address = updateFields.address;
    if (updateFields.booking_url !== undefined) allowed.booking_url = updateFields.booking_url;
    if (updateFields.services !== undefined) allowed.services = updateFields.services;
    if (updateFields.categories !== undefined) allowed.categories = updateFields.categories;
    if (updateFields.booking_policies !== undefined) allowed.booking_policies = updateFields.booking_policies;
    if (updateFields.products !== undefined) allowed.products = updateFields.products;
    if (updateFields.images !== undefined) allowed.images = updateFields.images;
    if (updateFields.hero_video_url !== undefined) allowed.hero_video_url = updateFields.hero_video_url;
    if (updateFields.gallery_video_url !== undefined) {
      if (updateFields.gallery_video_url === null || updateFields.gallery_video_url === "") {
        allowed.gallery_video_url = null;
      } else if (isGalleryVideoUrl(updateFields.gallery_video_url)) {
        allowed.gallery_video_url = updateFields.gallery_video_url.trim();
      } else {
        return NextResponse.json(
          { error: "Validation failed", errors: [{ field: "gallery_video_url", reason: "must be an uploaded gallery MP4 URL or null" }] },
          { status: 400 },
        );
      }
    }
    if (updateFields.gallery_video_title !== undefined) {
      allowed.gallery_video_title = normalizeGalleryVideoTitle(updateFields.gallery_video_title);
    }
    if (updateFields.hours !== undefined) allowed.hours = updateFields.hours;
    if (updateFields.imported_hours !== undefined) allowed.imported_hours = updateFields.imported_hours;

    // Look up tenant once — used to route deposit + tenant-scoped fields
    // to their canonical homes (booking_settings, tenants) when a tenant
    // exists, or to the previews row (pending state) when it doesn't.
    const tenantRow = await supabase
      .from("tenants")
      .select("id")
      .eq("preview_slug", slug)
      .maybeSingle();
    const tenantId = tenantRow.data?.id as string | undefined;

    // Tenant-scoped pending fields: only persist on the previews row when
    // there is no tenant yet. Once a tenant exists, /api/update-tenant
    // owns these (canonical home: tenants table).
    if (!tenantId) {
      if (updateFields.booking_mode !== undefined) allowed.booking_mode = updateFields.booking_mode;
      if (updateFields.notification_email !== undefined) allowed.notification_email = updateFields.notification_email;
    }

    // Handle generated_copy updates (merge, don't replace)
    if (updateFields.generated_copy && typeof updateFields.generated_copy === "object" && !Array.isArray(updateFields.generated_copy)) {
      const generatedCopyUpdates = updateFields.generated_copy as Record<string, unknown>;
      const currentCopy = (current.generated_copy || {}) as Record<string, unknown>;
      const mergedCopy = { ...currentCopy };

      // Merge EN copy
      if (generatedCopyUpdates.en && typeof generatedCopyUpdates.en === "object" && !Array.isArray(generatedCopyUpdates.en)) {
        const currentEn = (currentCopy.en || {}) as Record<string, unknown>;
        mergedCopy.en = { ...currentEn, ...(generatedCopyUpdates.en as Record<string, unknown>) };
      }

      // Merge ES copy
      if (generatedCopyUpdates.es && typeof generatedCopyUpdates.es === "object" && !Array.isArray(generatedCopyUpdates.es)) {
        const currentEs = (currentCopy.es || {}) as Record<string, unknown>;
        mergedCopy.es = { ...currentEs, ...(generatedCopyUpdates.es as Record<string, unknown>) };
      }

      // Merge top-level copy fields (logo, custom_colors, section_settings, etc)
      if (generatedCopyUpdates.logo !== undefined) mergedCopy.logo = generatedCopyUpdates.logo;
      if (generatedCopyUpdates.section_settings !== undefined) mergedCopy.section_settings = generatedCopyUpdates.section_settings;
      if (generatedCopyUpdates.custom_colors !== undefined) mergedCopy.custom_colors = generatedCopyUpdates.custom_colors;
      if (generatedCopyUpdates.booking_categories !== undefined) mergedCopy.booking_categories = generatedCopyUpdates.booking_categories;

      allowed.generated_copy = mergedCopy;
    }

    // Deposit settings: canonical home is booking_settings (per-tenant). For
    // preview-only sites with no tenant yet, the values land on the previews
    // row as pending state and migrate on activation. The validator runs in
    // both cases so the founder can't bypass field-level rules.
    const depositTouched =
      updateFields.deposit_required !== undefined ||
      updateFields.deposit_mode !== undefined ||
      updateFields.deposit_value !== undefined ||
      updateFields.deposit_cashapp !== undefined ||
      updateFields.deposit_zelle !== undefined ||
      updateFields.deposit_other_label !== undefined ||
      updateFields.deposit_other_value !== undefined;

    let depositValue: DepositSettingsValue | undefined;
    if (depositTouched) {
      const depositInput = {
        deposit_required: updateFields.deposit_required,
        deposit_mode: updateFields.deposit_mode,
        deposit_value: updateFields.deposit_value,
        deposit_cashapp: updateFields.deposit_cashapp,
        deposit_zelle: updateFields.deposit_zelle,
        deposit_other_label: updateFields.deposit_other_label,
        deposit_other_value: updateFields.deposit_other_value,
      } as DepositSettingsInput;
      const depositResult = validateDepositSettings(depositInput);
      if (!depositResult.ok) {
        return NextResponse.json(
          { error: "Deposit validation failed", errors: depositResult.errors },
          { status: 400 },
        );
      }
      depositValue = depositResult.value;

      // For preview-only sites: fold deposit fields into the same previews
      // UPDATE below. For real tenants: a separate booking_settings UPDATE
      // runs after.
      if (!tenantId) {
        allowed.deposit_required = depositValue.deposit_required;
        allowed.deposit_mode = depositValue.deposit_mode;
        allowed.deposit_value = depositValue.deposit_value;
        allowed.deposit_cashapp = depositValue.deposit_cashapp;
        allowed.deposit_zelle = depositValue.deposit_zelle;
        allowed.deposit_other_label = depositValue.deposit_other_label;
        allowed.deposit_other_value = depositValue.deposit_other_value;
      }
    }

    if (Object.keys(allowed).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from("previews")
      .update(allowed)
      .eq("slug", slug);

    if (updateError) {
      console.error("Update error:", updateError);
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }

    if (depositTouched && tenantId) {
      await supabase
        .from("booking_settings")
        .update({
          deposit_required: depositValue!.deposit_required,
          deposit_mode: depositValue!.deposit_mode,
          deposit_value: depositValue!.deposit_value,
          deposit_cashapp: depositValue!.deposit_cashapp,
          deposit_zelle: depositValue!.deposit_zelle,
          deposit_other_label: depositValue!.deposit_other_label,
          deposit_other_value: depositValue!.deposit_other_value,
          updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", tenantId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update site error:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
