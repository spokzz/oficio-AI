type IconProps = {
  className?: string;
};

export function LeafIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 4C11 4 5 9 5 17c0 1.1.3 2.2.8 3.1C7.4 14 11.8 10 18.4 7.6 13.2 10.8 9.7 15.1 8.4 21H12c6.1 0 10-4.7 10-11.1V4h-2Z" />
    </svg>
  );
}

export function CalendarIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 2h2v3h6V2h2v3h3a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3V2Zm13 8H4v10h16V10Z" />
    </svg>
  );
}

export function MessageIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
    </svg>
  );
}

export function DollarIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M13 2v3c2.6.3 4.4 1.8 4.8 4h-3.2c-.2-.9-1.1-1.4-2.4-1.4-1.4 0-2.2.6-2.2 1.4 0 .9.8 1.2 3.3 1.8 3.2.7 5 1.9 5 4.5 0 2.5-2 4.2-5.3 4.6V22h-2v-3c-3-.4-5-2-5.3-4.7h3.2c.3 1.2 1.4 1.9 3.1 1.9 1.8 0 2.7-.7 2.7-1.7 0-1-.8-1.4-3.5-2-3.1-.7-4.7-1.8-4.7-4.2 0-2.3 1.8-4 4.5-4.4V2h2Z" />
    </svg>
  );
}

export function UsersIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4 0-7 2-7 4.7V21h14v-3.3C16 15 13 13 9 13Zm8.5-1a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm0 1.5c-.8 0-1.5.1-2.2.3 1.7 1 2.7 2.4 2.7 3.9V21h4v-3c0-2.6-2-4.5-4.5-4.5Z" />
    </svg>
  );
}

