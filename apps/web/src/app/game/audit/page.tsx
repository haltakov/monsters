import type { Metadata } from "next";
import { MonsterAudit } from "@/components/game/monster-audit";

export const metadata: Metadata = {
  title: "Monster morphology audit",
  robots: { index: false, follow: false },
};

export default function MonsterAuditPage() {
  return <MonsterAudit />;
}
