import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";

export default function WebGLUnsupported() {
  const { t } = useTranslation();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        backgroundColor: "var(--tv-bg)",
        color: "var(--tv-text-primary)",
        padding: "2rem",
        textAlign: "center",
      }}
    >
      <AlertTriangle
        size={64}
        style={{ color: "var(--tv-warning)", marginBottom: "1.5rem" }}
      />
      <h1
        style={{
          fontSize: "1.5rem",
          fontWeight: 600,
          marginBottom: "0.75rem",
        }}
      >
        {t("errors.webglUnsupported")}
      </h1>
      <p
        style={{
          color: "var(--tv-text-secondary)",
          maxWidth: "480px",
          lineHeight: 1.6,
        }}
      >
        {t("errors.webglUnsupportedHint")}
      </p>
    </div>
  );
}
