import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { amIAdmin, fetchMyProfile } from "@/lib/access";

export function useProfile() {
  const { user, loading } = useAuth();

  const profile = useQuery({
    queryKey: ["my-profile", user?.id],
    queryFn: () => fetchMyProfile(user!.id),
    enabled: !!user,
    // El admin puede renovar o cambiar el plan en cualquier momento: mantenemos
    // el estado y el tiempo restante al día sin recargar la página.
    staleTime: 10_000,
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
  });

  const admin = useQuery({
    queryKey: ["is-admin", user?.id],
    queryFn: () => amIAdmin(user!.id),
    enabled: !!user,
    staleTime: 60_000,
  });

  return {
    user,
    profile: profile.data ?? null,
    isAdmin: admin.data ?? false,
    loading: loading || profile.isLoading || admin.isLoading,
  };
}
