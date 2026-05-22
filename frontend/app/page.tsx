"use client";
import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search, Loader2, Database, UserCheck, Brain, CalendarDays,
  AlertTriangle, Settings, ChevronRight, Zap, Sun, Moon, LogOut, Shield
} from "lucide-react";
import { api, Lead, Stats } from "@/components/api";
import { useToast } from "@/components/Toast";
import { useTheme } from "@/components/ThemeProvider";
import { useAuth } from "@/components/AuthProvider";
import LeadsTable from "@/components/LeadsTable";
import LeadDrawer from "@/components/LeadDrawer";
import Link from "next/link";

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <div className="stat-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</span>
        <span style={{ color }}>{icon}</span>
      </div>
      <p style={{ fontSize: 32, fontWeight: 800, color: "var(--text-primary)", lineHeight: 1 }}>{value.toLocaleString()}</p>
    </div>
  );
}

export default function HomePage() {
  const toast = useToast();
  const { theme, toggle } = useTheme();
  const { user, usage, logout } = useAuth();
  const [query, setQuery] = useState("");
  const [maxResults, setMaxResults] = useState(50);
  const [isScraping, setIsScraping] = useState(false);
  const [selectedQuery, setSelectedQuery] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [drawerLead, setDrawerLead] = useState<Lead | null>(null);

  // Stats
  const { data: stats } = useQuery<Stats>({
    queryKey: ["stats"],
    queryFn: () => api.get("/api/leads/stats"),
    refetchInterval: 30000,
  });

  // Previous queries
  const { data: queries, refetch: refetchQueries } = useQuery<{ query: string; count: number }[]>({
    queryKey: ["queries"],
    queryFn: () => api.get("/api/leads/queries"),
  });

  // Settings / missing keys
  const { data: settingsData } = useQuery<{ settings: Record<string, string>; missing_keys: string[] }>({
    queryKey: ["settings"],
    queryFn: () => api.get("/api/settings"),
  });

  // Leads
  const { data: leadsData, refetch: refetchLeads, isFetching } = useQuery({
    queryKey: ["leads", selectedQuery, page, limit],
    queryFn: () => api.get(`/api/leads?${selectedQuery ? `search_query=${encodeURIComponent(selectedQuery)}&` : ""}page=${page}&limit=${limit}`),
    enabled: true,
  });

  const refresh = useCallback(async () => {
    await Promise.all([refetchLeads(), refetchQueries()]);
  }, [refetchLeads, refetchQueries]);

  const scrape = async () => {
    if (!query.trim()) { toast("Please enter a search query", "error"); return; }
    setIsScraping(true);
    try {
      const res = await api.post("/api/scrape", { query: query.trim(), max_results: maxResults });
      toast(`Scraped ${res.count} businesses from Google Maps`, "success");
      setSelectedQuery(query.trim());
      setPage(1);
      await refresh();
    } catch (e: unknown) {
      toast((e instanceof Error ? e.message : "Scrape failed"), "error");
    } finally {
      setIsScraping(false);
    }
  };

  const leads: Lead[] = leadsData?.leads || [];
  const total: number = leadsData?.total || 0;

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* Sidebar */}
      <aside style={{
        width: 280, background: "var(--surface)", borderRight: "1px solid var(--border)",
        display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden"
      }}>
        {/* Logo */}
        <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: "linear-gradient(135deg, #3b82f6, #6366f1)",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
            }}>
              <Zap size={18} color="white" fill="white" />
            </div>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.3px" }}>POC Finder</h1>
              <p style={{ fontSize: 11, color: "var(--text-muted)" }}>Lead Intelligence Platform</p>
            </div>
            {/* Theme toggle */}
            <button
              id="theme-toggle"
              className="theme-toggle"
              onClick={toggle}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
        </div>

        {/* Search form */}
        <div style={{ padding: 16, borderBottom: "1px solid var(--border)" }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>New Search</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <textarea
              className="input"
              placeholder='e.g. "doctor clinics in Delhi"'
              value={query}
              onChange={e => setQuery(e.target.value)}
              rows={3}
              id="search-query"
              style={{ resize: "none", fontFamily: "inherit" }}
            />
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", flexShrink: 0 }}>Max:</label>
              <input
                type="number"
                className="input"
                value={maxResults}
                onChange={e => setMaxResults(Number(e.target.value))}
                min={1} max={500} id="max-results"
                style={{ width: 70 }}
              />
            </div>
            <button
              className="btn btn-primary"
              onClick={scrape}
              disabled={isScraping}
              id="scrape-btn"
              style={{ width: "100%", justifyContent: "center" }}
            >
              {isScraping
                ? <><Loader2 size={14} className="animate-spin" /> Scraping…</>
                : <><Search size={14} /> Scrape Google Maps</>}
            </button>
          </div>
          {isScraping && (
            <div className="warning-banner animate-fade-in" style={{
              marginTop: 10, background: "var(--accent-muted)", borderColor: "rgba(59,130,246,0.3)", color: "#60a5fa"
            }}>
              <Loader2 size={13} className="animate-spin" />
              <span style={{ fontSize: 12 }}>Scraping Google Maps… this may take 1-3 minutes</span>
            </div>
          )}
        </div>

        {/* Previous searches */}
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>Previous Searches</p>
          {!queries || queries.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>No searches yet. Run your first scrape to get started.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <button
                className={`btn btn-ghost ${!selectedQuery ? "active" : ""}`}
                onClick={() => { setSelectedQuery(null); setPage(1); }}
                style={{ justifyContent: "space-between", textAlign: "left", width: "100%", background: !selectedQuery ? "var(--accent-muted)" : "" }}
              >
                <span style={{ color: !selectedQuery ? "#60a5fa" : "var(--text-secondary)", fontSize: 12 }}>All Leads</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{stats?.total || 0}</span>
              </button>
              {queries.map(q => (
                <button
                  key={q.query}
                  className="btn btn-ghost"
                  onClick={() => { setSelectedQuery(q.query); setPage(1); }}
                  style={{
                    justifyContent: "space-between", textAlign: "left", width: "100%",
                    background: selectedQuery === q.query ? "var(--accent-muted)" : "",
                    borderRadius: 8
                  }}
                >
                  <span style={{ color: selectedQuery === q.query ? "#60a5fa" : "var(--text-primary)", fontSize: 12, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {q.query}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0, marginLeft: 4 }}>{q.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Usage meter */}
        {usage && (
          <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)" }}>
            <p style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>Daily Usage</p>
            {(["searches", "poc", "qualify"] as const).map(k => {
              const item = usage[k];
              const pct = Math.min(100, item.limit > 0 ? (item.used / item.limit) * 100 : 0);
              return (
                <div key={k} style={{ marginBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                    <span style={{ fontSize: 10, color: "var(--text-secondary)", textTransform: "capitalize" }}>{k}</span>
                    <span style={{ fontSize: 10, color: pct >= 100 ? "#f87171" : "var(--text-muted)" }}>{item.used}/{item.limit}</span>
                  </div>
                  <div style={{ height: 3, borderRadius: 99, background: "var(--border)" }}>
                    <div style={{ height: "100%", borderRadius: 99, width: `${pct}%`, background: pct >= 100 ? "#ef4444" : "var(--accent)", transition: "width 0.3s" }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Settings link */}
        <div style={{ padding: 12, borderTop: "1px solid var(--border)" }}>
          <Link href="/settings" style={{ textDecoration: "none" }}>
            <button className="btn btn-ghost" style={{ width: "100%", justifyContent: "space-between" }} id="settings-link">
              <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <Settings size={14} /> Settings
              </span>
              <ChevronRight size={13} />
            </button>
          </Link>
          {user?.is_admin && (
            <Link href="/admin" style={{ textDecoration: "none" }}>
              <button className="btn btn-ghost" style={{ width: "100%", justifyContent: "space-between", marginTop: 2 }} id="admin-link">
                <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#fbbf24" }}>
                  <Shield size={14} /> Admin Panel
                </span>
                <ChevronRight size={13} />
              </button>
            </Link>
          )}
          {/* User info + logout */}
          {user && (
            <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.username}</p>
                  <p style={{ fontSize: 10, color: "var(--accent)", fontWeight: 600, textTransform: "capitalize" }}>
                    {user.plan === "free_trial" ? "Free Trial" : user.plan.charAt(0).toUpperCase() + user.plan.slice(1)}
                  </p>
                </div>
                <button
                  id="logout-btn"
                  onClick={logout}
                  title="Logout"
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex", padding: 4, borderRadius: 6 }}
                >
                  <LogOut size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Top bar */}
        <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)", background: "var(--surface)", flexShrink: 0 }}>
          {/* Missing keys banner */}
          {settingsData?.missing_keys && settingsData.missing_keys.length > 0 && (
            <div className="warning-banner" style={{ marginBottom: 14 }}>
              <AlertTriangle size={14} />
              <span>Configure your API keys in <Link href="/settings" style={{ color: "#fbbf24", textDecoration: "underline" }}>Settings</Link> to use all features — missing: {settingsData.missing_keys.join(", ")}</span>
            </div>
          )}

          {/* Stats */}
          {stats && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              <StatCard label="Total Leads" value={stats.total} icon={<Database size={16} />} color="var(--accent)" />
              <StatCard label="POC Found" value={stats.poc_found} icon={<UserCheck size={16} />} color="var(--success)" />
              <StatCard label="Qualified" value={stats.qualified} icon={<Brain size={16} />} color="#a78bfa" />
              <StatCard label="This Week" value={stats.this_week} icon={<CalendarDays size={16} />} color="#f59e0b" />
            </div>
          )}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          {leads.length === 0 && !isFetching && !isScraping ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 16, textAlign: "center" }}>
              <div style={{
                width: 80, height: 80, borderRadius: "50%",
                background: "var(--accent-muted)", border: "1px solid rgba(59,130,246,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center"
              }}>
                <Search size={32} color="var(--accent)" />
              </div>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Find Your First Leads</h2>
                <p style={{ color: "var(--text-secondary)", fontSize: 14, maxWidth: 400, lineHeight: 1.6 }}>
                  Enter a search query in the sidebar (e.g. <em>"doctor clinics in Delhi"</em>) and click <strong>Scrape Google Maps</strong> to get started.
                </p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {["🏥 doctor clinics in Mumbai", "🍕 restaurants in Bangalore", "💼 IT companies in Hyderabad"].map(ex => (
                  <button key={ex} className="btn btn-secondary btn-sm"
                    onClick={() => setQuery(ex.split(" ").slice(1).join(" "))}
                    style={{ fontSize: 12 }}>
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <LeadsTable
              leads={leads}
              total={total}
              page={page}
              limit={limit}
              onPageChange={p => { setPage(p); }}
              onLimitChange={l => { setLimit(l); setPage(1); }}
              onLeadClick={setDrawerLead}
              onRefresh={refresh}
              isLoading={isFetching && leads.length === 0}
            />
          )}
        </div>
      </main>

      {/* Lead Drawer */}
      <LeadDrawer lead={drawerLead} onClose={() => setDrawerLead(null)} onRefresh={refresh} />
    </div>
  );
}
