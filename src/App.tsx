import { useMemo, useState } from "react";
import {
  Plus,
  Search,
  Trash2,
  Users,
  Loader2,
  X,
  ChevronDown,
  ChevronUp,
  Minus,
  Palette,
} from "lucide-react";

{/* TYPES */}
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
  tokens: TokenInstance[];
}

{/* COLOR PICKER */}

const PLAYER_COLORS = [
  { name: "Azul", value: "#2563eb", bg: "bg-blue-600", bgLight: "bg-blue-50", text: "text-blue-700" },
  { name: "Vermelho", value: "#dc2626", bg: "bg-red-600", bgLight: "bg-red-50", text: "text-red-700" },
  { name: "Verde", value: "#16a34a", bg: "bg-green-600", bgLight: "bg-green-50", text: "text-green-700" },
  { name: "Roxo", value: "#9333ea", bg: "bg-purple-600", bgLight: "bg-purple-50", text: "text-purple-700" },
  { name: "Laranja", value: "#ea580c", bg: "bg-orange-600", bgLight: "bg-orange-50", text: "text-orange-700" },
  { name: "Rosa", value: "#ec4899", bg: "bg-pink-600", bgLight: "bg-pink-50", text: "text-pink-700" },
  { name: "Índigo", value: "#4f46e5", bg: "bg-indigo-600", bgLight: "bg-indigo-50", text: "text-indigo-700" },
  { name: "Teal", value: "#0d9488", bg: "bg-teal-600", bgLight: "bg-teal-50", text: "text-teal-700" },
];

function getColorClasses(colorValue: string) {
  const color = PLAYER_COLORS.find((c) => c.value === colorValue);
  return color || PLAYER_COLORS[0];
}

{/* HELPERS */}

function getCardImage(card: ScryfallCard | null): string | null {
  if (!card) return null;

  if (card.image_uris?.normal) return card.image_uris.normal;

  if (card.image_uris?.large) return card.image_uris.large;

  if (card.card_faces?.[0]?.image_uris?.normal) {
    return card.card_faces[0].image_uris.normal;
  }

  if (card.card_faces?.[0]?.image_uris?.large) {
    return card.card_faces[0].image_uris.large;
  }

  return null;
}

function getCardText(card: ScryfallCard | null): string {
  if (!card) return "";

  const lines: string[] = [];

  if (card.type_line) lines.push(card.type_line);

  if (card.oracle_text) lines.push(card.oracle_text);

  if (card.flavor_text) {
    lines.push(`"${card.flavor_text}"`);
  }

  return lines.join("\n\n");
}

{ /* SEARCH COMPONENTS */}

async function searchTokens(
  query: string
): Promise<ScryfallCard[]> {
  const clean = query.trim();

  if (!clean) return [];

  const scryfallQuery = `is:token name:"${clean}"`;

  const url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(
    scryfallQuery
  )}&unique=prints`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Erro ao buscar token.");
  }

  const data = await response.json();

  if (!data.data) return [];

  return data.data.filter((card: ScryfallCard) => {
    const typeLine = card.type_line?.toLowerCase() || "";

    return (
      typeLine.includes("token") &&
      card.name.toLowerCase().includes(clean.toLowerCase())
    );
  });
}

{/* TOKEN COUNTER COMPONENT*/}

interface TokenCounterProps {
  label: string;
  value: number;
  onIncrement: () => void;
  onDecrement: () => void;
  variant: "plus" | "minus";
}

function TokenCounter({
  label,
  value,
  onIncrement,
  onDecrement,
  variant,
}: TokenCounterProps) {
  const bgColor =
    variant === "plus"
      ? "bg-emerald-50 hover:bg-emerald-100"
      : "bg-rose-50 hover:bg-rose-100";

  const textColor =
    variant === "plus" ? "text-emerald-700" : "text-rose-700";

  const buttonColor =
    variant === "plus"
      ? "bg-emerald-200 hover:bg-emerald-300 text-emerald-800"
      : "bg-rose-200 hover:bg-rose-300 text-rose-800";

  return (
    <div className={`rounded-lg p-3 ${bgColor} transition-colors`}>
      <div className="text-xs font-semibold text-gray-600 mb-2">
        {label}
      </div>
      <div className="flex items-center justify-between">
        <span className={`text-2xl font-bold ${textColor}`}>
          {value}
        </span>
        <div className="flex gap-1">
          <button
            onClick={onDecrement}
            className={`p-1.5 rounded transition-colors ${buttonColor}`}
            title="Diminuir"
          >
            <Minus className="w-3 h-3" />
          </button>
          <button
            onClick={onIncrement}
            className={`p-1.5 rounded transition-colors ${buttonColor}`}
            title="Aumentar"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

{/* TOKEN CARD COMPONENT */}

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
  onHover: () => void;
  onLeave: () => void;
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
  onHover,
  onLeave,
}: TokenCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-all duration-200"
    >
      {/* Card Image */}
      <div
        onClick={onToggleTapped}
        className={`relative cursor-pointer overflow-hidden bg-gray-100 aspect-[63/88] transition-all duration-200 ${
          token.tapped ? "opacity-60 scale-95" : ""
        }`}
      >
        {getCardImage(token.card) ? (
          <img
            src={getCardImage(token.card)!}
            alt={token.card.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-200 to-gray-300 text-gray-500 font-semibold">
            No Image
          </div>
        )}

        {/* Quantity Badge */}
        <div className="absolute bottom-2 right-2 bg-gray-900 text-white px-2 py-1 rounded-lg text-xs font-bold shadow-lg">
          ×{token.quantity}
        </div>

        {/* Counter Badges */}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {token.plusCounters > 0 && (
            <div className="bg-emerald-600 text-white px-2 py-0.5 rounded text-xs font-bold shadow-lg">
              +{token.plusCounters}
            </div>
          )}
          {token.minusCounters > 0 && (
            <div className="bg-rose-600 text-white px-2 py-0.5 rounded text-xs font-bold shadow-lg">
              −{token.minusCounters}
            </div>
          )}
        </div>

        {/* Tapped Indicator */}
        {token.tapped && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-sm">
            <div className="text-white text-xs font-bold bg-black/60 px-2 py-1 rounded">
              Tapped
            </div>
          </div>
        )}
      </div>

      {/* Card Info */}
      <div className="p-3">
        <h3 className="font-semibold text-sm text-gray-900 truncate mb-1">
          {token.card.name}
        </h3>
        <p className="text-xs text-gray-500 truncate mb-3">
          {token.card.set_name || "Unknown Set"}
        </p>

        {/* Expandable Controls */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between p-2 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors mb-2"
        >
          <span className="text-xs font-semibold text-gray-700">
            Controles
          </span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-gray-600" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-600" />
          )}
        </button>

        {expanded && (
          <div className="space-y-2 mb-3 pb-3 border-t border-gray-100">
            {/* Quantity Control */}
            <div className="pt-2">
              <div className="text-xs font-semibold text-gray-600 mb-1">
                Quantidade
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={onDecrementQuantity}
                  className="flex-1 px-2 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded text-xs font-semibold transition-colors"
                  title="Diminuir quantidade"
                >
                  −
                </button>
                <span className="px-2 py-1.5 bg-gray-100 text-gray-900 rounded text-xs font-bold text-center min-w-[2rem]">
                  {token.quantity}
                </span>
                <button
                  onClick={onIncrementQuantity}
                  className="flex-1 px-2 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded text-xs font-semibold transition-colors"
                  title="Aumentar quantidade"
                >
                  +
                </button>
              </div>
            </div>

            {/* Plus Counters */}
            <TokenCounter
              label="Contadores +"
              value={token.plusCounters}
              onIncrement={onAddPlusCounter}
              onDecrement={onRemovePlusCounter}
              variant="plus"
            />

            {/* Minus Counters */}
            <TokenCounter
              label="Contadores −"
              value={token.minusCounters}
              onIncrement={onAddMinusCounter}
              onDecrement={onRemoveMinusCounter}
              variant="minus"
            />
          </div>
        )}

        {/* Remove Button */}
        <button
          onClick={onRemove}
          className="w-full px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1"
          title="Remover token"
        >
          <Trash2 className="w-3 h-3" />
          Remover
        </button>
      </div>
    </div>
  );
}

{/*  PLAYER CARD */}

interface PlayerCardProps {
  player: Player;
  loading: boolean;
  onRemovePlayer: (id: string) => void;
  onChangeColor: (id: string, color: string) => void;
  openTokenPicker: (playerId: string, tokens: ScryfallCard[]) => void;
  onRemoveToken: (playerId: string, tokenUid: string) => void;
  onHoverToken: (token: ScryfallCard) => void;
  onLeaveToken: () => void;
  onIncrementQuantity: (playerId: string, tokenUid: string) => void;
  onDecrementQuantity: (playerId: string, tokenUid: string) => void;
  onAddPlusCounter: (playerId: string, tokenUid: string) => void;
  onRemovePlusCounter: (playerId: string, tokenUid: string) => void;
  onAddMinusCounter: (playerId: string, tokenUid: string) => void;
  onRemoveMinusCounter: (playerId: string, tokenUid: string) => void;
  onToggleTapped: (playerId: string, tokenUid: string) => void;
}

function PlayerCard({
  player,
  loading,
  onRemovePlayer,
  onChangeColor,
  openTokenPicker,
  onRemoveToken,
  onHoverToken,
  onLeaveToken,
  onIncrementQuantity,
  onDecrementQuantity,
  onAddPlusCounter,
  onRemovePlusCounter,
  onAddMinusCounter,
  onRemoveMinusCounter,
  onToggleTapped,
}: PlayerCardProps) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");
  const [colorPickerOpen, setColorPickerOpen] = useState(false);

  const colorClasses = getColorClasses(player.color);

  async function handleSearch() {
    setLocalError("");

    if (!query.trim()) return;

    try {
      setBusy(true);

      const results = await searchTokens(query);

      if (!results.length) {
        setLocalError("Nenhum token encontrado.");
        return;
      }

      openTokenPicker(player.id, results);

      setQuery("");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro inesperado.";

      setLocalError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      {/* Player Header */}
      <div className={`${colorClasses.bg} px-6 py-4`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white">
              <Users className="h-5 w-5" />
            </div>

            <div>
              <h2 className="font-semibold text-lg text-white">
                {player.name}
              </h2>

              <p className="text-xs text-white/80">
                {player.tokens.length} token{player.tokens.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setColorPickerOpen(!colorPickerOpen)}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors text-white"
                title="Escolher cor"
              >
                <Palette className="h-5 w-5" />
              </button>

              {colorPickerOpen && (
                <div className="absolute right-0 top-full mt-2 bg-white rounded-lg shadow-xl p-4 z-50 grid grid-cols-4 gap-3 w-max border border-gray-200">
                  {PLAYER_COLORS.map((color) => (
                    <button
                      key={color.value}
                      onClick={() => {
                        onChangeColor(player.id, color.value);
                        setColorPickerOpen(false);
                      }}
                      className={`w-10 h-10 rounded-lg transition-all ${color.bg} ${
                        player.color === color.value
                          ? "ring-2 ring-offset-2 ring-gray-400 shadow-md"
                          : "hover:scale-105 shadow-sm"
                      }`}
                      title={color.name}
                    />
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => onRemovePlayer(player.id)}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors text-white"
              title="Remover jogador"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Search Section */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex gap-2 mb-3">
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent transition-all">
            <Search className="h-4 w-4 text-gray-400" />

            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && handleSearch()
              }
              placeholder="Procurar token..."
              className="w-full bg-transparent outline-none text-sm placeholder-gray-400"
            />
          </div>

          <button
            disabled={busy || loading}
            onClick={handleSearch}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-semibold transition-colors flex items-center gap-2"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">Buscar</span>
          </button>
        </div>

        {localError && (
          <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
            {localError}
          </div>
        )}
      </div>

      {/* Tokens Grid */}
      <div className="p-6">
        {player.tokens.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <div className="text-4xl mb-2">∅</div>

            <span className="text-sm font-medium">
              Nenhum token adicionado
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {player.tokens.map((tokenInstance) => (
              <TokenCard
                key={tokenInstance.uid}
                token={tokenInstance}
                onRemove={() =>
                  onRemoveToken(player.id, tokenInstance.uid)
                }
                onToggleTapped={() =>
                  onToggleTapped(player.id, tokenInstance.uid)
                }
                onIncrementQuantity={() =>
                  onIncrementQuantity(
                    player.id,
                    tokenInstance.uid
                  )
                }
                onDecrementQuantity={() =>
                  onDecrementQuantity(
                    player.id,
                    tokenInstance.uid
                  )
                }
                onAddPlusCounter={() =>
                  onAddPlusCounter(player.id, tokenInstance.uid)
                }
                onRemovePlusCounter={() =>
                  onRemovePlusCounter(
                    player.id,
                    tokenInstance.uid
                  )
                }
                onAddMinusCounter={() =>
                  onAddMinusCounter(player.id, tokenInstance.uid)
                }
                onRemoveMinusCounter={() =>
                  onRemoveMinusCounter(
                    player.id,
                    tokenInstance.uid
                  )
                }
                onHover={() => onHoverToken(tokenInstance.card)}
                onLeave={onLeaveToken}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

{/* THIS IS THE APP */}

export default function Home() {
  const [players, setPlayers] = useState<Player[]>([]);

  const [newPlayerName, setNewPlayerName] = useState("");

  const [hovered, setHovered] =
    useState<ScryfallCard | null>(null);

  const [tokenPickerOpen, setTokenPickerOpen] =
    useState(false);

  const [tokenPickerResults, setTokenPickerResults] =
    useState<ScryfallCard[]>([]);

  const [selectedPlayerId, setSelectedPlayerId] =
    useState<string | null>(null);

  const totalTokens = useMemo(() => {
    return players.reduce(
      (sum, player) => sum + player.tokens.length,
      0
    );
  }, [players]);

  function addPlayer() {
    if (!newPlayerName.trim()) return;

    setPlayers((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: newPlayerName,
        color: PLAYER_COLORS[prev.length % PLAYER_COLORS.length].value,
        tokens: [],
      },
    ]);

    setNewPlayerName("");
  }

  function removePlayer(id: string) {
    setPlayers((prev) =>
      prev.filter((p) => p.id !== id)
    );
  }

  function changePlayerColor(id: string, color: string) {
    setPlayers((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, color } : p
      )
    );
  }

  function addToken(
    playerId: string,
    token: ScryfallCard
  ) {
    const instance: TokenInstance = {
      uid: crypto.randomUUID(),
      card: token,
      quantity: 1,
      plusCounters: 0,
      minusCounters: 0,
      tapped: false,
    };

    setPlayers((prev) =>
      prev.map((p) =>
        p.id === playerId
          ? {
              ...p,
              tokens: [...p.tokens, instance],
            }
          : p
      )
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
            token.uid === tokenUid
              ? updater(token)
              : token
          ),
        };
      })
    );
  }

  function removeToken(
    playerId: string,
    tokenUid: string
  ) {
    setPlayers((prev) =>
      prev.map((player) => {
        if (player.id !== playerId) return player;

        return {
          ...player,
          tokens: player.tokens.filter(
            (t) => t.uid !== tokenUid
          ),
        };
      })
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                MTG Token Manager
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                {players.length} jogador{players.length !== 1 ? "es" : ""} • {totalTokens} token{totalTokens !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Add Player Section */}
        <div className="mb-8">
          <div className="flex gap-2 max-w-md">
            <input
              value={newPlayerName}
              onChange={(e) =>
                setNewPlayerName(e.target.value)
              }
              onKeyDown={(e) =>
                e.key === "Enter" && addPlayer()
              }
              placeholder="Nome do novo jogador..."
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
            />

            <button
              onClick={addPlayer}
              className="px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors flex items-center gap-2"
            >
              <Plus className="h-5 w-5" />
              <span className="hidden sm:inline">Adicionar</span>
            </button>
          </div>
        </div>

        {/* Players Grid */}
        {players.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <div className="text-6xl mb-4">∅</div>
            <p className="text-lg font-medium">
              Nenhum jogador adicionado ainda
            </p>
            <p className="text-sm mt-2">
              Comece adicionando um novo jogador acima
            </p>
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
            {/* Players Section */}
            <div className="grid gap-6 auto-rows-max">
              {players.map((player) => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  loading={false}
                  onRemovePlayer={removePlayer}
                  onChangeColor={changePlayerColor}
                  openTokenPicker={(
                    playerId,
                    tokens
                  ) => {
                    setSelectedPlayerId(playerId);

                    setTokenPickerResults(tokens);

                    setTokenPickerOpen(true);
                  }}
                  onRemoveToken={removeToken}
                  onHoverToken={setHovered}
                  onLeaveToken={() => setHovered(null)}
                  onIncrementQuantity={(
                    playerId,
                    tokenUid
                  ) =>
                    updateToken(
                      playerId,
                      tokenUid,
                      (token) => ({
                        ...token,
                        quantity:
                          token.quantity + 1,
                      })
                    )
                  }
                  onDecrementQuantity={(
                    playerId,
                    tokenUid
                  ) =>
                    updateToken(
                      playerId,
                      tokenUid,
                      (token) => ({
                        ...token,
                        quantity: Math.max(
                          1,
                          token.quantity - 1
                        ),
                      })
                    )
                  }
                  onAddPlusCounter={(
                    playerId,
                    tokenUid
                  ) =>
                    updateToken(
                      playerId,
                      tokenUid,
                      (token) => ({
                        ...token,
                        plusCounters:
                          token.plusCounters + 1,
                      })
                    )
                  }
                  onRemovePlusCounter={(
                    playerId,
                    tokenUid
                  ) =>
                    updateToken(
                      playerId,
                      tokenUid,
                      (token) => ({
                        ...token,
                        plusCounters: Math.max(
                          0,
                          token.plusCounters - 1
                        ),
                      })
                    )
                  }
                  onAddMinusCounter={(
                    playerId,
                    tokenUid
                  ) =>
                    updateToken(
                      playerId,
                      tokenUid,
                      (token) => ({
                        ...token,
                        minusCounters:
                          token.minusCounters + 1,
                      })
                    )
                  }
                  onRemoveMinusCounter={(
                    playerId,
                    tokenUid
                  ) =>
                    updateToken(
                      playerId,
                      tokenUid,
                      (token) => ({
                        ...token,
                        minusCounters: Math.max(
                          0,
                          token.minusCounters - 1
                        ),
                      })
                    )
                  }
                  onToggleTapped={(
                    playerId,
                    tokenUid
                  ) =>
                    updateToken(
                      playerId,
                      tokenUid,
                      (token) => ({
                        ...token,
                        tapped: !token.tapped,
                      })
                    )
                  }
                />
              ))}
            </div>

            {/* Card Preview Sidebar */}
            <aside className="sticky top-24 h-fit">
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                <div className="bg-gradient-to-r from-purple-600 to-purple-700 px-6 py-4">
                  <h2 className="font-semibold text-lg text-white">
                    Visualização
                  </h2>
                </div>

                <div className="p-6">
                  {hovered ? (
                    <>
                      {getCardImage(hovered) && (
                        <img
                          src={getCardImage(hovered)!}
                          alt={hovered.name}
                          className="mb-4 rounded-lg w-full shadow-md"
                        />
                      )}

                      <h3 className="mb-3 font-semibold text-lg text-gray-900">
                        {hovered.name}
                      </h3>

                      <div className="mb-4 inline-block rounded-lg bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                        {hovered.type_line}
                      </div>

                      <div className="whitespace-pre-line text-sm leading-relaxed text-gray-700">
                        {getCardText(hovered)}
                      </div>
                    </>
                  ) : (
                    <div className="flex min-h-[500px] flex-col items-center justify-center text-gray-300">
                      <div className="text-5xl mb-3">∅</div>

                      <p className="text-sm font-medium">
                        Passe o mouse sobre um token
                      </p>
                      <p className="text-xs mt-1">
                        para visualizar seus detalhes
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </aside>
          </div>
        )}
      </main>

      {/* TOKEN PICKER MODAL */}

      {tokenPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-6xl overflow-auto rounded-xl border border-gray-300 bg-white shadow-2xl">
            <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between border-b border-gray-200">
              <h2 className="text-2xl font-bold text-white">
                Selecione um Token
              </h2>

              <button
                onClick={() =>
                  setTokenPickerOpen(false)
                }
                className="p-2 hover:bg-white/20 rounded-lg transition-colors text-white"
                title="Fechar"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6">
              {tokenPickerResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <div className="text-4xl mb-2">∅</div>
                  <p className="text-sm font-medium">
                    Nenhum token encontrado
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {tokenPickerResults.map((token) => (
                    <button
                      key={token.id}
                      onClick={() => {
                        if (!selectedPlayerId) return;

                        addToken(
                          selectedPlayerId,
                          token
                        );

                        setTokenPickerOpen(false);
                      }}
                      className="group text-left"
                    >
                      <div className="overflow-hidden rounded-lg border border-gray-300 transition-all group-hover:shadow-lg group-hover:border-blue-500">
                        {getCardImage(token) ? (
                          <img
                            src={getCardImage(token)!}
                            alt={token.name}
                            className="aspect-[63/88] w-full object-cover"
                          />
                        ) : (
                          <div className="aspect-[63/88] bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center text-gray-500 font-semibold">
                            No Image
                          </div>
                        )}
                      </div>

                      <div className="mt-2">
                        <h3 className="font-semibold text-sm text-gray-900 truncate">
                          {token.name}
                        </h3>

                        <p className="text-xs text-gray-600 truncate">
                          {token.set_name || "Unknown"}
                        </p>

                        <p className="text-[10px] text-gray-500">
                          #{token.collector_number}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}