"use client";
import { useState, useEffect } from "react";
import { X, ExternalLink, Phone, Mail, Link2, UserSearch, Brain, MapPin, Star, Copy, Loader2 } from "lucide-react";
import { Lead, Contact, Qualification, api } from "./api";
import { useToast } from "./Toast";
import POCModeModal, { POCMode } from "./POCModeModal";
import QualifyModeModal, { QualifyDepth } from "./QualifyModeModal";

function ScoreBar({ score }: { score?: number | null }) {
  if (score == null) return null;
  const cls = score >= 7 ? "progress-green" : score >= 4 ? "progress-yellow" : "progress-red";
  const color = score >= 7 ? "#22c55e" : score >= 4 ? "#f59e0b" : "#ef4444";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>Score</span>
        <span style={{ fontWeight: 800, fontSize: 20, color }}>{score}<span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 400 }}>/10</span></span>
      </div>
      <div className="progress-bar">
        <div className={`progress-fill ${cls}`} style={{ width: `${score * 10}%` }} />
      </div>
    </div>
  );
}

function ContactCard({ contact }: { contact: Contact }) {
  const toast = useToast();
  const copy = (text: string) => { navigator.clipboard.writeText(text); toast("Copied!", "success"); };
  const sourceLabel = contact.source === "apollo" ? "via Apollo" : contact.source === "openai" ? "via AI Search" : "via Web";
  const badgeCls = contact.source === "apollo" ? "badge-apollo" : "badge-openai";

  return (
    <div className="contact-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <p style={{ fontWeight: 600, fontSize: 14 }}>{contact.name || "Unknown"}</p>
          {contact.title && <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{contact.title}</p>}
        </div>
        <span className={`badge ${badgeCls}`} style={{ fontSize: 10 }}>{sourceLabel}</span>
      </div>
      {contact.email && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Mail size={12} color="var(--text-muted)" />
          <span className="mono" style={{ fontSize: 12, color: "var(--text-secondary)", flex: 1 }}>{contact.email}</span>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => copy(contact.email!)} title="Copy email">
            <Copy size={11} />
          </button>
        </div>
      )}
      {contact.linkedin_url && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Link2 size={12} color="var(--text-muted)" />
          <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none", flex: 1 }}>
            {contact.linkedin_url.replace("https://", "")}
          </a>
        </div>
      )}
      {contact.phone && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Phone size={12} color="var(--text-muted)" />
          <a href={`tel:${contact.phone}`} className="mono" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>{contact.phone}</a>
        </div>
      )}
    </div>
  );
}

function QualCard({ qual }: { qual: Qualification }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <ScoreBar score={qual.score} />
      {qual.summary && (
        <div>
          <p style={{ fontSize: 11, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600, marginBottom: 6 }}>Summary</p>
          <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text-primary)" }}>{qual.summary}</p>
        </div>
      )}
      {qual.size && (
        <div>
          <p style={{ fontSize: 11, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600, marginBottom: 4 }}>Size</p>
          <p style={{ fontSize: 13, color: "var(--text-primary)" }}>{qual.size}</p>
        </div>
      )}
      {qual.reasoning && (
        <div>
          <p style={{ fontSize: 11, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600, marginBottom: 4 }}>Reasoning</p>
          <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text-secondary)" }}>{qual.reasoning}</p>
        </div>
      )}
      {qual.recent_news && (
        <div style={{ background: "var(--surface-2)", borderRadius: 8, padding: "10px 14px" }}>
          <p style={{ fontSize: 11, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600, marginBottom: 4 }}>Recent News</p>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>{qual.recent_news}</p>
        </div>
      )}
    </div>
  );
}

interface LeadDrawerProps {
  lead: Lead | null;
  onClose: () => void;
  onRefresh: () => void;
}

export default function LeadDrawer({ lead, onClose, onRefresh }: LeadDrawerProps) {
  const toast = useToast();
  const [tab, setTab] = useState<"contacts" | "qualification">("contacts");
  const [detail, setDetail] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<"poc" | "qualify" | null>(null);
  const [showModeModal, setShowModeModal] = useState(false);
  const [showQualifyModal, setShowQualifyModal] = useState(false);

  useEffect(() => {
    if (!lead) return;
    setDetail(null);
    setLoading(true);
    api.get(`/api/leads/${lead.id}`)
      .then(setDetail)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [lead?.id]);

  if (!lead) return null;

  const current = detail || lead;
  const contacts = detail?.contacts || [];
  const qualifications = detail?.qualifications || [];

  const findPOC = async (mode: POCMode) => {
    setShowModeModal(false);
    setActionLoading("poc");
    try {
      const res = await api.post(`/api/leads/${lead.id}/find-poc`, { mode });
      const count = res.contacts?.length ?? 0;
      toast(count > 0 ? `Found ${count} contact${count !== 1 ? "s" : ""}` : "No contacts found", count > 0 ? "success" : "info");
      onRefresh();
      const updated = await api.get(`/api/leads/${lead.id}`);
      setDetail(updated);
      setTab("contacts");
    } catch (e: unknown) {
      toast((e instanceof Error ? e.message : "Failed"), "error");
    } finally { setActionLoading(null); }
  };

  const qualifyLead = async (depth: QualifyDepth) => {
    setShowQualifyModal(false);
    setActionLoading("qualify");
    try {
      await api.post(`/api/leads/${lead.id}/qualify`, { depth });
      toast(`Lead qualified! (${depth === "deep" ? "In-Depth" : "Normal"} analysis)`, "success");
      onRefresh();
      const updated = await api.get(`/api/leads/${lead.id}`);
      setDetail(updated);
      setTab("qualification");
    } catch (e: unknown) {
      toast((e instanceof Error ? e.message : "Failed"), "error");
    } finally { setActionLoading(null); }
  };

  return (
    <>
      {showModeModal && (
        <POCModeModal
          leadName={current.business_name}
          onConfirm={findPOC}
          onClose={() => setShowModeModal(false)}
        />
      )}
      {showQualifyModal && (
        <QualifyModeModal
          leadName={current.business_name}
          onConfirm={qualifyLead}
          onClose={() => setShowQualifyModal(false)}
        />
      )}
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer animate-slide-in-right">
        {/* Header */}
        <div style={{ padding: "20px 20px 0", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>{current.business_name}</h2>
              {current.category && <span className="badge badge-new" style={{ fontSize: 11 }}>{current.category}</span>}
            </div>
            <button className="btn btn-ghost btn-icon" onClick={onClose} id="close-drawer"><X size={17} /></button>
          </div>

          {/* Info grid */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 16 }}>
            {current.address && (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <MapPin size={13} color="var(--text-muted)" style={{ marginTop: 2, flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{current.address}</span>
              </div>
            )}
            {current.phone && (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Phone size={13} color="var(--text-muted)" />
                <a href={`tel:${current.phone}`} className="mono" style={{ fontSize: 13, color: "var(--accent)", textDecoration: "none" }}>{current.phone}</a>
              </div>
            )}
            {current.website && (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <ExternalLink size={13} color="var(--text-muted)" />
                <a href={current.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: "var(--accent)", textDecoration: "none" }}>{current.website}</a>
              </div>
            )}
            {current.rating != null && (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Star size={13} fill="#f59e0b" color="#f59e0b" />
                <span style={{ fontSize: 13 }}>{current.rating.toFixed(1)} ({current.review_count} reviews)</span>
              </div>
            )}
            {current.maps_url && (
              <a href={current.maps_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
                View on Google Maps <ExternalLink size={10} />
              </a>
            )}
          </div>

          {/* Tabs */}
          <div className="tab-list">
            <button className={`tab ${tab === "contacts" ? "active" : ""}`} onClick={() => setTab("contacts")}>
              Contacts {contacts.length > 0 && `(${contacts.length})`}
            </button>
            <button className={`tab ${tab === "qualification" ? "active" : ""}`} onClick={() => setTab("qualification")}>
              Qualification {qualifications.length > 0 && `✓`}
            </button>
          </div>
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[1,2].map(i => <div key={i} className="skeleton" style={{ height: 100 }} />)}
            </div>
          ) : tab === "contacts" ? (
            contacts.length > 0
              ? <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {contacts.map(c => <ContactCard key={c.id} contact={c} />)}
                </div>
              : <div style={{ textAlign: "center", padding: "48px 20px" }}>
                  <UserSearch size={36} color="var(--text-muted)" style={{ margin: "0 auto 12px" }} />
                  <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>No contacts found yet</p>
                  <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 4 }}>Click "Find POC" to search Apollo for contacts</p>
                </div>
          ) : (
            qualifications.length > 0
              ? <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {qualifications.map(q => <QualCard key={q.id} qual={q} />)}
                </div>
              : <div style={{ textAlign: "center", padding: "48px 20px" }}>
                  <Brain size={36} color="var(--text-muted)" style={{ margin: "0 auto 12px" }} />
                  <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Not qualified yet</p>
                  <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 4 }}>Click "Qualify Lead" to get an AI analysis</p>
                </div>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ padding: "16px 20px", borderTop: "1px solid var(--border)", display: "flex", gap: 10 }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setShowModeModal(true)} disabled={!!actionLoading} id="drawer-find-poc">
            {actionLoading === "poc" ? <><Loader2 size={14} className="animate-spin" /> Finding…</> : <><UserSearch size={14} /> Find POC</>}
          </button>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowQualifyModal(true)} disabled={!!actionLoading} id="drawer-qualify">
            {actionLoading === "qualify" ? <><Loader2 size={14} className="animate-spin" /> Qualifying…</> : <><Brain size={14} /> Qualify Lead</>}
          </button>
        </div>
      </div>
    </>
  );
}
