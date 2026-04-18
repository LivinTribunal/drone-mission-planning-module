import { useState, type FormEvent } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";

const AIRPORT_STORAGE_KEY = "tarmacview_airport";

function getPostLoginPath(): string {
  const remembered = localStorage.getItem(AIRPORT_STORAGE_KEY);
  return remembered
    ? "/operator-center/dashboard"
    : "/operator-center/airport-selection";
}

export default function LoginPage() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (isLoading) {
    return null;
  }

  if (isAuthenticated) {
    return <Navigate to={getPostLoginPath()} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(false);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate(getPostLoginPath());
    } catch {
      setError(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-tv-bg">
      <div className="w-full max-w-sm p-6 rounded-2xl border border-tv-border bg-tv-surface">
        <h1 className="text-2xl font-semibold text-center mb-6 text-tv-text-primary">
          {t("auth.loginTitle")}
        </h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div className="text-tv-error text-sm text-center">
              {t("auth.wrongCredentials")}
            </div>
          )}
          <div>
            <label
              htmlFor="email"
              className="block text-xs font-medium mb-1 text-tv-text-secondary"
            >
              {t("auth.email")}
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder={t("auth.emailPlaceholder")}
              className="w-full px-4 py-2.5 rounded-full border border-tv-border
                bg-tv-bg text-tv-text-primary placeholder:text-tv-text-muted
                focus:outline-none focus:border-tv-accent transition-colors"
              data-testid="email-input"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-xs font-medium mb-1 text-tv-text-secondary"
            >
              {t("auth.password")}
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder={t("auth.passwordPlaceholder")}
              className="w-full px-4 py-2.5 rounded-full border border-tv-border
                bg-tv-bg text-tv-text-primary placeholder:text-tv-text-muted
                focus:outline-none focus:border-tv-accent transition-colors"
              data-testid="password-input"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 rounded-full bg-tv-accent text-tv-accent-text font-semibold text-sm
              hover:bg-tv-accent-hover transition-colors disabled:opacity-50"
            data-testid="login-button"
          >
            {submitting ? t("auth.loggingIn") : t("auth.login")}
          </button>
        </form>
      </div>
    </div>
  );
}
