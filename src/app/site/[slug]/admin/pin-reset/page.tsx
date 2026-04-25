import { PinResetForm } from "../_components/PinResetForm";

export const dynamic = "force-dynamic";

export default function PinResetPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = typeof searchParams.token === "string" ? searchParams.token : "";
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <PinResetForm token={token} />
    </div>
  );
}
