import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { GripVertical, ArrowLeft, MapPin, Maximize2, Home as HomeIcon, Car, StickyNote, Tag, Star, PiggyBank, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getCurrentUser, getRankingOrder, saveRankingOrder, getRankingNotes, saveRankingNote, getAllPropertyTags, addPropertyTag, removePropertyTag, getRankingPreferences, saveRankingPreferences, type RankingPreferences } from "@/lib/auth";

interface Property {
  id: string;
  nome?: string;
  imagem?: string;
  valor?: string;
  m2?: string;
  localizacao?: string;
  link?: string;
  quartos?: string;
  garagem?: string;
  tags?: string[];
  banhos?: string;
  distancia?: number;
}

type NotesMap = Record<string, string>;

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=400&h=300&fit=crop";

const sanitizeImageUrl = (url?: string) => {
  if (!url) return FALLBACK_IMAGE;
  if (url.startsWith("http:")) return url.replace(/^http:/, "https:");
  if (url.startsWith("//")) return `https:${url}`;
  return url;
};

const normalizeTags = (value: unknown): string[] => {
  const result = new Set<string>();

  const addValue = (item: unknown) => {
    if (typeof item === "string") {
      item
        .split(",")
        .map(segment => segment.trim())
        .filter(Boolean)
        .forEach(tag => result.add(tag));
    } else if (Array.isArray(item)) {
      item.forEach(entry => addValue(entry));
    }
  };

  addValue(value);

  return Array.from(result);
};

const parseJson = <T,>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

const parseNumericValue = (valueStr?: string): number => {
  if (!valueStr) return 0;
  try {
    const num = parseInt(String(valueStr).replace(/[^\d]/g, ""), 10);
    return Number.isFinite(num) ? num : 0;
  } catch (e) {
    return 0;
  }
};

export default function Ranking() {
  const [storageKeySuffix, setStorageKeySuffix] = useState("guest");
  const [rankingItems, setRankingItems] = useState<Property[]>([]);
  const [notes, setNotes] = useState<NotesMap>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [bestMatchId, setBestMatchId] = useState<string | null>(null);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [editingPropertyForTags, setEditingPropertyForTags] = useState<Property | null>(null);

  // Preferences: priority 1..4 (1 = highest weight). 0 means not used.
  const [prefTamanhoPriority, setPrefTamanhoPriority] = useState<number>(1);
  const [prefQuartosPriority, setPrefQuartosPriority] = useState<number>(2);
  const [prefBanheirosPriority, setPrefBanheirosPriority] = useState<number>(3);
  const [prefDistanciaPriority, setPrefDistanciaPriority] = useState<number>(4);

  const [prefTamanhoValue, setPrefTamanhoValue] = useState<number | null>(80); // desired minimum m2
  const [prefQuartosValue, setPrefQuartosValue] = useState<number | null>(2);
  const [prefBanheirosValue, setPrefBanheirosValue] = useState<number | null>(1);
  const [prefDistanciaValue, setPrefDistanciaValue] = useState<number | null>(10); // km max

  const rankingOrderKey = useMemo(
    () => `propertyRankingOrder_${storageKeySuffix}`,
    [storageKeySuffix],
  );
  const rankingNotesKey = useMemo(
    () => `propertyRankingNotes_${storageKeySuffix}`,
    [storageKeySuffix],
  );


  const persistOrder = useCallback(
    async (items: Property[], userId?: string) => {
      try {
        if (userId) {
          const ids = items.map(item => item.id);
          await saveRankingOrder(userId, ids);
        }
      } catch (error) {
        console.error("Erro ao salvar ordem do ranking", error);
        toast.error("Erro ao salvar ordem do ranking");
      }
    },
    [],
  );

  const persistNotes = useCallback(
    async (notesMap: NotesMap, userId?: string) => {
      try {
        if (userId) {
          // Save all notes to Supabase
          for (const [propertyId, note] of Object.entries(notesMap)) {
            if (note.trim()) {
              await saveRankingNote(userId, propertyId, note);
            }
          }
        }
      } catch (error) {
        console.error("Erro ao salvar notas do ranking", error);
        toast.error("Erro ao salvar notas do ranking");
      }
    },
    [],
  );

  const mergeOrderWithProperties = useCallback(
    (propertiesToMerge: Property[], orderIds: string[]) => {
      if (!Array.isArray(orderIds) || orderIds.length === 0) {
        return propertiesToMerge;
      }

      const mapById = new Map(propertiesToMerge.map(property => [property.id, property]));
      const ordered: Property[] = [];

      orderIds.forEach(id => {
        const match = mapById.get(id);
        if (match) {
          ordered.push(match);
          mapById.delete(id);
        }
      });

      if (mapById.size > 0) {
        ordered.push(...mapById.values());
      }

      return ordered;
    },
    [],
  );

  const loadData = useCallback(async () => {
    if (typeof window === "undefined") return;

    const user = await getCurrentUser();
    const userId = user?.id;
    const suffix = userId ?? "guest";
    setStorageKeySuffix(suffix);

    let likes: Property[] = [];
    if (user) {
      likes = (user.likedProperties as Property[]) ?? [];
    } else {
      setRankingItems([]);
      setNotes({});
      return;
    }

    // Load tags from Supabase
    const tagsMap = await getAllPropertyTags(userId);

    const enhancedLikes = likes.map((property, index) => ({
      ...property,
      id: property.id || `${property.link ?? property.nome ?? "property"}-${index}`,
      imagem: sanitizeImageUrl(property.imagem),
      tags: tagsMap[property.id || `${property.link ?? property.nome ?? "property"}-${index}`] || [],
    }));

    // Load ranking order from Supabase
    const orderIds = await getRankingOrder(userId);
    // Load ranking notes from Supabase
    const storedNotes = await getRankingNotes(userId);

    // Load ranking preferences from Supabase
    const preferences = await getRankingPreferences(userId);
    setPrefTamanhoValue(preferences.prefTamanhoValue);
    setPrefTamanhoPriority(preferences.prefTamanhoPriority);
    setPrefQuartosValue(preferences.prefQuartosValue);
    setPrefQuartosPriority(preferences.prefQuartosPriority);
    setPrefBanheirosValue(preferences.prefBanheirosValue);
    setPrefBanheirosPriority(preferences.prefBanheirosPriority);
    setPrefDistanciaValue(preferences.prefDistanciaValue);
    setPrefDistanciaPriority(preferences.prefDistanciaPriority);

    const ordered = mergeOrderWithProperties(enhancedLikes, orderIds);
    setRankingItems(ordered);
    setNotes(storedNotes);
  }, [mergeOrderWithProperties]);

  useEffect(() => {
    loadData();

    const handleUsersUpdated = () => loadData();
    window.addEventListener("app-users-updated", handleUsersUpdated as EventListener);

    return () => {
      window.removeEventListener("app-users-updated", handleUsersUpdated as EventListener);
    };
  }, [loadData]);

  // Save ranking preferences whenever they change
  useEffect(() => {
    const savePreferences = async () => {
      const user = await getCurrentUser();
      if (!user) return;

      const preferences: RankingPreferences = {
        prefTamanhoValue,
        prefTamanhoPriority,
        prefQuartosValue,
        prefQuartosPriority,
        prefBanheirosValue,
        prefBanheirosPriority,
        prefDistanciaValue,
        prefDistanciaPriority,
      };

      try {
        await saveRankingPreferences(user.id, preferences);
      } catch (error) {
        console.error('Erro ao salvar preferências de ranking:', error);
      }
    };

    savePreferences();
  }, [prefTamanhoValue, prefTamanhoPriority, prefQuartosValue, prefQuartosPriority, prefBanheirosValue, prefBanheirosPriority, prefDistanciaValue, prefDistanciaPriority]);

  const moveItem = useCallback(
    async (sourceId: string, targetId: string | null) => {
      if (sourceId === targetId) return;
      const user = await getCurrentUser();
      if (!user) return;

      setRankingItems(prev => {
        const current = [...prev];
        const fromIndex = current.findIndex(item => item.id === sourceId);
        if (fromIndex === -1) return prev;
        const [moved] = current.splice(fromIndex, 1);
        if (!moved) return prev;

        if (targetId) {
          const toIndex = current.findIndex(item => item.id === targetId);
          if (toIndex === -1) {
            current.push(moved);
          } else {
            current.splice(toIndex, 0, moved);
          }
        } else {
          current.push(moved);
        }

        persistOrder(current, user.id);
        return current;
      });
    },
    [persistOrder],
  );

  const openNoteDialog = useCallback(
    (property: Property) => {
      setEditingProperty(property);
      setNoteDraft(notes[property.id] ?? "");
      setNoteDialogOpen(true);
    },
    [notes],
  );

  const closeNoteDialog = useCallback(() => {
    setNoteDialogOpen(false);
    setNoteDraft("");
    setEditingProperty(null);
  }, []);

  const handleSaveNote = useCallback(async () => {
    if (!editingProperty) return;
    const user = await getCurrentUser();
    if (!user) {
      toast.error("Você precisa estar logado para salvar notas");
      return;
    }

    const trimmed = noteDraft.trim();
    try {
      // Save to Supabase
      await saveRankingNote(user.id, editingProperty.id, trimmed);

      setNotes(prev => {
        const updated: NotesMap = { ...prev };
        if (trimmed) {
          updated[editingProperty.id] = trimmed;
        } else {
          delete updated[editingProperty.id];
        }
        return updated;
      });
      toast.success("Descrição salva no ranking!");
      closeNoteDialog();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido ao salvar descrição';
      console.error('Erro ao salvar nota:', errorMsg);
      toast.error(`Erro ao salvar descrição: ${errorMsg}`);
    }
  }, [closeNoteDialog, editingProperty, noteDraft]);

  const handleDragStart = useCallback((event: React.DragEvent<HTMLElement>, propertyId: string) => {
    event.dataTransfer.effectAllowed = "move";
    setDraggingId(propertyId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
  }, []);

  const handleItemDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>, targetId: string) => {
      event.preventDefault();
      if (!draggingId) return;
      moveItem(draggingId, targetId);
      setDraggingId(null);
    },
    [draggingId, moveItem],
  );

  const handleContainerDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (!draggingId) return;
      moveItem(draggingId, null);
      setDraggingId(null);
    },
    [draggingId, moveItem],
  );

  const handleAddTag = useCallback(async (property: Property, tag: string) => {
    const user = await getCurrentUser();
    if (!user) {
      toast.error("Você precisa estar logado para adicionar tags");
      return;
    }

    try {
      await addPropertyTag(user.id, property.id, tag);
      setRankingItems(prev => prev.map(p => {
        if (p.id === property.id) {
          const newTags = Array.from(new Set([...(p.tags || []), tag]));
          return { ...p, tags: newTags };
        }
        return p;
      }));
      toast.success("Tag adicionada!");
    } catch (error) {
      console.error('Erro ao adicionar tag:', error);
      toast.error("Erro ao adicionar tag");
    }
  }, []);

  const handleRemoveTag = useCallback(async (property: Property, tag: string) => {
    const user = await getCurrentUser();
    if (!user) {
      toast.error("Você precisa estar logado para remover tags");
      return;
    }

    try {
      await removePropertyTag(user.id, property.id, tag);
      setRankingItems(prev => prev.map(p => {
        if (p.id === property.id) {
          const newTags = (p.tags || []).filter(t => t !== tag);
          return { ...p, tags: newTags };
        }
        return p;
      }));
      toast.success("Tag removida!");
    } catch (error) {
      console.error('Erro ao remover tag:', error);
      toast.error("Erro ao remover tag");
    }
  }, []);

  const moveItemToIndex = useCallback(
    async (sourceId: string, toIndexOneBased: number) => {
      const user = await getCurrentUser();
      if (!user) return;

      setRankingItems(prev => {
        const current = [...prev];
        const fromIndex = current.findIndex(item => item.id === sourceId);
        if (fromIndex === -1) return prev;
        const [moved] = current.splice(fromIndex, 1);
        if (!moved) return prev;
        const clamped = Math.max(0, Math.min((toIndexOneBased | 0) - 1, current.length));
        current.splice(clamped, 0, moved);
        persistOrder(current, user.id);
        return current;
      });
    },
    [persistOrder],
  );

  const applyPositionInput = useCallback(
    (id: string, raw: string) => {
      const value = parseInt(raw, 10);
      if (!Number.isFinite(value)) return;
      moveItemToIndex(id, value);
    },
    [moveItemToIndex],
  );

  const handlePriorityChange = (key: string, priority: number) => {
    // swap priorities to keep uniqueness
    if (key === "tamanho") {
      if (prefQuartosPriority === priority) setPrefQuartosPriority(prefTamanhoPriority);
      if (prefBanheirosPriority === priority) setPrefBanheirosPriority(prefTamanhoPriority);
      if (prefDistanciaPriority === priority) setPrefDistanciaPriority(prefTamanhoPriority);
      setPrefTamanhoPriority(priority);
    }
    if (key === "quartos") {
      if (prefTamanhoPriority === priority) setPrefTamanhoPriority(prefQuartosPriority);
      if (prefBanheirosPriority === priority) setPrefBanheirosPriority(prefQuartosPriority);
      if (prefDistanciaPriority === priority) setPrefDistanciaPriority(prefQuartosPriority);
      setPrefQuartosPriority(priority);
    }
    if (key === "banheiros") {
      if (prefTamanhoPriority === priority) setPrefTamanhoPriority(prefBanheirosPriority);
      if (prefQuartosPriority === priority) setPrefQuartosPriority(prefBanheirosPriority);
      if (prefDistanciaPriority === priority) setPrefDistanciaPriority(prefBanheirosPriority);
      setPrefBanheirosPriority(priority);
    }
    if (key === "distancia") {
      if (prefTamanhoPriority === priority) setPrefTamanhoPriority(prefDistanciaPriority);
      if (prefQuartosPriority === priority) setPrefQuartosPriority(prefDistanciaPriority);
      if (prefBanheirosPriority === priority) setPrefBanheirosPriority(prefDistanciaPriority);
      setPrefDistanciaPriority(priority);
    }
  };

  const computeWeights = useCallback(() => {
    // priority 1..4 -> weight = 5 - priority (1->4, 4->1)
    const map: Record<string, number> = {};
    map["tamanho"] = 5 - (prefTamanhoPriority || 0);
    map["quartos"] = 5 - (prefQuartosPriority || 0);
    map["banheiros"] = 5 - (prefBanheirosPriority || 0);
    map["distancia"] = 5 - (prefDistanciaPriority || 0);
    return map;
  }, [prefTamanhoPriority, prefQuartosPriority, prefBanheirosPriority, prefDistanciaPriority]);

  const computeScoreForProperty = useCallback((property: Property) => {
    const weights = computeWeights();
    let totalWeight = 0;
    let score = 0;

    // Tamanho (minimum desired)
    if (prefTamanhoValue && prefTamanhoValue > 0) {
      const propM2 = parseNumericValue(property.m2);
      const w = weights["tamanho"] || 0;
      if (w > 0) {
        totalWeight += w;
        let s = 0;
        if (propM2 >= prefTamanhoValue) s = 1;
        else if (propM2 > 0) s = propM2 / prefTamanhoValue;
        score += s * w;
      }
    }

    // Quartos (minimum desired)
    if (prefQuartosValue && prefQuartosValue > 0) {
      const propQ = parseNumericValue(property.quartos);
      const w = weights["quartos"] || 0;
      if (w > 0) {
        totalWeight += w;
        let s = 0;
        if (propQ >= prefQuartosValue) s = 1;
        else if (propQ > 0) s = propQ / prefQuartosValue;
        score += s * w;
      }
    }

    // Banheiros (minimum desired) - support property.banhos or property.banheiros
    if (prefBanheirosValue && prefBanheirosValue > 0) {
      const propB = parseNumericValue((property as any).banhos || (property as any).banheiros || property.banhos || "");
      const w = weights["banheiros"] || 0;
      if (w > 0) {
        totalWeight += w;
        let s = 0;
        if (propB >= prefBanheirosValue) s = 1;
        else if (propB > 0) s = propB / prefBanheirosValue;
        score += s * w;
      }
    }

    // Distancia (maximum desired) - lower is better
    if (prefDistanciaValue != null && prefDistanciaValue >= 0) {
      const propD = property.distancia ?? 0;
      const w = weights["distancia"] || 0;
      if (w > 0) {
        totalWeight += w;
        let s = 0;
        if (propD === 0 && prefDistanciaValue === 0) s = 1;
        else if (propD <= prefDistanciaValue) s = 1;
        else if (prefDistanciaValue > 0) {
          // penalize proportionally up to 2x the desired distance
          const diff = propD - prefDistanciaValue;
          s = Math.max(0, 1 - diff / Math.max(prefDistanciaValue, 1));
        }
        score += s * w;
      }
    }

    if (totalWeight === 0) return 0;
    return score / totalWeight; // normalized 0..1
  }, [prefTamanhoValue, prefQuartosValue, prefBanheirosValue, prefDistanciaValue, computeWeights]);

  const calculateBestMatch = useCallback(() => {
    if (!rankingItems || rankingItems.length === 0) return;
    const scored = rankingItems.map(item => ({ item, score: computeScoreForProperty(item) }));
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (best) {
      const ordered = scored.map(s => s.item);
      setRankingItems(ordered);
      persistOrder(ordered);
      setBestMatchId(best.item.id);
      toast.success("Melhor imóvel destacado com base nas preferências");
    }
  }, [rankingItems, computeScoreForProperty, persistOrder]);

  useEffect(() => {
    // Recompute best match whenever preferences change
    calculateBestMatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefTamanhoPriority, prefQuartosPriority, prefBanheirosPriority, prefDistanciaPriority, prefTamanhoValue, prefQuartosValue, prefBanheirosValue, prefDistanciaValue]);

  return (
    <div className={cn("min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50", draggingId ? "select-none" : undefined)}>
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-40">
        <div className="container mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Link to="/">
                <Button variant="outline" size="sm" className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Voltar
                </Button>
              </Link>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Ranking de Imóveis</h1>
                <p className="text-sm text-gray-600">
                  Organize seus favoritos arrastando e explique suas escolhas com um duplo clique.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <StickyNote className="h-4 w-4 text-purple-500" />
              <span>{rankingItems.length} imóveis no ranking</span>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <section className="mb-6">
          <Card className="bg-white/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-base sm:text-lg">Como funciona</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-gray-700">
              <p>
                • Os imóveis curtidos são carregados automaticamente. Arraste cada cartão para posicionar no ranking.
              </p>
              <p>
                • Dê um duplo clique em um cartão (ou use o botão "Adicionar descrição") para registrar o motivo da posição.
              </p>
              <p>
                • Use o painel de Preferências abaixo para definir prioridades e o sistema destacará o imóvel que mais combina.
              </p>
            </CardContent>
          </Card>
        </section>

        <section className="mb-6">
          <Card className="bg-white/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">Preferências de Ranqueamento <Star className="h-5 w-5 text-yellow-500" /></CardTitle>
              <p className="text-xs sm:text-sm text-gray-600 mt-2">Todos os campos são opcionais. Deixe em branco para ignorar uma preferência.</p>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Tamanho */}
              <div className="space-y-3">
                <div>
                  <Label className="text-sm font-medium">Tamanho mínimo (m²)</Label>
                  <p className="text-xs text-gray-500">Opcional</p>
                </div>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    value={prefTamanhoValue ?? ''}
                    onChange={(e) => setPrefTamanhoValue(e.target.value === '' ? null : Number(e.target.value))}
                    className="w-32"
                    placeholder="Ex: 80"
                  />
                  <div className="flex items-center gap-2">
                    <Label className="text-sm whitespace-nowrap">Prioridade</Label>
                    <select value={prefTamanhoPriority} onChange={(e) => handlePriorityChange('tamanho', Number(e.target.value))} className="border rounded p-1 text-sm">
                      {[1,2,3,4].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Quartos */}
              <div className="space-y-3">
                <div>
                  <Label className="text-sm font-medium">Quartos mínimos</Label>
                  <p className="text-xs text-gray-500">Opcional</p>
                </div>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    value={prefQuartosValue ?? ''}
                    onChange={(e) => setPrefQuartosValue(e.target.value === '' ? null : Number(e.target.value))}
                    className="w-32"
                    placeholder="Ex: 2"
                  />
                  <div className="flex items-center gap-2">
                    <Label className="text-sm whitespace-nowrap">Prioridade</Label>
                    <select value={prefQuartosPriority} onChange={(e) => handlePriorityChange('quartos', Number(e.target.value))} className="border rounded p-1 text-sm">
                      {[1,2,3,4].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Banheiros */}
              <div className="space-y-3">
                <div>
                  <Label className="text-sm font-medium">Banheiros mínimos</Label>
                  <p className="text-xs text-gray-500">Opcional</p>
                </div>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    value={prefBanheirosValue ?? ''}
                    onChange={(e) => setPrefBanheirosValue(e.target.value === '' ? null : Number(e.target.value))}
                    className="w-32"
                    placeholder="Ex: 1"
                  />
                  <div className="flex items-center gap-2">
                    <Label className="text-sm whitespace-nowrap">Prioridade</Label>
                    <select value={prefBanheirosPriority} onChange={(e) => handlePriorityChange('banheiros', Number(e.target.value))} className="border rounded p-1 text-sm">
                      {[1,2,3,4].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Distância */}
              <div className="space-y-3">
                <div>
                  <Label className="text-sm font-medium">Distância máxima (km)</Label>
                  <p className="text-xs text-gray-500">Opcional</p>
                </div>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    value={prefDistanciaValue ?? ''}
                    onChange={(e) => setPrefDistanciaValue(e.target.value === '' ? null : Number(e.target.value))}
                    className="w-32"
                    placeholder="Ex: 10"
                  />
                  <div className="flex items-center gap-2">
                    <Label className="text-sm whitespace-nowrap">Prioridade</Label>
                    <select value={prefDistanciaPriority} onChange={(e) => handlePriorityChange('distancia', Number(e.target.value))} className="border rounded p-1 text-sm">
                      {[1,2,3,4].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="md:col-span-2 flex flex-col gap-4 mt-2">
                <div className="text-xs sm:text-sm text-gray-600 bg-blue-50 p-3 rounded">
                  💡 <strong>Dica:</strong> A prioridade 1 recebe o maior peso no cálculo. Deixe campos em branco para ignorar essa preferência.
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button onClick={calculateBestMatch} className="bg-green-600 hover:bg-green-700 gap-2">
                    <Star className="h-4 w-4" />
                    Calcular melhor imóvel
                  </Button>
                  <Button variant="outline" onClick={() => { setBestMatchId(null); toast.info('Destaque removido'); }}>Remover destaque</Button>
                  <Link to="/cofrinho">
                    <Button variant="outline" className="gap-2">
                      <PiggyBank className="h-4 w-4" />
                      Ir para Cofrinho
                    </Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {rankingItems.length === 0 ? (
          <Card className="bg-white/80 backdrop-blur-sm">
            <CardContent className="p-10 text-center space-y-3">
              <h2 className="text-lg font-semibold text-gray-900">Nenhum imóvel no ranking ainda</h2>
              <p className="text-sm text-gray-600">
                Curta imóveis na página principal para que eles apareçam aqui automaticamente.
              </p>
              <div className="flex justify-center">
                <Link to="/">
                  <Button className="gap-2">Voltar para a busca</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div
            className="space-y-4"
            onDragOver={event => event.preventDefault()}
            onDrop={handleContainerDrop}
          >
            {rankingItems.map((property, index) => (
              <Card
                key={property.id}
                onDragEnd={handleDragEnd}
                onDragOver={event => event.preventDefault()}
                onDrop={event => handleItemDrop(event, property.id)}
                onDoubleClick={() => openNoteDialog(property)}
                tabIndex={0}
                onKeyDown={event => {
                  if (event.key === "Enter") {
                    openNoteDialog(property);
                  }
                }}
                className={cn(
                  "bg-white/80 backdrop-blur-sm shadow-sm transition-shadow duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400",
                  draggingId === property.id ? "ring-2 ring-purple-500 shadow-lg" : "hover:shadow-lg",
                  "sm:select-text select-none",
                  property.id === bestMatchId ? "border-2 border-yellow-300 bg-yellow-50" : undefined,
                )}
              >
                <CardContent className="p-4 sm:p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <div className="flex items-center gap-2 text-gray-500">
                      <div
                        className="flex items-center gap-2"
                        draggable
                        onDragStart={event => handleDragStart(event, property.id)}
                        aria-label="Arrastar para reordenar"
                        role="button"
                      >
                        <GripVertical className="h-5 w-5" />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-xl font-semibold text-gray-900">#</span>
                        <Input
                          key={`${property.id}-${index}`}
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={rankingItems.length}
                          defaultValue={index + 1}
                          onBlur={e => applyPositionInput(property.id, e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter") {
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                          onDragStart={e => e.stopPropagation()}
                          className="w-16 h-8 text-center px-2 py-1"
                          aria-label="Posição no ranking"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 flex-1">
                      <div className="w-full sm:w-48 overflow-hidden rounded-lg">
                        <img
                          src={property.imagem || FALLBACK_IMAGE}
                          alt={property.nome}
                          className="h-40 w-full object-cover"
                          draggable={false}
                          onMouseDown={e => e.preventDefault()}
                          onTouchStart={e => e.preventDefault()}
                          style={{ WebkitUserDrag: "none", userSelect: "none", WebkitTouchCallout: "none" }}
                          onError={event => {
                            (event.target as HTMLImageElement).src = FALLBACK_IMAGE;
                          }}
                        />
                      </div>

                      <div className="flex-1 space-y-3">
                        <div className="flex flex-col gap-1">
                          <h3 className="text-lg font-semibold text-gray-900 leading-tight line-clamp-2">
                            {property.nome}
                          </h3>
                          {property.valor && (
                            <p className="text-base font-bold text-purple-600">{property.valor}</p>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-600">
                          {property.localizacao && (
                            <div className="flex items-center gap-2">
                              <MapPin className="h-4 w-4 text-gray-400" />
                              <span className="line-clamp-1">{property.localizacao}</span>
                            </div>
                          )}
                          {property.m2 && (
                            <div className="flex items-center gap-2">
                              <Maximize2 className="h-4 w-4 text-gray-400" />
                              <span>{property.m2}</span>
                            </div>
                          )}
                          {property.quartos && (
                            <div className="flex items-center gap-2">
                              <HomeIcon className="h-4 w-4 text-gray-400" />
                              <span>{property.quartos}</span>
                            </div>
                          )}
                          {(property.garagem || (property as any).garagem) && (
                            <div className="flex items-center gap-2">
                              <Car className="h-4 w-4 text-gray-400" />
                              <span>{property.garagem} vagas</span>
                            </div>
                          )}
                        </div>

                        {(property.tags && property.tags.length > 0 || true) && (
                          <div className="flex flex-wrap gap-2 items-center">
                            {property.tags && property.tags.map((tag, tagIndex) => (
                              <Badge key={`${property.id}-tag-${tagIndex}`} variant="secondary" className="gap-1 pr-0 group">
                                <Tag className="h-3 w-3" />
                                {tag}
                                <button
                                  onClick={() => handleRemoveTag(property, tag)}
                                  className="ml-1 p-0.5 hover:bg-red-200 rounded transition-colors"
                                  title="Remover tag"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </Badge>
                            ))}
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-xs gap-1"
                              onClick={() => {
                                setEditingPropertyForTags(property);
                                setTagDraft("");
                                setTagDialogOpen(true);
                              }}
                            >
                              <Tag className="h-3 w-3" />
                              Adicionar tag
                            </Button>
                          </div>
                        )}

                        <div className="space-y-2">
                          {notes[property.id] ? (
                            <div className="bg-purple-50 border border-purple-200 text-purple-900 rounded-lg p-3 text-sm">
                              <p className="font-medium flex items-center gap-2">
                                <StickyNote className="h-4 w-4" />
                                Motivo registrado
                              </p>
                              <p className="mt-1 whitespace-pre-wrap leading-relaxed">{notes[property.id]}</p>
                            </div>
                          ) : (
                            <div className="bg-gray-100 border border-dashed border-gray-300 rounded-lg p-3 text-sm text-gray-600">
                              Duplo clique para explicar por que este imóvel está na posição #{index + 1}.
                            </div>
                          )}

                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-2"
                              onClick={() => openNoteDialog(property)}
                            >
                              <StickyNote className="h-4 w-4" />
                              {notes[property.id] ? "Editar descrição" : "Adicionar descrição"}
                            </Button>
                            {property.link && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => window.open(property.link, "_blank", "noopener,noreferrer")}
                              >
                                Ver anúncio
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      <Dialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar motivo no ranking</DialogTitle>
            {editingProperty && (
              <p className="text-sm text-gray-600">
                {editingProperty.nome ? `${editingProperty.nome}` : "Imóvel selecionado"}
              </p>
            )}
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="note">Descrição</Label>
              <Textarea
                id="note"
                value={noteDraft}
                onChange={event => setNoteDraft(event.target.value)}
                placeholder="Explique por que este imóvel merece esta posição no ranking"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter className="pt-4">
            <Button variant="outline" onClick={closeNoteDialog}>
              Cancelar
            </Button>
            <Button onClick={handleSaveNote}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={tagDialogOpen} onOpenChange={setTagDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Adicionar tag ao imóvel</DialogTitle>
            {editingPropertyForTags && (
              <p className="text-sm text-gray-600">
                {editingPropertyForTags.nome ? `${editingPropertyForTags.nome}` : "Imóvel selecionado"}
              </p>
            )}
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tag">Tag</Label>
              <Input
                id="tag"
                value={tagDraft}
                onChange={event => setTagDraft(event.target.value)}
                placeholder="Ex: Próximo ao metrô, Vista panorâmica, Piscina"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter className="pt-4">
            <Button variant="outline" onClick={() => setTagDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={async () => {
              if (editingPropertyForTags && tagDraft.trim()) {
                await handleAddTag(editingPropertyForTags, tagDraft.trim());
                setTagDialogOpen(false);
              }
            }}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
