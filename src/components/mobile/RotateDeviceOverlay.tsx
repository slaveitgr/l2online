export function RotateDeviceOverlay() {
  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center text-center px-8">
      <div className="text-5xl mb-4 text-gold animate-pulse">↻</div>
      <h2 className="font-display text-gold text-xl tracking-widest">
        Γύρισε τη συσκευή
      </h2>
      <p className="text-muted-foreground text-sm mt-2 max-w-sm">
        Το L2 Online Mobile UI είναι σχεδιασμένο για landscape mode.
      </p>
    </div>
  );
}
