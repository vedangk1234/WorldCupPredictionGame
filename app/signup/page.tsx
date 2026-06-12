"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  normalizeUsername,
  usernameToEmail,
  validateName,
  validateUsername,
} from "@/lib/username";

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

function fieldErr(text: string) {
  return (
    <span style={{ color: "var(--m3)", fontSize: 12.5, fontWeight: 500 }}>{text}</span>
  );
}

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const nameErr = validateName(name);
  const usernameErr = validateUsername(username);
  const passwordErr = password.length < 6 ? "Password must be at least 6 characters." : null;
  const confirmErr = confirm !== password ? "Passwords don’t match." : null;
  const valid = !nameErr && !usernameErr && !passwordErr && !confirmErr;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    setFormErr(null);
    setInfo(null);
    if (!valid) return;

    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: usernameToEmail(username),
      password,
      options: { data: { name: name.trim(), username: normalizeUsername(username) } },
    });
    setBusy(false);

    if (error) {
      const m = error.message.toLowerCase();
      if (m.includes("already") || m.includes("registered") || m.includes("exists")) {
        setFormErr("That username is taken — try another.");
      } else {
        setFormErr(error.message);
      }
      return;
    }

    if (data.session) {
      router.push("/");
      router.refresh();
    } else {
      setInfo(
        "Account created, but login is blocked — ask the admin to turn off " +
          "“Confirm email” in Supabase.",
      );
    }
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
        Create your account
      </h1>

      <form onSubmit={onSubmit} style={card} noValidate>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <label style={labelStyle}>
            Name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              style={field}
            />
            {touched && nameErr && fieldErr(nameErr)}
          </label>

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
            {touched && usernameErr ? (
              fieldErr(usernameErr)
            ) : (
              <span style={{ color: "var(--chalk-dim)", fontSize: 12 }}>
                3–20 chars · letters, numbers, underscore. No email needed.
              </span>
            )}
          </label>

          <label style={labelStyle}>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              style={field}
            />
            {touched && passwordErr && fieldErr(passwordErr)}
          </label>

          <label style={labelStyle}>
            Confirm password
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              style={field}
            />
            {touched && confirmErr && fieldErr(confirmErr)}
          </label>

          {formErr && (
            <p style={{ color: "var(--m3)", fontSize: 13.5, fontWeight: 600, margin: 0 }}>
              {formErr}
            </p>
          )}
          {info && (
            <p style={{ color: "var(--gold-300)", fontSize: 13.5, fontWeight: 600, margin: 0 }}>
              {info}
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
            {busy ? "Creating…" : "Create account"}
          </button>
        </div>
      </form>

      <p style={{ color: "var(--chalk-dim)", fontSize: 14, marginTop: 18, textAlign: "center" }}>
        Already have an account?{" "}
        <Link href="/login" style={{ color: "var(--gold-300)", fontWeight: 600 }}>
          Log in
        </Link>
      </p>
    </main>
  );
}
