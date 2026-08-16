import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

/**
 * Capa de protección visual: bloquea atajos de captura/impresión, difumina el
 * contenido al perder foco (o al cambiar de app en móvil), añade marca de agua
 * con el usuario y avisa si detecta grabación/compartición de pantalla.
 */
export function ContentProtection() {
  const { user } = useAuth();
  const label = user?.email ?? user?.id ?? "CONFIDENCIAL";

  const [hidden, setHidden] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);

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
  useEffect(() => {
    const hide = () => setHidden(true);
    const show = () => setHidden(false);
    const onVisibility = () => setHidden(document.visibilityState !== "visible");

    window.addEventListener("blur", hide);
    window.addEventListener("focus", show);
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", show);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", hide);
      window.removeEventListener("focus", show);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", show);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Atajos bloqueados + menú contextual y pulsación larga.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key?.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;

      const isPrintScreen = key === "printscreen" || e.code === "PrintScreen";
      const isPrint = mod && key === "p";
      const isSave = mod && key === "s";
      const isDevTools =
        (mod && e.shiftKey && ["i", "j", "c"].includes(key)) || key === "f12";
      const isCopyAll = mod && key === "a";

      if (isPrintScreen || isPrint || isSave || isDevTools || isCopyAll) {
        e.preventDefault();
        e.stopPropagation();
        setNotice(
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
        setNotice("Capturas de pantalla no permitidas en este contenido.");
      }
    };

    const onContextMenu = (e: Event) => e.preventDefault();
    const onBeforePrint = () => setNotice("La impresión está deshabilitada.");

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
  }, []);

  // Detección de grabación / compartición de pantalla.
  useEffect(() => {
    const md = navigator.mediaDevices as MediaDevices | undefined;
    if (!md?.getDisplayMedia) return;
    const original = md.getDisplayMedia.bind(md);

    md.getDisplayMedia = async (...args: Parameters<MediaDevices["getDisplayMedia"]>) => {
      setRecording(true);
      setNotice("Grabación o compartición de pantalla detectada.");
      try {
        const stream = await original(...args);
        stream.getVideoTracks().forEach((track) => {
          track.addEventListener("ended", () => setRecording(false));
        });
        return stream;
      } catch (err) {
        setRecording(false);
        throw err;
      }
    };

    return () => {
      md.getDisplayMedia = original;
    };
  }, []);

  const masked = hidden || recording;

  return (
    <>
      {/* Marca de agua diagonal permanente */}
      <div aria-hidden className="watermark-layer">
        <div className="watermark-tile">
          {Array.from({ length: 28 }).map((_, i) => (
            <span key={i}>{label} · CONFIDENCIAL</span>
          ))}
        </div>
      </div>

      {/* Cortina al perder foco / cambiar de app / grabar pantalla */}
      <div
        aria-hidden={!masked}
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
        <div className="protection-notice" role="status">
          <ShieldAlert className="h-4 w-4 shrink-0 text-warn" />
          <span>{notice}</span>
        </div>
      )}
    </>
  );
}
