import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import type { UserRole } from "@/types/enums";

interface ProtectedRouteProps {
  requiredRole?: UserRole;
}

export default function ProtectedRoute({ requiredRole }: ProtectedRouteProps) {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && !user?.roles.includes(requiredRole)) {
    // redirect to default route - they're already authenticated
    const coordinator: UserRole = "COORDINATOR";
    const defaultRoute = user?.roles.includes(coordinator)
      ? "/coordinator-center/dashboard"
      : "/operator-center/dashboard";
    return <Navigate to={defaultRoute} replace />;
  }

  return <Outlet />;
}
