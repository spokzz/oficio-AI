"use client";

import { useEffect, useRef, useState } from "react";

type AddressSuggestion = {
  label: string;
};

export function AddressLookupInput({
  className = "",
  defaultValue,
  emptyLabel = "No matches",
  label,
  name,
  placeholder = "123 Main St, Austin, TX",
  required = false
}: {
  className?: string;
  defaultValue?: string | null;
  emptyLabel?: string;
  label: string;
  name: string;
  placeholder?: string;
  required?: boolean;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const hasUserEditedRef = useRef(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!hasUserEditedRef.current) return;

    const query = value.replace(/\s+/g, " ").trim();
    if (query.length < 4) return;

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    const timeout = window.setTimeout(() => {
      setLoading(true);
      fetch(`/api/address-autocomplete?query=${encodeURIComponent(query)}`)
        .then((response) => (response.ok ? response.json() : { suggestions: [] }))
        .then((payload: { suggestions?: AddressSuggestion[] }) => {
          if (requestIdRef.current !== requestId) return;
          const nextSuggestions = payload.suggestions ?? [];
          setSuggestions(nextSuggestions);
          setOpen(nextSuggestions.length > 0);
        })
        .catch(() => {
          if (requestIdRef.current !== requestId) return;
          setSuggestions([]);
          setOpen(false);
        })
        .finally(() => {
          if (requestIdRef.current === requestId) setLoading(false);
        });
    }, 280);

    return () => window.clearTimeout(timeout);
  }, [value]);

  return (
    <label className={`field address-lookup-field ${className}`.trim()}>
      <span>{label}</span>
      <input
        autoComplete="off"
        name={name}
        onBlur={() => window.setTimeout(() => setOpen(false), 160)}
        onChange={(event) => {
          const nextValue = event.target.value;
          hasUserEditedRef.current = true;
          setValue(nextValue);
          if (nextValue.replace(/\s+/g, " ").trim().length < 4) {
            setSuggestions([]);
            setOpen(false);
            setLoading(false);
          } else {
            setOpen(true);
          }
        }}
        onFocus={() => {
          if (suggestions.length) setOpen(true);
        }}
        placeholder={placeholder}
        required={required}
        value={value}
      />
      {open || loading ? (
        <div className="address-lookup-menu">
          {suggestions.length ? (
            suggestions.map((suggestion) => (
              <button
                key={suggestion.label}
                onClick={() => {
                  hasUserEditedRef.current = false;
                  setValue(suggestion.label);
                  setOpen(false);
                }}
                onMouseDown={(event) => event.preventDefault()}
                type="button"
              >
                {suggestion.label}
              </button>
            ))
          ) : (
            <div className="address-lookup-empty">{loading ? "..." : emptyLabel}</div>
          )}
        </div>
      ) : null}
    </label>
  );
}
