import { useQuery } from "@tanstack/react-query";
import { applyChecklistOverlay } from "@/lib/checklist";
import { fetchPublishedOverlay } from "@/lib/checklist-overlay";

/**
 * Activa en el navegador la versión publicada del cuestionario antes de mostrar
 * o calcular una evaluación. Si no hay versión publicada se usa el cuestionario
 * base definido en el código.
 */
export function useChecklistCatalog() {
  const query = useQuery({
    queryKey: ["checklist-overlay", "published"],
    queryFn: async () => {
      const overlay = await fetchPublishedOverlay();
      applyChecklistOverlay(overlay);
      return { stamp: Date.now() };
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  return { ready: query.isSuccess, stamp: query.data?.stamp ?? 0, loading: query.isLoading };
}
