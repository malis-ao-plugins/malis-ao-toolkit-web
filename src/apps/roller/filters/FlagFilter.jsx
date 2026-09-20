import { useMemo, useRef, useState } from "react";
import { TagField, TypeAhead } from "../../../ui";

/**
 * Pick any number of named flags — "Can" bits, item bits.
 *
 * Chosen flags are tags above the field; clicking a tag removes it, and
 * Backspace on an empty field removes the last one, which is the behaviour
 * people expect from a tag field and the one usually missing.
 */
export default function FlagFilter({ flags, value, onChange, placeholder }) {
  const [query, setQuery] = useState("");
  const fieldRef = useRef(null);

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.keys(flags)
      .filter((name) => !value.includes(name))
      .filter((name) => !q || name.toLowerCase().includes(q))
      .map((name) => ({ key: name, label: name }));
  }, [flags, value, query]);

  const remove = (name) => onChange(value.filter((n) => n !== name));

  return (
    <TagField
      tags={value}
      onRemove={remove}
      onFocusInput={() => fieldRef.current?.focus()}
    >
      <TypeAhead
        ref={fieldRef}
        value={query}
        onChange={setQuery}
        options={options}
        onPick={(option) => {
          onChange([...value, option.key]);
          setQuery("");
          fieldRef.current?.focus();
        }}
        placeholder={value.length === 0 ? (placeholder ?? "Add…") : ""}
        onKeyDownExtra={(e) => {
          if (e.key === "Backspace" && query === "" && value.length) {
            remove(value[value.length - 1]);
          }
        }}
      />
    </TagField>
  );
}
