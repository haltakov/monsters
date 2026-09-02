import Image from "next/image";

type MonsterMarkProps = { className?: string };

/** The same generated mascot used by favicons and Google sign-in branding. */
export function MonsterMark({ className }: MonsterMarkProps) {
  return (
    <Image
      src="/brand/monstersdna-mark-v1.png?v=1"
      width={256}
      height={256}
      className={["monster-mark", className].filter(Boolean).join(" ")}
      alt=""
      aria-hidden="true"
      draggable={false}
      unoptimized
    />
  );
}
