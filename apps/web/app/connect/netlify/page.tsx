"use client";

import { useEffect, useState } from "react";

/**
 * Netlify sends the sign-in pop-up back here with a short-lived key after the "#". It is
 * handed to the room window that opened the pop-up and never sent anywhere else.
 */
export default function NetlifyReturn() {
  const [note, setNote] = useState("Finishing…");
  useEffect(() => {
    const p = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const token = p.get("access_token");
    const state = p.get("state");
    window.history.replaceState(null, "", window.location.pathname);
    let want: string | null = null;
    try {
      want = window.localStorage.getItem("as:netlify-state");
      window.localStorage.removeItem("as:netlify-state");
    } catch {}
    if (!token || !state || state !== want || !window.opener) {
      setNote("That did not work. Close this window and try again.");
      return;
    }
    (window.opener as Window).postMessage({ type: "as:netlify", token }, window.location.origin);
    setNote("Connected. You can close this window.");
    window.close();
  }, []);
  return (
    <main className="flex min-h-screen items-center justify-center bg-white p-6 text-sm text-zinc-700">
      <p role="status">{note}</p>
    </main>
  );
}
