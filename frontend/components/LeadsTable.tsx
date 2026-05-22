"use client";
import { useState, useMemo } from "react";
import {
  Star, ExternalLink, Phone, MoreHorizontal, UserSearch,
  Brain, Trash2, CheckSquare, Square, Download, ChevronLeft, ChevronRight, Loader2
} from "lucide-react";
import { Lead, api } from "./api";
import { useToast } from "./Toast";
import POCModeModal, { POCMode } from "./POCModeModal";
import QualifyModeModal, { QualifyDepth } from "./QualifyModeModal";

function StatusBadge({ status }: { status: string }) {
  if (status === "poc_found") return <span className="badge badge-poc">POC Found</span>;
  if (status === "qualified") return <span className="badge badge-qualified">Qualified</span>;
  return <span className="badge badge-new">New</span>;
}

function truncate(s: string | undefined, n: number) {
  if (!s) return "—";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function extractDomain(url?: string) {
  if (!url) return null;
  try {
    const u = new URL(url.includes("://") ? url : `https://${url}`);
    return u.hostname.replace("www.", "");
  } catch { return url; }
}

interface LeadsTableProps {
  leads: Lead[];
  total: number;
  page: number;
  limit: number;
  onPageChange: (p: number) => void;
  onLimitChange: (l: number) => void;
  onLeadClick: (lead: Lead) => void;
  onRefresh: () => void;
  isLoading?: boolean;
}

export default function LeadsTable({
  leads, total, page, limit, onPageChange, onLimitChange, onLeadClick, onRefresh, isLoading
}: LeadsTableProps) {
  const toast = useToast();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [actionLoading, setActionLoading] = useState<Record<number, string>>({});
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const [bulkProgress, setBulkProgress] = useState<null | { current: number; total: number; action: string }>(null);
  // POC mode modal state
  const [pocModal, setPocModal] = useState<{ leadId: number; leadName: string } | null>(null);
  const [bulkPocModal, setBulkPocModal] = useState<{ ids: number[] } | null>(null);
  // Qualify mode modal state
  const [qualifyModal, setQualifyModal] = useState<{ leadId: number; leadName: string } | null>(null);
  const [bulkQualifyModal, setBulkQualifyModal] = useState<{ ids: number[] } | null>(null);

  const categories = useMemo(() => Array.from(new Set(leads.map(l => l.category).filter(Boolean))), [leads]);

  const filtered = useMemo(() => leads.filter(l => {
    const nameMatch = l.business_name.toLowerCase().includes(search.toLowerCase());
    const statusMatch = !statusFilter || l.status === statusFilter;
    const catMatch = !categoryFilter || l.category === categoryFilter;
    return nameMatch && statusMatch && catMatch;
  }), [leads, search, statusFilter, categoryFilter]);

  const totalPages = Math.ceil(total / limit);

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(l => l.id)));
  };

  const findPOC = async (leadId: number, mode: POCMode) => {
    setPocModal(null);
    setActionLoading(p => ({ ...p, [leadId]: "poc" }));
    try {
      const res = await api.post(`/api/leads/${leadId}/find-poc`, { mode });
      const count = res.contacts?.length ?? 0;
      toast(count > 0 ? `Found ${count} contact${count !== 1 ? "s" : ""}` : "No contacts found", count > 0 ? "success" : "info");
      onRefresh();
    } catch (e: unknown) {
      toast((e instanceof Error ? e.message : "Failed to find POC"), "error");
    } finally {
      setActionLoading(p => { const n = { ...p }; delete n[leadId]; return n; });
    }
  };

  const qualifyLead = async (leadId: number, depth: QualifyDepth) => {
    setQualifyModal(null);
    setActionLoading(p => ({ ...p, [leadId]: "qualify" }));
    setOpenMenu(null);
    try {
      const res = await api.post(`/api/leads/${leadId}/qualify`, { depth });
      toast(`Qualified — Score: ${res.qualification.score}/10 (${depth === "deep" ? "In-Depth" : "Normal"})`, "success");
      onRefresh();
    } catch (e: unknown) {
      toast((e instanceof Error ? e.message : "Qualification failed"), "error");
    } finally {
      setActionLoading(p => { const n = { ...p }; delete n[leadId]; return n; });
    }
  };

  const deleteLead = async (leadId: number) => {
    setOpenMenu(null);
    try {
      await api.delete(`/api/leads/${leadId}`);
      toast("Lead deleted", "info");
      setSelected(prev => { const n = new Set(prev); n.delete(leadId); return n; });
      onRefresh();
    } catch (e: unknown) {
      toast((e instanceof Error ? e.message : "Delete failed"), "error");
    }
  };

  const bulkAction = async (action: "poc" | "qualify" | "delete") => {
    const ids = Array.from(selected);
    if (!ids.length) return;

    if (action === "delete") {
      try {
        await api.bulkDelete(ids);
        toast(`Deleted ${ids.length} leads`, "info");
        setSelected(new Set());
        onRefresh();
      } catch (e: unknown) { toast((e instanceof Error ? e.message : "Bulk delete failed"), "error"); }
      return;
    }

    if (action === "poc") {
      setBulkPocModal({ ids });
      return;
    }

    // qualify — show modal to pick depth
    if (action === "qualify") {
      setBulkQualifyModal({ ids });
      return;
    }
  };

  const runBulkQualify = async (depth: QualifyDepth) => {
    if (!bulkQualifyModal) return;
    const ids = bulkQualifyModal.ids;
    setBulkQualifyModal(null);
    setBulkProgress({ current: 0, total: ids.length, action: "Qualifying" });
    try {
      const res = await api.post("/api/leads/bulk-qualify", { lead_ids: ids, depth });
      setBulkProgress(null);
      toast(`Qualified ${res.processed} of ${ids.length} leads`, "success");
      setSelected(new Set());
      onRefresh();
    } catch (e: unknown) {
      setBulkProgress(null);
      toast((e instanceof Error ? e.message : "Bulk qualify failed"), "error");
    }
  };

  const runBulkPOC = async (mode: POCMode) => {
    if (!bulkPocModal) return;
    const ids = bulkPocModal.ids;
    setBulkPocModal(null);
    setBulkProgress({ current: 0, total: ids.length, action: mode === "decision_maker" ? "Finding Decision Makers" : "Finding Company Emails" });
    try {
      const res = await api.post("/api/leads/bulk-find-poc", { lead_ids: ids, mode });
      setBulkProgress(null);
      toast(`Found POC for ${res.processed} of ${ids.length} leads`, "success");
      setSelected(new Set());
      onRefresh();
    } catch (e: unknown) {
      setBulkProgress(null);
      toast((e instanceof Error ? e.message : "Bulk POC failed"), "error");
    }
  };

  const exportCSV = async () => {
    const url = api.exportUrl(selected.size > 0 ? Array.from(selected) : undefined);
    try {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) { toast("Export failed", "error"); return; }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "poc_export.csv";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      toast("Export failed", "error");
    }
  };

  if (isLoading) {
    return (
      <div>
        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 36, flex: 1 }} />)}
        </div>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {[...Array(8)].map((_, i) => (
            <div key={i} style={{ display: "flex", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
              {[80,160,120,100,80,60].map((w, j) => (
                <div key={j} className="skeleton" style={{ height: 14, width: w }} />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* POC Mode Modal — single lead */}
      {pocModal && (
        <POCModeModal
          leadName={pocModal.leadName}
          onConfirm={(mode) => findPOC(pocModal.leadId, mode)}
          onClose={() => { setPocModal(null); setOpenMenu(null); }}
        />
      )}
      {/* POC Mode Modal — bulk */}
      {bulkPocModal && (
        <POCModeModal
          leadName={`${bulkPocModal.ids.length} selected leads`}
          onConfirm={runBulkPOC}
          onClose={() => setBulkPocModal(null)}
        />
      )}
      {/* Filters */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input
          className="input"
          placeholder="Search by name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: 220 }}
          id="lead-search"
        />
        <select className="input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ maxWidth: 150 }} id="status-filter">
          <option value="">All Status</option>
          <option value="new">New</option>
          <option value="poc_found">POC Found</option>
          <option value="qualified">Qualified</option>
        </select>
        <select className="input" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{ maxWidth: 180 }} id="category-filter">
          <option value="">All Categories</option>
          {categories.map(c => <option key={c} value={c!}>{c}</option>)}
        </select>
        <span style={{ fontSize: 12, color: "var(--text-secondary)", marginLeft: "auto" }}>
          Showing {filtered.length} of {total} leads
        </span>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="animate-fade-in" style={{
          background: "var(--accent-muted)", border: "1px solid rgba(59,130,246,0.3)",
          borderRadius: 10, padding: "10px 16px", display: "flex", gap: 10, alignItems: "center"
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#60a5fa" }}>{selected.size} selected</span>
          <div style={{ flex: 1 }} />
          <button className="btn btn-sm btn-secondary" onClick={() => bulkAction("poc")} id="bulk-find-poc">
            <UserSearch size={13} /> Find POC for {selected.size}
          </button>
          <button className="btn btn-sm btn-secondary" onClick={() => bulkAction("qualify")} id="bulk-qualify">
            <Brain size={13} /> Qualify {selected.size}
          </button>
          <button className="btn btn-sm btn-secondary" onClick={exportCSV} id="bulk-export">
            <Download size={13} /> Export CSV
          </button>
          <button className="btn btn-sm btn-danger" onClick={() => bulkAction("delete")} id="bulk-delete">
            <Trash2 size={13} /> Delete
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {/* Bulk progress */}
      {bulkProgress && (
        <div className="warning-banner animate-fade-in" style={{ background: "var(--accent-muted)", borderColor: "rgba(59,130,246,0.3)", color: "#60a5fa" }}>
          <Loader2 size={15} className="animate-spin" />
          {bulkProgress.action} {bulkProgress.current} of {bulkProgress.total} leads…
        </div>
      )}

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 36, textAlign: "center" }}>
                  <input type="checkbox" className="checkbox"
                    checked={filtered.length > 0 && selected.size === filtered.length}
                    onChange={toggleAll} id="select-all"
                  />
                </th>
                <th>Business</th>
                <th>Category</th>
                <th>Address</th>
                <th>Phone</th>
                <th>Website</th>
                <th>Rating</th>
                <th>Reviews</th>
                <th>Status</th>
                <th style={{ width: 50 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: "center", padding: "48px 16px", color: "var(--text-secondary)" }}>
                    No leads match your filters
                  </td>
                </tr>
              ) : filtered.map(lead => (
                <tr
                  key={lead.id}
                  className={selected.has(lead.id) ? "selected" : ""}
                  onClick={() => onLeadClick(lead)}
                >
                  <td style={{ textAlign: "center" }} onClick={e => { e.stopPropagation(); toggleSelect(lead.id); }}>
                    <input type="checkbox" className="checkbox" checked={selected.has(lead.id)} onChange={() => toggleSelect(lead.id)} />
                  </td>
                  <td>
                    <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{lead.business_name}</span>
                    {(lead.contact_count ?? 0) > 0 && (
                      <span style={{ marginLeft: 6, fontSize: 10, color: "#4ade80" }}>• {lead.contact_count} contacts</span>
                    )}
                  </td>
                  <td>
                    {lead.category ? <span className="badge badge-new" style={{ fontSize: 10 }}>{lead.category}</span> : <span style={{ color: "var(--text-muted)" }}>—</span>}
                  </td>
                  <td>
                    <span title={lead.address || ""} style={{ color: "var(--text-secondary)", fontSize: 12 }}>
                      {truncate(lead.address, 38)}
                    </span>
                  </td>
                  <td>
                    {lead.phone
                      ? <a href={`tel:${lead.phone}`} className="mono" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }} onClick={e => e.stopPropagation()}>{lead.phone}</a>
                      : <span style={{ color: "var(--text-muted)" }}>—</span>}
                  </td>
                  <td>
                    {lead.website
                      ? <a href={lead.website} target="_blank" rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>
                          {extractDomain(lead.website)} <ExternalLink size={10} />
                        </a>
                      : <span style={{ color: "var(--text-muted)" }}>—</span>}
                  </td>
                  <td>
                    {lead.rating != null
                      ? <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <Star size={12} fill="#f59e0b" color="#f59e0b" /> {lead.rating.toFixed(1)}
                        </span>
                      : <span style={{ color: "var(--text-muted)" }}>—</span>}
                  </td>
                  <td style={{ color: "var(--text-secondary)", fontSize: 12 }}>{lead.review_count ?? "—"}</td>
                  <td><StatusBadge status={lead.status} /></td>
                  <td style={{ position: "relative" }} onClick={e => e.stopPropagation()}>
                    {(actionLoading[lead.id]) ? (
                      <Loader2 size={15} className="animate-spin" style={{ color: "var(--accent)" }} />
                    ) : (
                      <>
                        <button className="btn btn-ghost btn-icon" onClick={() => setOpenMenu(openMenu === lead.id ? null : lead.id)}>
                          <MoreHorizontal size={15} />
                        </button>
                        {openMenu === lead.id && (
                          <div className="dropdown-menu">
                            <button className="dropdown-item" onClick={() => { setOpenMenu(null); setPocModal({ leadId: lead.id, leadName: lead.business_name }); }}>
                              <UserSearch size={13} /> Find POC
                            </button>
                            <button className="dropdown-item" onClick={() => { setOpenMenu(null); setQualifyModal({ leadId: lead.id, leadName: lead.business_name }); }}>
                              <Brain size={13} /> Qualify Lead (AI)
                            </button>
                            <div className="divider" style={{ margin: "4px 0" }} />
                            <button className="dropdown-item danger" onClick={() => deleteLead(lead.id)}>
                              <Trash2 size={13} /> Delete
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
          borderTop: "1px solid var(--border)", background: "var(--surface)"
        }}>
          <select className="input" value={limit} onChange={e => onLimitChange(Number(e.target.value))} style={{ width: 80 }} id="page-limit">
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <span style={{ fontSize: 12, color: "var(--text-secondary)", flex: 1 }}>
            Page {page} of {totalPages || 1}
          </span>
          <button className="btn btn-secondary btn-sm" onClick={() => onPageChange(page - 1)} disabled={page <= 1} id="prev-page">
            <ChevronLeft size={14} /> Previous
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} id="next-page">
            Next <ChevronRight size={14} />
          </button>
          <button className="btn btn-secondary btn-sm" onClick={exportCSV} id="export-all-csv">
            <Download size={13} /> Export All
          </button>
        </div>
      </div>
      {/* Single qualify mode modal */}
      {qualifyModal && (
        <QualifyModeModal
          leadName={qualifyModal.leadName}
          onConfirm={(depth) => qualifyLead(qualifyModal.leadId, depth)}
          onClose={() => setQualifyModal(null)}
        />
      )}
      {/* Bulk qualify mode modal */}
      {bulkQualifyModal && (
        <QualifyModeModal
          leadName=""
          isBulk
          count={bulkQualifyModal.ids.length}
          onConfirm={runBulkQualify}
          onClose={() => setBulkQualifyModal(null)}
        />
      )}
    </div>
  );
}
