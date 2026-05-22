"use client";
import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";
import { Zap, Mail, Lock, User, Loader2, Sun, Moon, Eye, EyeOff } from "lucide-react";

export default function SignupPage() {
  const { register } = useAuth();
  const { theme, toggle } = useTheme();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(username, email, password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--bg)", padding: 20, position: "relative",
    }}>
      <button className="theme-toggle" onClick={toggle} style={{ position: "absolute", top: 20, right: 20 }} title="Toggle theme">
        {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
      </button>

      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, margin: "0 auto 12px",
            background: "linear-gradient(135deg, #3b82f6, #6366f1)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Zap size={24} color="white" fill="white" />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Create your account</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Start finding leads with POC Finder</p>
        </div>

        {/* Plan info */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {[
            { label: "Free Trial", desc: "5 searches/day", color: "#60a5fa" },
            { label: "Pro", desc: "10 searches/day", color: "#a78bfa" },
            { label: "Max", desc: "25 searches/day", color: "#34d399" },
          ].map(p => (
            <div key={p.label} style={{
              flex: 1, padding: "10px 8px", borderRadius: 10, textAlign: "center",
              background: "var(--surface-2)", border: "1px solid var(--border)",
            }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: p.color, marginBottom: 2 }}>{p.label}</p>
              <p style={{ fontSize: 10, color: "var(--text-muted)" }}>{p.desc}</p>
            </div>
          ))}
        </div>

        <div className="card" style={{ padding: 28 }}>
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Username</label>
              <div style={{ position: "relative" }}>
                <User size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                <input id="signup-username" type="text" className="input" required value={username}
                  onChange={e => setUsername(e.target.value)} placeholder="johndoe"
                  style={{ paddingLeft: 36 }} autoComplete="username" />
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Email</label>
              <div style={{ position: "relative" }}>
                <Mail size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                <input id="signup-email" type="email" className="input" required value={email}
                  onChange={e => setEmail(e.target.value)} placeholder="you@example.com"
                  style={{ paddingLeft: 36 }} autoComplete="email" />
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Password <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(min. 8 characters)</span></label>
              <div style={{ position: "relative" }}>
                <Lock size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                <input id="signup-password" type={showPw ? "text" : "password"} className="input" required
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" style={{ paddingLeft: 36, paddingRight: 40 }} autoComplete="new-password" />
                <button type="button" onClick={() => setShowPw(s => !s)}
                  style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}>
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {error && (
              <div style={{ padding: "10px 14px", borderRadius: 8, background: "var(--danger-muted)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171", fontSize: 13 }}>
                {error}
              </div>
            )}

            <button id="signup-submit" type="submit" className="btn btn-primary" style={{ justifyContent: "center", marginTop: 4 }} disabled={loading}>
              {loading ? <><Loader2 size={15} className="animate-spin" /> Creating account…</> : "Create Account"}
            </button>
          </form>
        </div>

        <p style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "var(--text-secondary)" }}>
          Already have an account?{" "}
          <Link href="/login" style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "none" }}>Sign in</Link>
        </p>

        <p style={{ textAlign: "center", marginTop: 8, fontSize: 11, color: "var(--text-muted)" }}>
          First account registered automatically becomes Admin
        </p>
      </div>
    </div>
  );
}
