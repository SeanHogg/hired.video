import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@fontsource-variable/bricolage-grotesque";
import "./global.css";
// Side-effect import: initialises i18next before any component calls
// useTranslation(). The module exports a `default` and helpers; importing
// for side effects keeps App.tsx out of the loop on every locale change.
import "@/lib/i18n/i18n";

import { createRoot } from "react-dom/client";
import { AppProviders } from "@/providers/AppProviders";
import { AppRoutes } from "@/routes";
import { bootstrapApp } from "@/lib/app-bootstrap";

// Entry module (index.html → ./App.tsx). Thin composition:
//   - providers + global chrome: providers/AppProviders.tsx
//   - the route table:           routes/*.tsx (composed in routes/index.tsx)
//   - one-time side effects:     lib/app-bootstrap.ts
bootstrapApp();

const App = () => (
  <AppProviders>
    <AppRoutes />
  </AppProviders>
);

createRoot(document.getElementById("root")).render(<App />);
