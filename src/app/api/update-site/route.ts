import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateDepositSettings, type DepositSettingsValue } from "@/lib/validation/deposit-settings";

export async function POST(request: Request) {
  try {
    const { slug, updates } = await request.json();

    if (!slug || !updates) {
      return NextResponse.json({ error: "slug and updates required" }, { status: 400 });
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

    if (updates.business_name !== undefined) allowed.business_name = updates.business_name;
    if (updates.phone !== undefined) allowed.phone = updates.phone;
    if (updates.address !== undefined) allowed.address = updates.address;
    if (updates.booking_url !== undefined) allowed.booking_url = updates.booking_url;
    if (updates.services !== undefined) allowed.services = updates.services;
    if (updates.categories !== undefined) allowed.categories = updates.categories;
    if (updates.booking_policies !== undefined) allowed.booking_policies = updates.booking_policies;
    if (updates.products !== undefined) allowed.products = updates.products;
    if (updates.images !== undefined) allowed.images = updates.images;
    if (updates.hero_video_url !== undefined) allowed.hero_video_url = updates.hero_video_url;
    if (updates.hours !== undefined) allowed.hours = updates.hours;
    if (updates.imported_hours !== undefined) allowed.imported_hours = updates.imported_hours;

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
      if (updates.booking_mode !== undefined) allowed.booking_mode = updates.booking_mode;
      if (updates.notification_email !== undefined) allowed.notification_email = updates.notification_email;
    }

    // Handle generated_copy updates (merge, don't replace)
    if (updates.generated_copy) {
      const currentCopy = (current.generated_copy || {}) as Record<string, unknown>;
      const mergedCopy = { ...currentCopy };

      // Merge EN copy
      if (updates.generated_copy.en) {
        const currentEn = (currentCopy.en || {}) as Record<string, unknown>;
        mergedCopy.en = { ...currentEn, ...updates.generated_copy.en };
      }

      // Merge ES copy
      if (updates.generated_copy.es) {
        const currentEs = (currentCopy.es || {}) as Record<string, unknown>;
        mergedCopy.es = { ...currentEs, ...updates.generated_copy.es };
      }

      // Merge top-level copy fields (logo, custom_colors, section_settings, etc)
      if (updates.generated_copy.logo !== undefined) mergedCopy.logo = updates.generated_copy.logo;
      if (updates.generated_copy.section_settings !== undefined) mergedCopy.section_settings = updates.generated_copy.section_settings;
      if (updates.generated_copy.custom_colors !== undefined) mergedCopy.custom_colors = updates.generated_copy.custom_colors;
      if (updates.generated_copy.booking_categories !== undefined) mergedCopy.booking_categories = updates.generated_copy.booking_categories;

      allowed.generated_copy = mergedCopy;
    }

    // Deposit settings: canonical home is booking_settings (per-tenant). For
    // preview-only sites with no tenant yet, the values land on the previews
    // row as pending state and migrate on activation. The validator runs in
    // both cases so the founder can't bypass field-level rules.
    const depositTouched =
      updates.deposit_required !== undefined ||
      updates.deposit_mode !== undefined ||
      updates.deposit_value !== undefined ||
      updates.deposit_cashapp !== undefined ||
      updates.deposit_zelle !== undefined ||
      updates.deposit_other_label !== undefined ||
      updates.deposit_other_value !== undefined;

    let depositValue: DepositSettingsValue | undefined;
    if (depositTouched) {
      const depositResult = validateDepositSettings({
        deposit_required: updates.deposit_required,
        deposit_mode: updates.deposit_mode,
        deposit_value: updates.deposit_value,
        deposit_cashapp: updates.deposit_cashapp,
        deposit_zelle: updates.deposit_zelle,
        deposit_other_label: updates.deposit_other_label,
        deposit_other_value: updates.deposit_other_value,
      });
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
