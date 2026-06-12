"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { usernameToEmail } from "@/lib/username";

const card: React.CSSProperties = {
  background: "var(--pitch-900)",
  border: "1px solid var(--pitch-line)",
  borderRadius: 16,
  padding: 26,
};

const field: React.CSSProperties = {
  width: "100%",
  background: "var(--pitch-950)",
  border: "1px solid var(--pitch-line)",
  borderRadius: 9,
  color: "var(--chalk)",
  padding: "11px 12px",
  fontSize: 15,
};

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 13.5,
  fontWeight: 600,
};

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [formErr, setFormErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormErr(null);
    if (username.trim() === "" || password === "") {
      setFormErr("Enter your username and password.");
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    });
    setBusy(false);

    if (error) {
      setFormErr("Wrong username or password.");
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main style={{ maxWidth: 440, margin: "0 auto", padding: "8vh 22px 60px" }}>
      <div className="stripe-26" style={{ borderRadius: 99, marginBottom: 22 }} />
      <p
        style={{
          color: "var(--gold-400)",
          letterSpacing: "0.18em",
          fontSize: 11.5,
          fontWeight: 700,
        }}
      >
        WC 2026 PREDICTIONS
      </p>
      <h1 className="display" style={{ fontSize: 34, lineHeight: 1.05, margin: "8px 0 20px" }}>
        Welcome back
      </h1>

      <form onSubmit={onSubmit} style={card} noValidate>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <label style={labelStyle}>
            Username
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username"
              style={field}
            />
          </label>

          <label style={labelStyle}>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              style={field}
            />
          </label>

          {formErr && (
            <p style={{ color: "var(--m3)", fontSize: 13.5, fontWeight: 600, margin: 0 }}>
              {formErr}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            style={{
              background: "var(--gold-400)",
              color: "#1a1206",
              border: "none",
              borderRadius: 10,
              padding: "12px 18px",
              fontWeight: 700,
              fontSize: 15,
              cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? "Logging in…" : "Log in"}
          </button>
        </div>
      </form>

      <p style={{ color: "var(--chalk-dim)", fontSize: 14, marginTop: 18, textAlign: "center" }}>
        New here?{" "}
        <Link href="/signup" style={{ color: "var(--gold-300)", fontWeight: 600 }}>
          Create an account
        </Link>
      </p>
    </main>
  );
}
