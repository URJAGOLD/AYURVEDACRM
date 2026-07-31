"use client";
import { useEffect, useState } from "react";

// Returns false on the server and on the client's first (hydration) render,
// then true after mount. Gate auth decisions on this so we never redirect or
// fire authenticated fetches before zustand-persist has restored the token
// from localStorage. Also keeps server/client first render identical (no
// hydration mismatch).
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);
  return hydrated;
}