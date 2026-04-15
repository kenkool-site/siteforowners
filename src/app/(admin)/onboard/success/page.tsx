import Link from "next/link";

export default function OnboardSuccessPage() {
  return (
    <div className="py-16 text-center">
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
        <svg
          className="h-10 w-10 text-green-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>
      <h1 className="mb-3 text-3xl font-bold text-gray-900">
        Payment Successful!
      </h1>
      <p className="mb-8 text-gray-600">
        The client&apos;s subscription is now active. Time to get their site
        live!
      </p>
      <div className="flex items-center justify-center gap-4">
        <Link
          href="/prospects"
          className="rounded-full border px-6 py-3 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          View Prospects
        </Link>
        <Link
          href="/clients"
          className="rounded-full bg-amber-600 px-6 py-3 text-sm font-medium text-white hover:bg-amber-700"
        >
          View Clients
        </Link>
      </div>
    </div>
  );
}
