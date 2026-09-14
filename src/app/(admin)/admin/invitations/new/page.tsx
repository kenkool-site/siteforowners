import Link from "next/link";
import { FounderEventForm } from "@/components/invitations/FounderEventForm";

export default function NewInvitationPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/invitations" className="text-sm font-medium text-gray-600 hover:text-gray-950">
        Back to invitations
      </Link>
      <div className="mt-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl">New invitation</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
          Create the owner login and a draft event. You can add the invitation details and design next.
        </p>
        <div className="mt-8">
          <FounderEventForm />
        </div>
      </div>
    </div>
  );
}
