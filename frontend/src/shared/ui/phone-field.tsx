import { useEffect, useMemo, useRef, useState } from "react";

/* ─────────────────────────────────────────────────────────────────────────
 * PhoneField — mobile number with a searchable country-code selector.
 * Search matches country name, ISO-2 code, and dial code (with or without
 * the +). Composes E.164 (`+919876543210`); `parsePhone` splits stored
 * values back by longest dial-code match. No external dependencies; flags
 * derive from ISO-2 regional indicators.
 * ───────────────────────────────────────────────────────────────────────── */

import { COUNTRIES, type Country } from "./countries";

export interface PhoneValue {
  iso2: string;
  national: string;
}

export function flagFor(iso2: string): string {
  if (!/^[A-Za-z]{2}$/.test(iso2)) return "🌐";
  return String.fromCodePoint(
    ...iso2
      .toUpperCase()
      .split("")
      .map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65),
  );
}

export function countryByIso2(iso2: string): Country {
  return COUNTRIES.find((c) => c.iso2 === iso2) ?? { iso2: "IN", name: "India", dial: "+91" };
}

/** Countries that own a shared dial code (NANP, +7, etc.). */
const PRIMARY_BY_DIAL: Record<string, string> = {
  "+1": "US",
  "+7": "RU",
  "+44": "GB",
  "+61": "AU",
};

/** Longest-dial-match parse of a stored phone value. */
export function parsePhone(value: string | null | undefined): PhoneValue {
  const raw = String(value || "").trim();
  if (!raw) return { iso2: "IN", national: "" };
  // Enrich invalid data for telemetry: include type + truncated value at producer.
  if (typeof value !== "string" && value !== null && value !== undefined) {
    throw new Error(`[phone] Invalid phone value for parsePhone: type=${typeof value}, value=${String(value).substring(0, 50)}`);
  }
  const digits = raw.replace(/[^\d+]/g, "");
  // Sort by dial length descending to prefer longest match deterministically.
  const sorted = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
  let best: Country | null = null;
  for (const c of sorted) {
    const dialDigits = c.dial.replace(/\D/g, "");
    const matches = digits.startsWith(`+${dialDigits}`) || digits.startsWith(dialDigits);
    if (!matches) continue;
    // First match in sorted order is longest; handle shared-code tie via PRIMARY_BY_DIAL.
    if (!best) {
      best = c;
      continue;
    }
    if (c.dial.length < best.dial.length) break;
    if (c.dial.length === best.dial.length && PRIMARY_BY_DIAL[c.dial] === c.iso2) {
      best = c;
    }
  }
  const country = best ?? countryByIso2("IN");
  const dialDigits = country.dial.replace(/\D/g, "");
  let national = (digits.startsWith("+") ? digits.slice(1) : digits)
    .slice(dialDigits.length)
    .replace(/\D/g, "");
  // Strip leading 0 that is often dialed domestically (India 0, UK 0) — producer fix for E.164.
  if (national.startsWith("0") && national.length > 6) national = national.replace(/^0+/, "");
  return { iso2: country.iso2, national };
}

export function composePhone(value: PhoneValue): string {
  const dial = countryByIso2(value.iso2).dial;
  const national = value.national.replace(/\D/g, "");
  return national ? `${dial}${national}` : "";
}

export function matchesSearch(c: Country, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const bare = q.replace(/^\+/, "");
  return (
    c.name.toLowerCase().includes(q) ||
    c.iso2.toLowerCase() === q ||
    c.iso2.toLowerCase().startsWith(bare) ||
    c.dial.replace(/\D/g, "").startsWith(bare)
  );
}

interface CountrySelectProps {
  iso2: string;
  onChange: (iso2: string) => void;
  disabled?: boolean;
}

export function CountrySelect({ iso2, onChange, disabled }: CountrySelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selected = countryByIso2(iso2);
  const results = useMemo(() => COUNTRIES.filter((c) => matchesSearch(c, query)), [query]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const onDocDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onDocEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onDocEsc);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onDocEsc);
    };
  }, [open]);

  return (
    <div className="phone-country" ref={rootRef}>
      <button
        type="button"
        className="phone-country-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Country code: ${selected.name} ${selected.dial}`}
        onClick={() => {
          setOpen((v) => !v);
          setQuery("");
        }}
      >
        <span aria-hidden>{flagFor(selected.iso2)}</span>
        <span className="phone-country-dial">{selected.dial}</span>
        <span aria-hidden className="phone-country-caret">▾</span>
      </button>
      {open ? (
        <div className="phone-country-pop" role="listbox" aria-label="Country codes">
          <input
            ref={searchRef}
            className="phone-country-search"
            type="text"
            placeholder="Search country or code…"
            aria-label="Search country or code"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setOpen(false);
                return;
              }
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                if (results[0]) {
                  onChange(results[0].iso2);
                  setOpen(false);
                }
              }
            }}
          />
          <div className="phone-country-list">
            {results.map((c) => (
              <button
                key={c.iso2 + c.dial}
                type="button"
                role="option"
                aria-selected={c.iso2 === iso2}
                className={`phone-country-option ${c.iso2 === iso2 ? "is-selected" : ""}`}
                onClick={() => {
                  onChange(c.iso2);
                  setOpen(false);
                }}
              >
                <span aria-hidden>{flagFor(c.iso2)}</span>
                <span className="phone-country-name">{c.name}</span>
                <span className="phone-country-dial">{c.dial}</span>
              </button>
            ))}
            {results.length === 0 ? <p className="phone-country-empty">No matches.</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export interface PhoneFieldProps {
  value: PhoneValue;
  onChange: (value: PhoneValue) => void;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  label?: string;
}

export function PhoneField({ value, onChange, id, required, disabled, label = "Mobile number" }: PhoneFieldProps) {
  const national = value.national.replace(/\D/g, "");
  // Use ref to avoid stale closure on blur — producer holds latest value.
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  return (
    <div className="field-label">
      {label ? <span className="phone-field-label" id={id ? `${id}-label` : undefined}>{label}</span> : null}
      <span className="phone-field">
        <CountrySelect
          iso2={value.iso2}
          disabled={disabled}
          onChange={(iso2) => onChange({ ...valueRef.current, iso2 })}
        />
        <input
          id={id}
          className="field phone-national"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="98765 43210"
          aria-label={label || "Mobile number"}
          aria-labelledby={id ? `${id}-label` : undefined}
          aria-required={required ? "true" : undefined}
          disabled={disabled}
          required={required}
          value={value.national}
          onChange={(e) => onChange({ ...valueRef.current, national: e.target.value.replace(/\D/g, "") })}
          onBlur={() => {
            const trimmed = valueRef.current.national.replace(/\D/g, "");
            if (trimmed !== valueRef.current.national) onChange({ ...valueRef.current, national: trimmed });
          }}
        />
      </span>
      <span className="phone-hint" aria-live="polite">
        {national.length >= 6 && national.length <= 15 ? `Will be saved as ${composePhone(value)}` : "Select a country and enter 6–15 digits"}
      </span>
    </div>
  );
}

export function isValidPhone(value: PhoneValue): boolean {
  const digits = value.national.replace(/\D/g, "");
  return digits.length >= 6 && digits.length <= 15;
}
