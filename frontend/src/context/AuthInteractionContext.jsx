import { createContext, useState } from 'react';

const AuthInteractionContext = createContext({
    interactionState: 'idle',
    setInteractionState: () => {},
});

export const AuthInteractionProvider = ({ children }) => {
    const [interactionState, setInteractionState] = useState('idle');

    return (
        <AuthInteractionContext.Provider value={{ interactionState, setInteractionState }}>
            {children}
        </AuthInteractionContext.Provider>
    );
};

export default AuthInteractionContext;
