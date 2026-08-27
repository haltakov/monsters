import type { Metadata } from "next";
import { GameClient } from "./game-client";

export const metadata: Metadata = {
  title: "Островен прототип",
  description: "Изследвай малък 3D остров като любопитно чудовище.",
};

export default function GamePage() {
  return <GameClient />;
}
