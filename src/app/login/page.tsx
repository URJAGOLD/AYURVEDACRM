"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/apiClient";
import { useAuth } from "@/store/auth";

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuth((s) => s.setAuth);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setErr(""); setLoading(true);
    try {
      const { token, user } = await api.post("/api/auth/login", { email, password });
      setAuth(token, user); router.push("/orders");
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="card w-full max-w-sm p-8">
        <div className="flex items-center gap-2 mb-1">
          <div className="h-10 w-10 rounded-lg bg-brand text-white grid place-items-center font-bold">AA</div>
          <div>
            <h1 className="font-bold text-gray-900 leading-tight">Amri Ayurveda CRM</h1>
            <p className="text-xs text-gray-500">Pure Ayurveda - Manage Orders</p>
          </div>
        </div>
        <p className="text-sm text-gray-500 mt-3 mb-5">Sign in with the credentials your admin gave you.</p>
        <label className="label">Email</label>
        <input className="input mb-3" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="you@prakritiherbs.in" />
        <label className="label">Password</label>
        <input className="input mb-4" type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="********" />
        {err && <p className="text-sm text-red-600 mb-3">{err}</p>}
        <button className="btn btn-primary w-full" disabled={loading} onClick={submit}>{loading ? "Signing in..." : "Sign In"}</button>
      </div>
    </div>
  );
}