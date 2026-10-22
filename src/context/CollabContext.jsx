import { useEffect, useMemo, useRef } from "react";
import { CollabProvider } from "../collaboration/react";
import { createBrowserTransport } from "../collaboration/transport";
import { getLocalIdentity } from "../collaboration/identity";
import useAuth from "../hooks/useAuth";

export { CollabContext } from "../collaboration/react";

export default function CollabContextProvider({ children }) {
  const { user } = useAuth();
  const identityRef = useRef({
    ...getLocalIdentity(),
    displayName: user?.username ?? "Guest",
  });
  const transport = useMemo(() => createBrowserTransport(), []);

  useEffect(() => {
    if (user?.username) identityRef.current.displayName = user.username;
  }, [user?.username]);

  return (
    <CollabProvider identity={identityRef.current} transport={transport}>
      {children}
    </CollabProvider>
  );
}
