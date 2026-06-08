/**
 * S14 — Unknown world-phase opcode logger.
 *
 * Records the FIRST occurrence (with size) of every opcode we don't yet parse,
 * so we can chart unmapped packets across a session without flooding the log.
 * Known unmapped (from spec): 0x32 (~564B) = UserInfo, 0x21 (NpcInfo variant),
 * + status/skill packets.
 */

const seen = new Set<number>();

export function logUnknownOpcode(
  opcode: number,
  size: number,
  emit: (msg: string) => void,
): void {
  if (seen.has(opcode)) return;
  seen.add(opcode);
  const hex = `0x${opcode.toString(16).padStart(2, "0")}`;
  emit(`[GS] unknown world opcode ${hex} (${size}B) — first occurrence logged`);
}

export function resetUnknownOpcodeLog(): void {
  seen.clear();
}

export function getLoggedUnknownOpcodes(): number[] {
  return [...seen].sort((a, b) => a - b);
}
