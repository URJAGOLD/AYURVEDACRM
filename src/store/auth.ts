"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthUser } from "@/types";

interface AuthState {
  token: string | null; user: AuthUser | null;
  setAuth: (token: string, user: AuthUser) => void;
  logout: () => void; can: (permission: string) => boolean;
}
export const useAuth = create<AuthState>()(persist((set, get) => ({
  token: null, user: null,
  setAuth: (token, user) => set({ token, user }),
  logout: () => set({ token: null, user: null }),
  can: (permission) => {
    const u = get().user;
    if (!u) return false;
    if (u.role === "SUPER_ADMIN") return true;
    return u.permissions?.[permission] === true;
  },
}), { name: "ph-crm-auth" }));