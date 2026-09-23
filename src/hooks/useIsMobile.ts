import { useState, useEffect } from 'react';

/**
 * Custom hook to detect mobile viewport and touch capabilities,
 * with support for user preference override (e.g. "View as Desktop").
 */
export function useIsMobile(breakpoint = 768) {
  const [isMobileScreen, setIsMobileScreen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < breakpoint;
  });

  const [isTouchDevice, setIsTouchDevice] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
    );
  });

  // User manual preference: 'auto' | 'mobile' | 'desktop'
  const [layoutOverride, setLayoutOverride] = useState<'auto' | 'mobile' | 'desktop'>(() => {
    try {
      const saved = localStorage.getItem('app_layout_mode');
      if (saved === 'mobile' || saved === 'desktop') return saved;
      return 'auto';
    } catch {
      return 'auto';
    }
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobileScreen(window.innerWidth < breakpoint);
      setIsTouchDevice(
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
      );
    };

    window.addEventListener('resize', handleResize, { passive: true });
    window.addEventListener('orientationchange', handleResize, { passive: true });

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, [breakpoint]);

  const setPreference = (mode: 'auto' | 'mobile' | 'desktop') => {
    setLayoutOverride(mode);
    try {
      localStorage.setItem('app_layout_mode', mode);
    } catch {
      // ignore
    }
  };

  const isMobile = layoutOverride === 'mobile' 
    ? true 
    : layoutOverride === 'desktop' 
      ? false 
      : isMobileScreen;

  return {
    isMobile,
    isMobileScreen,
    isTouchDevice,
    layoutOverride,
    setLayoutPreference: setPreference,
  };
}
