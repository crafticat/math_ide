import { useState, useEffect } from 'react';

export function useDelayedUnmount(isOpen: boolean, delayMs: number = 200) {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setIsAnimatingOut(false);
    } else if (shouldRender) {
      setIsAnimatingOut(true);
      const timer = setTimeout(() => {
        setShouldRender(false);
        setIsAnimatingOut(false);
      }, delayMs);
      return () => clearTimeout(timer);
    }
  }, [isOpen, delayMs, shouldRender]);

  return { shouldRender, isAnimatingOut };
}
