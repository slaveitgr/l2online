import { type CSSProperties } from "react";
import { HudWindow } from "./HudWindow";
import { L2Sprite } from "./L2Sprite";

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

export const XDAT_WINDOWS = {
  character: {
    title: "Character Status",
    parent: "DetailStatusWndClassic",
    initial: { x: 320, y: 88 },
    width: 470,
    exact: true,
    controlCount: 106,
    byType: { Window: 10, Texture: 39, Button: 8, TextBox: 46, StatusBar: 3 },
    topTextures: [
      { ref: "L2UI_NewTex.AbilityWnd.AbilityIBgLine", count: 13 },
      { ref: "L2UI_CT1.GroupBox.GroupBox_DF", count: 6 },
      { ref: "L2UI_NewTex.DetailStatusWnd.BgLight", count: 4 },
      { ref: "L2UI_NewTex.Gauge.Gauge_DetailStatusBGCenter13", count: 4 },
    ],
  },
  equipment: {
    title: "Inventory / Equipment",
    parent: "InventoryWnd",
    initial: { x: 780, y: 96 },
    width: 360,
    exact: true,
    controlCount: 34,
    byType: { TextBox: 2, Button: 11, Window: 3, Texture: 10, ItemWindow: 7, Tab: 1 },
    topTextures: [
      { ref: "L2UI_NewTex.InventoryWnd.ItemSlot_Disable", count: 7 },
      { ref: "L2UI_NewTex.InventoryWnd.InventoryExpandBtn_O", count: 1 },
      { ref: "L2UI_ct1.tab.Tab_DF_Tab_Large_Selected", count: 1 },
      { ref: "L2UI_NewTex.VirtualEquipmentWnd.ListLightDeco", count: 1 },
    ],
  },
  actions: {
    title: "Actions",
    parent: "ActionWnd",
    initial: { x: 420, y: 160 },
    width: 350,
    exact: true,
    controlCount: 3,
    byType: { Button: 1, Window: 2 },
    topTextures: [{ ref: "L2UI_NewTex.Frames.Frame_HelpBtn_over", count: 1 }],
  },
  skills: {
    title: "Skills",
    parent: "Skill0",
    initial: { x: 360, y: 96 },
    width: 500,
    exact: true,
    controlCount: 33,
    byType: { Texture: 3, TextBox: 3, ItemWindow: 3, Window: 24 },
    topTextures: [{ ref: "L2UI_NewTex.SkillWnd.TextTitleBg", count: 3 }],
  },
  quest: {
    title: "Quest",
    parent: "QuestTreeWnd",
    initial: { x: 420, y: 90 },
    width: 480,
    exact: true,
    controlCount: 11,
    byType: { Window: 1, Tab: 1, Texture: 4, TextBox: 2, CheckBox: 2, Button: 1 },
    topTextures: [
      { ref: "L2ui.Control.CheckBox_checked_unable", count: 2 },
      { ref: "L2UI_CT1.GroupBox.GroupBox_DF", count: 2 },
      { ref: "L2UI_CT1.tab.Tab_DF_Tab_Selected", count: 1 },
      { ref: "L2UI_CT1.Button.Button_DF_Click", count: 1 },
    ],
  },
  clan: {
    title: "Clan",
    parent: "ClanWndClassicNew",
    initial: { x: 360, y: 84 },
    width: 560,
    exact: true,
    controlCount: 30,
    byType: { Window: 6, Button: 8, Texture: 10, TextBox: 5, StatusBar: 1 },
    topTextures: [
      { ref: "l2ui_ct1.groupbox_DF", count: 4 },
      { ref: "L2UI_NewTex.Button29_Over", count: 3 },
      { ref: "L2UI_CT1.WindowDisable_BG", count: 2 },
      { ref: "L2UI_EPIC.ClanWnd_BrownBg", count: 1 },
    ],
  },
  map: {
    title: "Map",
    parent: "MinimapWnd",
    initial: { x: 460, y: 70 },
    width: 560,
    exact: true,
    controlCount: 27,
    byType: { Tab: 1, Texture: 11, Button: 11, TextBox: 4 },
    topTextures: [
      { ref: "L2UI_CT1.tab.Tab_DF_bg", count: 3 },
      { ref: "L2UI_CT1.Minimap.map_cursed_weapon_i01_Over", count: 3 },
      { ref: "L2UI_CT1.Button.Button_DF_Click", count: 3 },
      { ref: "L2UI_CT1.Minimap_DF_TexShadowTop", count: 1 },
    ],
  },
  mailbox: {
    title: "Mailbox",
    parent: "PostBoxWnd",
    initial: { x: 430, y: 96 },
    width: 560,
    exact: true,
    controlCount: 12,
    byType: { Tab: 1, Texture: 8, Button: 2, TextBox: 1 },
    topTextures: [
      { ref: "L2UI_ct1.GroupBox.GroupBox_DF", count: 2 },
      { ref: "L2UI_EPIC.LCoinShopWnd.LCoinShopWnd_Tab_Left_Selected", count: 1 },
      { ref: "L2UI_NewTex.PostWnd.Divider", count: 1 },
    ],
  },
  teleport: {
    title: "Teleport",
    parent: "TeleportWnd",
    initial: { x: 360, y: 84 },
    width: 620,
    exact: true,
    controlCount: 8,
    byType: { Window: 4, Texture: 2, Button: 2 },
    topTextures: [
      { ref: "L2UI_CT1.WindowDisable_BG", count: 1 },
      { ref: "L2UI_CT1.tab.Tab_DF_bg_line", count: 1 },
    ],
  },
  store: {
    title: "Store",
    parent: "ShopWnd",
    initial: { x: 360, y: 88 },
    width: 620,
    exact: true,
    controlCount: 45,
    byType: { Window: 8, Button: 12, Texture: 15, TextBox: 7, ItemWindow: 2, EditBox: 1 },
    topTextures: [
      { ref: "L2UI_CT1.Button.inventoryWnd_Icon_over", count: 1 },
      { ref: "L2UI_CT1.ShopWnd_DF_Arrow", count: 1 },
      { ref: "L2UI_CT1.Button.ListTabIcon_over", count: 1 },
    ],
  },
  craft: {
    title: "Craft",
    parent: "ShopLcoinCraftWnd",
    initial: { x: 440, y: 110 },
    width: 480,
    controlCount: 27,
    byType: { Window: 6, Button: 7, Texture: 9, TextBox: 5 },
    topTextures: [{ ref: "L2UI_CT1.Button.Button_DF_Click", count: 2 }],
  },
  "party-search": {
    title: "Party Search",
    parent: "PartyMatchWnd",
    initial: { x: 420, y: 110 },
    width: 520,
    exact: true,
    controlCount: 27,
    byType: { Window: 2, Texture: 8, TextBox: 8, Button: 8, ListCtrl: 1 },
    topTextures: [
      { ref: "L2UI_ct1.ListCtrl.ListCTRL_DF_Decoration", count: 1 },
      { ref: "L2UI_ct1.Button.Button_DF_Click", count: 1 },
    ],
  },
  macro: {
    title: "Macro",
    parent: "MacroListWnd",
    initial: { x: 420, y: 120 },
    width: 430,
    exact: true,
    controlCount: 10,
    byType: { Window: 1, TextBox: 2, ItemWindow: 1, Button: 6 },
    topTextures: [{ ref: "L2UI_CT1.Button.Button_DF_Click", count: 3 }],
  },
  collection: {
    title: "Collection",
    parent: "CollectionSystem",
    initial: { x: 300, y: 70 },
    width: 680,
    exact: true,
    controlCount: 8,
    byType: { Button: 3, CheckBox: 1, Window: 4 },
    topTextures: [
      { ref: "L2UI_EPIC.CollectionSystemWnd.CollArrowPrv_Over", count: 1 },
      { ref: "L2UI_EPIC.CollectionSystemWnd.CollArrowNext_Over", count: 1 },
      { ref: "L2UI.Control.CheckBox_checked_unable", count: 1 },
    ],
  },
  relics: {
    title: "Relics",
    parent: "RelicWndList",
    initial: { x: 360, y: 90 },
    width: 590,
    exact: true,
    controlCount: 15,
    byType: { Texture: 4, TextBox: 1, Button: 10 },
    topTextures: [
      { ref: "L2UI_NewTex.RelicWnd.RelicHeader_List", count: 1 },
      { ref: "L2UI_NewTex.RelicWnd.RelicListBottomBg", count: 1 },
      { ref: "L2UI_NewTex.RelicWnd.RelicListBtn_O", count: 1 },
    ],
  },
  tattoos: {
    title: "Tattoos",
    parent: "HennaInfoWnd",
    initial: { x: 430, y: 110 },
    width: 480,
    exact: true,
    controlCount: 41,
    byType: { Window: 5, Texture: 13, Button: 7, TextBox: 12, ItemWindow: 4 },
    topTextures: [{ ref: "L2UI_CT1.GroupBox.GroupBox_DF", count: 3 }],
  },
  contacts: {
    title: "Contacts",
    parent: "FriendWnd",
    initial: { x: 480, y: 120 },
    width: 420,
    controlCount: 0,
    byType: {},
    topTextures: [],
  },
  "private-store-review": {
    title: "Private Store Review",
    parent: "PrivateShopWndReport",
    initial: { x: 430, y: 110 },
    width: 520,
    exact: true,
    controlCount: 22,
    byType: { Button: 4, TextBox: 7, EditBox: 1, Texture: 9, ListCtrl: 1 },
    topTextures: [
      { ref: "L2UI_ct1.GroupBox.GroupBox_DF", count: 3 },
      { ref: "l2ui_ct1.groupbox.groupbox_df_text", count: 3 },
      { ref: "L2UI_CT1.Divider.Divider_DF", count: 1 },
    ],
  },
  "record-video": {
    title: "Record Video",
    parent: "OptionWnd0",
    initial: { x: 500, y: 130 },
    width: 420,
    controlCount: 20,
    byType: { Button: 1, TextBox: 5, Texture: 7, Window: 7 },
    topTextures: [{ ref: "L2UI_NewTex.Button.SimpleBtn_Disable", count: 1 }],
  },
} satisfies Record<string, XdatWindowDef>;

export type XdatWindowKey = keyof typeof XDAT_WINDOWS;

export function isXdatWindowKey(key: string): key is XdatWindowKey {
  return key in XDAT_WINDOWS;
}

function TypePill({ label, value }: { label: string; value: number }) {
  return (
    <span style={pillStyle}>
      {label} <b style={{ color: "#e6dcc0" }}>{value}</b>
    </span>
  );
}

export function L2XdatWindow({ windowKey, onClose }: { windowKey: XdatWindowKey; onClose: () => void }) {
  const def = XDAT_WINDOWS[windowKey];
  return (
    <HudWindow title={def.title} initial={def.initial} width={def.width} onClose={onClose}>
      <div style={{ color: "#cabf98", fontSize: 11 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ color: "#d8b25a", fontWeight: 700 }}>{def.parent}</span>
          <span style={{ color: def.exact ? "#7ad84a" : "#d8b25a" }}>{def.exact ? "exact xdat parent" : "mapped xdat parent"}</span>
          <span style={{ marginLeft: "auto", color: "#8a8270" }}>{def.controlCount} controls</span>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {Object.entries(def.byType).map(([label, value]) => <TypePill key={label} label={label} value={value} />)}
          {!Object.keys(def.byType).length && <span style={{ color: "#8a8270" }}>No parsed controls matched this parent yet.</span>}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6 }}>
          {def.topTextures.map((texture) => (
            <div key={texture.ref} style={{ minHeight: 58, background: "rgba(8,8,8,0.55)", border: "1px solid #3a3222", padding: 5, overflow: "hidden" }}>
              <div style={{ height: 24, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4 }}>
                <L2Sprite refId={texture.ref} height={22} style={{ maxWidth: "100%" }} />
              </div>
              <div style={{ color: "#d8b25a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{texture.ref}</div>
              <div style={{ color: "#8a8270" }}>used {texture.count}x</div>
            </div>
          ))}
        </div>
      </div>
    </HudWindow>
  );
}

const pillStyle: CSSProperties = {
  border: "1px solid #4a4030",
  background: "rgba(8,8,8,0.55)",
  color: "#bcae84",
  padding: "3px 7px",
};
