/**
 * S6 — NPC/monster resolver from original client files (typed skeleton).
 *
 * When server NpcInfo carries a displayId we don't know yet:
 *  - Decode Npcgrp.dat (RSA + zlib → bytes).
 *  - Search for u16 == npcId followed at offset +2 by a u32 string-index
 *    pointing into the package name table at a "Lineage*.*" mesh class.
 *  - Resolve package alias (LineageMonster → LineageMonsters.ukx, etc.).
 *  - Load <obj>_m00 SkeletalMesh + the first Tex ref.
 *
 * Names come from NpcName-eu.dat: u32 id followed (within ~K) by
 * [u32 byteLen][utf16] for the name.
 */

import { findPackage } from "./asset-index";

export const NPC_PACKAGE_ALIAS: Record<string, string> = {
  LineageMonster: "LineageMonsters.ukx",
  LineageNpc: "LineageNPCs.ukx",
  LineageMonster2: "LineageMonsters2.ukx",
  LineageMonster3: "LineageMonsters3.ukx",
};

export interface NpcEntry {
  npcId: number;
  meshPackage: string; // resolved .ukx
  meshObject: string;  // <obj>_m00
  texPackage?: string; // resolved .utx
  texObject?: string;
}

export interface NpcNameEntry {
  npcId: number;
  name: string;
}

const cache = new Map<number, NpcEntry>();
const nameCache = new Map<number, string>();

export function rememberNpc(entry: NpcEntry): void {
  cache.set(entry.npcId, entry);
}

export function getNpc(npcId: number): NpcEntry | null {
  return cache.get(npcId) ?? null;
}

export function rememberNpcName(npcId: number, name: string): void {
  nameCache.set(npcId, name);
}

export function getNpcName(npcId: number): string | null {
  return nameCache.get(npcId) ?? null;
}

/** Use the asset index to upgrade a raw mesh ref into a concrete package. */
export async function resolveNpcMeshPackage(meshObject: string): Promise<string | null> {
  const pkg = await findPackage(meshObject);
  if (pkg) return pkg;
  // Heuristic: walk known aliases.
  for (const [prefix, target] of Object.entries(NPC_PACKAGE_ALIAS)) {
    if (meshObject.toLowerCase().startsWith(prefix.toLowerCase())) return target;
  }
  return null;
}

export function resolveAliasPackage(rawClassName: string): string | null {
  for (const [k, v] of Object.entries(NPC_PACKAGE_ALIAS)) {
    if (rawClassName.toLowerCase() === k.toLowerCase()) return v;
  }
  return null;
}
