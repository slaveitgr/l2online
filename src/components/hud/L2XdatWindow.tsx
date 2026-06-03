import { type CSSProperties } from "react";
import { HudWindow } from "./HudWindow";
import { L2Gauge } from "./L2Gauge";
import { L2Slot, L2Sprite } from "./L2Sprite";

interface XdatWindowDef {
  title: string;
  parent: string;
  initial: { x: number; y: number };
  width: number;
  controlCount: number;
  byType: Record<string, number>;
  topTextures: Array<{ ref: string; count: number }>;
  exact?: boolean;
}

const T = (ref: string, count = 1) => ({ ref, count });

export const XDAT_WINDOWS = {
  character: { title: "Character Status", parent: "DetailStatusWndClassic", initial: { x: 320, y: 88 }, width: 470, exact: true, controlCount: 106, byType: { Window: 10, Texture: 39, Button: 8, TextBox: 46, StatusBar: 3 }, topTextures: [T("L2UI_NewTex.AbilityWnd.AbilityIBgLine", 13), T("L2UI_CT1.GroupBox.GroupBox_DF", 6), T("L2UI_NewTex.DetailStatusWnd.BgLight", 4), T("L2UI_NewTex.Gauge.Gauge_DetailStatusBGCenter13", 4)] },
  equipment: { title: "Inventory / Equipment", parent: "InventoryWnd", initial: { x: 780, y: 96 }, width: 360, exact: true, controlCount: 34, byType: { TextBox: 2, Button: 11, Window: 3, Texture: 10, ItemWindow: 7, Tab: 1 }, topTextures: [T("L2UI_NewTex.InventoryWnd.ItemSlot_Disable", 7), T("L2UI_NewTex.InventoryWnd.InventoryExpandBtn_O"), T("L2UI_ct1.tab.Tab_DF_Tab_Large_Selected"), T("L2UI_NewTex.VirtualEquipmentWnd.ListLightDeco")] },
  actions: { title: "Actions", parent: "ActionWnd", initial: { x: 420, y: 160 }, width: 350, exact: true, controlCount: 3, byType: { Button: 1, Window: 2 }, topTextures: [T("L2UI_NewTex.Frames.Frame_HelpBtn_over")] },
  skills: { title: "Skills", parent: "Skill0", initial: { x: 360, y: 96 }, width: 500, exact: true, controlCount: 33, byType: { Texture: 3, TextBox: 3, ItemWindow: 3, Window: 24 }, topTextures: [T("L2UI_NewTex.SkillWnd.TextTitleBg", 3)] },
  quest: { title: "Quest", parent: "QuestTreeWnd", initial: { x: 420, y: 90 }, width: 480, exact: true, controlCount: 11, byType: { Window: 1, Tab: 1, Texture: 4, TextBox: 2, CheckBox: 2, Button: 1 }, topTextures: [T("L2ui.Control.CheckBox_checked_unable", 2), T("L2UI_CT1.GroupBox.GroupBox_DF", 2), T("L2UI_CT1.tab.Tab_DF_Tab_Selected"), T("L2UI_CT1.Button.Button_DF_Click")] },
  clan: { title: "Clan", parent: "ClanWndClassicNew", initial: { x: 360, y: 84 }, width: 560, exact: true, controlCount: 30, byType: { Window: 6, Button: 8, Texture: 10, TextBox: 5, StatusBar: 1 }, topTextures: [T("l2ui_ct1.groupbox_DF", 4), T("L2UI_NewTex.Button29_Over", 3), T("L2UI_CT1.WindowDisable_BG", 2), T("L2UI_EPIC.ClanWnd_BrownBg")] },
  map: { title: "Map", parent: "MinimapWnd", initial: { x: 460, y: 70 }, width: 560, exact: true, controlCount: 27, byType: { Tab: 1, Texture: 11, Button: 11, TextBox: 4 }, topTextures: [T("L2UI_CT1.tab.Tab_DF_bg", 3), T("L2UI_CT1.Minimap.map_cursed_weapon_i01_Over", 3), T("L2UI_CT1.Button.Button_DF_Click", 3), T("L2UI_CT1.Minimap_DF_TexShadowTop")] },
  mailbox: { title: "Mailbox", parent: "PostBoxWnd", initial: { x: 430, y: 96 }, width: 560, exact: true, controlCount: 12, byType: { Tab: 1, Texture: 8, Button: 2, TextBox: 1 }, topTextures: [T("L2UI_ct1.GroupBox.GroupBox_DF", 2), T("L2UI_EPIC.LCoinShopWnd.LCoinShopWnd_Tab_Left_Selected"), T("L2UI_NewTex.PostWnd.Divider")] },
  teleport: { title: "Teleport", parent: "TeleportWnd", initial: { x: 360, y: 84 }, width: 620, exact: true, controlCount: 8, byType: { Window: 4, Texture: 2, Button: 2 }, topTextures: [T("L2UI_CT1.WindowDisable_BG"), T("L2UI_CT1.tab.Tab_DF_bg_line")] },
  store: { title: "Store", parent: "ShopWnd", initial: { x: 360, y: 88 }, width: 620, exact: true, controlCount: 45, byType: { Window: 8, Button: 12, Texture: 15, TextBox: 7, ItemWindow: 2, EditBox: 1 }, topTextures: [T("L2UI_CT1.Button.inventoryWnd_Icon_over"), T("L2UI_CT1.ShopWnd_DF_Arrow"), T("L2UI_CT1.Button.ListTabIcon_over")] },
  craft: { title: "Craft", parent: "ShopLcoinCraftWnd", initial: { x: 440, y: 110 }, width: 480, controlCount: 27, byType: { Window: 6, Button: 7, Texture: 9, TextBox: 5 }, topTextures: [T("L2UI_CT1.Button.Button_DF_Click", 2)] },
  "party-search": { title: "Party Search", parent: "PartyMatchWnd", initial: { x: 420, y: 110 }, width: 520, exact: true, controlCount: 27, byType: { Window: 2, Texture: 8, TextBox: 8, Button: 8, ListCtrl: 1 }, topTextures: [T("L2UI_ct1.ListCtrl.ListCTRL_DF_Decoration"), T("L2UI_ct1.Button.Button_DF_Click")] },
  macro: { title: "Macro", parent: "MacroListWnd", initial: { x: 420, y: 120 }, width: 430, exact: true, controlCount: 10, byType: { Window: 1, TextBox: 2, ItemWindow: 1, Button: 6 }, topTextures: [T("L2UI_CT1.Button.Button_DF_Click", 3)] },
  collection: { title: "Collection", parent: "CollectionSystem", initial: { x: 300, y: 70 }, width: 680, exact: true, controlCount: 8, byType: { Button: 3, CheckBox: 1, Window: 4 }, topTextures: [T("L2UI_EPIC.CollectionSystemWnd.CollArrowPrv_Over"), T("L2UI_EPIC.CollectionSystemWnd.CollArrowNext_Over"), T("L2UI.Control.CheckBox_checked_unable")] },
  relics: { title: "Relics", parent: "RelicWndList", initial: { x: 360, y: 90 }, width: 590, exact: true, controlCount: 15, byType: { Texture: 4, TextBox: 1, Button: 10 }, topTextures: [T("L2UI_NewTex.RelicWnd.RelicHeader_List"), T("L2UI_NewTex.RelicWnd.RelicListBottomBg"), T("L2UI_NewTex.RelicWnd.RelicListBtn_O")] },
  tattoos: { title: "Tattoos", parent: "HennaInfoWnd", initial: { x: 430, y: 110 }, width: 480, exact: true, controlCount: 41, byType: { Window: 5, Texture: 13, Button: 7, TextBox: 12, ItemWindow: 4 }, topTextures: [T("L2UI_CT1.GroupBox.GroupBox_DF", 3)] },
  contacts: { title: "Contacts", parent: "FriendWnd", initial: { x: 480, y: 120 }, width: 420, controlCount: 0, byType: {}, topTextures: [] },
  "instance-zones": { title: "Instance Zones", parent: "InzoneWnd", initial: { x: 430, y: 110 }, width: 520, controlCount: 0, byType: {}, topTextures: [] },
  "session-zones": { title: "Session Zones", parent: "DethroneWnd", initial: { x: 430, y: 110 }, width: 560, exact: true, controlCount: 15, byType: { Window: 7, Texture: 3, Tab: 1, Button: 4 }, topTextures: [T("L2UI_CT1.GroupBox.GroupBox_DF", 3), T("L2UI_CT1.WindowDisable_BG"), T("L2UI_EPIC.DethroneWnd.Dethrone_RewardBtn_O")] },
  olympiad: { title: "Olympiad", parent: "OlympiadWnd", initial: { x: 430, y: 110 }, width: 520, exact: true, controlCount: 52, byType: { Window: 3, Button: 7, TextBox: 26, Texture: 16 }, topTextures: [T("L2UI_ct1.GroupBox.GroupBox_DF", 5), T("L2UI_ct1.Divider.Divider_shadow", 4), T("L2UI_CT1.OlympiadWnd.ONICON")] },
  homunculi: { title: "Homunculi", parent: "HomunculusWndBirth", initial: { x: 430, y: 90 }, width: 620, controlCount: 33, byType: { Button: 9, Texture: 8, TextBox: 9, StatusBar: 6, Window: 1 }, topTextures: [T("L2UI_NewTex.Gauge.Gauge19_GaugeBG_Right", 4), T("L2UI_NewTex.Button.BTN_Plus_Over", 3), T("L2UI_EPIC.HomunCulusWnd.Img_Clock")] },
  conquest: { title: "Conquest", parent: "WorldCastleWarWnd", initial: { x: 430, y: 90 }, width: 620, controlCount: 0, byType: {}, topTextures: [] },
  community: { title: "Community", parent: "BoardWnd", initial: { x: 330, y: 80 }, width: 640, exact: true, controlCount: 5, byType: { Window: 1, Button: 1, Tab: 1, Texture: 2 }, topTextures: [T("L2UI_CT1.Button.Button_DF_Small_Down"), T("l2ui_ct1.Tab_DF_Tab_Selected"), T("L2UI_CT1.tab.Tab_DF_bg_line")] },
  "private-store-review": { title: "Private Store Review", parent: "PrivateShopWndReport", initial: { x: 430, y: 110 }, width: 520, exact: true, controlCount: 22, byType: { Button: 4, TextBox: 7, EditBox: 1, Texture: 9, ListCtrl: 1 }, topTextures: [T("L2UI_ct1.GroupBox.GroupBox_DF", 3), T("l2ui_ct1.groupbox.groupbox_df_text", 3), T("L2UI_CT1.Divider.Divider_DF")] },
  "adena-distribution": { title: "Adena Distribution", parent: "InventoryWnd", initial: { x: 430, y: 130 }, width: 460, controlCount: 34, byType: { TextBox: 2, Button: 11, Window: 3, Texture: 10, ItemWindow: 7, Tab: 1 }, topTextures: [T("L2UI_NewTex.InventoryWnd.ItemSlot_Disable", 7), T("L2UI_NewTex.InventoryWnd.InventoryExpandBtn_O")] },
  "record-video": { title: "Record Video", parent: "OptionWnd0", initial: { x: 500, y: 130 }, width: 420, controlCount: 20, byType: { Button: 1, TextBox: 5, Texture: 7, Window: 7 }, topTextures: [T("L2UI_NewTex.Button.SimpleBtn_Disable")] },
} satisfies Record<string, XdatWindowDef>;

export type XdatWindowKey = keyof typeof XDAT_WINDOWS;

export function isXdatWindowKey(key: string): key is XdatWindowKey {
  return key in XDAT_WINDOWS;
}

function TypePill({ label, value }: { label: string; value: number }) {
  return <span style={pillStyle}>{label} <b style={{ color: "#e6dcc0" }}>{value}</b></span>;
}

function TextureCard({ texture }: { texture: { ref: string; count: number } }) {
  return (
    <div style={textureCellStyle}>
      <div style={spritePreviewStyle}><L2Sprite refId={texture.ref} height={24} style={{ maxWidth: "100%" }} /></div>
      <div style={labelStyle}>{texture.ref}</div>
      <div style={{ color: "#8a8270" }}>used {texture.count}x</div>
    </div>
  );
}

function SkeletonControls({ def }: { def: XdatWindowDef }) {
  const items = Math.min(def.byType.ItemWindow ?? 0, 4);
  const buttons = Math.min(def.byType.Button ?? 0, 8);
  const textRows = Math.min(def.byType.TextBox ?? 0, 8);
  const gauges = Math.min(def.byType.StatusBar ?? 0, 4);
  const windows = Math.min(def.byType.Window ?? 0, 6);
  const tabs = Math.min(def.byType.Tab ?? 0, 4);
  const checks = Math.min(def.byType.CheckBox ?? 0, 4);
  const lists = Math.min((def.byType.ListCtrl ?? 0) + (def.byType.RichListCtrl ?? 0) + (def.byType.ScrollArea ?? 0), 3);

  return (
    <div style={controlGridStyle}>
      {def.topTextures.map((texture) => <TextureCard key={texture.ref} texture={texture} />)}
      {Array.from({ length: tabs }).map((_, i) => <div key={`tab-${i}`} style={tabStyle}>Tab {i + 1}</div>)}
      {Array.from({ length: items }).map((_, i) => (
        <div key={`items-${i}`} style={itemWindowStyle}>
          <span style={smallTitleStyle}>ItemWindow {i + 1}</span>
          <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
            {Array.from({ length: 8 }).map((__, j) => <L2Slot key={j} size={28} refId="L2UI_NewTex.InventoryWnd.ItemSlot_Disable" />)}
          </div>
        </div>
      ))}
      {Array.from({ length: gauges }).map((_, i) => <div key={`gauge-${i}`} style={wideControlStyle}><span style={smallTitleStyle}>StatusBar {i + 1}</span><L2Gauge kind="HP" value={0.66} width="100%" height={12} /></div>)}
      {Array.from({ length: buttons }).map((_, i) => <button key={`button-${i}`} style={buttonStyle} type="button">Button {i + 1}</button>)}
      {Array.from({ length: checks }).map((_, i) => <label key={`check-${i}`} style={checkboxStyle}><span style={checkboxBoxStyle} />CheckBox {i + 1}</label>)}
      {Array.from({ length: lists }).map((_, i) => <div key={`list-${i}`} style={listStyle}><span style={smallTitleStyle}>ListCtrl {i + 1}</span><div style={{ color: "#8a8270" }}>xdat list surface</div></div>)}
      {Array.from({ length: textRows }).map((_, i) => <div key={`text-${i}`} style={textStyle}>TextBox {i + 1}</div>)}
      {Array.from({ length: windows }).map((_, i) => <div key={`window-${i}`} style={windowBlockStyle}>Child Window {i + 1}</div>)}
    </div>
  );
}

export function L2XdatWindow({ windowKey, onClose }: { windowKey: XdatWindowKey; onClose: () => void }) {
  const def = XDAT_WINDOWS[windowKey];
  return (
    <HudWindow title={def.title} initial={def.initial} width={def.width} onClose={onClose}>
      <div style={{ color: "#cabf98", fontSize: 11 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ color: "#d8b25a", fontWeight: 700 }}>{def.parent}</span>
          <span style={{ color: "exact" in def && def.exact ? "#7ad84a" : "#d8b25a" }}>{"exact" in def && def.exact ? "exact xdat parent" : "mapped xdat parent"}</span>
          <span style={{ marginLeft: "auto", color: "#8a8270" }}>{def.controlCount} controls</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {Object.entries(def.byType).map(([label, value]) => <TypePill key={label} label={label} value={value} />)}
          {!Object.keys(def.byType).length && <span style={{ color: "#8a8270" }}>No parsed controls matched this parent yet.</span>}
        </div>
        {def.controlCount > 0 ? <SkeletonControls def={def} /> : <div style={emptyStyle}>This system-menu target exists, but its exact xdat parent still needs a layout mapping.</div>}
      </div>
    </HudWindow>
  );
}

const pillStyle: CSSProperties = { border: "1px solid #4a4030", background: "rgba(8,8,8,0.55)", color: "#bcae84", padding: "3px 7px" };
const controlGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(118px, 1fr))", gap: 6, maxHeight: 430, overflow: "auto", paddingRight: 2 };
const textureCellStyle: CSSProperties = { minHeight: 62, background: "rgba(8,8,8,0.55)", border: "1px solid #3a3222", padding: 5, overflow: "hidden" };
const spritePreviewStyle: CSSProperties = { height: 28, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4 };
const labelStyle: CSSProperties = { color: "#d8b25a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const buttonStyle: CSSProperties = { minHeight: 32, padding: "4px 7px", background: "linear-gradient(180deg,#241c10,#15110a)", border: "1px solid #5a4a2a", color: "#e6dcc0", fontSize: 10, fontWeight: 700, cursor: "pointer", textShadow: "0 1px 1px #000" };
const itemWindowStyle: CSSProperties = { gridColumn: "span 2", border: "1px solid #3a3222", background: "rgba(8,8,8,0.45)", padding: 6 };
const smallTitleStyle: CSSProperties = { display: "block", color: "#d8b25a", marginBottom: 5 };
const wideControlStyle: CSSProperties = { gridColumn: "span 2", border: "1px solid #3a3222", background: "rgba(8,8,8,0.45)", padding: 6 };
const tabStyle: CSSProperties = { minHeight: 26, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(180deg,#2c2418,#15110a)", border: "1px solid #5a4a2a", color: "#d8b25a", fontWeight: 700 };
const checkboxStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 6, minHeight: 28, border: "1px solid #3a3222", background: "rgba(8,8,8,0.45)", padding: "0 7px" };
const checkboxBoxStyle: CSSProperties = { width: 13, height: 13, border: "1px solid #6a5a3a", background: "#0a0a08" };
const listStyle: CSSProperties = { gridColumn: "span 2", minHeight: 58, border: "1px solid #3a3222", background: "rgba(8,8,8,0.45)", padding: 6 };
const windowBlockStyle: CSSProperties = { minHeight: 30, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #3a3222", background: "rgba(20,17,12,0.75)", color: "#bcae84" };
const textStyle: CSSProperties = { minHeight: 25, display: "flex", alignItems: "center", borderBottom: "1px solid #2a2418", color: "#cabf98" };
const emptyStyle: CSSProperties = { minHeight: 80, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #3a3222", background: "rgba(8,8,8,0.45)", color: "#8a8270" };
