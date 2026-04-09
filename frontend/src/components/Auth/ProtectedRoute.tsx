import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import type { UserRole } from "@/types/enums";

interface ProtectedRouteProps {
  requiredRole?: UserRole;
}

const ROLE_HIERARCHY: Record<UserRole, UserRole[]> = {
  OPERATOR: ["OPERATOR", "COORDINATOR", "SUPER_ADMIN"],
  COORDINATOR: ["COORDINATOR", "SUPER_ADMIN"],
  SUPER_ADMIN: ["SUPER_ADMIN"],
};

export function getDefaultRoute(role: UserRole): string {
  if (role === "SUPER_ADMIN") return "/super-admin/users";
  if (role === "COORDINATOR") return "/coordinator-center/airports";
  return "/operator-center/dashboard";
}

export default function ProtectedRoute({ requiredRole }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-8 w-8 border-4 border-tv-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && user?.role) {
    const allowed = ROLE_HIERARCHY[requiredRole] || [];
    if (!allowed.includes(user.role)) {
      return <Navigate to={getDefaultRoute(user.role)} replace />;
    }
  }

  return <Outlet />;
}
