import { useState, type FormEvent } from "react";
import { useSearchParams, Navigate, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import client from "@/api/client";

export default function SetupPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError(t("auth.passwordTooShort"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("auth.passwordMismatch"));
      return;
    }

    setSubmitting(true);
    try {
      await client.post("/auth/setup-password", { token, password });
      navigate("/login");
    } catch {
      setError(t("auth.setupPasswordError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-tv-bg">
      <div className="w-full max-w-sm p-6 rounded-2xl border border-tv-border bg-tv-surface">
        <h1 className="text-2xl font-semibold text-center mb-6 text-tv-text-primary">
          {t("auth.setupPasswordTitle")}
        </h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div className="text-tv-error text-sm text-center">{error}</div>
          )}
          <div>
            <label
              htmlFor="password"
              className="block text-xs font-medium mb-1 text-tv-text-secondary"
            >
              {t("auth.newPassword")}
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder={t("auth.newPasswordPlaceholder")}
              className="w-full px-4 py-2.5 rounded-full border border-tv-border
                bg-tv-bg text-tv-text-primary placeholder:text-tv-text-muted
                focus:outline-none focus:border-tv-accent transition-colors"
            />
          </div>
          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-xs font-medium mb-1 text-tv-text-secondary"
            >
              {t("auth.confirmPassword")}
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              placeholder={t("auth.confirmPasswordPlaceholder")}
              className="w-full px-4 py-2.5 rounded-full border border-tv-border
                bg-tv-bg text-tv-text-primary placeholder:text-tv-text-muted
                focus:outline-none focus:border-tv-accent transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 rounded-full bg-tv-accent text-tv-accent-text font-semibold text-sm
              hover:bg-tv-accent-hover transition-colors disabled:opacity-50"
          >
            {submitting ? t("auth.settingUp") : t("auth.setPassword")}
          </button>
        </form>
      </div>
    </div>
  );
}
