// Enhanced Theme Transition System with iOS Support
"use client";

/**
 * Enhanced theme transitions with iOS compatibility and mobile support
 * Includes fallbacks for browsers that don't support View Transitions API
 */

interface ThemeToggleOptions {
  x?: number;
  y?: number;
}

/**
 * Check if View Transitions are supported
 */
function supportsViewTransitions(): boolean {
  return typeof window !== 'undefined' && 'startViewTransition' in document;
}

/**
 * Set animation origin coordinates with mobile adjustments
 */
function setThemeOrigin(x: number, y: number) {
  // Clamp coordinates to ensure they're within viewport bounds
  const clampedX = Math.max(0, Math.min(x, window.innerWidth));
  const clampedY = Math.max(0, Math.min(y, window.innerHeight));
  
  document.documentElement.style.setProperty('--x', `${clampedX}px`);
  document.documentElement.style.setProperty('--y', `${clampedY}px`);
  
  // Debug logging for mobile troubleshooting
  if (process.env.NODE_ENV === 'development') {
    console.log(`🎯 Animation origin set: (${clampedX}, ${clampedY})`);
    console.log(`📱 Viewport: ${window.innerWidth}x${window.innerHeight}`);
    console.log(`🔍 View Transitions supported: ${supportsViewTransitions()}`);
  }
}

/**
 * Get accurate element coordinates with mobile viewport handling
 */
function getElementCoordinates(element: HTMLElement): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  
  // Get the center of the element
  const x = rect.left + (rect.width / 2);
  const y = rect.top + (rect.height / 2);
  
  // Account for page scroll (important on mobile)
  const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
  const scrollY = window.pageYOffset || document.documentElement.scrollTop;
  
  return {
    x: x + scrollX,
    y: y + scrollY
  };
}

/**
 * iOS-compatible fallback animation using CSS transitions
 */
function createFallbackAnimation(coordinates?: ThemeToggleOptions): Promise<void> {
  return new Promise((resolve) => {
    // Set origin coordinates for fallback
    if (coordinates) {
      setThemeOrigin(coordinates.x!, coordinates.y!);
    }
    
    // Add a temporary CSS class for fallback animation
    const root = document.documentElement;
    root.classList.add('theme-transition-fallback');
    
    // Remove the class after animation completes
    setTimeout(() => {
      root.classList.remove('theme-transition-fallback');
      resolve();
    }, 400); // Match the animation duration in CSS
  });
}

/**
 * Enhanced theme transition with iOS fallback support
 */
export async function transitionTheme(
  themeCallback: () => void | Promise<void>,
  coordinates?: ThemeToggleOptions
): Promise<void> {
  // Set animation origin for both View Transitions and fallback
  if (coordinates) {
    setThemeOrigin(coordinates.x!, coordinates.y!);
  } else {
    // Default to center if no coordinates provided
    setThemeOrigin(window.innerWidth / 2, window.innerHeight / 2);
  }

  // Check for View Transitions support (not available on iOS yet)
  if (supportsViewTransitions()) {
    try {
      // Use View Transitions API
      const transition = document.startViewTransition(async () => {
        await themeCallback();
      });
      await transition.finished;
    } catch (error) {
      console.warn('View Transition failed, using fallback:', error);
      // Fallback if View Transition fails
      await createFallbackAnimation(coordinates);
      await themeCallback();
    }
  } else {
    // iOS/Safari fallback - use CSS transition
    console.log('📱 Using iOS fallback animation');
    
    // Start fallback animation first
    const animationPromise = createFallbackAnimation(coordinates);
    
    // Apply theme change during animation
    setTimeout(async () => {
      await themeCallback();
    }, 200); // Halfway through the animation
    
    // Wait for animation to complete
    await animationPromise;
  }
}

/**
 * Enhanced smooth theme toggle for buttons with proper mobile coordinate detection
 */
export async function smoothThemeToggle(
  element: HTMLElement,
  themeCallback: () => void | Promise<void>
): Promise<void> {
  // Get accurate coordinates accounting for mobile viewport and scrolling
  const coords = getElementCoordinates(element);
  
  await transitionTheme(themeCallback, coords);
}

/**
 * Enhanced click handler for theme toggle buttons with touch event support
 */
export async function handleThemeToggleClick(
  event: React.MouseEvent<HTMLElement> | React.TouchEvent<HTMLElement>,
  themeCallback: () => void | Promise<void>
): Promise<void> {
  let clientX: number, clientY: number;
  
  // Handle both mouse and touch events
  if ('touches' in event && event.touches.length > 0) {
    // Touch event (mobile)
    clientX = event.touches[0].clientX;
    clientY = event.touches[0].clientY;
  } else if ('changedTouches' in event && event.changedTouches.length > 0) {
    // Touch end event (mobile)
    clientX = event.changedTouches[0].clientX;
    clientY = event.changedTouches[0].clientY;
  } else {
    // Mouse event (desktop)
    const mouseEvent = event as React.MouseEvent<HTMLElement>;
    clientX = mouseEvent.clientX;
    clientY = mouseEvent.clientY;
  }
  
  // Account for scroll position
  const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
  const scrollY = window.pageYOffset || document.documentElement.scrollTop;
  
  const coordinates = {
    x: clientX + scrollX,
    y: clientY + scrollY
  };
  
  await transitionTheme(themeCallback, coordinates);
}

/**
 * Enhanced click handler that works with any pointer event
 */
export async function handleThemeTogglePointer(
  event: PointerEvent,
  themeCallback: () => void | Promise<void>
): Promise<void> {
  const coordinates = {
    x: event.clientX + (window.pageXOffset || document.documentElement.scrollLeft),
    y: event.clientY + (window.pageYOffset || document.documentElement.scrollTop)
  };
  
  await transitionTheme(themeCallback, coordinates);
}

/**
 * Hook for getting theme toggle handler with proper coordinates and iOS support
 */
export function useThemeToggleHandler(toggleTheme: (element?: HTMLElement) => Promise<void>) {
  return async (event: React.MouseEvent<HTMLElement> | React.TouchEvent<HTMLElement>) => {
    // Use the enhanced click handler with iOS support
    await handleThemeToggleClick(event, async () => {
      await toggleTheme(event.currentTarget);
    });
  };
}

/**
 * Alternative hook using pointer events (more reliable on mobile)
 */
export function useThemeTogglePointerHandler(toggleTheme: (element?: HTMLElement) => Promise<void>) {
  return (element: HTMLElement) => {
    const handlePointer = async (event: PointerEvent) => {
      await handleThemeTogglePointer(event, async () => {
        await toggleTheme(element);
      });
    };
    
    element.addEventListener('pointerdown', handlePointer);
    
    // Return cleanup function
    return () => {
      element.removeEventListener('pointerdown', handlePointer);
    };
  };
}