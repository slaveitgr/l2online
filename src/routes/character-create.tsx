import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SpriteProvider } from "@/components/hud/L2Sprite";
import { L2CharCreateScreen } from "@/components/hud/L2CharCreateScreen";
import { CharacterModel } from "@/components/CharacterModel";

export const Route = createFileRoute("/character-create")({
  head: () => ({
    meta: [
      { title: "Create Character — Lineage II Web" },
      { name: "description", content: "Create your hero." },
    ],
  }),
  component: CharacterCreate,
});

function CharacterCreate() {
  const navigate = useNavigate();
  return (
    <SpriteProvider>
      <L2CharCreateScreen
        onCancel={() => navigate({ to: "/characters" })}
        onCreate={(opts) => {
          // TODO: wire to game-client sendCharacterCreate once available
          console.log("[char-create]", opts);
          navigate({ to: "/characters" });
        }}
      />
    </SpriteProvider>
  );
}
