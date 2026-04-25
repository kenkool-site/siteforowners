import { notFound } from "next/navigation";
import { loadTenantBySlug } from "@/lib/admin-tenant";
import { ChangePinForm } from "../_components/ChangePinForm";
import { SignOutButton } from "../_components/SignOutButton";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ params }: { params: { slug: string } }) {
  const tenant = await loadTenantBySlug(params.slug);
  if (!tenant) notFound();

  const emailOnFile = tenant.admin_email ?? tenant.email ?? "(none)";
  const subdomain = tenant.preview_slug;

  return (
    <div className="py-4 md:py-6">
      <div className="px-4 md:px-8">
        <div className="text-lg font-semibold">Settings</div>
      </div>

      <div className="px-3 md:px-8 mt-4 space-y-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm font-semibold mb-2">Account</div>
          <div className="text-xs text-gray-500">Email on file</div>
          <div className="text-sm">{emailOnFile}</div>
          <div className="text-[10px] text-gray-400 mt-2">
            Need to change your email? File an update request.
          </div>
        </div>

        <ChangePinForm />

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm font-semibold mb-2">Your website</div>
          <div className="text-sm">{tenant.business_name}</div>
          {subdomain && (
            <div className="text-xs text-gray-500 mt-1">{subdomain}.siteforowners.com</div>
          )}
          <div className="text-xs text-gray-500 mt-1">
            {tenant.site_published ? "Published" : "Draft"} · Subscription: {tenant.subscription_status}
          </div>
        </div>

        <div className="bg-white border border-red-200 rounded-lg p-4">
          <SignOutButton className="w-full text-center text-sm font-medium text-red-600 border border-red-600 rounded-lg py-2" />
        </div>
      </div>
    </div>
  );
}
