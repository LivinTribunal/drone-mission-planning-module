import React from "react";
import ReactDOM from "react-dom/client";
import "./i18n";
import App from "./App";
import { AuthProvider } from "./contexts/AuthContext";
import { AirportProvider } from "./contexts/AirportContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { checkWebGLSupport } from "./utils/webglCheck";
import WebGLUnsupported from "./components/common/WebGLUnsupported";
import "./index.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("root element not found - check index.html");

const webgl = checkWebGLSupport();

if (!webgl.supported) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <ThemeProvider>
        <WebGLUnsupported />
      </ThemeProvider>
    </React.StrictMode>,
  );
} else {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <ThemeProvider>
        <AuthProvider>
          <AirportProvider>
            <App />
          </AirportProvider>
        </AuthProvider>
      </ThemeProvider>
    </React.StrictMode>,
  );
}
