'use client';

import { useState, useEffect, useLayoutEffect } from 'react';

export function useViewport() {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

  // useLayoutEffect fires synchronously after all DOM mutations 
  // but before the browser paints, ensuring no "visual jump"
  useLayoutEffect(() => {
    const mql = window.matchMedia('(max-width: 1023px)');
    
    const handler = () => setIsMobile(mql.matches);
    
    // Initial sync
    handler();

    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return { isMobile };
}