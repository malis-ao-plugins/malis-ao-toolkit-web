/** Join truthy class names. Keeps JSX free of ternary noise. */
export function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

export default cx;
