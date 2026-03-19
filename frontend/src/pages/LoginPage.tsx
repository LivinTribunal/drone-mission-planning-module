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
    <div className="flex items-center justify-center min-h-screen bg-tv-bg">
      <div className="w-full max-w-sm p-6 rounded-2xl border border-tv-border bg-tv-surface">
        <h1 className="text-2xl font-semibold text-center mb-6 text-tv-text-primary">
          Login to TarmacView
        </h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div className="text-tv-error text-sm text-center">{error}</div>
          )}
          <div>
            <label
              htmlFor="email"
              className="block text-xs font-medium mb-1 text-tv-text-secondary"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
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
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Enter your password"
              className="w-full px-4 py-2.5 rounded-full border border-tv-border
                bg-tv-bg text-tv-text-primary placeholder:text-tv-text-muted
                focus:outline-none focus:border-tv-accent transition-colors"
              data-testid="password-input"
            />
          </div>
          <button
            type="submit"
            className="w-full py-2.5 rounded-full bg-tv-accent text-tv-accent-text font-semibold text-sm
              hover:bg-tv-accent-hover transition-colors"
            data-testid="login-button"
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
