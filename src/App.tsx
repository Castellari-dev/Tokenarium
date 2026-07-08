import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import "./index.css";

import { Loader2, Palette, Plus, RotateCcw, Search, Swords, Trash2, Users, X } from "lucide-react";


// ─── UUID HELPER (works on http://localhost, no secure context required) ────

function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
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

/** Agrupa todas as ações sobre tokens para não explodir o número de props. */
interface TokenActions {
  remove: (playerId: string, tokenUid: string) => void;
  toggleTapped: (playerId: string, tokenUid: string) => void;
  incrementQuantity: (playerId: string, tokenUid: string, amount: number) => void;
  decrementQuantity: (playerId: string, tokenUid: string, amount: number) => void;
  addPlusCounter: (playerId: string, tokenUid: string, amount: number) => void;
  removePlusCounter: (playerId: string, tokenUid: string, amount: number) => void;
  addMinusCounter: (playerId: string, tokenUid: string, amount: number) => void;
  removeMinusCounter: (playerId: string, tokenUid: string, amount: number) => void;
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

/** Gera `count` matizes espalhados igualmente por todo o espectro (roda de cores). */
function generateColorSpectrum(count: number): string[] {
  const colors: string[] = [];
  for (let i = 0; i < count; i++) {
    const hue = Math.round((360 / count) * i);
    colors.push(`hsl(${hue}, 72%, 52%)`);
  }
  return colors;
}

const COLOR_SPECTRUM = generateColorSpectrum(24);

// ─── COLOR MATH (para o picker customizado, sem input nativo) ──────────────

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function hsvToHex(h: number, s: number, v: number): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    const c = v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(5)}${f(3)}${f(1)}`;
}

/** Aceita "#rrggbb" ou "hsl(h, s%, l%)" e converte para HSV. */
function parseColorToHsv(color: string): { h: number; s: number; v: number } {
  const trimmed = color.trim();

  const hslMatch = trimmed.match(
    /^hsl\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%\s*\)$/i
  );
  if (hslMatch) {
    const h = parseFloat(hslMatch[1]);
    const sl = parseFloat(hslMatch[2]) / 100;
    const l = parseFloat(hslMatch[3]) / 100;
    const v = l + sl * Math.min(l, 1 - l);
    const s = v === 0 ? 0 : 2 * (1 - l / v);
    return { h, s, v };
  }

  let r = 37;
  let g = 99;
  let b = 235; // fallback: #2563eb
  const hexMatch = trimmed.match(/^#([0-9a-f]{6})$/i);
  if (hexMatch) {
    r = parseInt(hexMatch[1].slice(0, 2), 16);
    g = parseInt(hexMatch[1].slice(2, 4), 16);
    b = parseInt(hexMatch[1].slice(4, 6), 16);
  }

  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === rn) h = 60 * (((gn - bn) / d) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / d + 2);
    else h = 60 * ((rn - gn) / d + 4);
  }
  if (h < 0) h += 360;

  return { h, s: max === 0 ? 0 : d / max, v: max };
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

// ─── TOKEN COUNTER ──────────────────────────────────────────────────────────

function TokenCounter({
  label,
  value,
  onIncrement,
  onDecrement,
  variant,
}: {
  label: string;
  value: number;
  onIncrement: (amount: number) => void;
  onDecrement: (amount: number) => void;
  variant: "plus" | "minus";
}) {
  const [amount, setAmount] = useState("");

  function getAmount() {
    const n = parseInt(amount, 10);
    return !isNaN(n) && n > 0 ? n : 1;
  }

  return (
    <div className={`token-counter-box ${variant}`}>
      <div className="token-counter-label">{label}</div>

      <div className="token-counter-row">
        <span className="token-counter-value">{value}</span>

        <div className="token-counter-controls">
          <input
            className="token-counter-amount-input"
            value={amount}
            placeholder="1"
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          />

          <button
            onClick={(e) => { e.stopPropagation(); onDecrement(getAmount()); }}
            className="token-counter-btn"
            type="button"
          >
            −
          </button>

          <button
            onClick={(e) => { e.stopPropagation(); onIncrement(getAmount()); }}
            className="token-counter-btn"
            type="button"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ADD TOKEN MODAL ────────────────────────────────────────────────────────

function AddTokenModal({
  open,
  playerName,
  onClose,
  onPick,
}: {
  open: boolean;
  playerName: string;
  onClose: () => void;
  onPick: (card: ScryfallCard) => void;
}) {
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
    <div className="token-picker-overlay" onClick={onClose}>
      <div className="token-picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="token-picker-header">
          <div>
            <span className="token-picker-title">Adicionar token</span>
            <div className="token-picker-subtitle">{playerName}</div>
          </div>

          <button onClick={onClose} className="token-picker-close" type="button">
            <X size={18} />
          </button>
        </div>

        <div className="token-picker-content">
          <div className="token-search-bar">
            <div className="token-search-input-wrapper">
              <Search size={14} className="token-search-icon" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Buscar token no Scryfall..."
                className="token-search-input"
                autoFocus
              />
            </div>

            <button
              onClick={handleSearch}
              disabled={busy}
              className="token-search-btn"
              type="button"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : "Buscar"}
            </button>
          </div>

          {error && <div className="token-search-error">{error}</div>}

          {results.length === 0 ? (
            <div className="token-picker-empty">Use a busca acima para localizar tokens.</div>
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

// ─── TOKEN CARD ─────────────────────────────────────────────────────────────

function TokenCard({
  token,
  playerId,
  actions,
  onSelect,
}: {
  token: TokenInstance;
  playerId: string;
  actions: TokenActions;
  onSelect: () => void;
}) {
  const img = getCardImage(token.card);
  const [showControls, setShowControls] = useState(false);
  const [qtyAmount, setQtyAmount] = useState("");
  const pt = getFinalPT(token);

  function getQtyAmount() {
    const n = parseInt(qtyAmount, 10);
    return !isNaN(n) && n > 0 ? n : 1;
  }

  return (
    <div className="token-card" onClick={onSelect}>
      <div
        className={`token-image ${token.tapped ? "tapped" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          actions.toggleTapped(playerId, token.uid);
        }}
        title={token.tapped ? "Desvirar" : "Virar"}
      >
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

        {pt && <div className="token-pt">{pt}</div>}

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
        <div className="token-name" title={token.card.name}>
          {token.card.name}
        </div>
        <div className="token-set" title={token.card.type_line}>
          {token.card.type_line || "Token"}
        </div>

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
              <span className="token-quantity-value">{token.quantity}</span>

              <input
                className="token-quantity-amount-input"
                value={qtyAmount}
                placeholder="1"
                onChange={(e) => setQtyAmount(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              />

              <button
                className="small-btn"
                onClick={() => actions.decrementQuantity(playerId, token.uid, getQtyAmount())}
                type="button"
              >
                −
              </button>
              <button
                className="small-btn"
                onClick={() => actions.incrementQuantity(playerId, token.uid, getQtyAmount())}
                type="button"
              >
                +
              </button>
            </div>

            <div className="token-counters-grid">
              <TokenCounter
                label="Contadores +"
                value={token.plusCounters}
                onIncrement={(amt) => actions.addPlusCounter(playerId, token.uid, amt)}
                onDecrement={(amt) => actions.removePlusCounter(playerId, token.uid, amt)}
                variant="plus"
              />
              <TokenCounter
                label="Contadores −"
                value={token.minusCounters}
                onIncrement={(amt) => actions.addMinusCounter(playerId, token.uid, amt)}
                onDecrement={(amt) => actions.removeMinusCounter(playerId, token.uid, amt)}
                variant="minus"
              />
            </div>

            <button
              className="token-remove-btn"
              onClick={() => actions.remove(playerId, token.uid)}
              type="button"
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

// ─── CARD PREVIEW ───────────────────────────────────────────────────────────

function CardPreview({ card, onClose }: { card: ScryfallCard | null; onClose: () => void }) {
  if (!card) return null;

  const img = getCardImage(card);
  const lines: string[] = [];

  if (card.oracle_text) lines.push(card.oracle_text);
  if (card.flavor_text) lines.push(`"${card.flavor_text}"`);

  return (
    <div className="card-preview">
      <div className="card-preview-header">
        <span className="card-preview-title">Visualização</span>

        <button onClick={onClose} className="card-preview-close" type="button">
          <X size={14} />
        </button>
      </div>

      {img && <img src={img} alt={card.name} className="card-preview-image" />}

      <div className="card-preview-content">
        <div className="card-preview-name">{card.name}</div>

        {card.type_line && <div className="card-preview-type">{card.type_line}</div>}

        <div className="card-preview-text">{lines.join("\n\n")}</div>
      </div>
    </div>
  );
}

// ─── LIFE CONTROL ───────────────────────────────────────────────────────────

function LifeControl({
  life,
  color,
  onUpdate,
  size = "large",
}: {
  life: number;
  color: string;
  onUpdate: (amount: number) => void;
  size?: "large" | "medium";
}) {
  const [delta, setDelta] = useState("");

  function apply(sign: number) {
    const n = parseInt(delta, 10) || 1;
    onUpdate(sign * n);
    setDelta("");
  }

  return (
    <div className={`life-control ${size}`} style={{ "--player-color": color } as CSSVars}>
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

// ─── PLAYER BOARD (tela cheia / metade do combate) ─────────────────────────

function PlayerBoard({
  player,
  isActive,
  compact = false,
  roleLabel,
  extraTurnsCount,
  onUpdateLife,
  onAddToken,
  onAddExtraTurn,
  onSelectCard,
  tokenActions,
}: {
  player: Player;
  isActive: boolean;
  compact?: boolean;
  roleLabel?: string;
  extraTurnsCount: number;
  onUpdateLife: (amount: number) => void;
  onAddToken: (card: ScryfallCard) => void;
  onAddExtraTurn?: () => void;
  onSelectCard: (card: ScryfallCard) => void;
  tokenActions: TokenActions;
}) {
  const [addTokenOpen, setAddTokenOpen] = useState(false);

  return (
    <div
      className={`board ${compact ? "compact" : ""} ${isActive ? "active" : ""}`}
      style={{ "--player-color": player.color } as CSSVars}
    >
      <div className="board-header" style={{ background: player.color }}>
        <div className="board-header-left">
          <div className="board-avatar">
            <Users size={compact ? 16 : 20} />
          </div>

          <div>
            {roleLabel && <div className="board-role">{roleLabel}</div>}
            <div className="board-player-name">{player.name}</div>
            <div className="board-player-info">
              {player.tokens.length} token{player.tokens.length !== 1 ? "s" : ""}
              {isActive && " · vez atual"}
              {extraTurnsCount > 0 &&
                ` · +${extraTurnsCount} turno${extraTurnsCount > 1 ? "s" : ""} extra${extraTurnsCount > 1 ? "s" : ""}`}
            </div>
          </div>
        </div>

        {player.initiative > 0 && <div className="initiative-badge">d{player.initiative}</div>}
      </div>

      <div className="board-body">
        <div className="board-life-column">
          <LifeControl
            life={player.life}
            color={player.color}
            onUpdate={onUpdateLife}
            size={compact ? "medium" : "large"}
          />

          <button onClick={() => setAddTokenOpen(true)} className="board-action-btn" type="button">
            <Plus size={14} />
            Adicionar token
          </button>

          {isActive && onAddExtraTurn && (
            <button onClick={onAddExtraTurn} className="board-action-btn secondary" type="button">
              Turno extra
            </button>
          )}
        </div>

        <div className="board-tokens-column">
          <div className="board-tokens-title">Tokens em campo</div>

          {player.tokens.length === 0 ? (
            <div className="board-tokens-empty">
              Nenhum token ainda. Use "Adicionar token" para buscar no Scryfall.
            </div>
          ) : (
            <div className="board-tokens-grid">
              {player.tokens.map((tokenInstance) => (
                <TokenCard
                  key={tokenInstance.uid}
                  token={tokenInstance}
                  playerId={player.id}
                  actions={tokenActions}
                  onSelect={() => onSelectCard(tokenInstance.card)}
                />
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
    </div>
  );
}

// ─── CUSTOM COLOR PICKER (área de saturação/brilho + barra de matiz) ───────
// Implementado 100% em HTML/CSS/pointer events — nada de input nativo.

function CustomColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (hex: string) => void;
}) {
  // Inicializa a partir da cor atual do jogador (uma vez, ao montar).
  const [hsv, setHsv] = useState(() => parseColorToHsv(value));

  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);

  const hex = hsvToHex(hsv.h, hsv.s, hsv.v);
  const hueColor = `hsl(${Math.round(hsv.h)}, 100%, 50%)`;

  function updateSv(clientX: number, clientY: number) {
    const el = svRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const s = clamp01((clientX - rect.left) / rect.width);
    const v = 1 - clamp01((clientY - rect.top) / rect.height);
    setHsv((prev) => {
      const next = { ...prev, s, v };
      onChange(hsvToHex(next.h, next.s, next.v));
      return next;
    });
  }

  function updateHue(clientX: number) {
    const el = hueRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const h = clamp01((clientX - rect.left) / rect.width) * 360;
    setHsv((prev) => {
      const next = { ...prev, h };
      onChange(hsvToHex(next.h, next.s, next.v));
      return next;
    });
  }

  return (
    <div className="custom-color-picker">
      <div
        ref={svRef}
        className="custom-color-sv"
        style={{ "--hue-color": hueColor } as CSSVars}
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          updateSv(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) updateSv(e.clientX, e.clientY);
        }}
      >
        <span
          className="custom-color-sv-cursor"
          style={{
            left: `${hsv.s * 100}%`,
            top: `${(1 - hsv.v) * 100}%`,
            background: hex,
          }}
        />
      </div>

      <div className="custom-color-row">
        <span className="custom-color-preview" style={{ background: hex }} />

        <div
          ref={hueRef}
          className="custom-color-hue"
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            updateHue(e.clientX);
          }}
          onPointerMove={(e) => {
            if (e.buttons === 1) updateHue(e.clientX);
          }}
        >
          <span
            className="custom-color-hue-handle"
            style={{ left: `${(hsv.h / 360) * 100}%`, background: hueColor }}
          />
        </div>
      </div>

      <div className="custom-color-hex">{hex.toUpperCase()}</div>
    </div>
  );
}

// ─── COLOR PICKER MODAL (roda de cores + cor personalizada) ────────────────
// Renderizado como modal fixo para não ser cortado por containers com
// overflow (ex.: a coluna de jogadores no canto tem overflow-y: auto).

function ColorPickerModal({
  open,
  playerName,
  value,
  onClose,
  onSelect,
}: {
  open: boolean;
  playerName: string;
  value: string;
  onClose: () => void;
  onSelect: (color: string) => void;
}) {
  if (!open) return null;

  return (
    <div className="color-modal-overlay" onClick={onClose}>
      <div className="color-modal" onClick={(e) => e.stopPropagation()}>
        <div className="color-modal-header">
          <span className="color-modal-title">Cor de {playerName}</span>
          <button onClick={onClose} className="color-modal-close" type="button">
            <X size={16} />
          </button>
        </div>

        <div className="color-spectrum-grid">
          {COLOR_SPECTRUM.map((c) => (
            <button
              key={c}
              onClick={() => {
                onSelect(c);
                onClose();
              }}
              className={`color-swatch ${value === c ? "selected" : ""}`}
              style={{ background: c }}
              type="button"
            />
          ))}
        </div>

        <div className="color-modal-section-label">Cor personalizada</div>

        <CustomColorPicker value={value} onChange={onSelect} />
      </div>
    </div>
  );
}

// ─── MINI SQUARE (quadrado no canto para cada jogador) ─────────────────────

function MiniPlayerSquare({
  player,
  isActive,
  canAttack,
  inCombat,
  onAttack,
  onUpdateLife,
  onRemove,
  onChangeColor,
}: {
  player: Player;
  isActive: boolean;
  canAttack: boolean;
  inCombat: boolean;
  onAttack: () => void;
  onUpdateLife: (amount: number) => void;
  onRemove: () => void;
  onChangeColor: (color: string) => void;
}) {
  const [colorPickerOpen, setColorPickerOpen] = useState(false);

  return (
    <div
      className={`mini-square ${isActive ? "active" : ""} ${inCombat ? "in-combat" : ""}`}
      style={{ "--player-color": player.color } as CSSVars}
    >
      <div className="mini-square-top">
        <div className="mini-square-identity">
          <span className="mini-square-dot" />
          <span className="mini-square-name" title={player.name}>
            {player.name}
          </span>
        </div>

        <div className="mini-square-actions">
          <button
            onClick={() => setColorPickerOpen(true)}
            className="mini-icon-btn"
            type="button"
            title="Escolher cor"
          >
            <Palette size={13} />
          </button>

          <button
            onClick={onRemove}
            className="mini-icon-btn"
            type="button"
            title="Remover jogador"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div className="mini-square-life">
        <button className="mini-life-btn minus" onClick={() => onUpdateLife(-1)} type="button">
          −
        </button>
        <span className="mini-life-value">{player.life}</span>
        <button className="mini-life-btn plus" onClick={() => onUpdateLife(1)} type="button">
          +
        </button>
      </div>

      <div className="mini-square-footer">
        <span className="mini-square-tokens">
          {player.tokens.length} token{player.tokens.length !== 1 ? "s" : ""}
        </span>

        {player.turnPosition > 0 && (
          <span className="mini-square-position">#{player.turnPosition}</span>
        )}
      </div>

      {isActive && <div className="mini-square-turn-tag">Vez atual</div>}

      {canAttack && (
        <button className="mini-attack-btn" onClick={onAttack} type="button">
          <Swords size={13} />
          Atacar
        </button>
      )}

      <ColorPickerModal
        open={colorPickerOpen}
        playerName={player.name}
        value={player.color}
        onClose={() => setColorPickerOpen(false)}
        onSelect={onChangeColor}
      />
    </div>
  );
}

// ─── COMBAT SPLIT (tela dividida no meio) ───────────────────────────────────

function CombatSplit({
  combat,
  players,
  extraTurns,
  onClose,
  onUpdateLife,
  onAddToken,
  onSelectCard,
  tokenActions,
}: {
  combat: CombatView;
  players: Player[];
  extraTurns: Record<string, number>;
  onClose: () => void;
  onUpdateLife: (playerId: string, amount: number) => void;
  onAddToken: (playerId: string, card: ScryfallCard) => void;
  onSelectCard: (card: ScryfallCard) => void;
  tokenActions: TokenActions;
}) {
  const attacker = players.find((p) => p.id === combat.attackerId);
  const defender = players.find((p) => p.id === combat.defenderId);

  if (!attacker || !defender) return null;

  return (
    <div className="combat-split">
      <div className="combat-split-header">
        <div className="combat-split-title">
          <Swords size={18} />
          <span>
            Combate — {attacker.name} <em>vs</em> {defender.name}
          </span>
        </div>

        <button onClick={onClose} className="combat-end-btn" type="button">
          Encerrar combate
        </button>
      </div>

      <div className="combat-split-halves">
        <PlayerBoard
          player={attacker}
          isActive
          compact
          roleLabel="Atacante"
          extraTurnsCount={extraTurns[attacker.id] ?? 0}
          onUpdateLife={(amt) => onUpdateLife(attacker.id, amt)}
          onAddToken={(card) => onAddToken(attacker.id, card)}
          onSelectCard={onSelectCard}
          tokenActions={tokenActions}
        />

        <div className="combat-split-divider">
          <span className="combat-split-vs">⚔️</span>
        </div>

        <PlayerBoard
          player={defender}
          isActive={false}
          compact
          roleLabel="Defensor"
          extraTurnsCount={extraTurns[defender.id] ?? 0}
          onUpdateLife={(amt) => onUpdateLife(defender.id, amt)}
          onAddToken={(card) => onAddToken(defender.id, card)}
          onSelectCard={onSelectCard}
          tokenActions={tokenActions}
        />
      </div>
    </div>
  );
}

// ─── TURN BAR ───────────────────────────────────────────────────────────────

function TurnBar({
  turnOrder,
  players,
  activePlayerId,
  onNextTurn,
  turnCount,
  extraTurnsTotal,
}: {
  turnOrder: string[];
  players: Player[];
  activePlayerId: string | null;
  onNextTurn: () => void;
  turnCount: number;
  extraTurnsTotal: number;
}) {
  return (
    <div className="turnbar">
      <span className="turnbar-label">ORDEM:</span>

      <span className="turnbar-chip strong">Turno {turnCount}</span>

      {extraTurnsTotal > 0 && (
        <span className="turnbar-chip">
          +{extraTurnsTotal} turno{extraTurnsTotal > 1 ? "s" : ""} extra
          {extraTurnsTotal > 1 ? "s" : ""}
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

      <button onClick={onNextTurn} className="next-turn-btn" type="button">
        Próximo turno →
      </button>
    </div>
  );
}

// ─── SETUP (antes do jogo começar) ──────────────────────────────────────────

function SetupScreen({
  players,
  onAdd,
  onRemove,
  onChangeColor,
  onStartGame,
}: {
  players: Player[];
  onAdd: (name: string) => void;
  onRemove: (id: string) => void;
  onChangeColor: (id: string, color: string) => void;
  onStartGame: () => void;
}) {
  const [name, setName] = useState("");

  function submit() {
    if (!name.trim()) return;
    onAdd(name.trim());
    setName("");
  }

  return (
    <div className="setup-screen">
      <div className="setup-card">
        <h2 className="setup-title">Preparar mesa</h2>
        <p className="setup-subtitle">
          Adicione os jogadores e role a iniciativa para definir a ordem dos turnos.
        </p>

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

        {players.length === 0 ? (
          <div className="setup-empty">
            <div className="setup-empty-icon">🂠</div>
            Nenhum jogador ainda
          </div>
        ) : (
          <div className="setup-player-list">
            {players.map((p) => (
              <SetupPlayerRow
                key={p.id}
                player={p}
                onRemove={() => onRemove(p.id)}
                onChangeColor={(color) => onChangeColor(p.id, color)}
              />
            ))}
          </div>
        )}

        <button
          onClick={onStartGame}
          className="start-game-btn"
          type="button"
          disabled={players.length < 2}
        >
          {players.length < 2
            ? "Adicione pelo menos 2 jogadores"
            : "Rolar iniciativa e iniciar"}
        </button>
      </div>
    </div>
  );
}

function SetupPlayerRow({
  player,
  onRemove,
  onChangeColor,
}: {
  player: Player;
  onRemove: () => void;
  onChangeColor: (color: string) => void;
}) {
  const [colorPickerOpen, setColorPickerOpen] = useState(false);

  return (
    <div className="setup-player-row" style={{ "--player-color": player.color } as CSSVars}>
      <span className="setup-player-dot" />
      <span className="setup-player-name">{player.name}</span>
      <span className="setup-player-life">{player.life} vidas</span>

      <button
        onClick={() => setColorPickerOpen(true)}
        className="mini-icon-btn dark"
        type="button"
        title="Escolher cor"
      >
        <Palette size={14} />
      </button>

      <button onClick={onRemove} className="mini-icon-btn dark" type="button" title="Remover">
        <Trash2 size={14} />
      </button>

      <ColorPickerModal
        open={colorPickerOpen}
        playerName={player.name}
        value={player.color}
        onClose={() => setColorPickerOpen(false)}
        onSelect={onChangeColor}
      />
    </div>
  );
}

// ─── MAIN APP ───────────────────────────────────────────────────────────────

export default function Home() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [turnOrder, setTurnOrder] = useState<string[]>([]);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [combatView, setCombatView] = useState<CombatView | null>(null);
  const [selectedCard, setSelectedCard] = useState<ScryfallCard | null>(null);
  const [turnCount, setTurnCount] = useState(1);
  const [extraTurns, setExtraTurns] = useState<Record<string, number>>({});
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const activePlayer = useMemo(
    () => players.find((p) => p.id === activePlayerId) ?? null,
    [players, activePlayerId]
  );

  const extraTurnsTotal = useMemo(
    () => Object.values(extraTurns).reduce((sum, n) => sum + n, 0),
    [extraTurns]
  );

  function addPlayer(name: string) {
    const newPlayer: Player = {
      id: uuid(),
      name,
      color: assignColor(players.length),
      life: 40,
      initiative: 0,
      turnPosition: gameStarted ? turnOrder.length + 1 : 0,
      isActive: false,
      tokens: [],
    };

    setPlayers((prev) => [...prev, newPlayer]);

    // Se o jogo já começou, o novo jogador entra no fim da ordem de turnos.
    if (gameStarted) {
      setTurnOrder((prev) => [...prev, newPlayer.id]);
    }
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

    // Ao passar o turno, qualquer combate em andamento se encerra.
    setCombatView(null);
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

  /**
   * Reseta a mesa: volta todos os jogadores para 40 de vida e remove
   * todos os tokens. Turnos extras concedidos são zerados, já que
   * pertenciam à partida anterior.
   *
   * Se `rerollInitiative` for true, uma nova iniciativa é rolada e a
   * ordem de turnos é refeita; caso contrário, iniciativa, ordem de
   * turnos, turno ativo e contagem de turno são mantidos como estão.
   */
  function resetBoard(rerollInitiative: boolean) {
    setCombatView(null);
    setSelectedCard(null);
    setExtraTurns({});

    if (rerollInitiative) {
      const rolled = players
        .map((p) => ({ ...p, life: 40, tokens: [], initiative: Math.floor(Math.random() * 20) + 1 }))
        .sort((a, b) => b.initiative - a.initiative)
        .map((p, i) => ({ ...p, turnPosition: i + 1, isActive: i === 0 }));

      setPlayers(rolled);
      const order = rolled.map((p) => p.id);
      setTurnOrder(order);
      setActivePlayerId(order[0] ?? null);
      setTurnCount(1);
    } else {
      setPlayers((prev) => prev.map((p) => ({ ...p, life: 40, tokens: [] })));
    }
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
          tokens: player.tokens.map((token) =>
            token.uid === tokenUid ? updater(token) : token
          ),
        };
      })
    );
  }

  function addToken(playerId: string, card: ScryfallCard) {
    const instance: TokenInstance = {
      uid: uuid(),
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

  const tokenActions: TokenActions = {
    remove: removeToken,
    toggleTapped: (playerId, uid) =>
      updateToken(playerId, uid, (t) => ({ ...t, tapped: !t.tapped })),
    incrementQuantity: (playerId, uid, amount) =>
      updateToken(playerId, uid, (t) => ({ ...t, quantity: t.quantity + amount })),
    decrementQuantity: (playerId, uid, amount) =>
      updateToken(playerId, uid, (t) => ({ ...t, quantity: Math.max(1, t.quantity - amount) })),
    addPlusCounter: (playerId, uid, amount) =>
      updateToken(playerId, uid, (t) => ({ ...t, plusCounters: t.plusCounters + amount })),
    removePlusCounter: (playerId, uid, amount) =>
      updateToken(playerId, uid, (t) => ({
        ...t,
        plusCounters: Math.max(0, t.plusCounters - amount),
      })),
    addMinusCounter: (playerId, uid, amount) =>
      updateToken(playerId, uid, (t) => ({ ...t, minusCounters: t.minusCounters + amount })),
    removeMinusCounter: (playerId, uid, amount) =>
      updateToken(playerId, uid, (t) => ({
        ...t,
        minusCounters: Math.max(0, t.minusCounters - amount),
      })),
  };

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

          {gameStarted && (
            <div className="header-actions">
              <button
                onClick={() => setResetConfirmOpen(true)}
                className="reset-board-btn"
                type="button"
                title="Resetar mesa"
              >
                <RotateCcw size={14} />
                Resetar mesa
              </button>

              <AddPlayerInline onAdd={addPlayer} />
            </div>
          )}
        </div>
      </header>

      {!gameStarted ? (
        <SetupScreen
          players={players}
          onAdd={addPlayer}
          onRemove={removePlayer}
          onChangeColor={changeColor}
          onStartGame={startGame}
        />
      ) : (
        <>
          <TurnBar
            turnOrder={turnOrder}
            players={players}
            activePlayerId={activePlayerId}
            onNextTurn={nextTurn}
            turnCount={turnCount}
            extraTurnsTotal={extraTurnsTotal}
          />

          <main className="game-layout">
            <section className="board-area">
              {combatView ? (
                <CombatSplit
                  combat={combatView}
                  players={players}
                  extraTurns={extraTurns}
                  onClose={() => setCombatView(null)}
                  onUpdateLife={updateLife}
                  onAddToken={addToken}
                  onSelectCard={setSelectedCard}
                  tokenActions={tokenActions}
                />
              ) : activePlayer ? (
                <PlayerBoard
                  player={activePlayer}
                  isActive
                  extraTurnsCount={extraTurns[activePlayer.id] ?? 0}
                  onUpdateLife={(amt) => updateLife(activePlayer.id, amt)}
                  onAddToken={(card) => addToken(activePlayer.id, card)}
                  onAddExtraTurn={() => grantExtraTurn(activePlayer.id)}
                  onSelectCard={setSelectedCard}
                  tokenActions={tokenActions}
                />
              ) : (
                <div className="board-area-empty">Nenhum jogador ativo.</div>
              )}
            </section>

            <aside className="players-corner">
              <div className="players-corner-title">Jogadores</div>

              {players.map((p) => (
                <MiniPlayerSquare
                  key={p.id}
                  player={p}
                  isActive={p.id === activePlayerId}
                  canAttack={
                    p.id !== activePlayerId &&
                    activePlayerId !== null &&
                    combatView === null
                  }
                  inCombat={
                    combatView !== null &&
                    (combatView.attackerId === p.id || combatView.defenderId === p.id)
                  }
                  onAttack={() =>
                    setCombatView({
                      attackerId: activePlayerId!,
                      defenderId: p.id,
                    })
                  }
                  onUpdateLife={(amt) => updateLife(p.id, amt)}
                  onRemove={() => removePlayer(p.id)}
                  onChangeColor={(color) => changeColor(p.id, color)}
                />
              ))}
            </aside>
          </main>
        </>
      )}

      <footer className="home-footer">
        Powered by{" "}
        <a
          href="https://github.com/Castellari-dev"
          target="_blank"
          rel="noopener noreferrer"
          className="home-footer-link"
        >
          Castelari
        </a>{" "}
        arcane powers
      </footer>

      <CardPreview card={selectedCard} onClose={() => setSelectedCard(null)} />

      <ResetBoardModal
        open={resetConfirmOpen}
        onCancel={() => setResetConfirmOpen(false)}
        onConfirm={(rerollInitiative) => {
          resetBoard(rerollInitiative);
          setResetConfirmOpen(false);
        }}
      />
    </div>
  );
}

// ─── RESET BOARD MODAL ──────────────────────────────────────────────────────

function ResetBoardModal({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: (rerollInitiative: boolean) => void;
}) {
  const [rerollInitiative, setRerollInitiative] = useState(false);

  useEffect(() => {
    if (open) setRerollInitiative(false);
  }, [open]);

  if (!open) return null;

  return (
    <div className="reset-modal-overlay" onClick={onCancel}>
      <div className="reset-modal" onClick={(e) => e.stopPropagation()}>
        <div className="reset-modal-title">Resetar mesa?</div>
        <p className="reset-modal-text">
          Todos os jogadores voltam para 40 de vida e todos os tokens são
          removidos.
        </p>

        <div className="reset-modal-options">
          <label className="reset-modal-option">
            <input
              type="radio"
              name="initiative-choice"
              checked={!rerollInitiative}
              onChange={() => setRerollInitiative(false)}
            />
            <div>
              <div className="reset-modal-option-title">Manter iniciativa</div>
              <div className="reset-modal-option-desc">
                A ordem de turnos e o turno atual continuam como estão.
              </div>
            </div>
          </label>

          <label className="reset-modal-option">
            <input
              type="radio"
              name="initiative-choice"
              checked={rerollInitiative}
              onChange={() => setRerollInitiative(true)}
            />
            <div>
              <div className="reset-modal-option-title">Rolar iniciativa novamente</div>
              <div className="reset-modal-option-desc">
                Sorteia uma nova ordem de turnos e reinicia a contagem.
              </div>
            </div>
          </label>
        </div>

        <div className="reset-modal-actions">
          <button onClick={onCancel} className="reset-modal-cancel" type="button">
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(rerollInitiative)}
            className="reset-modal-confirm"
            type="button"
          >
            Resetar mesa
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ADD PLAYER (inline no header, durante o jogo) ──────────────────────────

function AddPlayerInline({ onAdd }: { onAdd: (name: string) => void }) {
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