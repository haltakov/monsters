import type { Metadata } from "next";
import { GameClient } from "./game-client";

export const metadata: Metadata = {
  title: "Island prototype",
  description: "Explore a tiny 3D island as a curious monster.",
};

export default function GamePage() {
  return <GameClient />;
}
