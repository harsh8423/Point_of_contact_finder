"use client";
import { useState, useEffect, useCallback } from "react";
import { useAuth, apiFetch } from "@/components/AuthProvider";
import { useTheme } from "@/components/ThemeProvider";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Shield, Users, ArrowLeft, Sun, Moon, RefreshCw, Trash2,
  ChevronDown, Loader2, BarChart3, Zap, Crown, Star
} from "lucide-react";

const PLAN_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  free_trial: { label: "Free Trial", color: "#60a5fa", bg: "rgba(96,165,250,0.12)" },
  pro:        { label: "Pro",        color: "#a78bfa", bg: "rgba(167,139,250,0.12)" },
  max:        { label: "Max",        color: "#34d399", bg: "rgba(52,211,153,0.12)" },
};

const PLAN_LIMITS: Record<string, { searches: number; poc: number; qualify: number }> = {
  free_trial: { searches: 5,  poc: 10, qualify: 5 },
  pro:        { searches: 10, poc: 20, qualify: 10 },
  max:        { searches: 25, poc: 50, qualify: 25 },
};

interface UsageItem { used: number; limit: number; }
interface AdminUser {
  id: number; username: string; email: string; plan: string;
  is_admin: boolean; is_active: boolean; created_at: string;
  usage_today: { searches: UsageItem; poc: UsageItem; qualify: UsageItem };
}
interface Stats {
  total_users: number;
  plan_counts: Record<string, number>;
  today_usage: { searches: number; poc: number; qualify: number };
}

function UsageBar({ item, color }: { item: UsageItem; color: string }) {
  const pct = Math.min(100, item.limit > 0 ? (item.used / item.limit) * 100 : 0);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{item.used}/{item.limit}</span>
        <span style={{ fontSize: 10, color: pct >= 100 ? "#f87171" : "var(--text-muted)" }}>{Math.round(pct)}%</span>
      </div>
      <div style={{ height: 4, borderRadius: 99, background: "var(--surface-3)", overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: 99, width: `${pct}%`, background: pct >= 100 ? "#ef4444" : color, transition: "width 0.3s" }} />
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const { theme, toggle } = useTheme();
  const router = useRouter();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [actionLoading, setActionLoading] = useState<Record<number, string>>({});
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoadingData(true);
    try {
      const [usersData, statsData] = await Promise.all([
        apiFetch("/api/admin/users"),
        apiFetch("/api/admin/stats"),
      ]);
      setUsers(usersData.users);
      setStats(statsData);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !user?.is_admin) { router.push("/"); return; }
    if (!authLoading && user?.is_admin) load();
  }, [authLoading, user, load, router]);

  const updateUser = async (userId: number, patch: object, label: string) => {
    setActionLoading(p => ({ ...p, [userId]: label }));
    try {
      await apiFetch(`/api/admin/users/${userId}`, { method: "PATCH", body: JSON.stringify(patch) });
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setActionLoading(p => { const n = { ...p }; delete n[userId]; return n; });
    }
  };

  const resetUsage = async (userId: number) => {
    setActionLoading(p => ({ ...p, [userId]: "reset" }));
    try {
      await apiFetch(`/api/admin/users/${userId}/reset-usage`, { method: "POST" });
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setActionLoading(p => { const n = { ...p }; delete n[userId]; return n; });
    }
  };

  const deleteUser = async (userId: number, username: string) => {
    if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return;
    setActionLoading(p => ({ ...p, [userId]: "delete" }));
    try {
      await apiFetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setActionLoading(p => { const n = { ...p }; delete n[userId]; return n; });
    }
  };

  if (authLoading || loadingData) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
        <Loader2 size={28} className="animate-spin" style={{ color: "var(--accent)" }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text-primary)" }}>
      {/* Top Bar */}
      <div style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)", padding: "14px 24px", display: "flex", alignItems: "center", gap: 12 }}>
        <Link href="/" style={{ textDecoration: "none" }}>
          <button className="btn btn-ghost btn-sm"><ArrowLeft size={14} /> Dashboard</button>
        </Link>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
          <Shield size={18} color="var(--accent)" />
          <h1 style={{ fontSize: 18, fontWeight: 800 }}>Admin Panel</h1>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={13} /> Refresh</button>
        <button className="theme-toggle" onClick={toggle}>{theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}</button>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
        {error && (
          <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 8, background: "var(--danger-muted)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171", fontSize: 13, display: "flex", justifyContent: "space-between" }}>
            {error}
            <button onClick={() => setError("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#f87171" }}>✕</button>
          </div>
        )}

        {/* Stats row */}
        {stats && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 28 }}>
            {[
              { label: "Total Users", value: stats.total_users, icon: <Users size={16} />, color: "var(--accent)" },
              { label: "Free Trial", value: stats.plan_counts.free_trial || 0, icon: <Zap size={16} />, color: "#60a5fa" },
              { label: "Pro Users", value: stats.plan_counts.pro || 0, icon: <Star size={16} />, color: "#a78bfa" },
              { label: "Max Users", value: stats.plan_counts.max || 0, icon: <Crown size={16} />, color: "#34d399" },
              { label: "Searches Today", value: stats.today_usage.searches, icon: <BarChart3 size={16} />, color: "#f59e0b" },
              { label: "POC Lookups Today", value: stats.today_usage.poc, icon: <BarChart3 size={16} />, color: "#f59e0b" },
              { label: "Qualifications Today", value: stats.today_usage.qualify, icon: <BarChart3 size={16} />, color: "#f59e0b" },
            ].map(s => (
              <div key={s.label} className="stat-card" style={{ padding: "14px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.4px" }}>{s.label}</span>
                  <span style={{ color: s.color }}>{s.icon}</span>
                </div>
                <p style={{ fontSize: 28, fontWeight: 800, lineHeight: 1, color: "var(--text-primary)" }}>{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Plan Limits Reference */}
        <div className="card" style={{ padding: 16, marginBottom: 20 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 12 }}>Plan Limits (per day)</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {Object.entries(PLAN_LIMITS).map(([plan, lim]) => {
              const meta = PLAN_LABELS[plan];
              return (
                <div key={plan} style={{ padding: "10px 14px", borderRadius: 10, background: meta.bg, border: `1px solid ${meta.color}40` }}>
                  <p style={{ fontWeight: 700, fontSize: 13, color: meta.color, marginBottom: 6 }}>{meta.label}</p>
                  <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--text-secondary)" }}>
                    <span>🔍 {lim.searches} searches</span>
                    <span>👤 {lim.poc} POC</span>
                    <span>🧠 {lim.qualify} qualify</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Users Table */}
        <div className="card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
            <Users size={16} color="var(--accent)" />
            <h2 style={{ fontSize: 15, fontWeight: 700 }}>Users ({users.length})</h2>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["User", "Plan", "Today's Usage", "Status", "Joined", "Actions"].map(h => (
                    <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.4px", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const planMeta = PLAN_LABELS[u.plan] || PLAN_LABELS.free_trial;
                  const isLoading = !!actionLoading[u.id];
                  return (
                    <tr key={u.id} style={{ borderBottom: "1px solid var(--border)", background: !u.is_active ? "var(--danger-muted)" : "transparent" }}>
                      <td style={{ padding: "12px 16px" }}>
                        <p style={{ fontWeight: 600 }}>{u.username} {u.is_admin && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: "rgba(251,191,36,0.15)", color: "#fbbf24", marginLeft: 4 }}>ADMIN</span>}</p>
                        <p style={{ fontSize: 11, color: "var(--text-muted)" }}>{u.email}</p>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <select
                          value={u.plan}
                          disabled={isLoading}
                          onChange={e => updateUser(u.id, { plan: e.target.value }, "plan")}
                          style={{
                            background: planMeta.bg, border: `1px solid ${planMeta.color}60`,
                            borderRadius: 6, padding: "4px 8px", fontSize: 12,
                            color: planMeta.color, cursor: "pointer", fontWeight: 600,
                          }}
                        >
                          <option value="free_trial">Free Trial</option>
                          <option value="pro">Pro</option>
                          <option value="max">Max</option>
                        </select>
                      </td>
                      <td style={{ padding: "12px 16px", minWidth: 200 }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {(["searches", "poc", "qualify"] as const).map(k => (
                            <div key={k}>
                              <p style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2, textTransform: "capitalize" }}>{k}</p>
                              <UsageBar item={u.usage_today[k]} color={planMeta.color} />
                            </div>
                          ))}
                        </div>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <button
                          onClick={() => updateUser(u.id, { is_active: !u.is_active }, "status")}
                          disabled={isLoading}
                          style={{
                            padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none",
                            background: u.is_active ? "var(--success-muted)" : "var(--danger-muted)",
                            color: u.is_active ? "var(--success)" : "#f87171",
                          }}
                        >
                          {actionLoading[u.id] === "status" ? "…" : u.is_active ? "Active" : "Inactive"}
                        </button>
                      </td>
                      <td style={{ padding: "12px 16px", color: "var(--text-muted)", fontSize: 12, whiteSpace: "nowrap" }}>
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => resetUsage(u.id)}
                            disabled={isLoading}
                            title="Reset today's usage limits"
                          >
                            {actionLoading[u.id] === "reset" ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                            Reset
                          </button>
                          {!u.is_admin && (
                            <button
                              className="btn btn-sm btn-danger"
                              onClick={() => deleteUser(u.id, u.username)}
                              disabled={isLoading}
                              title="Delete user"
                            >
                              {actionLoading[u.id] === "delete" ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
