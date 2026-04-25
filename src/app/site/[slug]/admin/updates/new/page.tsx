import Link from "next/link";
import { NewUpdateRequestForm } from "../../_components/NewUpdateRequestForm";

export const dynamic = "force-dynamic";

export default function NewUpdateRequestPage() {
  return (
    <div className="py-4 md:py-6">
      <div className="px-4 md:px-8 flex items-baseline justify-between">
        <div className="text-lg font-semibold">New request</div>
        <Link href="/admin/updates" className="text-xs text-gray-500 underline">Cancel</Link>
      </div>
      <div className="px-3 md:px-8 mt-4">
        <NewUpdateRequestForm />
      </div>
    </div>
  );
}
