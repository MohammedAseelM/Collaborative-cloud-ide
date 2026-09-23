// src/context/AuthContext.jsx
// Responsibility: Provide global authentication state (current user,
// loading state) and actions (login, register, logout) to the rest of
// the app via React Context, so components don't need to manage auth
// state or API calls individually.

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  registerRequest,
  loginRequest,
  logoutRequest,
  fetchCurrentUser,
  googleLoginRequest,
} from "../services/auth.service";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  // `initializing` covers the initial "check if already logged in" call,
  // distinct from action-specific loading states below.
  const [initializing, setInitializing] = useState(true);

  // On first load, check whether a valid session cookie already exists
  // (e.g. the user refreshed the page while logged in).
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const data = await fetchCurrentUser();
        setUser(data.user);
      } catch (error) {
        // No valid session - this is expected for logged-out visitors
        setUser(null);
      } finally {
        setInitializing(false);
      }
    };

    restoreSession();
  }, []);

  const register = useCallback(async ({ name, email, password }) => {
    const data = await registerRequest({ name, email, password });
    setUser(data.user);
    return data;
  }, []);

  const login = useCallback(async ({ email, password }) => {
    const data = await loginRequest({ email, password });
    setUser(data.user);
    return data;
  }, []);

  const loginWithGoogle = useCallback(async (idToken) => {
    const data = await googleLoginRequest(idToken);
    setUser(data.user);
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      // Clear local state regardless of whether the API call succeeded,
      // so the UI never gets stuck showing a "logged in" state.
      setUser(null);
    }
  }, []);

  const value = {
    user,
    isAuthenticated: Boolean(user),
    initializing,
    register,
    login,
    logout,
    loginWithGoogle,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/**
 * Hook for consuming the AuthContext. Throws if used outside of an
 * AuthProvider, to catch misuse early during development.
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
