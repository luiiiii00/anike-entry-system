import { Link, useLocation, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

import {
  BarChart3,
  BookOpen,
  CalendarRange,
  LayoutDashboard,
  Library,
  LogOut,
  PlusCircle,
  Settings,
  Shield,
  User,
} from "lucide-react";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Wordmark } from "./brand";
import { AccessBanner } from "./AccessBanner";
import { ContentProtection } from "./ContentProtection";
import { useProfile } from "@/hooks/useProfile";
import { cn } from "@/lib/utils";


const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/nueva", label: "Evaluación", icon: PlusCircle },
  { to: "/journal", label: "Journal", icon: BookOpen },
  { to: "/libros", label: "Biblioteca", icon: Library },
  { to: "/stats", label: "Stats", icon: BarChart3 },
  { to: "/perfil", label: "Perfil", icon: User },
] as const;

const DESKTOP_EXTRA = [
  { to: "/weekly", label: "Weekly Review", icon: CalendarRange },
  { to: "/perfil", label: "Configuración", icon: Settings },
] as const;


export function AppShell({
  children,
  title,
  subtitle,
  action,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAdmin } = useProfile();
  const pathname = useLocation({ select: (l) => l.pathname });
  // Rutas con capa de protección de contenido.
  const protectionEnabled = [
    "/dashboard",
    "/estado",
    "/admin",
    "/nueva",
    "/journal",
    "/libros",

    "/stats",
    "/perfil",
    "/weekly",
    "/trade",
  ].some((p) => pathname === p || pathname.startsWith(`${p}/`));


  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/login", replace: true });
  }


  return (
    <div className="min-h-screen bg-background">
      {protectionEnabled && <ContentProtection />}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-border bg-surface/60 p-5 lg:flex">
        <Wordmark />
        <nav className="mt-8 flex flex-1 flex-col gap-1">
          {NAV.filter((n) => n.to !== "/perfil").map((item) => (
            <SideLink key={item.to} {...item} />
          ))}
          <div className="my-3 h-px bg-border" />
          {DESKTOP_EXTRA.map((item) => (
            <SideLink key={item.label} {...item} />
          ))}
          {isAdmin && <SideLink to="/admin" label="Administración" icon={Shield} />}
          {isAdmin && <SideLink to="/admin-preguntas" label="Editor de preguntas" icon={BookOpen} />}

        </nav>
        <button
          onClick={signOut}
          className="mt-4 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <LogOut className="h-4 w-4" /> Salir
        </button>
        <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
          Herramienta de proceso y control de riesgo. No es asesoramiento financiero ni predicción
          de mercado.
        </p>
      </aside>

      <div className="lg:pl-64">
        <header className="grid-noise sticky top-0 z-10 border-b border-border bg-background/85 px-4 py-4 backdrop-blur-md sm:px-6">
          <div className="mx-auto flex w-full max-w-5xl items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="lg:hidden">
                <Wordmark compact />
              </div>
              <h1 className="mt-2 truncate font-display text-xl font-semibold sm:text-2xl lg:mt-0">
                {title}
              </h1>
              {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
            </div>
            {action}
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-5 sm:px-6 lg:pb-12">
          <AccessBanner />
          {children}
        </main>

      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
        <div className="flex items-stretch justify-between px-2">
          {[...NAV, ...(isAdmin ? [{ to: "/admin", label: "Admin", icon: Shield } as const] : [])].map(
            ({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="flex flex-1 flex-col items-center gap-1 px-1 py-2.5 text-[11px] text-muted-foreground transition-colors"
                activeProps={{ className: "text-primary" }}
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            ),
          )}
        </div>
      </nav>

    </div>
  );
}

function SideLink({
  to,
  label,
  icon: Icon,
}: {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground",
      )}
      activeProps={{ className: "bg-surface-2 text-foreground" }}
    >
      <Icon className="h-4 w-4" /> {label}
    </Link>
  );
}
