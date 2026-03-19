import { useState, type FormEvent } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  if (isAuthenticated) {
    return <Navigate to="/operator-center/dashboard" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await login(email, password);
      navigate("/operator-center/dashboard");
    } catch {
      setError("Login failed");
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-[var(--color-bg)]">
      <div className="w-full max-w-sm p-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
        <h1 className="text-2xl font-bold text-center mb-6 text-[var(--color-accent)]">
          TarmacView
        </h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div className="text-red-500 text-sm text-center">{error}</div>
          )}
          <div>
            <label
              htmlFor="email"
              className="block text-sm mb-1 text-[var(--color-text-muted)]"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 rounded border border-[var(--color-border)]
                bg-[var(--color-bg)] text-[var(--color-text)]
                focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              data-testid="email-input"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-sm mb-1 text-[var(--color-text-muted)]"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 rounded border border-[var(--color-border)]
                bg-[var(--color-bg)] text-[var(--color-text)]
                focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              data-testid="password-input"
            />
          </div>
          <button
            type="submit"
            className="w-full py-2 rounded bg-[var(--color-accent)] text-white font-medium
              hover:opacity-90 transition-opacity"
            data-testid="login-button"
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
