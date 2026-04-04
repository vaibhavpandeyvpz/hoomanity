import { createContext, useContext, ReactNode } from "react";
import type { HoomanContainer } from "../../cli/container.js";

export const ContainerContext = createContext<HoomanContainer | null>(null);

export function useContainer(): HoomanContainer {
  const container = useContext(ContainerContext);
  if (!container) {
    throw new Error("useContainer must be used within a ContainerProvider");
  }
  return container;
}

export function ContainerProvider({
  container,
  children,
}: {
  container: HoomanContainer;
  children: ReactNode;
}) {
  return (
    <ContainerContext.Provider value={container}>
      {children}
    </ContainerContext.Provider>
  );
}
