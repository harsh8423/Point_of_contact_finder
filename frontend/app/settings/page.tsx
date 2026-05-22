"use client";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Save, ArrowLeft, Key, CheckCircle, ExternalLink, Loader2, Sun, Moon } from "lucide-react";
import { api } from "@/components/api";
import { useToast } from "@/components/Toast";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";

function KeyInput({ id, label, value, onChange, placeholder, docUrl }: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  placeholder: string; docUrl: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <label htmlFor={id} style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>{label}</label>
        <a href={docUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none", display: "flex", alignItems: "center", gap: 3 }}>
          Get key <ExternalLink size={10} />
        </a>
      </div>
      <div style={{ position: "relative" }}>
        <input
          id={id}
          type={show ? "text" : "password"}
          className="input"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ paddingRight: 40 }}
        />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}
        >
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const { theme, toggle } = useTheme();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [form, setForm] = useState({
    APIFY_API_TOKEN: "",
    ANYMAILFINDER_API_KEY: "",
    OPENAI_API_KEY: "",
    DEFAULT_MAX_RESULTS: "50",
  });

  const { data } = useQuery<{ settings: Record<string, string>; missing_keys: string[] }>({
    queryKey: ["settings"],
    queryFn: () => api.get("/api/settings"),
  });

  useEffect(() => {
    if (data?.settings) {
      setForm(f => ({
        ...f,
        DEFAULT_MAX_RESULTS: data.settings.DEFAULT_MAX_RESULTS || "50",
      }));
    }
  }, [data]);

  const save = async () => {
    setSaving(true);
    try {
      await api.post("/api/settings", form);
      toast("Settings saved", "success");
      setSaved(true);
      qc.invalidateQueries({ queryKey: ["settings"] });
      setTimeout(() => setSaved(false), 3000);
    } catch (e: unknown) {
      toast((e instanceof Error ? e.message : "Save failed"), "error");
    } finally { setSaving(false); }
  };

  const set = (key: string) => (v: string) => setForm(f => ({ ...f, [key]: v }));

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", padding: "40px 24px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <Link href="/" style={{ textDecoration: "none" }}>
              <button className="btn btn-ghost btn-sm">
                <ArrowLeft size={14} /> Back to Dashboard
              </button>
            </Link>
            <button
              id="theme-toggle-settings"
              className="theme-toggle"
              onClick={toggle}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 6 }}>Settings</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Configure your API keys and preferences. Keys are stored securely in the local SQLite database.</p>
        </div>

        {/* Status */}
        {data?.missing_keys && data.missing_keys.length > 0 && (
          <div className="warning-banner" style={{ marginBottom: 20 }}>
            <Key size={14} />
            Missing API keys: {data.missing_keys.join(", ")}
          </div>
        )}

        {/* API Keys card */}
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>API Keys</h2>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>Enter your API keys below. Existing keys are masked — enter a new value to update.</p>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <KeyInput
              id="apify-token" label="Apify API Token"
              value={form.APIFY_API_TOKEN} onChange={set("APIFY_API_TOKEN")}
              placeholder="apify_api_..."
              docUrl="https://console.apify.com/settings/integrations"
            />
            <KeyInput
              id="anymailfinder-key" label="AnyMailFinder API Key"
              value={form.ANYMAILFINDER_API_KEY} onChange={set("ANYMAILFINDER_API_KEY")}
              placeholder="your_anymailfinder_key..."
              docUrl="https://newapp.anymailfinder.com/settings/api"
            />
            <KeyInput
              id="openai-key" label="OpenAI API Key"
              value={form.OPENAI_API_KEY} onChange={set("OPENAI_API_KEY")}
              placeholder="sk-..."
              docUrl="https://platform.openai.com/api-keys"
            />
          </div>
        </div>

        {/* Preferences card */}
        <div className="card" style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Preferences</h2>
          <div>
            <label htmlFor="default-max" style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
              Default Max Results per Scrape
            </label>
            <input
              id="default-max" type="number"
              className="input" style={{ maxWidth: 140 }}
              value={form.DEFAULT_MAX_RESULTS}
              onChange={e => set("DEFAULT_MAX_RESULTS")(e.target.value)}
              min={1} max={500}
            />
          </div>
        </div>

        {/* How to get keys */}
        <div className="card" style={{ marginBottom: 24, background: "var(--surface-2)" }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>How to get API keys</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { name: "Apify", desc: "Go to console.apify.com → Settings → Integrations → API Tokens", url: "https://console.apify.com/settings/integrations", cost: "Free tier available" },
              { name: "AnyMailFinder", desc: "Go to newapp.anymailfinder.com/settings/api → Copy your API key", url: "https://newapp.anymailfinder.com/settings/api", cost: "2 credits per decision maker, 1 credit per company search" },
              { name: "OpenAI", desc: "Go to platform.openai.com → API Keys → Create new key", url: "https://platform.openai.com/api-keys", cost: "Pay per use (~$0.01/qualification)" },
            ].map(k => (
              <div key={k.name} style={{ display: "flex", gap: 12, padding: "10px 14px", background: "var(--surface)", borderRadius: 8, border: "1px solid var(--border)" }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 600, fontSize: 13 }}>{k.name}</p>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{k.desc}</p>
                  <p style={{ fontSize: 11, color: "var(--success)", marginTop: 4 }}>{k.cost}</p>
                </div>
                <a href={k.url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm" style={{ alignSelf: "center", textDecoration: "none", display: "flex" }}>
                  Open <ExternalLink size={11} />
                </a>
              </div>
            ))}
          </div>
        </div>

        <button className="btn btn-primary" onClick={save} disabled={saving} id="save-settings" style={{ minWidth: 140, justifyContent: "center" }}>
          {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
            : saved ? <><CheckCircle size={14} /> Saved!</>
            : <><Save size={14} /> Save Settings</>}
        </button>
      </div>
    </div>
  );
}
