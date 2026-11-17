"use client";

export function SignOutButton() {
  return (
    <button
      type="button"
      className="l-ghost"
      onClick={async () => {
        try {
          await fetch("/api/auth/logout", { method: "POST" });
        } finally {
          window.location.href = "/";
        }
      }}
    >
      Sign out
    </button>
  );
}
