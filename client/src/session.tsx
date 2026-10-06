import { createContext, useContext } from "react";

export type Me = { role: "owner" | "client" | "designer"; designer?: { id: string; name: string } };
const Ctx = createContext<Me>({ role: "owner" });
export const SessionProvider = Ctx.Provider;
export const useMe = () => useContext(Ctx);
