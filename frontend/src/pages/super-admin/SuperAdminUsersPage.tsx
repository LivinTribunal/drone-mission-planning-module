import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { Pencil, UserMinus, UserCheck, Trash2 } from "lucide-react";
import {
  ListPageContainer,
  ListPageContent,
  SearchBar,
  Pagination,
  SortableHeader,
} from "@/components/common/ListPageLayout";
import Button from "@/components/common/Button";
import RowActionButtons from "@/components/common/RowActionButtons";
import Modal from "@/components/common/Modal";
import Input from "@/components/common/Input";
import InviteUserDialog from "@/components/admin/InviteUserDialog";
import {
  listUsers,
  getUser,
  updateUser,
  deactivateUser,
  activateUser,
  deleteUser,
  resetPassword,
  updateUserAirports,
  listAirportsAdmin,
} from "@/api/admin";
import type { UserAdminResponse, AirportAdminResponse } from "@/types/admin";
import type { AirportSummary } from "@/types/auth";

type SortKey = "name" | "email" | "role" | "airports" | "is_active" | "last_login" | "created_at";
type SortDir = "asc" | "desc";

const ROLE_COLORS: Record<string, string> = {
  OPERATOR: "bg-[var(--tv-accent)]/15 text-[var(--tv-accent)]",
  COORDINATOR: "bg-[var(--tv-warning)]/15 text-[var(--tv-warning)]",
  SUPER_ADMIN: "bg-[var(--tv-error)]/15 text-[var(--tv-error)]",
};

export default function SuperAdminUsersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id: selectedUserId } = useParams<{ id: string }>();

  // list state
  const [users, setUsers] = useState<UserAdminResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  // dialog state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: "deactivate" | "activate" | "delete";
    user: UserAdminResponse;
  } | null>(null);
  const [allAirports, setAllAirports] = useState<AirportSummary[]>([]);

  // detail state
  const [selectedUser, setSelectedUser] = useState<UserAdminResponse | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState("");
  const [saving, setSaving] = useState(false);
  const [resetLink, setResetLink] = useState("");

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = {
        limit: pageSize,
        offset: page * pageSize,
      };
      if (search) params.search = search;
      if (roleFilter) params.role = roleFilter;
      if (statusFilter) params.is_active = statusFilter === "active";

      const res = await listUsers(params as Parameters<typeof listUsers>[0]);
      setUsers(res.data);
      setTotal(res.meta.total);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, roleFilter, statusFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    listAirportsAdmin().then((res) => {
      setAllAirports(
        res.data.map((a: AirportAdminResponse) => ({
          id: a.id,
          icao_code: a.icao_code,
          name: a.name,
        })),
      );
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedUserId) {
      getUser(selectedUserId).then((u) => {
        setSelectedUser(u);
        setEditName(u.name);
        setEditEmail(u.email);
        setEditRole(u.role);
      }).catch(() => navigate("/super-admin/users"));
    } else {
      setSelectedUser(null);
    }
  }, [selectedUserId, navigate]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sortedUsers = [...users].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    const av = a[sortKey as keyof UserAdminResponse];
    const bv = b[sortKey as keyof UserAdminResponse];
    if (sortKey === "airports") return dir * ((a.airports?.length || 0) - (b.airports?.length || 0));
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "string" && typeof bv === "string") return dir * av.localeCompare(bv);
    return 0;
  });

  async function handleConfirmAction() {
    if (!confirmAction) return;
    try {
      if (confirmAction.type === "deactivate") {
        await deactivateUser(confirmAction.user.id);
      } else if (confirmAction.type === "activate") {
        await activateUser(confirmAction.user.id);
      } else if (confirmAction.type === "delete") {
        await deleteUser(confirmAction.user.id);
      }
      setConfirmAction(null);
      fetchUsers();
    } catch {
      /* ignore */
    }
  }

  async function handleSaveUser() {
    if (!selectedUser) return;
    setSaving(true);
    try {
      const updated = await updateUser(selectedUser.id, {
        name: editName,
        email: editEmail,
        role: editRole,
      });
      setSelectedUser(updated);
      fetchUsers();
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  }

  async function handleResetPassword() {
    if (!selectedUser) return;
    try {
      const res = await resetPassword(selectedUser.id);
      setResetLink(window.location.origin + res.invitation_link);
    } catch {
      /* ignore */
    }
  }

  async function handleRemoveAirport(airportId: string) {
    if (!selectedUser) return;
    const newIds = selectedUser.airports
      .filter((a) => a.id !== airportId)
      .map((a) => a.id);
    try {
      const updated = await updateUserAirports(selectedUser.id, {
        airport_ids: newIds,
      });
      setSelectedUser(updated);
      fetchUsers();
    } catch {
      /* ignore */
    }
  }

  async function handleAddAirport(airportId: string) {
    if (!selectedUser) return;
    const currentIds = selectedUser.airports.map((a) => a.id);
    try {
      const updated = await updateUserAirports(selectedUser.id, {
        airport_ids: [...currentIds, airportId],
      });
      setSelectedUser(updated);
      fetchUsers();
    } catch {
      /* ignore */
    }
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return t("admin.never");
    return new Date(dateStr).toLocaleDateString();
  }

  // detail view
  if (selectedUser) {
    const unassignedAirports = allAirports.filter(
      (a) => !selectedUser.airports.some((ua) => ua.id === a.id),
    );

    return (
      <ListPageContainer>
        <ListPageContent>
          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={() => navigate("/super-admin/users")}
              className="text-sm text-tv-text-secondary hover:text-tv-text-primary transition-colors"
            >
              &larr; {t("admin.users")}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* left panel */}
            <div className="space-y-4">
              <div className="bg-tv-surface border border-tv-border rounded-2xl p-4">
                <h3 className="text-base font-semibold text-tv-text-primary mb-3">
                  {selectedUser.name}
                </h3>
                <p className="text-sm text-tv-text-secondary">{selectedUser.email}</p>
                <div className="flex gap-2 mt-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ROLE_COLORS[selectedUser.role] || ""}`}>
                    {t(`admin.role.${selectedUser.role === "SUPER_ADMIN" ? "superAdmin" : selectedUser.role.toLowerCase()}`)}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${selectedUser.is_active ? "bg-[var(--tv-accent)]/15 text-[var(--tv-accent)]" : "bg-tv-surface-hover text-tv-text-muted"}`}>
                    {selectedUser.is_active ? t("admin.status.active") : t("admin.status.inactive")}
                  </span>
                </div>
                <div className="mt-3 text-xs text-tv-text-muted space-y-1">
                  <p>{t("admin.lastLogin")}: {formatDate(selectedUser.last_login)}</p>
                  <p>{t("admin.memberSince")}: {formatDate(selectedUser.created_at)}</p>
                </div>
              </div>

              {/* assigned airports */}
              <div className="bg-tv-surface border border-tv-border rounded-2xl p-4">
                <h4 className="text-sm font-semibold text-tv-text-primary mb-2">
                  {t("admin.assignedAirports")}
                </h4>
                <div className="space-y-1">
                  {selectedUser.airports.map((ap) => (
                    <div key={ap.id} className="flex items-center justify-between rounded-xl bg-tv-bg px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-tv-text-primary">{ap.name}</span>
                        <span className="text-xs text-tv-text-muted rounded-full bg-tv-surface-hover px-2 py-0.5">{ap.icao_code}</span>
                      </div>
                      <button
                        onClick={() => handleRemoveAirport(ap.id)}
                        className="text-tv-text-muted hover:text-tv-error text-xs"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
                {unassignedAirports.length > 0 && (
                  <select
                    onChange={(e) => {
                      if (e.target.value) handleAddAirport(e.target.value);
                      e.target.value = "";
                    }}
                    className="mt-2 w-full rounded-full border border-tv-border bg-tv-bg px-3 py-2 text-sm text-tv-text-primary focus:outline-none focus:border-tv-accent"
                    defaultValue=""
                  >
                    <option value="" disabled>{t("admin.addAirport")}</option>
                    {unassignedAirports.map((ap) => (
                      <option key={ap.id} value={ap.id}>{ap.name} ({ap.icao_code})</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* right panel - edit form */}
            <div className="lg:col-span-2">
              <div className="bg-tv-surface border border-tv-border rounded-2xl p-4 space-y-4">
                <h3 className="text-base font-semibold text-tv-text-primary">
                  {t("admin.editUser")}
                </h3>
                <Input
                  label={t("admin.name")}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
                <Input
                  label={t("admin.email")}
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                />
                <div>
                  <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
                    {t("admin.selectRole")}
                  </label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent"
                  >
                    <option value="OPERATOR">{t("admin.role.operator")}</option>
                    <option value="COORDINATOR">{t("admin.role.coordinator")}</option>
                    <option value="SUPER_ADMIN">{t("admin.role.superAdmin")}</option>
                  </select>
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <Button onClick={handleSaveUser} disabled={saving}>
                    {saving ? t("admin.saving") : t("admin.saveChanges")}
                  </Button>
                  <Button variant="secondary" onClick={handleResetPassword}>
                    {t("admin.resetPassword")}
                  </Button>
                </div>
                {resetLink && (
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      readOnly
                      value={resetLink}
                      className="flex-1 rounded-full border border-tv-border bg-tv-bg px-4 py-2 text-sm text-tv-text-primary"
                    />
                    <Button
                      variant="secondary"
                      onClick={() => {
                        navigator.clipboard.writeText(resetLink);
                      }}
                    >
                      {t("admin.copyLink")}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </ListPageContent>
      </ListPageContainer>
    );
  }

  // list view
  const roles = ["OPERATOR", "COORDINATOR", "SUPER_ADMIN"];

  return (
    <ListPageContainer data-testid="admin-users-page">
      <ListPageContent>
        <SearchBar
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          placeholder={t("admin.searchUsers")}
        >
          <div className="flex items-center gap-2">
            {roles.map((r) => (
              <button
                key={r}
                onClick={() => { setRoleFilter(roleFilter === r ? "" : r); setPage(0); }}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  roleFilter === r
                    ? "bg-tv-accent text-tv-accent-text"
                    : "bg-tv-surface text-tv-text-secondary hover:bg-tv-surface-hover"
                }`}
              >
                {t(`admin.role.${r === "SUPER_ADMIN" ? "superAdmin" : r.toLowerCase()}`)}
              </button>
            ))}
            {["active", "inactive"].map((s) => (
              <button
                key={s}
                onClick={() => { setStatusFilter(statusFilter === s ? "" : s); setPage(0); }}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  statusFilter === s
                    ? "bg-tv-accent text-tv-accent-text"
                    : "bg-tv-surface text-tv-text-secondary hover:bg-tv-surface-hover"
                }`}
              >
                {t(`admin.status.${s}`)}
              </button>
            ))}
            <Button variant="danger" onClick={() => setInviteOpen(true)}>
              {t("admin.inviteUser")}
            </Button>
          </div>
        </SearchBar>

        {loading ? (
          <p className="text-center text-tv-text-muted py-8">{t("common.loading")}</p>
        ) : users.length === 0 ? (
          <p className="text-center text-tv-text-muted py-8">{t("admin.noUsers")}</p>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full" data-testid="users-table">
              <thead>
                <tr className="border-b border-tv-border">
                  <SortableHeader sortKey="name" currentSort={sortKey} currentDir={sortDir} onSort={handleSort}>
                    {t("admin.columns.name")}
                  </SortableHeader>
                  <SortableHeader sortKey="email" currentSort={sortKey} currentDir={sortDir} onSort={handleSort}>
                    {t("admin.columns.email")}
                  </SortableHeader>
                  <SortableHeader sortKey="role" currentSort={sortKey} currentDir={sortDir} onSort={handleSort}>
                    {t("admin.columns.role")}
                  </SortableHeader>
                  <SortableHeader sortKey="airports" currentSort={sortKey} currentDir={sortDir} onSort={handleSort}>
                    {t("admin.columns.airports")}
                  </SortableHeader>
                  <SortableHeader sortKey="is_active" currentSort={sortKey} currentDir={sortDir} onSort={handleSort}>
                    {t("admin.columns.status")}
                  </SortableHeader>
                  <SortableHeader sortKey="last_login" currentSort={sortKey} currentDir={sortDir} onSort={handleSort}>
                    {t("admin.columns.lastLogin")}
                  </SortableHeader>
                  <SortableHeader sortKey="created_at" currentSort={sortKey} currentDir={sortDir} onSort={handleSort}>
                    {t("admin.columns.created")}
                  </SortableHeader>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {sortedUsers.map((user) => (
                  <tr
                    key={user.id}
                    onClick={() => navigate(`/super-admin/users/${user.id}`)}
                    className="border-b border-tv-border hover:bg-tv-surface-hover cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 text-sm text-tv-text-primary font-medium">{user.name}</td>
                    <td className="px-4 py-3 text-sm text-tv-text-secondary">{user.email}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ROLE_COLORS[user.role] || ""}`}>
                        {t(`admin.role.${user.role === "SUPER_ADMIN" ? "superAdmin" : user.role.toLowerCase()}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-tv-text-secondary">{user.airports?.length || 0}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${user.is_active ? "bg-[var(--tv-accent)]/15 text-[var(--tv-accent)]" : "bg-tv-surface-hover text-tv-text-muted"}`}>
                        {user.is_active ? t("admin.status.active") : t("admin.status.inactive")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-tv-text-muted">{formatDate(user.last_login)}</td>
                    <td className="px-4 py-3 text-sm text-tv-text-muted">{formatDate(user.created_at)}</td>
                    <td className="px-4 py-3">
                      <RowActionButtons
                        actions={[
                          {
                            icon: Pencil,
                            onClick: () => navigate(`/super-admin/users/${user.id}`),
                            title: t("common.edit"),
                          },
                          user.is_active
                            ? {
                                icon: UserMinus,
                                onClick: () => setConfirmAction({ type: "deactivate", user }),
                                title: t("admin.deactivateUser"),
                              }
                            : {
                                icon: UserCheck,
                                onClick: () => setConfirmAction({ type: "activate", user }),
                                title: t("admin.activateUser"),
                              },
                          {
                            icon: Trash2,
                            onClick: () => setConfirmAction({ type: "delete", user }),
                            variant: "danger" as const,
                            disabled: user.is_active,
                            title: t("admin.deleteUser"),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          page={page}
          pageSize={pageSize}
          totalItems={total}
          onPageChange={setPage}
          onPageSizeChange={(s) => { setPageSize(s); setPage(0); }}
          showingKey="admin.pagination"
        />
      </ListPageContent>

      <InviteUserDialog
        isOpen={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onSuccess={fetchUsers}
        airports={allAirports}
      />

      {/* confirm dialog */}
      <Modal
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        title={
          confirmAction?.type === "deactivate"
            ? t("admin.deactivateUser")
            : confirmAction?.type === "activate"
              ? t("admin.activateUser")
              : t("admin.deleteUser")
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-tv-text-secondary">
            {confirmAction?.type === "delete"
              ? t("admin.deleteUserConfirm", { name: confirmAction?.user.name })
              : t("admin.deactivateConfirm", { name: confirmAction?.user.name })}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmAction(null)}>
              {t("common.cancel")}
            </Button>
            <Button variant="danger" onClick={handleConfirmAction}>
              {t("common.yes")}
            </Button>
          </div>
        </div>
      </Modal>
    </ListPageContainer>
  );
}
