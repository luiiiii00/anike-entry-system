import { useCallback, useEffect, useRef, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { logProtectionEvent } from "@/lib/protection-log";

/**
 * Capa de protección visual: bloquea atajos de captura/impresión sin romper la
 * navegación con teclado ni los formularios, oculta el contenido al perder foco
 * (o al cambiar de app en móvil), añade marca de agua con el usuario, avisa si
 * detecta grabación de pantalla y registra cada evento con fecha y hora.
 */
export function ContentProtection() {
  const { user } = useAuth();
  const label = user?.email ?? user?.id ?? "CONFIDENCIAL";

  const [hidden, setHidden] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const maskTimer = useRef<number | null>(null);

  const warn = useCallback((message: string) => setNotice(message), []);

  // Aviso flotante autodesaparece.
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 2600);
    return () => window.clearTimeout(t);
  }, [notice]);

  // Marca de agua + clases globales de protección.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("protected-content");
    root.style.setProperty("--watermark-text", `"${label}"`);
    return () => {
      root.classList.remove("protected-content");
    };
  }, [label]);

  // Ocultar contenido al perder foco o cambiar de app / multitarea.
  // Se aplica con una pequeña espera y se verifica document.hasFocus() para que
  // el foco moviéndose entre campos del formulario no provoque parpadeos.
  useEffect(() => {
    const clearTimer = () => {
      if (maskTimer.current !== null) {
        window.clearTimeout(maskTimer.current);
        maskTimer.current = null;
      }
    };

    const mask = (reason: string, immediate = false) => {
      clearTimer();
      const apply = () => {
        if (document.hasFocus() && document.visibilityState === "visible") return;
        setHidden(true);
        logProtectionEvent(reason === "app-switch" ? "app-switch" : "blur", "Contenido oculto");
      };
      if (immediate) apply();
      else maskTimer.current = window.setTimeout(apply, 180);
    };

    const unmask = () => {
      clearTimer();
      setHidden((wasHidden) => {
        if (wasHidden) logProtectionEvent("focus", "Contenido restaurado");
        return false;
      });
    };

    const onBlur = () => mask("blur");
    const onHide = () => mask("app-switch", true);
    const onVisibility = () => {
      if (document.visibilityState === "visible") unmask();
      else mask("app-switch", true);
    };

    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", unmask);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("pageshow", unmask);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimer();
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", unmask);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("pageshow", unmask);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Atajos bloqueados + menú contextual y pulsación larga.
  useEffect(() => {
    const isEditable = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el || typeof el.closest !== "function") return false;
      return !!el.closest("input, textarea, select, [contenteditable='true']");
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key?.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;

      const isPrintScreen = key === "printscreen" || e.code === "PrintScreen";
      const isPrint = mod && key === "p";
      const isSave = mod && key === "s" && !isEditable(e.target);
      const isDevTools = (mod && e.shiftKey && ["i", "j", "c"].includes(key)) || key === "f12";

      // Nunca se interceptan Tab, flechas, Enter, Space, Escape ni atajos de
      // edición (Ctrl+A/C/V/X/Z) para no romper teclado ni formularios.
      if (isPrintScreen || isPrint || isSave || isDevTools) {
        e.preventDefault();
        e.stopPropagation();
        const detail = isPrintScreen
          ? "PrintScreen"
          : isPrint
            ? `${mod ? "Ctrl/Cmd+" : ""}P (imprimir)`
            : isSave
              ? "Ctrl/Cmd+S (guardar página)"
              : "DevTools";
        logProtectionEvent("shortcut", detail);
        warn(
          isPrintScreen
            ? "Capturas de pantalla no permitidas en este contenido."
            : "Acción bloqueada: contenido confidencial.",
        );
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key?.toLowerCase() === "printscreen" || e.code === "PrintScreen") {
        // Vacía el portapapeles cuando el sistema ya copió la pantalla.
        void navigator.clipboard?.writeText?.("").catch(() => undefined);
        logProtectionEvent("shortcut", "PrintScreen (post-captura)");
        warn("Capturas de pantalla no permitidas en este contenido.");
      }
    };

    const onContextMenu = (e: Event) => {
      // Se permite el menú contextual en campos de formulario (pegar, corregir).
      if (isEditable(e.target)) return;
      e.preventDefault();
      logProtectionEvent("context-menu", "Menú contextual / pulsación larga");
    };

    const onBeforePrint = () => {
      logProtectionEvent("print", "Diálogo de impresión abierto");
      warn("La impresión está deshabilitada.");
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    document.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("beforeprint", onBeforePrint);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      document.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("beforeprint", onBeforePrint);
    };
  }, [warn]);

  // Detección de grabación / compartición de pantalla.
  useEffect(() => {
    const md = navigator.mediaDevices as MediaDevices | undefined;
    if (!md?.getDisplayMedia) return;
    const original = md.getDisplayMedia.bind(md);

    md.getDisplayMedia = async (...args: Parameters<MediaDevices["getDisplayMedia"]>) => {
      setRecording(true);
      logProtectionEvent("recording-start", "getDisplayMedia solicitado");
      warn("Grabación o compartición de pantalla detectada.");
      try {
        const stream = await original(...args);
        stream.getVideoTracks().forEach((track) => {
          track.addEventListener("ended", () => {
            setRecording(false);
            logProtectionEvent("recording-end", "Grabación finalizada");
          });
        });
        return stream;
      } catch (err) {
        setRecording(false);
        logProtectionEvent("recording-end", "Grabación cancelada");
        throw err;
      }
    };

    return () => {
      md.getDisplayMedia = original;
    };
  }, [warn]);

  const masked = hidden || recording;

  return (
    <>
      {/* Marca de agua diagonal permanente, texto consistente y responsive */}
      <div aria-hidden className="watermark-layer" data-testid="watermark-layer">
        <div className="watermark-tile">
          {Array.from({ length: 36 }).map((_, i) => (
            <span key={i}>{label} · CONFIDENCIAL</span>
          ))}
        </div>
      </div>

      {/* Cortina al perder foco / cambiar de app / grabar pantalla */}
      <div
        aria-hidden={!masked}
        data-testid="privacy-curtain"
        data-active={masked ? "true" : "false"}
        className={`privacy-curtain${masked ? " is-active" : ""}`}
      >
        <div className="pointer-events-none flex flex-col items-center gap-3 px-6 text-center">
          <ShieldAlert className="h-8 w-8 text-primary" />
          <p className="font-display text-base font-semibold">Contenido protegido</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            {recording
              ? "Se detectó grabación o compartición de pantalla. El contenido queda oculto."
              : "Vuelve a esta ventana para continuar viendo la información."}
          </p>
        </div>
      </div>

      {notice && (
        <div className="protection-notice" role="status" data-testid="protection-notice">
          <ShieldAlert className="h-4 w-4 shrink-0 text-warn" />
          <span>{notice}</span>
        </div>
      )}
    </>
  );
}
