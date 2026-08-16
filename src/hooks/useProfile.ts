import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { amIAdmin, fetchMyProfile } from "@/lib/access";

export function useProfile() {
  const { user, loading } = useAuth();

  const profile = useQuery({
    queryKey: ["my-profile", user?.id],
    queryFn: () => fetchMyProfile(user!.id),
    enabled: !!user,
    staleTime: 30_000,
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
