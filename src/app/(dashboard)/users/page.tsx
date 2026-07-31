"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { PERMISSION_CATALOG, defaultPermissionsForRole, type RoleName } from "@/lib/permissions";
import type { UserRow } from "@/types";

const ROLES: RoleName[] = ["SUPER_ADMIN", "MANAGER", "AGENT", "VIEWER", "DEALER"];

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [msg, setMsg] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);

  async function load() { try { const d = await api.get("/api/users"); setUsers(d.users); } catch (e: any) { setMsg(e.message); } }
  useEffect(() => { load(); }, []);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div><h1 className="text-xl font-bold text-gray-900">Users & Access</h1><p className="text-sm text-gray-500">Create users and grant each one specific access.</p></div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>+ New User</button>
      </div>
      {msg && <div className="mb-3 text-sm rounded-lg bg-brand-light text-brand-dark px-3 py-2">{msg}</div>}

      <div className="card overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left"><tr>
            <th className="px-3 py-2">Name</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Role</th>
            <th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Access</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-gray-100">
                <td className="px-3 py-2 font-medium">{u.name}</td>
                <td className="px-3 py-2 text-gray-600">{u.email}</td>
                <td className="px-3 py-2"><span className="badge bg-brand-light text-brand-dark">{u.role}</span></td>
                <td className="px-3 py-2">{u.isActive ? <span className="badge bg-green-100 text-green-700">Active</span> : <span className="badge bg-gray-200 text-gray-600">Inactive</span>}</td>
                <td className="px-3 py-2 text-right"><button className="btn btn-ghost px-2 py-1" onClick={() => setEditing(u)}>Manage Access</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(creating || editing) && (
        <UserForm user={editing} onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); load(); }} />
      )}
    </div>
  );
}

function UserForm({ user, onClose, onSaved }: { user: UserRow | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!user;
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<RoleName>((user?.role as RoleName) ?? "AGENT");
  const [perms, setPerms] = useState<Record<string, boolean>>(user?.permissions ?? defaultPermissionsForRole("AGENT"));
  const [isActive, setIsActive] = useState(user?.isActive ?? true);
  const [dealerId, setDealerId] = useState<string>(String((user as any)?.dealerId ?? ""));
  const [dealers, setDealers] = useState<any[]>([]);
  useEffect(() => { if (role === "DEALER" && dealers.length === 0) { api.get("/api/masters/dealers").then((d: any) => setDealers(d.dealers ?? d ?? [])).catch(() => {}); } }, [role, dealers.length]);
  const [err, setErr] = useState(""); const [saving, setSaving] = useState(false);

  // when role changes (and not editing existing perms), apply role defaults
  function applyRole(r: RoleName) { setRole(r); setPerms(defaultPermissionsForRole(r)); }
  function toggle(key: string) { setPerms((p) => ({ ...p, [key]: !p[key] })); }

  async function save() {
    setErr(""); setSaving(true);
    try {
      if (isEdit) await api.put("/api/users/" + user!.id, { name, phone, role, permissions: perms, isActive, dealerId: role === "DEALER" && dealerId ? Number(dealerId) : null, ...(password ? { password } : {}) });
      else await api.post("/api/users", { name, email, phone, password, role, permissions: perms, dealerId: role === "DEALER" && dealerId ? Number(dealerId) : null });
      onSaved();
    } catch (e: any) { setErr(e.message); } finally { setSaving(false); }
  }

  const superAdmin = role === "SUPER_ADMIN";

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white h-full shadow-xl overflow-auto">
        <div className="px-5 py-4 border-b flex items-center justify-between sticky top-0 bg-white">
          <h2 className="font-bold text-gray-900">{isEdit ? ("Manage Access - " + user!.name) : "New User"}</h2>
          <button className="text-gray-400 hover:text-gray-700" onClick={onClose}>X</button>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><label className="label">Phone</label><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          </div>
          <div><label className="label">Email (login id)</label><input className="input" value={email} disabled={isEdit} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><label className="label">{isEdit ? "Reset Password (optional)" : "Password"}</label><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={isEdit ? "leave blank to keep" : "min 6 chars"} /></div>
          <div className="grid grid-cols-2 gap-3 items-end">
            <div><label className="label">Role (sets defaults)</label>
              <select className="input" value={role} onChange={(e) => applyRole(e.target.value as RoleName)}>{ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select></div>
            {isEdit && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Active</label>}
          </div>
          {role === "DEALER" && (
            <div><label className="label">Dealer (is login ko kis dealer se jodna hai)</label>
              <select className="input" value={dealerId} onChange={(e) => setDealerId(e.target.value)}>
                <option value="">-- select dealer --</option>
                {dealers.map((d: any) => <option key={d.id} value={d.id}>{d.name}{d.city ? " (" + d.city + ")" : ""}</option>)}
              </select></div>
          )}

          <div className="pt-2">
            <div className="label">Module Access {superAdmin && <span className="text-brand">(Super Admin = full access)</span>}</div>
            <div className="space-y-3">
              {PERMISSION_CATALOG.map((m) => (
                <div key={m.module} className="card p-3">
                  <div className="font-medium text-sm text-gray-800 mb-2">{m.label}</div>
                  <div className="grid grid-cols-1 gap-1">
                    {m.permissions.map((p) => (
                      <label key={p.key} className="flex items-center gap-2 text-sm text-gray-600">
                        <input type="checkbox" disabled={superAdmin} checked={superAdmin || !!perms[p.key]} onChange={() => toggle(p.key)} />
                        {p.label}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="flex gap-2 pt-2 pb-8">
            <button className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary flex-1" disabled={saving} onClick={save}>{saving ? "Saving..." : "Save User"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}