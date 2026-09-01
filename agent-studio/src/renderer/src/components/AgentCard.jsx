import { accentFor, glyphFor } from "../accent.js";

export default function AgentCard({
  agent,
  onEdit,
  onDelegate,
  onReveal,
  onTag,
  onVersions,
}) {
  const accent = accentFor(agent.name);
  const toolCount = agent.tools ? `${agent.tools.length} tools` : "all tools";

  return (
    <div className="card" style={{ "--accent": accent }}>
      <div className="card-stripe" />
      <div className="card-glyph dot">{glyphFor(agent.name)}</div>

      <div className="card-name">{agent.name}</div>

      <div className="chips">
        <span className="chip scope">
          {agent.scope === "user" ? "global" : "project"}
        </span>
        <span className="chip">{agent.model}</span>
        <span className="chip">{toolCount}</span>
        {(agent.tags ?? []).map((t) => (
          <span key={t} className="chip tag" onClick={() => onTag?.(t)}>
            {t}
          </span>
        ))}
      </div>

      {agent.broken ? (
        <div className="card-desc missing">failed to parse: {agent.broken}</div>
      ) : agent.description ? (
        <div className="card-desc">{agent.description}</div>
      ) : (
        <div className="card-desc missing">
          No description — this agent may never be auto-selected.
        </div>
      )}

      <div className="card-actions">
        <button onClick={() => onDelegate(agent)}>Run</button>
        <button onClick={() => onEdit(agent)}>Edit</button>
        {onVersions && (
          <button className="ghost" title="Version history" onClick={() => onVersions(agent)}>
            ⟲
          </button>
        )}
        <button className="ghost" title="Show file" onClick={() => onReveal(agent)}>
          ↗
        </button>
      </div>
    </div>
  );
}
