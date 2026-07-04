import { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [session, setSession] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const searchParams = new URLSearchParams(window.location.search);
    const queryKey = searchParams.get("session_key");

    async function init() {
      try {
        let sessionData;
        if (queryKey) {
          const res = await api.session(queryKey);
          sessionData = res.data;
        } else {
          const res = await api.latestSession();
          sessionData = res.data;
        }

        if (cancelled) return;
        setSession(sessionData);

        if (sessionData?.session_key) {
          const driversRes = await api.drivers(sessionData.session_key);
          if (!cancelled) setDrivers(driversRes.data || []);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SessionContext.Provider value={{ session, drivers, loading, error }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
