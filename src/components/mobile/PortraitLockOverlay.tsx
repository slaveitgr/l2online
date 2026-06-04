import { useEffect, useState } from "react";

/**
 * Global overlay shown on mobile devices held in portrait orientation.
 * Asks the user to rotate to landscape — the entire app (login, char select,
 * world) is designed for landscape on mobile.
 */
export function PortraitLockOverlay() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const check = () => {
      const coarse = window.matchMedia("(pointer: coarse)").matches;
      const small = window.innerWidth < 900 || window.innerHeight < 900;
      const portrait = window.innerHeight > window.innerWidth;
      setShow((coarse || small) && portrait);
    };
    check();
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, []);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[10000] bg-black flex flex-col items-center justify-center text-center px-8">
      <div className="text-6xl mb-6 text-gold animate-[spin_2.5s_ease-in-out_infinite]">↻</div>
      <h2 className="font-display text-gold text-2xl tracking-[0.3em] mb-3">
        ΓΥΡΙΣΕ ΤΗ ΣΥΣΚΕΥΗ
      </h2>
      <p className="text-muted-foreground text-sm max-w-sm">
        Το L2 Online είναι σχεδιασμένο για landscape mode.
        Γύρισε την οθόνη σου οριζόντια για να ξεκινήσει το παιχνίδι.
      </p>
      <div className="mt-8 flex items-center gap-3 text-gold/50 text-xs tracking-widest">
        <span>📱</span>
        <span>→</span>
        <span className="rotate-90 inline-block">📱</span>
      </div>
    </div>
  );
}
