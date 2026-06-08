/**
 * S9 — UE2 material → three material translator (typed skeleton).
 *
 * Walk chain: FinalBlend → Shader → TexPanner → Texture.
 * Properties to honour:
 *   OutputBlending      1 = Masked (alphaTest)
 *                       3 = Translucent (alphaBlend)
 *                       5 = Brighten (additive)
 *   FrameBufferBlending 2/4 = AlphaBlend
 *                       6   = Brighten
 *   TwoSided            → double-side
 *   SelfIllumination    → emissive
 *   TexPanner.PanRate   → UV scroll speed
 *   TexPanner.PanDirection (yaw / 65536 * 2π) → UV direction
 *   smoothness = 0      (no plastic-shiny default)
 */

export type BlendMode = "opaque" | "masked" | "translucent" | "additive";

export interface MaterialDescriptor {
  diffuseRef: { pkg?: string; name: string };
  blendMode: BlendMode;
  twoSided: boolean;
  emissive: boolean;
  /** UV pan, units per second in (u, v). */
  uvPan?: { du: number; dv: number };
}

export function blendModeFromUE2(outputBlending: number, frameBufferBlending = 0): BlendMode {
  if (outputBlending === 5 || frameBufferBlending === 6) return "additive";
  if (outputBlending === 3 || frameBufferBlending === 2 || frameBufferBlending === 4) return "translucent";
  if (outputBlending === 1) return "masked";
  return "opaque";
}

export function texPannerToUv(panRate: number, panDirectionYaw: number): { du: number; dv: number } {
  const ang = (panDirectionYaw / 65536) * Math.PI * 2;
  return { du: Math.cos(ang) * panRate, dv: Math.sin(ang) * panRate };
}
