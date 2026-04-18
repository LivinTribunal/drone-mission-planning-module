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
          {error && (
            <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-tv-error/10 border border-tv-error/20">
              <svg className="h-4 w-4 flex-shrink-0 text-tv-error" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-sm text-tv-error">
                {t("auth.wrongCredentials")}
              </span>
            </div>
          )}
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
