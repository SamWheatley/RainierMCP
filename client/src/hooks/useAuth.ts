import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

export function useAuth() {
  // TEMPORARY: Auth disabled for prototype sharing
  const { data: user, isLoading } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  return {
    user: user || {
      id: 'demo-user-id',
      email: 'demo@example.com', 
      firstName: 'Demo',
      lastName: 'User',
      profileImageUrl: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    isLoading: false, // Always loaded for demo
    isAuthenticated: true, // Always authenticated for demo
  };
}
