import { PixelText } from "../ui";

/**
 * Item tooltip contents.
 *
 * Every leaf goes through PixelText. Two things to know when editing:
 *
 *   - Indentation is carried by leading spaces in the label strings. The
 *     atlas has a blank cell for a space, so the mask preserves them exactly;
 *     do not swap them for padding.
 *   - There is no italic. An atlas holds one face at one size in one style,
 *     and no italic one was exported; the description used to lean and now
 *     does not, so colour distinguishes it instead.
 */

export function Section({ title, children }) {
  return (
    <div className="tt-section">
      {title && (
        <PixelText upper className="tt-section-title">
          {title}
        </PixelText>
      )}
      {children}
    </div>
  );
}

export function Row({ label, value, suffix, valueColor, style }) {
  return (
    <div className="tt-row">
      <PixelText className="tt-label">{label}</PixelText>
      <span>
        <PixelText
          className={`tt-value ${style ?? ""}`}
          style={valueColor ? { color: valueColor } : undefined}
        >
          {String(value ?? "")}
        </PixelText>
        {suffix && (
          <PixelText className={`tt-value ${style ?? ""}`}>
            {String(suffix)}
          </PixelText>
        )}
      </span>
    </div>
  );
}

export function TooltipBody({ data }) {
  const generalStats = data.stats?.filter((s) => !s.section) ?? [];
  const combatStats = data.stats?.filter((s) => s.section === "Combat") ?? [];

  return (
    <>
      {generalStats.length > 0 && (
        <Section title="Stats">
          {generalStats.map((s, i) => (
            <Row key={i} label={s.label} value={s.value} />
          ))}
        </Section>
      )}

      {Object.keys(data.reqs).length > 0 && (
        <Section title="Requirements">
          {Object.entries(data.reqs).map(([action, bySource]) => (
            <div className="tt-mod-root" key={action}>
              {action !== "Any" && (
                <PixelText className="tt-sub-title">{`${action}:`}</PixelText>
              )}
              {Object.entries(bySource).map(([source, reqs]) => (
                <div key={source} className="tt-target-bubble">
                  <PixelText className="tt-target-title">{source}</PixelText>
                  {reqs.map((r, i) => {
                    if (r.connector) return null;
                    const next = reqs[i + 1];
                    const connector = next?.connector ?? null;
                    return (
                      <div key={i}>
                        <Row
                          label={`  ${r.label}`}
                          value={`${r.value}${connector ? ` ${connector}` : ""}`}
                        />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
        </Section>
      )}

      {combatStats.length > 0 && (
        <Section title="Combat">
          {combatStats.map((s, i) => (
            <Row key={i} label={s.label} value={s.value} />
          ))}
        </Section>
      )}

      {Object.keys(data.mods).length > 0 && (
        <Section title="Modifiers">
          {Object.entries(data.mods).map(([event, byTarget]) => (
            <div className="tt-mod-root" key={event}>
              <PixelText className="tt-sub-title">{`${event}:`}</PixelText>
              {Object.entries(byTarget).map(([target, lines]) => (
                <div key={target} className="tt-target-bubble">
                  <PixelText className="tt-target-title">{target}</PixelText>
                  {lines.map((l, i) => (
                    <div
                      key={i}
                      className={l.criteria?.length > 0 ? "tt-mod-bubble" : ""}
                    >
                      {l.criteria?.length > 0 && (
                        <div className="tt-mod-criteria">
                          {l.criteria.map((r, ci) => {
                            if (r.connector) return null;
                            const next = l.criteria[ci + 1];
                            const connector = next?.connector ?? null;
                            return (
                              <div key={ci} className="tt-mod-criteria-row">
                                <PixelText className="tt-label">
                                  {r.label}
                                </PixelText>
                                <PixelText className="tt-value">
                                  {`${r.value}${connector ? ` ${connector}` : ""}`}
                                </PixelText>
                              </div>
                            );
                          })}
                          <div className="tt-mod-divider" />
                        </div>
                      )}
                      <Row
                        style={
                          l.criteria?.length > 0 ? undefined : "tt-value-mod"
                        }
                        label={`    ${l.label}`}
                        value={l.value}
                        suffix={l.suffix}
                        valueColor={(() => {
                          if (l.noColor || typeof l.value !== "string")
                            return undefined;
                          const normalized = l.value
                            .replace(" - ", "-")
                            .replace(/^[+-]/, "");
                          if (!/^\d/.test(normalized)) return undefined;
                          return l.negative ? "#f44336" : "#4caf50";
                        })()}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </Section>
      )}

      {data.description && (
        <PixelText className="tt-description">{data.description}</PixelText>
      )}
    </>
  );
}
