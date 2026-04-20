import { useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import type { UserRole } from "@/types/enums";

const STORAGE_KEY = "tarmacview_lastPath";

const IGNORED_PATHS = ["/login", "/setup-password", "/maintenance"];

const ROLE_PREFIX: Record<UserRole, string> = {
  OPERATOR: "/operator-center",
  COORDINATOR: "/coordinator-center",
  SUPER_ADMIN: "/super-admin",
};

const ROLE_DEFAULT: Record<UserRole, string> = {
  OPERATOR: "/operator-center/dashboard",
  COORDINATOR: "/coordinator-center/airports",
  SUPER_ADMIN: "/super-admin/users",
};

export function getDefaultPathForRole(role: UserRole): string {
  return ROLE_DEFAULT[role] ?? ROLE_DEFAULT.OPERATOR;
}

export function getLastVisitedPath(role: UserRole): string | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    const prefix = ROLE_PREFIX[role];
    if (prefix && saved.startsWith(prefix)) return saved;
    return null;
  } catch {
    return null;
  }
}

export function useLastVisitedPath(): void {
  const location = useLocation();

  const savePath = useCallback((pathname: string) => {
    if (IGNORED_PATHS.some((p) => pathname.startsWith(p))) return;
    if (pathname === "/") return;
    try {
      localStorage.setItem(STORAGE_KEY, pathname);
    } catch {
      // storage full or unavailable
    }
  }, []);

  useEffect(() => {
    savePath(location.pathname);
  }, [location.pathname, savePath]);
}
