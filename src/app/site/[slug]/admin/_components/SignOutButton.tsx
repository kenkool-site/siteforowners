"use client";

export function SignOutButton({ className = "" }: { className?: string }) {
  async function signOut() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/admin";
  }
  return (
    <button type="button" onClick={signOut} className={className}>
      Sign out
    </button>
  );
}
