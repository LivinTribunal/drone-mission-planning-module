import { useState } from "react";
import { useTranslation } from "react-i18next";
import Modal from "@/components/common/Modal";
import Input from "@/components/common/Input";
import Button from "@/components/common/Button";
import { inviteUser } from "@/api/admin";
import type { AirportSummary } from "@/types/auth";

interface InviteUserDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  airports: AirportSummary[];
}

export default function InviteUserDialog({
  isOpen,
  onClose,
  onSuccess,
  airports,
}: InviteUserDialogProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("OPERATOR");
  const [selectedAirports, setSelectedAirports] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [invitationLink, setInvitationLink] = useState("");
  const [copied, setCopied] = useState(false);

  function reset() {
    setEmail("");
    setName("");
    setRole("OPERATOR");
    setSelectedAirports([]);
    setError("");
    setInvitationLink("");
    setCopied(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit() {
    if (!email || !name) return;
    setSubmitting(true);
    setError("");
    try {
      const result = await inviteUser({
        email,
        name,
        role,
        airport_ids: selectedAirports,
      });
      setInvitationLink(result.invitation_link);
      onSuccess();
    } catch {
      setError(t("admin.invitationSent", { email: "" }).includes("error") ? "Failed" : "Failed to send invitation");
    } finally {
      setSubmitting(false);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(window.location.origin + invitationLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function toggleAirport(id: string) {
    setSelectedAirports((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id],
    );
  }

  if (invitationLink) {
    return (
      <Modal isOpen={isOpen} onClose={handleClose} title={t("admin.invitationSent", { email })}>
        <div className="space-y-4">
          <p className="text-sm text-tv-text-secondary">
            {t("admin.invitationSent", { email })}
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={window.location.origin + invitationLink}
              className="flex-1 rounded-full border border-tv-border bg-tv-bg px-4 py-2.5 text-sm text-tv-text-primary"
            />
            <Button onClick={handleCopy} variant="secondary">
              {copied ? "Copied!" : t("admin.copyLink")}
            </Button>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleClose}>{t("common.close")}</Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={t("admin.inviteNewUser")}>
      <div className="space-y-4">
        <Input
          label={t("admin.email")}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="user@example.com"
        />
        <Input
          label={t("admin.name")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Full Name"
        />
        <div>
          <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
            {t("admin.selectRole")}
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full px-4 py-2.5 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent"
          >
            <option value="OPERATOR">{t("admin.role.operator")}</option>
            <option value="COORDINATOR">{t("admin.role.coordinator")}</option>
            <option value="SUPER_ADMIN">{t("admin.role.superAdmin")}</option>
          </select>
        </div>
        {airports.length > 0 && (
          <div>
            <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
              {t("admin.assignAirports")}
            </label>
            <div className="max-h-32 overflow-auto rounded-2xl border border-tv-border bg-tv-bg p-2 space-y-1">
              {airports.map((ap) => (
                <label
                  key={ap.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-tv-surface-hover cursor-pointer text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selectedAirports.includes(ap.id)}
                    onChange={() => toggleAirport(ap.id)}
                    className="rounded"
                  />
                  <span className="text-tv-text-primary">{ap.name}</span>
                  <span className="text-tv-text-muted text-xs">{ap.icao_code}</span>
                </label>
              ))}
            </div>
          </div>
        )}
        {error && <p className="text-sm text-tv-error">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={handleClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="danger"
            onClick={handleSubmit}
            disabled={submitting || !email || !name}
          >
            {submitting ? t("admin.saving") : t("admin.sendInvitation")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
