import { createContext, useContext, useEffect, useState } from "react";
import { request, post } from "./api/client";
const Context = createContext(null);
export const useAccount = () => useContext(Context);
export function AccountProvider({ children }) {
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(true);
  async function refresh() {
    try {
      setUser(await request("/auth/session"));
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
  }, []);
  async function logout() {
    await post("/auth/logout", {});
    setUser(null);
  }
  return (
    <Context.Provider value={{ user, setUser, loading, refresh, logout }}>
      {children}
    </Context.Provider>
  );
}
