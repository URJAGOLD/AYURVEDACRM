"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/store/auth";
import { useHydrated } from "@/lib/useHydrated";

interface NavItem { href: string; label: string; icon: string; perm?: string; superOnly?: boolean; }
const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "\uD83D\uDCCA", perm: "orders.view" },
  { href: "/orders", label: "Manage Orders", icon: "\uD83D\uDCE6", perm: "orders.view" },
  { href: "/reports", label: "Reports", icon: "\uD83D\uDCC8", perm: "reports.view" },
  { href: "/reports/sales", label: "Sales Report", icon: "\uD83D\uDCB0", perm: "reports.view" },
  { href: "/users", label: "Users & Access", icon: "\uD83D\uDC64", perm: "users.manage" },
  { href: "/settings", label: "Settings", icon: "\u2699\uFE0F", superOnly: true },
  { href: "/system", label: "System Health", icon: "\uD83E\uDE7A", perm: "users.manage" },
  { href: "/audit", label: "Audit Logs", icon: "\uD83D\uDCDC", perm: "users.manage" },
  { href: "/shiprocket", label: "Shiprocket", icon: "\uD83D\uDE9A", perm: "users.manage" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, token, logout, can } = useAuth();
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);

  useEffect(() => { if (hydrated && !token) router.replace("/login"); }, [hydrated, token, router]);
  useEffect(() => { setOpen(false); }, [pathname]);
  if (!hydrated) return null;
  if (!token || !user) return null;
  const visible = NAV.filter((n) => (n.superOnly ? user.role === "SUPER_ADMIN" : (!n.perm || can(n.perm))));

  return (
    <div className="h-screen flex bg-[#EEF2F7] overflow-hidden">
      {open && <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={"w-60 shrink-0 bg-gradient-to-b from-slate-900 to-slate-800 text-slate-100 flex flex-col overflow-hidden fixed lg:static inset-y-0 left-0 z-40 transition-transform duration-200 lg:translate-x-0 " + (open ? "translate-x-0" : "-translate-x-full")}>
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <div className="font-extrabold text-lg leading-tight text-white">Amri Ayurveda</div>
            <div className="text-xs text-emerald-300">CRM - Pure Ayurveda</div>
          </div>
          <button className="lg:hidden text-slate-300 hover:text-white" onClick={() => setOpen(false)} aria-label="Close menu">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto overscroll-contain">
          {visible.map((n) => {
            const active = pathname.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)}
                className={"flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition relative " + (active ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white")}>
                {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r bg-emerald-400" />}
                <span className="text-lg">{n.icon}</span>{n.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-3 px-2 mb-2">
            <div className="h-9 w-9 rounded-full bg-emerald-500 text-white grid place-items-center font-bold">{(user.name || "U").slice(0, 1).toUpperCase()}</div>
            <div className="min-w-0"><div className="text-sm font-semibold text-white truncate">{user.name}</div><div className="text-[11px] text-emerald-300">{user.role}</div></div>
          </div>
          <button className="w-full rounded-lg bg-white/5 hover:bg-red-500/20 text-red-300 hover:text-red-200 px-3 py-2 text-sm font-medium transition" onClick={() => { logout(); router.replace("/login"); }}>Sign Out</button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto min-w-0 overscroll-contain">
        <div className="lg:hidden sticky top-0 z-20 flex items-center gap-3 bg-slate-900 text-white px-4 py-3 shadow-md">
          <button onClick={() => setOpen(true)} aria-label="Open menu" className="text-white">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
          </button>
          <span className="font-bold">Amri Ayurveda CRM</span>
        </div>
        {children}
      </main>
    </div>
  );
}