import { createContext, useContext } from "react";

export type Me = { role: "owner" | "client" | "designer"; designer?: { id: string; name: string }; client?: { id: string; name: string }; expiresAt?: number; maxUploadBytes?: number; ai?: boolean; mail?: boolean; notify?: boolean };
const Ctx = createContext<Me>({ role: "owner" });
export const SessionProvider = Ctx.Provider;
export const useMe = () => useContext(Ctx);
