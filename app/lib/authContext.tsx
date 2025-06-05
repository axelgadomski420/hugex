import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { AuthService, AuthStatus } from "./authService";

interface AuthContextType {
  authStatus: AuthStatus;
  userInfo: {
    username: string;
    fullName: string;
    avatarUrl: string;
  } | null;
  isLoading: boolean;
  login: (credentials: {
    openaiApiKey?: string;
    huggingfaceToken?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  // The AuthStatus state is used to track authentication status
  const [authStatus, setAuthStatus] = useState<AuthStatus>({
    isAuthenticated: false,
    hasOpenAI: false,
    hasHuggingFace: false,
  });
  const [userInfo, setUserInfo] = useState<{
    username: string;
    fullName: string;
    avatarUrl: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshAuth = useCallback(async () => {
    try {
      const status = await AuthService.getAuthStatus();
      setAuthStatus(status);

      // Get user info if authenticated
      if (status.isAuthenticated) {
        // Use user info from status if available
        if (status.hfUserInfo) {
          setUserInfo(status.hfUserInfo);
        } else {
          // Fallback to getCredentials if user info not in status
          try {
            const credentials = await AuthService.getCredentials();
            if (credentials?.hfUserInfo) {
              setUserInfo(credentials.hfUserInfo);
            } else {
              setUserInfo(null);
            }
          } catch (error) {
            console.error("Error fetching user info:", error);
            setUserInfo(null);
          }
        }
      } else {
        setUserInfo(null);
      }
    } catch (error) {
      console.error("Error fetching auth status:", error);
      setAuthStatus({
        isAuthenticated: false,
        hasOpenAI: false,
        hasHuggingFace: false,
      });
      setUserInfo(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = useCallback(
    async (credentials: {
      openaiApiKey?: string;
      huggingfaceToken?: string;
    }) => {
      try {
        const result = await AuthService.authenticate(credentials);
        if (result.success) {
          // Wait a bit for the cookie to be set properly, then refresh
          setTimeout(() => {
            refreshAuth();
          }, 100);
          return { success: true };
        } else {
          return { success: false, error: result.error };
        }
      } catch (error) {
        return { success: false, error: "Authentication failed" };
      }
    },
    [refreshAuth]
  );

  const logout = useCallback(async () => {
    try {
      await AuthService.logout();
      setAuthStatus({
        isAuthenticated: false,
        hasOpenAI: false,
        hasHuggingFace: false,
      });
      setUserInfo(null);
    } catch (error) {
      console.error("Error during logout:", error);
    }
  }, []);

  // Initialize auth status on mount
  useEffect(() => {
    refreshAuth();

    // Check auth status periodically (every minute)
    const interval = setInterval(() => {
      refreshAuth();
    }, 60000);

    return () => clearInterval(interval);
  }, [refreshAuth]);

  // Memoize the context value to prevent unnecessary re-renders
  const contextValue = useMemo(
    () => ({
      authStatus,
      userInfo,
      isLoading,
      login,
      logout,
      refreshAuth,
    }),
    [authStatus, userInfo, isLoading, login, logout, refreshAuth]
  );

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
};
