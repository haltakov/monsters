type MonsterMarkProps = { className?: string };

export function MonsterMark({ className }: MonsterMarkProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 96 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M28 26 20 11l20 12M68 26l8-15-20 12"
        fill="#FF8D6B"
        stroke="#173F35"
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <path
        d="M18 55c0-22 11-36 30-36s30 14 30 36c0 20-12 29-30 29S18 75 18 55Z"
        fill="#8FCB69"
        stroke="#173F35"
        strokeWidth="5"
      />
      <circle
        cx="37"
        cy="49"
        r="10"
        fill="#FFF9E8"
        stroke="#173F35"
        strokeWidth="4"
      />
      <circle
        cx="62"
        cy="49"
        r="10"
        fill="#FFF9E8"
        stroke="#173F35"
        strokeWidth="4"
      />
      <circle cx="39" cy="51" r="4" fill="#173F35" />
      <circle cx="59" cy="51" r="4" fill="#173F35" />
      <path
        d="M39 68c5 4 13 4 18 0"
        stroke="#173F35"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M26 79 22 90M68 79l5 11"
        stroke="#173F35"
        strokeWidth="6"
        strokeLinecap="round"
      />
    </svg>
  );
}
