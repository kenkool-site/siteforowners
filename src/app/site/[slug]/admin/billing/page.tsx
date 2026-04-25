import { notFound } from "next/navigation";
import { loadTenantBySlug } from "@/lib/admin-tenant";
import { BillingPortalButton } from "../_components/BillingPortalButton";

export const dynamic = "force-dynamic";

const STATUS_PILL: Record<string, { class: string; label: string }> = {
  active: { class: "bg-green-100 text-green-700", label: "Active" },
  trialing: { class: "bg-blue-100 text-blue-700", label: "Trial" },
  past_due: { class: "bg-red-100 text-red-700", label: "Past due" },
  canceled: { class: "bg-gray-200 text-gray-600", label: "Canceled" },
  pending: { class: "bg-pink-100 text-pink-700", label: "Pending" },
};

export default async function BillingPage({ params }: { params: { slug: string } }) {
  const tenant = await loadTenantBySlug(params.slug);
  if (!tenant) notFound();

  const pill = STATUS_PILL[tenant.subscription_status] ?? STATUS_PILL.pending;
  const isPastDue = tenant.subscription_status === "past_due";

  return (
    <div className="py-4 md:py-6">
      <div className="px-4 md:px-8">
        <div className="text-lg font-semibold">Billing</div>
      </div>

      <div className="px-3 md:px-8 mt-4 space-y-4">
        {isPastDue && (
          <div className="bg-red-50 border border-red-300 rounded-lg p-4 text-sm text-red-700" role="alert">
            <div className="font-semibold">Payment past due</div>
            <div className="mt-1">Update your payment method below to keep your site online.</div>
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
          <div className="text-xs text-gray-500">Subscription</div>
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium">SiteForOwners</span>
            <span className={"text-[10px] font-bold px-2 py-0.5 rounded-full " + pill.class}>
              {pill.label.toUpperCase()}
            </span>
          </div>
        </div>

        <BillingPortalButton />

        <div className="text-[10px] text-gray-400 text-center">
          Click above to view invoices, update payment, or cancel through Stripe.
        </div>
      </div>
    </div>
  );
}
