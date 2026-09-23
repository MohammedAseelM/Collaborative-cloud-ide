import { useEffect, useRef, useState } from "react";

const PLACEHOLDER_MARKERS = [
  "your_google_client_id",
  "your_google_oauth_client_id",
];

export function getGoogleClientId() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
  if (!clientId) return null;
  const lower = clientId.toLowerCase();
  if (PLACEHOLDER_MARKERS.some((marker) => lower.includes(marker))) {
    return null;
  }
  return clientId;
}

let googleIdentityInitializedFor = null;

function waitForGoogleIdentity(timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve(window.google.accounts.id);
      return;
    }

    const started = Date.now();
    const timer = setInterval(() => {
      if (window.google?.accounts?.id) {
        clearInterval(timer);
        resolve(window.google.accounts.id);
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error("Google Sign-In script did not load"));
      }
    }, 50);
  });
}

export function googleAuthErrorMessage(err) {
  if (err?.response?.data?.message) {
    return err.response.data.message;
  }
  if (err?.code === "ERR_NETWORK" || err?.message === "Network Error") {
    return "Cannot reach the API server. Start the backend on port 5000 and try again.";
  }
  return err?.message || "Google Authentication failed";
}

export function useGoogleSignIn({ buttonId, onCredential, onError }) {
  const [configured, setConfigured] = useState(() => Boolean(getGoogleClientId()));
  const onCredentialRef = useRef(onCredential);
  const onErrorRef = useRef(onError);
  onCredentialRef.current = onCredential;
  onErrorRef.current = onError;

  useEffect(() => {
    const clientId = getGoogleClientId();
    if (!clientId) {
      setConfigured(false);
      return undefined;
    }

    setConfigured(true);

    if (window.location.origin === "http://127.0.0.1:5173") {
      window.location.replace(
        `http://localhost:5173${window.location.pathname}${window.location.search}`
      );
      return undefined;
    }

    let cancelled = false;

    const setup = async () => {
      try {
        const googleId = await waitForGoogleIdentity();
        if (cancelled) return;

        if (googleIdentityInitializedFor !== clientId) {
          googleId.initialize({
            client_id: clientId,
            ux_mode: "popup",
            auto_select: false,
            cancel_on_tap_outside: true,
            callback: async (response) => {
              try {
                await onCredentialRef.current(response.credential);
              } catch (err) {
                onErrorRef.current?.(err);
              }
            },
          });
          googleIdentityInitializedFor = clientId;
        }

        const button = document.getElementById(buttonId);
        if (button) {
          button.innerHTML = "";
          googleId.renderButton(button, {
            theme: "filled_dark",
            size: "large",
            width: 384,
            shape: "rectangular",
            text: "continue_with",
          });
        }
      } catch (err) {
        if (!cancelled) onErrorRef.current?.(err);
      }
    };

    setup();

    return () => {
      cancelled = true;
      window.google?.accounts?.id?.cancel?.();
    };
  }, [buttonId]);

  return configured;
}
