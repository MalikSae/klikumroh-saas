import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

interface SidebarContextType {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  toggle: () => void;
  close: () => void;
}

const SidebarContext = createContext<SidebarContextType>({
  isOpen: false,
  setIsOpen: () => {},
  toggle: () => {},
  close: () => {},
});

export const SidebarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Automatically close mobile sidebar if viewport expands to desktop (> 1024px)
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 1024) {
        setIsOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const value = useMemo(
    () => ({
      isOpen,
      setIsOpen,
      toggle,
      close,
    }),
    [isOpen, toggle, close]
  );

  return (
    <SidebarContext.Provider value={value}>
      {children}
    </SidebarContext.Provider>
  );
};

export const useSidebar = () => useContext(SidebarContext);
