import { useCallback, useEffect, useState } from "react";
import { callTauri } from "../api/tauri";
import { BrandLogo } from "./BrandLogo";
import type { LoginResult, UserInfo } from "../types";

interface LoginScreenProps {
  onLogin: (user: UserInfo) => void;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");

      if (!username.trim()) {
        setError("الرجاء إدخال اسم المستخدم");
        return;
      }
      if (!password.trim()) {
        setError("الرجاء إدخال كلمة المرور");
        return;
      }

      setLoading(true);
      try {
        const result = await callTauri<LoginResult>("login", {
          username: username.trim(),
          password: password.trim(),
        });

        if (result.success && result.user) {
          onLogin(result.user);
        } else {
          setError(result.error || "فشل تسجيل الدخول");
        }
      } catch (err) {
        setError("حدث خطأ أثناء تسجيل الدخول");
        console.error(err);
      } finally {
        setLoading(false);
      }
    },
    [username, password, onLogin],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Enter" && !loading) {
        handleLogin(e as unknown as React.FormEvent);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleLogin, loading]);

  return (
    <div className="login-screen">
      <div className="login-screen__bg">
        <div className="app-bg__mesh" />
        <div className="app-bg__orb app-bg__orb--1" />
        <div className="app-bg__orb app-bg__orb--2" />
        <div className="app-bg__orb app-bg__orb--3" />
        <div className="app-bg__reflection" />
      </div>
      <div className="login-screen__overlay" />
      <div className="login-screen__card">
        <div className="login-screen__header">
          <div style={{ display: "flex", justifyContent: "center" }}>
            <BrandLogo size="lg" />
          </div>
          <h1>شركة فجر الوادي</h1>
          <p>نظام إدارة السيارات والحسابات</p>
        </div>
        <form className="login-screen__form" onSubmit={handleLogin}>
          <div className="login-screen__field">
            <label htmlFor="login-username">اسم المستخدم</label>
            <input
              id="login-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="أدخل اسم المستخدم"
              autoFocus
              autoComplete="username"
              dir="auto"
              data-testid="login-username"
            />
          </div>
          <div className="login-screen__field">
            <label htmlFor="login-password">كلمة المرور</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="أدخل كلمة المرور"
              autoComplete="current-password"
              dir="auto"
              data-testid="login-password"
            />
          </div>
          {error && <div className="login-screen__error">{error}</div>}
          <button
            type="submit"
            className="login-screen__button"
            disabled={loading}
            data-testid="login-submit"
          >
            {loading ? "جاري تسجيل الدخول..." : "تسجيل الدخول"}
          </button>
        </form>
      </div>
    </div>
  );
}
