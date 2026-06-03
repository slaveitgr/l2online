import { useEffect, useState } from "react";

export function useIsMobileGame() {
  const [isMobile, setIsMobile] = useState(false);
  const [isLandscape, setIsLandscape] = useState(true);

  useEffect(() => {
    const check = () => {
      const coarse = window.matchMedia("(pointer: coarse)").matches;
      setIsMobile(coarse || window.innerWidth < 900);
      setIsLandscape(window.innerWidth > window.innerHeight);
    };
    check();
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, []);

  return { isMobile, isLandscape };
}
