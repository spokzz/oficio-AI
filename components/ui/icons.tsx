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

export function PlusIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7V4Z" />
    </svg>
  );
}

export function EyeIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5c5.2 0 8.7 4.1 10 7-1.3 2.9-4.8 7-10 7S3.3 14.9 2 12c1.3-2.9 4.8-7 10-7Zm0 2C8.4 7 5.7 9.5 4.3 12c1.4 2.5 4.1 5 7.7 5s6.3-2.5 7.7-5C18.3 9.5 15.6 7 12 7Zm0 2.2a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6Z" />
    </svg>
  );
}

export function PencilIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="m4 16.8 10.9-10.9 3.2 3.2L7.2 20H4v-3.2Zm16.7-10.3-1.2 1.2-3.2-3.2 1.2-1.2a1.6 1.6 0 0 1 2.2 0l1 1a1.6 1.6 0 0 1 0 2.2Z" />
    </svg>
  );
}

export function TrashIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 3h6l1 2h5v2H3V5h5l1-2Zm-3 6h12l-.8 12H6.8L6 9Zm4 2v8h2v-8h-2Zm4 0v8h2v-8h-2Z" />
    </svg>
  );
}

export function SortIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="m7 4 4 4H8v12H6V8H3l4-4Zm11 16-4-4h3V4h2v12h3l-4 4Z" />
    </svg>
  );
}
