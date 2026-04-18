import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import type { UserRole } from "@/types/enums";

const ROLE_LEVEL: Record<string, number> = {
  OPERATOR: 1,
  COORDINATOR: 2,
  SUPER_ADMIN: 3,
};

interface ProtectedRouteProps {
  requiredRole?: UserRole;
}

export default function ProtectedRoute({ requiredRole }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (
    requiredRole &&
    (ROLE_LEVEL[user?.role ?? ""] ?? 0) < ROLE_LEVEL[requiredRole]
  ) {
    const defaultRoute =
      (ROLE_LEVEL[user?.role ?? ""] ?? 0) >= ROLE_LEVEL.COORDINATOR
        ? "/coordinator-center/airports"
        : "/operator-center/dashboard";
    return <Navigate to={defaultRoute} replace />;
  }

  return <Outlet />;
}
