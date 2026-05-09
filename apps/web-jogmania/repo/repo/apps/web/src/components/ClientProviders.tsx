"use client";

import { createContext, useContext, useEffect, useState } from "react";

type CrtContextValue = {
  enabled: boolean;
  setEnabled: (value: boolean) => void;
};

const CrtContext = createContext<CrtContextValue | undefined>(undefined);

export function ClientProviders({ children }: { children: React.ReactNode }) {
  const [crtEnabled, setCrtEnabled] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("jm-crt");
    if (stored === "on") {
      setCrtEnabled(true);
      document.body.classList.add("crt-overlay");
    }
  }, []);

  useEffect(() => {
    if (crtEnabled) {
      document.body.classList.add("crt-overlay");
      window.localStorage.setItem("jm-crt", "on");
    } else {
      document.body.classList.remove("crt-overlay");
      window.localStorage.setItem("jm-crt", "off");
    }
  }, [crtEnabled]);

  return (
    <CrtContext.Provider value={{ enabled: crtEnabled, setEnabled: setCrtEnabled }}>
      {children}
    </CrtContext.Provider>
  );
}

export function useCrtToggle(): [boolean, (value: boolean) => void] {
  const context = useContext(CrtContext);
  if (!context) {
    return [false, () => {}];
  }
  return [context.enabled, context.setEnabled];
}
