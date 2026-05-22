"use client";
import { useState } from "react";
import { UserSearch, Building2, X, Zap, Users, Search, Globe } from "lucide-react";

export type POCMode = "apify_leads" | "web_crawl" | "decision_maker" | "company";

interface POCModeModalProps {
  leadName: string;
  onConfirm: (mode: POCMode) => void;
  onClose: () => void;
}

const MODES: {
  id: POCMode;
  icon: React.ReactNode;
  label: string;
  badge?: string;
  description: string;
  detail: string;
  accent: string;
  accentBg: string;
}[] = [
  {
    id: "apify_leads",
    icon: <Search size={16} />,
    label: "Apify Leads Finder",
    badge: "DEFAULT",
    description:
      "Finds up to 5 verified decision makers (Founder/CEO/Director/Manager) from the company domain — LinkedIn, job title, headline, industry, and verified email.",
    detail: "Leads Finder + Email Verifier · only verified emails kept",
    accent: "#a78bfa",
    accentBg: "rgba(167,139,250,0.10)",
  },
  {
    id: "web_crawl",
    icon: <Globe size={16} />,
    label: "Website Crawler",
    badge: "FREE",
    description:
      "Crawls the company's own website pages (contact, team, about) to extract emails, phone numbers, employee cards, and social profiles — no API credits consumed.",
    detail: "aiohttp · Playwright fallback for JS sites · no external API",
    accent: "#22c55e",
    accentBg: "rgba(34,197,94,0.09)",
  },
  {
    id: "decision_maker",
    icon: <Zap size={16} />,
    label: "AnyMailFinder — Decision Maker",
    description:
      "Finds the CEO, Founder, or key manager with their name, verified email, and LinkedIn via AnyMailFinder.",
    detail: "2 credits · only charged on valid find",
    accent: "var(--accent)",
    accentBg: "rgba(59,130,246,0.08)",
  },
  {
    id: "company",
    icon: <Users size={16} />,
    label: "AnyMailFinder — Company Emails",
    description:
      "Fetches up to 20 email addresses associated with the company domain.",
    detail: "1 credit · up to 20 emails returned",
    accent: "var(--accent)",
    accentBg: "rgba(59,130,246,0.08)",
  },
];

export default function POCModeModal({ leadName, onConfirm, onClose }: POCModeModalProps) {
  const [selected, setSelected] = useState<POCMode>("apify_leads");

  const selectedMeta = MODES.find((m) => m.id === selected)!;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(4px)",
          zIndex: 200,
        }}
      />

      {/* Modal */}
      <div style={{
        position: "fixed",
        top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 201,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        padding: 28,
        width: 460,
        maxWidth: "calc(100vw - 32px)",
        boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Find Point of Contact</h2>
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{leadName}</p>
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}><X size={15} /></button>
        </div>

        {/* Options */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
          {MODES.map((mode) => {
            const isSelected = selected === mode.id;
            return (
              <button
                key={mode.id}
                id={`mode-${mode.id}`}
                onClick={() => setSelected(mode.id)}
                style={{
                  display: "flex", gap: 14, alignItems: "flex-start",
                  padding: "13px 15px",
                  borderRadius: 10,
                  border: `2px solid ${isSelected ? mode.accent : "var(--border)"}`,
                  background: isSelected ? mode.accentBg : "var(--surface-2)",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.15s",
                  width: "100%",
                }}
              >
                <div style={{
                  width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                  background: isSelected ? `${mode.accentBg}` : "var(--surface-3)",
                  border: `1px solid ${isSelected ? mode.accent : "transparent"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: isSelected ? mode.accent : "var(--text-muted)",
                  transition: "all 0.15s",
                }}>
                  {mode.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3, flexWrap: "wrap" }}>
                    <p style={{ fontWeight: 600, fontSize: 13.5 }}>{mode.label}</p>
                    {mode.badge && (
                      <span style={{
                        fontSize: 9.5, padding: "2px 6px", borderRadius: 99,
                        background: "rgba(167,139,250,0.18)", color: "#a78bfa",
                        fontWeight: 700, letterSpacing: "0.4px",
                      }}>{mode.badge}</span>
                    )}
                  </div>
                  <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: 4 }}>
                    {mode.description}
                  </p>
                  <p style={{ fontSize: 11, color: "var(--text-muted)" }}>{mode.detail}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button
            id="poc-modal-confirm"
            className="btn btn-primary"
            style={{
              flex: 2,
              background: selected === "apify_leads"
                ? "linear-gradient(135deg,#7c3aed,#a78bfa)"
                : selected === "web_crawl"
                ? "linear-gradient(135deg,#16a34a,#22c55e)"
                : undefined,
              borderColor: selected === "apify_leads"
                ? "#7c3aed"
                : selected === "web_crawl"
                ? "#16a34a"
                : undefined,
            }}
            onClick={() => onConfirm(selected)}
          >
            <UserSearch size={14} />
            {selected === "apify_leads"
              ? "Find with Apify Leads"
              : selected === "web_crawl"
              ? "Crawl Website"
              : selected === "decision_maker"
              ? "Find Decision Maker"
              : "Find Company Emails"}
          </button>
        </div>
      </div>
    </>
  );
}
