import { useEffect, useMemo, useState, type CSSProperties } from "react";
import "./index.css";

import { Loader2, Palette, Plus, Search, Trash2, Users } from "lucide-react";

// ─── TYPES ──────────────────────────────────────────────────────────────────

interface ScryfallImageUris {
  normal?: string;
  large?: string;
  small?: string;
  png?: string;
}

interface ScryfallCardFace {
  image_uris?: ScryfallImageUris;
}

interface ScryfallCard {
  id: string;
  name: string;
  type_line?: string;
  oracle_text?: string;
  flavor_text?: string;
  image_uris?: ScryfallImageUris;
  card_faces?: ScryfallCardFace[];
  set_name?: string;
  collector_number?: string;
  rarity?: string;
  power?: string;
  toughness?: string;
}

interface TokenInstance {
  uid: string;
  card: ScryfallCard;
  quantity: number;
  plusCounters: number;
  minusCounters: number;
  tapped: boolean;
}

interface Player {
  id: string;
  name: string;
  color: string;
  life: number;
  initiative: number;
  turnPosition: number;
  isActive: boolean;
  tokens: TokenInstance[];
}

interface CombatView {
  attackerId: string;
  defenderId: string;
}

interface TokenCounterProps {
  label: string;
  value: number;
  onIncrement: () => void;
  onDecrement: () => void;
  variant: "plus" | "minus";
}

interface TokenCardProps {
  token: TokenInstance;
  onRemove: () => void;
  onToggleTapped: () => void;
  onIncrementQuantity: () => void;
  onDecrementQuantity: () => void;
  onAddPlusCounter: () => void;
  onRemovePlusCounter: () => void;
  onAddMinusCounter: () => void;
  onRemoveMinusCounter: () => void;
  onSelect: () => void;
}

interface AddTokenModalProps {
  open: boolean;
  playerName: string;
  onClose: () => void;
  onPick: (card: ScryfallCard) => void;
}

interface CardPreviewProps {
  card: ScryfallCard | null;
  onClose: () => void;
}

interface LifeControlProps {
  life: number;
  color: string;
  onUpdate: (amount: number) => void;
}

interface PlayerPanelProps {
  player: Player;
  isActive: boolean;
  activePlayerId: string | null;
  onUpdateLife: (amount: number) => void;
  onAttack: () => void;
  onRemove: () => void;
  onChangeColor: (color: string) => void;
  onAddToken: (card: ScryfallCard) => void;
  onAddExtraTurn: () => void;
  extraTurnsCount: number;
  onSelectCard: (card: ScryfallCard) => void;
  onRemoveToken: (playerId: string, tokenUid: string) => void;
  onToggleTapped: (playerId: string, tokenUid: string) => void;
  onIncrementQuantity: (playerId: string, tokenUid: string) => void;
  onDecrementQuantity: (playerId: string, tokenUid: string) => void;
  onAddPlusCounter: (playerId: string, tokenUid: string) => void;
  onRemovePlusCounter: (playerId: string, tokenUid: string) => void;
  onAddMinusCounter: (playerId: string, tokenUid: string) => void;
  onRemoveMinusCounter: (playerId: string, tokenUid: string) => void;
}

interface TurnBarProps {
  turnOrder: string[];
  players: Player[];
  activePlayerId: string | null;
  onStartGame: () => void;
  onNextTurn: () => void;
  gameStarted: boolean;
  turnCount: number;
  extraTurnsTotal: number;
}

interface AddPlayerFormProps {
  onAdd: (name: string) => void;
}

type CSSVars = CSSProperties & {
  [key: `--${string}`]: string | number;
};

// ─── CONSTANTS ──────────────────────────────────────────────────────────────

const PLAYER_COLORS = [
  { name: "Azul", value: "#2563eb" },
  { name: "Vermelho", value: "#dc2626" },
  { name: "Verde", value: "#16a34a" },
  { name: "Roxo", value: "#9333ea" },
  { name: "Laranja", value: "#ea580c" },
  { name: "Rosa", value: "#ec4899" },
  { name: "Índigo", value: "#4f46e5" },
  { name: "Teal", value: "#0d9488" },
];

function assignColor(index: number): string {
  return PLAYER_COLORS[index % PLAYER_COLORS.length].value;
}

// ─── SCRYFALL HELPERS ───────────────────────────────────────────────────────

async function searchTokens(query: string): Promise<ScryfallCard[]> {
  const clean = query.trim();
  if (!clean) return [];

  const q = `is:token name:"${clean}"`;
  const url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}&unique=prints`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error("Erro ao buscar token.");
  }

  const data: { data?: ScryfallCard[] } = await res.json();
  if (!data.data) return [];

  return (data.data || []).filter((card) => {
    const tl = (card.type_line || "").toLowerCase();
    return tl.includes("token") && card.name.toLowerCase().includes(clean.toLowerCase());
  });
}

function getCardImage(card: ScryfallCard | null): string | null {
  if (!card) return null;

  return (
    card.image_uris?.normal ||
    card.image_uris?.large ||
    card.card_faces?.[0]?.image_uris?.normal ||
    card.card_faces?.[0]?.image_uris?.large ||
    null
  );
}

function getFinalPT(token: TokenInstance): string | null {
  const baseP = token.card.power;
  const baseT = token.card.toughness;

  if (baseP === undefined || baseT === undefined) return null;

  const pNum = parseInt(baseP, 10);
  const tNum = parseInt(baseT, 10);

  if (isNaN(pNum) || isNaN(tNum)) return `${baseP}/${baseT}`;

  const finalP = pNum + token.plusCounters - token.minusCounters;
  const finalT = tNum + token.plusCounters - token.minusCounters;

  return `${finalP}/${finalT}`;
}

// ─── TOKEN COUNTER ───────────────────────────────────────────────────────────

function TokenCounter({
  label,
  value,
  onIncrement,
  onDecrement,
  variant,
}: TokenCounterProps) {
  const isPlus = variant === "plus";
  const bg = isPlus ? "rgba(22, 163, 74, 0.1)" : "rgba(220, 38, 38, 0.1)";
  const text = isPlus ? "#16a34a" : "#dc2626";
  const btnBg = isPlus ? "rgba(22, 163, 74, 0.2)" : "rgba(220, 38, 38, 0.2)";

  return (
    <div style={{ background: bg, borderRadius: 10, padding: "8px 10px", border: `1px solid ${isPlus ? "rgba(22, 163, 74, 0.2)" : "rgba(220, 38, 38, 0.2)"}` }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: text, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
        {label}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: text }}>{value}</span>

        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDecrement();
            }}
            style={{
              background: btnBg,
              border: "none",
              borderRadius: 6,
              width: 24,
              height: 24,
              fontSize: 14,
              fontWeight: 800,
              cursor: "pointer",
              color: text,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "transform 0.1s ease",
            }}
            type="button"
          >
            −
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onIncrement();
            }}
            style={{
              background: btnBg,
              border: "none",
              borderRadius: 6,
              width: 24,
              height: 24,
              fontSize: 14,
              fontWeight: 800,
              cursor: "pointer",
              color: text,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "transform 0.1s ease",
            }}
            type="button"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── TOKEN PICKER / ADD TOKEN MODAL ─────────────────────────────────────────

function AddTokenModal({ open, playerName, onClose, onPick }: AddTokenModalProps) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<ScryfallCard[]>([]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setBusy(false);
      setError("");
      setResults([]);
    }
  }, [open]);

  async function handleSearch() {
    setError("");

    if (!query.trim()) return;

    try {
      setBusy(true);
      const found = await searchTokens(query);

      if (!found.length) {
        setError("Nenhum token encontrado.");
        return;
      }

      setResults(found);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro inesperado.";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="token-picker-overlay">
      <div className="token-picker-modal">
        <div className="token-picker-header">
          <div>
            <span className="token-picker-title">Adicionar token</span>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.72)", marginTop: 2 }}>
              {playerName}
            </div>
          </div>

          <button onClick={onClose} className="token-picker-close" type="button">
            ×
          </button>
        </div>

        <div className="token-picker-content">
          <div className="token-search-bar" style={{ padding: 0, borderBottom: "none", marginBottom: 12 }}>
            <div className="token-search-input-wrapper">
              <Search size={14} className="token-search-icon" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Buscar token no Scryfall..."
                className="token-search-input"
              />
            </div>

            <button
              onClick={handleSearch}
              disabled={busy}
              className={`token-search-btn ${busy ? "disabled" : ""}`}
              type="button"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : "Buscar"}
            </button>
          </div>

          {error && <div className="token-search-error">{error}</div>}

          {results.length === 0 ? (
            <div className="token-picker-empty">
              Use a busca acima para localizar tokens.
            </div>
          ) : (
            <div className="token-picker-grid">
              {results.map((token) => (
                <button
                  key={token.id}
                  onClick={() => onPick(token)}
                  className="token-picker-card"
                  type="button"
                >
                  <div className="token-picker-image-wrapper">
                    {getCardImage(token) ? (
                      <img
                        src={getCardImage(token)!}
                        alt={token.name}
                        className="token-picker-image"
                      />
                    ) : (
                      <div className="token-picker-image-placeholder">Sem imagem</div>
                    )}
                  </div>

                  <div className="token-picker-info">
                    <div className="token-picker-name">{token.name}</div>
                    <div className="token-picker-set">{token.set_name || "—"}</div>
                    <div className="token-picker-number">#{token.collector_number}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TokenCard({
  token,
  onRemove,
  onToggleTapped,
  onIncrementQuantity,
  onDecrementQuantity,
  onAddPlusCounter,
  onRemovePlusCounter,
  onAddMinusCounter,
  onRemoveMinusCounter,
  onSelect,
}: TokenCardProps) {
  const img = getCardImage(token.card);
  const [showControls, setShowControls] = useState(false);

  return (
    <div className="token-card" onClick={onSelect}>
      <div className={`token-image ${token.tapped ? "tapped" : ""}`} onClick={(e) => {
        e.stopPropagation();
        onToggleTapped();
      }}>
        {img ? (
          <img src={img} alt={token.card.name} className="token-image-img" />
        ) : (
          <div className="token-image-placeholder">Sem imagem</div>
        )}

        {token.tapped && (
          <div className="token-tapped-overlay">
            <span className="token-tapped-label">VIRADO</span>
          </div>
        )}

        <div className="token-quantity">{token.quantity}x</div>

        {(token.plusCounters !== 0 || token.minusCounters !== 0) && (
          <div className="token-counters">
            {token.plusCounters !== 0 && (
              <div className="token-counter-plus">+{token.plusCounters}</div>
            )}
            {token.minusCounters !== 0 && (
              <div className="token-counter-minus">-{token.minusCounters}</div>
            )}
          </div>
        )}
      </div>

      <div className="token-content">
        <div className="token-name" title={token.card.name}>{token.card.name}</div>
        <div className="token-set" title={token.card.type_line}>{token.card.type_line || "Token"}</div>

        <button
          className="token-controls-toggle"
          onClick={(e) => {
            e.stopPropagation();
            setShowControls(!showControls);
          }}
          type="button"
        >
          <span>{showControls ? "Ocultar controles" : "Ajustar token"}</span>
          <span>{showControls ? "▲" : "▼"}</span>
        </button>

        {showControls && (
          <div className="token-controls" onClick={(e) => e.stopPropagation()}>
            <div className="token-label">Quantidade</div>
            <div className="token-quantity-controls">
              <button
                className="small-btn"
                onClick={onDecrementQuantity}
                type="button"
              >
                −
              </button>
              <div className="token-quantity-value">{token.quantity}</div>
              <button
                className="small-btn"
                onClick={onIncrementQuantity}
                type="button"
              >
                +
              </button>
            </div>

            <div style={{ display: "grid", gap: 6, marginTop: 4 }}>
              <TokenCounter
                label="Contadores +"
                value={token.plusCounters}
                onIncrement={onAddPlusCounter}
                onDecrement={onRemovePlusCounter}
                variant="plus"
              />
              <TokenCounter
                label="Contadores −"
                value={token.minusCounters}
                onIncrement={onAddMinusCounter}
                onDecrement={onRemoveMinusCounter}
                variant="minus"
              />
            </div>

            <button
              className="token-remove-btn"
              onClick={onRemove}
              type="button"
              style={{ marginTop: 8 }}
            >
              <Trash2 size={12} />
              Remover
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CombatPanel({
  combat,
  players,
  onClose,
}: {
  combat: CombatView | null;
  players: Player[];
  onClose: () => void;
}) {
  if (!combat) return null;

  const attacker = players.find((p) => p.id === combat.attackerId);
  const defender = players.find((p) => p.id === combat.defenderId);

  const renderPlayerCombat = (player: Player | undefined, role: string) => {
    if (!player) return null;

    return (
      <div className="combat-section">
        <div className="combat-player-header">
          <div className="combat-accent" style={{ background: player.color }} />
          <div className="combat-role">{role}</div>
          <div className="combat-player-name">{player.name}</div>
          <div className="combat-life">{player.life}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 12 }}>
          {player.tokens.length === 0 ? (
            <div className="combat-empty">Nenhum token em campo.</div>
          ) : (
            player.tokens.map((token) => {
              const pt = getFinalPT(token);
              return (
                <div 
                  key={token.uid} 
                  style={{ 
                    display: "flex", 
                    alignItems: "center", 
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    background: "rgba(255,255,255,0.03)",
                    borderRadius: 8,
                    border: "1px solid rgba(255,255,255,0.05)"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.5)" }}>{token.quantity}x</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{token.card.name}</span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {(token.plusCounters !== 0 || token.minusCounters !== 0) && (
                      <div style={{ display: "flex", gap: 4 }}>
                        {token.plusCounters > 0 && (
                          <span style={{ fontSize: 10, background: "#16a34a", color: "#fff", padding: "1px 5px", borderRadius: 4, fontWeight: 800 }}>+{token.plusCounters}</span>
                        )}
                        {token.minusCounters > 0 && (
                          <span style={{ fontSize: 10, background: "#dc2626", color: "#fff", padding: "1px 5px", borderRadius: 4, fontWeight: 800 }}>-{token.minusCounters}</span>
                        )}
                      </div>
                    )}
                    {pt && (
                      <span style={{ fontSize: 14, fontWeight: 900, color: "#fff", background: "rgba(255,255,255,0.1)", padding: "2px 8px", borderRadius: 6, minWidth: 45, textAlign: "center" }}>
                        {pt}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="combat-panel">
      <div className="combat-header">
        <span className="combat-title">Fase de Combate</span>
        <button onClick={onClose} className="combat-close-btn" type="button">
          ×
        </button>
      </div>

      {renderPlayerCombat(attacker, "Atacante")}
      <div style={{ textAlign: "center", padding: "10px 0", opacity: 0.3, fontSize: 24 }}>⚔️</div>
      {renderPlayerCombat(defender, "Defensor")}
    </div>
  );
}

// ─── CARD PREVIEW ────────────────────────────────────────────────────────────

function CardPreview({ card, onClose }: CardPreviewProps) {
  if (!card) return null;

  const img = getCardImage(card);
  const lines: string[] = [];

  if (card.type_line) lines.push(card.type_line);
  if (card.oracle_text) lines.push(card.oracle_text);
  if (card.flavor_text) lines.push(`"${card.flavor_text}"`);

  return (
    <div className="card-preview">
      <div className="card-preview-header">
        <span className="card-preview-title">Visualização</span>

        <button onClick={onClose} className="card-preview-close" type="button">
          ×
        </button>
      </div>

      {img && <img src={img} alt={card.name} className="card-preview-image" />}

      <div className="card-preview-content">
        <div className="card-preview-name">{card.name}</div>

        {card.type_line && <div className="card-preview-type">{card.type_line}</div>}

        <div className="card-preview-text">{lines.slice(1).join("\n\n")}</div>
      </div>
    </div>
  );
}

// ─── LIFE CONTROL ────────────────────────────────────────────────────────────

function LifeControl({ life, color, onUpdate }: LifeControlProps) {
  const [delta, setDelta] = useState("");

  function apply(sign: number) {
    const n = parseInt(delta, 10) || 1;
    onUpdate(sign * n);
    setDelta("");
  }

  return (
    <div className="life-control" style={{ "--player-color": color } as CSSVars}>
      <div className="life-total">{life}</div>

      <div className="life-actions">
        <button onClick={() => apply(-1)} className="life-btn life-btn-minus" type="button">
          −
        </button>

        <input
          value={delta}
          onChange={(e) => setDelta(e.target.value.replace(/\D/g, ""))}
          placeholder="1"
          className="life-input"
        />

        <button onClick={() => apply(1)} className="life-btn life-btn-plus" type="button">
          +
        </button>
      </div>
    </div>
  );
}

// ─── PLAYER PANEL ────────────────────────────────────────────────────────────

function PlayerPanel({
  player,
  isActive,
  activePlayerId,
  onUpdateLife,
  onAttack,
  onRemove,
  onChangeColor,
  onAddToken,
  onAddExtraTurn,
  extraTurnsCount,
  onSelectCard,
  onRemoveToken,
  onToggleTapped,
  onIncrementQuantity,
  onDecrementQuantity,
  onAddPlusCounter,
  onRemovePlusCounter,
  onAddMinusCounter,
  onRemoveMinusCounter,
}: PlayerPanelProps) {
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [addTokenOpen, setAddTokenOpen] = useState(false);

  return (
    <>
      <div
        className={`player-panel ${isActive ? "active" : ""}`}
        style={{ "--player-color": player.color } as CSSVars}
      >
        <div className="player-header" style={{ background: player.color }}>
          <div className="player-header-top">
            <div className="player-badges">
              <div className="player-avatar" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 9999,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(255,255,255,.2)",
                    color: "#fff",
                    flexShrink: 0,
                  }}
                >
                  <Users size={16} />
                </div>

                <div>
                  <div className="player-name" style={{ marginTop: 0 }}>
                    {player.name}
                  </div>

                  <div className="player-info">
                    {player.tokens.length} token{player.tokens.length !== 1 ? "s" : ""}
                    {isActive && " · vez atual"}
                    {extraTurnsCount > 0 &&
                      ` · +${extraTurnsCount} turno${extraTurnsCount > 1 ? "s" : ""} extra${extraTurnsCount > 1 ? "s" : ""}`}
                  </div>
                </div>
              </div>

              {player.initiative > 0 && <div className="initiative-badge">d{player.initiative}</div>}
              {player.turnPosition > 0 && <div className="turn-position-badge">#{player.turnPosition}</div>}
            </div>

            <div className="player-actions">
              <div className="color-picker-wrapper">
                <button
                  onClick={() => setColorPickerOpen((v) => !v)}
                  className="header-icon-btn"
                  type="button"
                  title="Escolher cor"
                >
                  <Palette size={16} />
                </button>

                {colorPickerOpen && (
                  <div className="color-picker-menu">
                    {PLAYER_COLORS.map((c) => (
                      <button
                        key={c.value}
                        onClick={() => {
                          onChangeColor(c.value);
                          setColorPickerOpen(false);
                        }}
                        className={`color-option ${player.color === c.value ? "selected" : ""}`}
                        style={{ background: c.value }}
                        title={c.name}
                        type="button"
                      />
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={onRemove}
                className="header-icon-btn"
                type="button"
                title="Remover jogador"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className="player-life-section">
          <LifeControl life={player.life} color={player.color} onUpdate={onUpdateLife} />
        </div>

        <div className="player-attack-section" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button onClick={() => setAddTokenOpen(true)} className="attack-btn" type="button">
            <Plus size={14} style={{ marginRight: 6, verticalAlign: "text-bottom" }} />
            Adicionar token
          </button>

          {activePlayerId && activePlayerId !== player.id && (
            <button onClick={onAttack} className="attack-btn" type="button">
              ⚔️ Atacar
            </button>
          )}

          {isActive && (
            <button
              onClick={onAddExtraTurn}
              type="button"
              style={{
                width: "100%",
                background: "#ecfeff",
                border: "1px solid #a5f3fc",
                borderRadius: 10,
                padding: "7px 0",
                fontSize: 12,
                fontWeight: 700,
                color: "#0f766e",
                cursor: "pointer",
              }}
            >
              ✨ Turno extra
            </button>
          )}
        </div>

        <div style={{ padding: "0 16px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#6b7280", marginBottom: 8 }}>
            Tokens
          </div>

          {player.tokens.length === 0 ? (
            <div style={{ fontSize: 12, color: "#9ca3af", padding: "8px 0" }}>
              Nenhum token ainda.
            </div>
          ) : (
            <div style={{ 
              display: "flex", 
              gap: 12, 
              overflowX: "auto", 
              padding: "4px 4px 12px",
              margin: "0 -4px",
              scrollbarWidth: "thin"
            }}>
              {player.tokens.map((tokenInstance) => (
                <div key={tokenInstance.uid} style={{ flexShrink: 0, width: 145 }}>
                  <TokenCard
                    token={tokenInstance}
                    onRemove={() => onRemoveToken(player.id, tokenInstance.uid)}
                    onToggleTapped={() => onToggleTapped(player.id, tokenInstance.uid)}
                    onIncrementQuantity={() => onIncrementQuantity(player.id, tokenInstance.uid)}
                    onDecrementQuantity={() => onDecrementQuantity(player.id, tokenInstance.uid)}
                    onAddPlusCounter={() => onAddPlusCounter(player.id, tokenInstance.uid)}
                    onRemovePlusCounter={() => onRemovePlusCounter(player.id, tokenInstance.uid)}
                    onAddMinusCounter={() => onAddMinusCounter(player.id, tokenInstance.uid)}
                    onRemoveMinusCounter={() => onRemoveMinusCounter(player.id, tokenInstance.uid)}
                    onSelect={() => onSelectCard(tokenInstance.card)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <AddTokenModal
        open={addTokenOpen}
        playerName={player.name}
        onClose={() => setAddTokenOpen(false)}
        onPick={(card) => {
          onAddToken(card);
          setAddTokenOpen(false);
        }}
      />
    </>
  );
}

// ─── TURN BAR ────────────────────────────────────────────────────────────────

function TurnBar({
  turnOrder,
  players,
  activePlayerId,
  onStartGame,
  onNextTurn,
  gameStarted,
  turnCount,
  extraTurnsTotal,
}: TurnBarProps) {
  if (!gameStarted) {
    return (
      <div className="turnbar-setup">
        <span className="turnbar-setup-text">
          {players.length > 0
            ? `${players.length} jogador${players.length > 1 ? "es" : ""} adicionado${
                players.length > 1 ? "s" : ""
              } — pronto para iniciar`
            : "Adicione jogadores para começar"}
        </span>

        {players.length > 1 && (
          <button onClick={onStartGame} className="start-game-btn" type="button">
            🎲 Rolar iniciativa e iniciar
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="turnbar">
      <span className="turnbar-label">ORDEM:</span>

      <span
        style={{
          color: "rgba(255,255,255,.85)",
          fontWeight: 800,
          fontSize: 12,
          padding: "6px 12px",
          borderRadius: 9999,
          background: "rgba(255,255,255,.08)",
          border: "1px solid rgba(255,255,255,.08)",
          marginRight: 4,
        }}
      >
        Turno {turnCount}
      </span>

      {extraTurnsTotal > 0 && (
        <span
          style={{
            color: "rgba(255,255,255,.78)",
            fontWeight: 700,
            fontSize: 12,
            padding: "6px 12px",
            borderRadius: 9999,
            background: "rgba(255,255,255,.05)",
            border: "1px solid rgba(255,255,255,.08)",
            marginRight: 4,
          }}
        >
          +{extraTurnsTotal} turno{extraTurnsTotal > 1 ? "s" : ""} extra{extraTurnsTotal > 1 ? "s" : ""}
        </span>
      )}

      {turnOrder.map((pid, i) => {
        const p = players.find((pl) => pl.id === pid);
        if (!p) return null;

        const isActive = pid === activePlayerId;

        return (
          <div
            key={pid}
            className={`turnbar-player ${isActive ? "active" : ""}`}
            style={{ "--player-color": p.color } as CSSVars}
          >
            <span className="turnbar-position">#{i + 1}</span>
            <span className="turnbar-name">{p.name}</span>

            {p.initiative > 0 && <span className="turnbar-initiative">d{p.initiative}</span>}
          </div>
        );
      })}

      <button
        onClick={onNextTurn}
        className="next-turn-btn"
        type="button"
        style={{ marginLeft: "auto" }}
      >
        Próximo turno →
      </button>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

export default function Home() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [turnOrder, setTurnOrder] = useState<string[]>([]);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [combatView, setCombatView] = useState<CombatView | null>(null);
  const [selectedCard, setSelectedCard] = useState<ScryfallCard | null>(null);
  const [turnCount, setTurnCount] = useState(1);
  const [extraTurns, setExtraTurns] = useState<Record<string, number>>({});

  const extraTurnsTotal = useMemo(
    () => Object.values(extraTurns).reduce((sum, n) => sum + n, 0),
    [extraTurns]
  );

  function addPlayer(name: string) {
    setPlayers((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name,
        color: assignColor(prev.length),
        life: 40,
        initiative: 0,
        turnPosition: 0,
        isActive: false,
        tokens: [],
      },
    ]);
  }

  function removePlayer(id: string) {
    setPlayers((prev) => prev.filter((p) => p.id !== id));
    setTurnOrder((prev) => prev.filter((pid) => pid !== id));
    setExtraTurns((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

    if (activePlayerId === id) {
      setActivePlayerId(null);
    }

    if (combatView?.attackerId === id || combatView?.defenderId === id) {
      setCombatView(null);
    }
  }

  function changeColor(playerId: string, color: string) {
    setPlayers((prev) => prev.map((p) => (p.id === playerId ? { ...p, color } : p)));
  }

  function startGame() {
    const rolled = players
      .map((p) => ({ ...p, initiative: Math.floor(Math.random() * 20) + 1 }))
      .sort((a, b) => b.initiative - a.initiative)
      .map((p, i) => ({ ...p, turnPosition: i + 1, isActive: i === 0 }));

    setPlayers(rolled);
    const order = rolled.map((p) => p.id);
    setTurnOrder(order);
    setActivePlayerId(order[0] ?? null);
    setGameStarted(true);
    setTurnCount(1);
    setExtraTurns({});
    setCombatView(null);
    setSelectedCard(null);
  }

  function nextTurn() {
    if (!activePlayerId || !turnOrder.length) return;

    setTurnCount((v) => v + 1);

    const pendingExtra = extraTurns[activePlayerId] ?? 0;
    if (pendingExtra > 0) {
      setExtraTurns((prev) => ({
        ...prev,
        [activePlayerId]: pendingExtra - 1,
      }));

      setPlayers((prev) =>
        prev.map((p) => ({
          ...p,
          isActive: p.id === activePlayerId,
        }))
      );

      return;
    }

    const currentIndex = turnOrder.indexOf(activePlayerId);
    const nextId = turnOrder[(currentIndex + 1) % turnOrder.length];

    setActivePlayerId(nextId);
    setPlayers((prev) => prev.map((p) => ({ ...p, isActive: p.id === nextId })));
  }

  function grantExtraTurn(playerId: string) {
    setExtraTurns((prev) => ({
      ...prev,
      [playerId]: (prev[playerId] ?? 0) + 1,
    }));
  }

  function updateLife(playerId: string, amount: number) {
    setPlayers((prev) =>
      prev.map((p) => (p.id === playerId ? { ...p, life: p.life + amount } : p))
    );
  }

  function updateToken(
    playerId: string,
    tokenUid: string,
    updater: (token: TokenInstance) => TokenInstance
  ) {
    setPlayers((prev) =>
      prev.map((player) => {
        if (player.id !== playerId) return player;

        return {
          ...player,
          tokens: player.tokens.map((token) => (token.uid === tokenUid ? updater(token) : token)),
        };
      })
    );
  }

  function addToken(playerId: string, card: ScryfallCard) {
    const instance: TokenInstance = {
      uid: crypto.randomUUID(),
      card,
      quantity: 1,
      plusCounters: 0,
      minusCounters: 0,
      tapped: false,
    };

    setPlayers((prev) =>
      prev.map((p) => (p.id === playerId ? { ...p, tokens: [...p.tokens, instance] } : p))
    );
  }

  function removeToken(playerId: string, tokenUid: string) {
    setPlayers((prev) =>
      prev.map((p) =>
        p.id === playerId ? { ...p, tokens: p.tokens.filter((t) => t.uid !== tokenUid) } : p
      )
    );
  }

  return (
    <div className="home">
      <header className="home-header">
        <div className="home-header-content">
          <div>
            <h1 className="home-title">Tokenarium</h1>

            <p className="home-subtitle">
              {players.length} jogador{players.length !== 1 ? "es" : ""} •{" "}
              {players.reduce((s, p) => s + p.tokens.length, 0)} tokens
            </p>
          </div>

          <AddPlayerForm onAdd={addPlayer} />
        </div>
      </header>

      <TurnBar
        turnOrder={turnOrder}
        players={players}
        activePlayerId={activePlayerId}
        onStartGame={startGame}
        onNextTurn={nextTurn}
        gameStarted={gameStarted}
        turnCount={turnCount}
        extraTurnsTotal={extraTurnsTotal}
      />

      <main className="home-main">
        {players.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🂠</div>
            <div className="empty-state-title">Nenhum jogador ainda</div>
            <div className="empty-state-description">
              Use o campo acima para adicionar jogadores
            </div>
          </div>
        ) : (
          <div
            className="players-grid"
            style={{ "--columns": Math.min(players.length, 4) } as CSSVars}
          >
            {players.map((p) => (
              <PlayerPanel
                key={p.id}
                player={p}
                isActive={p.id === activePlayerId}
                activePlayerId={activePlayerId}
                onUpdateLife={(amt) => updateLife(p.id, amt)}
                onAttack={() =>
                  setCombatView({
                    attackerId: activePlayerId ?? "",
                    defenderId: p.id,
                  })
                }
                onRemove={() => removePlayer(p.id)}
                onChangeColor={(color) => changeColor(p.id, color)}
                onAddToken={(card) => addToken(p.id, card)}
                onAddExtraTurn={() => grantExtraTurn(p.id)}
                extraTurnsCount={extraTurns[p.id] ?? 0}
                onSelectCard={setSelectedCard}
                onRemoveToken={(playerId, tokenUid) => removeToken(playerId, tokenUid)}
                onToggleTapped={(playerId, tokenUid) =>
                  updateToken(playerId, tokenUid, (t) => ({ ...t, tapped: !t.tapped }))
                }
                onIncrementQuantity={(playerId, tokenUid) =>
                  updateToken(playerId, tokenUid, (t) => ({
                    ...t,
                    quantity: t.quantity + 1,
                  }))
                }
                onDecrementQuantity={(playerId, tokenUid) =>
                  updateToken(playerId, tokenUid, (t) => ({
                    ...t,
                    quantity: Math.max(1, t.quantity - 1),
                  }))
                }
                onAddPlusCounter={(playerId, tokenUid) =>
                  updateToken(playerId, tokenUid, (t) => ({
                    ...t,
                    plusCounters: t.plusCounters + 1,
                  }))
                }
                onRemovePlusCounter={(playerId, tokenUid) =>
                  updateToken(playerId, tokenUid, (t) => ({
                    ...t,
                    plusCounters: Math.max(0, t.plusCounters - 1),
                  }))
                }
                onAddMinusCounter={(playerId, tokenUid) =>
                  updateToken(playerId, tokenUid, (t) => ({
                    ...t,
                    minusCounters: t.minusCounters + 1,
                  }))
                }
                onRemoveMinusCounter={(playerId, tokenUid) =>
                  updateToken(playerId, tokenUid, (t) => ({
                    ...t,
                    minusCounters: Math.max(0, t.minusCounters - 1),
                  }))
                }
              />
            ))}
          </div>
        )}
      </main>

      <CombatPanel combat={combatView} players={players} onClose={() => setCombatView(null)} />

      <CardPreview card={selectedCard} onClose={() => setSelectedCard(null)} />
    </div>
  );
}

// ─── ADD PLAYER FORM ──────────────────────────────────────────────────────────

function AddPlayerForm({ onAdd }: AddPlayerFormProps) {
  const [name, setName] = useState("");

  function submit() {
    if (!name.trim()) return;
    onAdd(name.trim());
    setName("");
  }

  return (
    <div className="add-player-form">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="Nome do jogador..."
        className="add-player-input"
      />

      <button onClick={submit} className="add-player-btn" type="button">
        + Adicionar
      </button>
    </div>
  );
}
