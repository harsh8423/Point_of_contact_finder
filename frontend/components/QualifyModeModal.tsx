"use client";
import { useState } from "react";
import { Brain, Zap, Globe, X } from "lucide-react";

export type QualifyDepth = "normal" | "deep";

interface QualifyModeModalProps {
  leadName: string;
  isBulk?: boolean;
  count?: number;
  onConfirm: (depth: QualifyDepth) => void;
  onClose: () => void;
}

const MODES: {
  id: QualifyDepth;
  icon: React.ReactNode;
  label: string;
  badge?: string;
  description: string;
  detail: string;
  accent: string;
  accentBg: string;
}[] = [
  {
    id: "normal",
    icon: <Zap size={16} />,
    label: "Normal Analysis",
    badge: "DEFAULT",
    description:
      "Crawls the company website with Apify (if available) and feeds the content to GPT-4o. Falls back to analyzing stored lead data — no web search charges.",
    detail: "Standard token cost only · fast",
    accent: "var(--accent)",
    accentBg: "rgba(37,99,235,0.10)",
  },
  {
    id: "deep",
    icon: <Globe size={16} />,
    label: "In-Depth Analysis",
    description:
      "Uses OpenAI's live web search tool to research the company online — finds recent news, decision makers, company size, and more context beyond what's on the website.",
    detail: "web_search_preview charges apply · slower",
    accent: "#a78bfa",
    accentBg: "rgba(167,139,250,0.10)",
  },
];

export default function QualifyModeModal({
  leadName,
  isBulk,
  count,
  onConfirm,
  onClose,
}: QualifyModeModalProps) {
  const [selected, setSelected] = useState<QualifyDepth>("normal");

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
        boxShadow: "var(--shadow-lg)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Brain size={16} color="var(--accent)" />
              <h2 style={{ fontSize: 17, fontWeight: 700 }}>
                {isBulk ? `Qualify ${count} Leads` : "Qualify Lead"}
              </h2>
            </div>
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {isBulk ? `${count} leads selected` : leadName}
            </p>
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
                id={`qualify-mode-${mode.id}`}
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
                  background: isSelected ? mode.accentBg : "var(--surface-3)",
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
                        background: "rgba(37,99,235,0.15)", color: "var(--accent)",
                        fontWeight: 700, letterSpacing: "0.4px",
                      }}>{mode.badge}</span>
                    )}
                    {mode.id === "deep" && (
                      <span style={{
                        fontSize: 9.5, padding: "2px 6px", borderRadius: 99,
                        background: "rgba(167,139,250,0.15)", color: "#a78bfa",
                        fontWeight: 700, letterSpacing: "0.4px",
                      }}>PAID</span>
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
            id="qualify-modal-confirm"
            className="btn btn-primary"
            style={{
              flex: 2,
              background: selected === "deep"
                ? "linear-gradient(135deg,#7c3aed,#a78bfa)"
                : undefined,
              borderColor: selected === "deep" ? "#7c3aed" : undefined,
            }}
            onClick={() => onConfirm(selected)}
          >
            {selected === "deep" ? <Globe size={14} /> : <Brain size={14} />}
            {selected === "deep" ? "Run Deep Analysis" : "Run Normal Analysis"}
          </button>
        </div>
      </div>
    </>
  );
}
