import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import Modal from "@/components/common/Modal";
import Button from "@/components/common/Button";
import { listUsers, updateUserAirports } from "@/api/admin";
import type { UserAdminResponse } from "@/types/admin";
import { X } from "lucide-react";

interface ManageUsersPanelProps {
  isOpen: boolean;
  onClose: () => void;
  airportId: string;
  airportName: string;
  onUpdated: () => void;
}

const ROLE_BADGE: Record<string, React.CSSProperties> = {
  OPERATOR: { backgroundColor: "color-mix(in srgb, var(--tv-success) 20%, transparent)", color: "var(--tv-success)" },
  COORDINATOR: { backgroundColor: "color-mix(in srgb, var(--tv-warning) 20%, transparent)", color: "var(--tv-warning)" },
  SUPER_ADMIN: { backgroundColor: "color-mix(in srgb, var(--tv-error) 20%, transparent)", color: "var(--tv-error)" },
};

export default function ManageUsersPanel({
  isOpen,
  onClose,
  airportId,
  airportName,
  onUpdated,
}: ManageUsersPanelProps) {
  const { t } = useTranslation();
  const [assignedUsers, setAssignedUsers] = useState<UserAdminResponse[]>([]);
  const [allUsers, setAllUsers] = useState<UserAdminResponse[]>([]);
  const [showAddDropdown, setShowAddDropdown] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    loadUsers();
  }, [isOpen, airportId]);

  async function loadUsers() {
    try {
      const [assigned, all] = await Promise.all([
        listUsers({ airport_id: airportId, limit: 200 }),
        listUsers({ limit: 200 }),
      ]);
      setAssignedUsers(assigned.data);
      setAllUsers(all.data);
    } catch {
      /* ignore */
    }
  }

  const unassigned = allUsers.filter(
    (u) => !assignedUsers.some((a) => a.id === u.id),
  );

  async function handleAdd(userId: string) {
    const user = allUsers.find((u) => u.id === userId);
    if (!user) return;
    const currentAirportIds = user.airports.map((a) => a.id);
    try {
      await updateUserAirports(userId, {
        airport_ids: [...currentAirportIds, airportId],
      });
      setShowAddDropdown(false);
      await loadUsers();
      onUpdated();
    } catch {
      /* ignore */
    }
  }

  async function handleRemove(userId: string) {
    const user = allUsers.find((u) => u.id === userId);
    if (!user) return;
    const newIds = user.airports
      .filter((a) => a.id !== airportId)
      .map((a) => a.id);
    try {
      await updateUserAirports(userId, { airport_ids: newIds });
      await loadUsers();
      onUpdated();
    } catch {
      /* ignore */
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${airportName} — ${t("admin.manageUsers")}`}
    >
      <div className="space-y-3">
        {assignedUsers.map((user) => (
          <div
            key={user.id}
            className="flex items-center justify-between rounded-xl bg-tv-bg px-3 py-2"
          >
            <div>
              <p className="text-sm font-medium text-tv-text-primary">
                {user.name}
              </p>
              <p className="text-xs text-tv-text-muted">{user.email}</p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="rounded-full px-2 py-0.5 text-xs font-semibold"
                style={ROLE_BADGE[user.role]}
              >
                {t(`admin.role.${user.role === "SUPER_ADMIN" ? "superAdmin" : user.role.toLowerCase()}`)}
              </span>
              <button
                onClick={() => handleRemove(user.id)}
                className="w-6 h-6 rounded-full flex items-center justify-center text-tv-text-muted hover:text-tv-error hover:bg-tv-error/10 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}

        {assignedUsers.length === 0 && (
          <p className="text-sm text-tv-text-muted text-center py-4">
            {t("admin.noUsers")}
          </p>
        )}

        <div className="relative">
          <Button
            variant="secondary"
            onClick={() => setShowAddDropdown(!showAddDropdown)}
            className="w-full"
          >
            {t("admin.addUser")}
          </Button>
          {showAddDropdown && unassigned.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 max-h-48 overflow-auto rounded-2xl border border-tv-border bg-tv-surface p-2 z-50">
              {unassigned.map((user) => (
                <button
                  key={user.id}
                  onClick={() => handleAdd(user.id)}
                  className="w-full text-left rounded-xl px-3 py-2 text-sm hover:bg-tv-surface-hover transition-colors"
                >
                  <span className="text-tv-text-primary">{user.name}</span>
                  <span className="text-tv-text-muted ml-2">{user.email}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
