import { createContext, useContext } from 'react';

// Who's logged in ({ user, logout }), or null when running without Auth0.
export const AccountContext = createContext(null);
export const useAccount = () => useContext(AccountContext);
