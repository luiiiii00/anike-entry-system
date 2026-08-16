import { createFileRoute, redirect } from "@tanstack/react-router";

// Ruta histórica: todo el acceso vive ahora en /login.
export const Route = createFileRoute("/auth")({
  beforeLoad: () => {
    throw redirect({ to: "/login", replace: true });
  },
});
