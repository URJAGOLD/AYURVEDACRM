"use client";
import { useAuth } from "@/store/auth";

// App is served under /crm (nginx subpath). Raw fetch() is NOT auto-prefixed by Next basePath.
const BASE = "/crm";

function authHeaders(): Record<string, string> {
  const t = useAuth.getState().token;
  return t ? { Authorization: "Bearer " + t } : {};
}
async function handle(res: Response) {
  if (res.status === 401) { useAuth.getState().logout(); if (typeof window !== "undefined") window.location.href = BASE + "/login"; throw new Error("Session expired"); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || ("Request failed (" + res.status + ")"));
  return data;
}
export const api = {
  async get(p: string) { return handle(await fetch(BASE + p, { headers: authHeaders() })); },
  async post(p: string, body?: any) { return handle(await fetch(BASE + p, { method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined })); },
  async put(p: string, body?: any) { return handle(await fetch(BASE + p, { method: "PUT", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined })); },
  async del(p: string) { return handle(await fetch(BASE + p, { method: "DELETE", headers: authHeaders() })); },
  async upload(p: string, file: File) { const fd = new FormData(); fd.append("file", file); return handle(await fetch(BASE + p, { method: "POST", headers: authHeaders(), body: fd })); },
  async download(p: string, filename: string) {
    const res = await fetch(BASE + p, { headers: authHeaders() });
    if (!res.ok) throw new Error("Download failed");
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
  },
};