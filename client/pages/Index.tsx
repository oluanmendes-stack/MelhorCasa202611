import React, { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Play, Square, Upload, Download, Home, MapPin, Car, Maximize2, Settings, Filter, Heart, ThumbsDown, ArrowUpDown, Archive, ListOrdered, Star, PiggyBank, Plus, Bath, Trash2, Calendar } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import * as XLSX from 'xlsx';
import { registerUser, loginUser, logoutUser, getCurrentUser, getAllUsers, addInvite, acceptInvite, addLikeForUser, addDislikeForUser, addMatchBetweenUsers, getUserById, initializeAuth, setCurrentUserId, removeLikeForUser, removeDislikeForUser } from '@/lib/auth';

import { Property } from '@/types/property';
import { MatchOverlay } from '@/components/MatchOverlay';
import { ManualPropertyEntry } from '@/components/ManualPropertyEntry';

interface UserLocation {
  address: string;
  latitude: number;
  longitude: number;
}

interface Filters {
  valorMin: string;
  valorMax: string;
  m2Min: number;
  m2Max: number;
  quartos: string[]; // allow multiple selections
  vagas: string[]; // allow multiple selections
  banhos: string[]; // allow multiple selections for bathrooms
  distanciaMax: number; // use large number (e.g. 1e9) to represent infinity
  location: string; // location search input
  tipo_imovel: string; // property type
  characteristics: string[]; // characteristics like piscina, acessivel, etc
  amenities: string[]; // amenities like elevador, academia, etc
  location_options: string[]; // location options like proximo_escola, proximo_hospital
  tour_virtual: boolean; // has virtual tour
  video: boolean; // has video
}

interface SortOption {
  field: 'valor' | 'distancia' | 'tamanho';
  direction: 'asc' | 'desc';
}

interface TouchPosition {
  x: number;
  y: number;
}

export default function Index() {
  const [isScrapingActive, setIsScrapingActive] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
    const [properties, setProperties] = useState<Property[]>([]);
  const [filteredProperties, setFilteredProperties] = useState<Property[]>([]);
  const [likedProperties, setLikedProperties] = useState<Property[]>([]);
  const [dislikedProperties, setDislikedProperties] = useState<Property[]>([]);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login'|'register'>('login');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isSharedHouseOpen, setIsSharedHouseOpen] = useState(false);
  const [statusFilters, setStatusFilters] = useState({ naPlanta: true, emConstrucao: true, leilao: true });
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLikedModalOpen, setIsLikedModalOpen] = useState(false);
  const [isMatchModeOpen, setIsMatchModeOpen] = useState(false);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [isTagModalOpen, setIsTagModalOpen] = useState(false);
  const [selectedPropertyForTag, setSelectedPropertyForTag] = useState<Property | null>(null);
  const [newTagInput, setNewTagInput] = useState("");
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [tagSearchInput, setTagSearchInput] = useState("");
  const [locationInput, setLocationInput] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>({ field: 'valor', direction: 'asc' });
  const [touchStart, setTouchStart] = useState<TouchPosition | null>(null);
  const [touchEnd, setTouchEnd] = useState<TouchPosition | null>(null);
  const [swipedCard, setSwipedCard] = useState<string | null>(null);
  const [dragX, setDragX] = useState(0);
  const dragStartX = useRef<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isManualEntryOpen, setIsManualEntryOpen] = useState(false);
  const [manualProperty, setManualProperty] = useState({
    nome: "",
    valor: "",
    link: "",
    imagem: "",
    localizacao: "",
    m2: "",
    quartos: "",
    vagas: "",
    banheiros: "",
    tags: [] as string[],
  });
  const [newLeisureTag, setNewLeisureTag] = useState("");
  const [matchOverlay, setMatchOverlay] = useState<{
    isOpen: boolean;
    property: Property | null;
    matchedWith: string;
  }>({
    isOpen: false,
    property: null,
    matchedWith: "",
  });
  const [apiBaseInput, setApiBaseInput] = useState("");
  const [supabaseUrlInput, setSupabaseUrlInput] = useState("");
  const [supabaseAnonKeyInput, setSupabaseAnonKeyInput] = useState("");

  const INFINITE = 1e9;

  const [filters, setFilters] = useState<Filters>({
    valorMin: "",
    valorMax: "250000",
    m2Min: 0,
    m2Max: INFINITE,
    quartos: ["all"],
    vagas: ["all"],
    banhos: [],
    distanciaMax: INFINITE,
    location: "",
    tipo_imovel: "apartamentos",
    characteristics: [],
    amenities: [],
    location_options: [],
    tour_virtual: false,
    video: false
  });

  // Ranking preferences (appear also on /ranking)
  const [prefTamanhoPriority, setPrefTamanhoPriority] = useState<number>(1);
  const [prefQuartosPriority, setPrefQuartosPriority] = useState<number>(2);
  const [prefBanheirosPriority, setPrefBanheirosPriority] = useState<number>(3);
  const [prefDistanciaPriority, setPrefDistanciaPriority] = useState<number>(4);

  const [prefTamanhoValue, setPrefTamanhoValue] = useState<number | null>(80);
  const [prefQuartosValue, setPrefQuartosValue] = useState<number | null>(2);
  const [prefBanheirosValue, setPrefBanheirosValue] = useState<number | null>(1);
  const [prefDistanciaValue, setPrefDistanciaValue] = useState<number | null>(10);
    const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem('API_BASE');
    if (stored) setApiBaseInput(stored);

    const sUrl = localStorage.getItem('SUPABASE_URL');
    if (sUrl) setSupabaseUrlInput(sUrl);
    const sKey = localStorage.getItem('SUPABASE_ANON_KEY');
    if (sKey) setSupabaseAnonKeyInput(sKey);
  }, []);

  const handleSaveApiBase = () => {
    localStorage.setItem('API_BASE', apiBaseInput);
    toast.success("URL da API salva com sucesso!");
  };

  const handleSaveSupabaseConfig = () => {
    localStorage.setItem('SUPABASE_URL', supabaseUrlInput);
    localStorage.setItem('SUPABASE_ANON_KEY', supabaseAnonKeyInput);
    toast.success("Configuração do Supabase salva! Recarregue a página para aplicar.", {
      action: {
        label: "Recarregar",
        onClick: () => window.location.reload()
      },
      duration: 10000
    });
  };

  // Function to calculate distance between two coordinates using Haversine formula
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  // Function to get coordinates from address using a geocoding service
  const geocodeAddress = async (address: string): Promise<{lat: number, lng: number} | null> => {
    try {
      // Using a free geocoding service (Nominatim)
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address + ', Brazil')}&limit=1`);
      const data = await response.json();
      if (data && data.length > 0) {
        return {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon)
        };
      }
    } catch (error) {
      console.error('Geocoding error:', error);
    }
    return null;
  };

  // Function to parse numeric values from strings
  const parseNumericValue = (valueStr: string): number => {
    return parseInt(valueStr.replace(/[^\d]/g, '')) || 0;
  };

      // Function to check if property link already exists
  const isDuplicateProperty = (newProperty: Property, existingProperties: Property[]): boolean => {
    return existingProperties.some(existing => existing.link === newProperty.link);
  };

  // Function to remove duplicates from property array based on link
  const removeDuplicateProperties = (properties: Property[]): Property[] => {
    const seen = new Set<string>();
    return properties.filter(property => {
      if (seen.has(property.link)) {
        return false;
      }
      seen.add(property.link);
      return true;
    });
  };

  // Function to enhance property with numeric values and distance
  const enhanceProperty = (property: Property): Property => {
    const enhanced = {
      ...property,
      valorNumerico: parseNumericValue(property.valor),
      m2Numerico: parseNumericValue(property.m2),
      quartosNumerico: parseNumericValue(property.quartos),
      garagemNumerico: parseNumericValue(property.garagem),
      banhosNumerico: parseNumericValue((property as any).banhos || (property as any).banheiros || '')
    };

    // Add mock coordinates for demonstration (in real app, these would come from geocoding)
    const locations = [
      { lat: -19.9191, lng: -43.9386 }, // Savassi
      { lat: -19.9245, lng: -43.9352 }, // Funcionários
      { lat: -19.8687, lng: -43.9653 }, // Santa Mônica
      { lat: -19.9167, lng: -43.9345 }, // Centro
      { lat: -19.8915, lng: -43.9401 }, // Castelo
      { lat: -19.9542, lng: -43.9542 }, // São Pedro
    ];
    const randomLocation = locations[Math.floor(Math.random() * locations.length)];
    enhanced.latitude = randomLocation.lat;
    enhanced.longitude = randomLocation.lng;

    // Calculate distance if user location is set
    if (userLocation) {
      enhanced.distancia = calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        enhanced.latitude,
        enhanced.longitude
      );
    }

    return enhanced;
  };

  // Ranking scoring helpers (used by preferences card)
  const computeWeights = () => {
    const map: Record<string, number> = {};
    map["tamanho"] = 5 - (prefTamanhoPriority || 0);
    map["quartos"] = 5 - (prefQuartosPriority || 0);
    map["banheiros"] = 5 - (prefBanheirosPriority || 0);
    map["distancia"] = 5 - (prefDistanciaPriority || 0);
    return map;
  };

  const computeScoreForProperty = (property: Property) => {
    const weights = computeWeights();
    let totalWeight = 0;
    let score = 0;

    // Tamanho
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

    // Quartos
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

    // Banheiros
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

    // Distancia (lower better)
    if (prefDistanciaValue != null && prefDistanciaValue >= 0) {
      const propD = property.distancia ?? 0;
      const w = weights["distancia"] || 0;
      if (w > 0) {
        totalWeight += w;
        let s = 0;
        if (propD <= prefDistanciaValue) s = 1;
        else if (prefDistanciaValue > 0) {
          const diff = propD - prefDistanciaValue;
          s = Math.max(0, 1 - diff / Math.max(prefDistanciaValue, 1));
        }
        score += s * w;
      }
    }

    if (totalWeight === 0) return 0;
    return score / totalWeight;
  };

  const calculateBestMatchFromIndex = () => {
    try {
      const cur = currentUser;
      const suffix = cur?.id ?? 'guest';

      if (!likedProperties || likedProperties.length === 0) {
        toast.info('Nenhum imóvel curtido para ranquear');
        return;
      }

      const scored = likedProperties.map(p => {
        const enhanced = enhanceProperty(p);
        return { item: enhanced, score: computeScoreForProperty(enhanced) };
      });

      scored.sort((a, b) => b.score - a.score);
      const orderedIds = scored.map(s => s.item.id);
      localStorage.setItem(`propertyRankingOrder_${suffix}`, JSON.stringify(orderedIds));
      toast.success('Melhor imóvel calculado e ordem salva. Abra o Ranking para ver o destaque.');
    } catch (e) {
      console.error(e);
      toast.error('Erro ao calcular melhor imóvel');
    }
  };

    // Filter properties based on current filters
  const applyFilters = (propertiesToFilter: Property[]) => {
    return propertiesToFilter.filter(property => {
      const enhanced = enhanceProperty(property);

      // Price filter
      const valorMin = filters.valorMin ? parseInt(filters.valorMin.replace(/[^\d]/g, '')) : 0;
      const valorMax = filters.valorMax ? parseInt(filters.valorMax.replace(/[^\d]/g, '')) : Infinity;
      if (enhanced.valorNumerico < valorMin || enhanced.valorNumerico > valorMax) {
        return false;
      }

      // Size filter
      if (enhanced.m2Numerico < filters.m2Min || enhanced.m2Numerico > filters.m2Max) {
        return false;
      }

      // Rooms filter (support multiple selections)
      try {
        if (!filters.quartos.includes('all')) {
          const allowed = filters.quartos.map(q => q === '5+' ? 5 : parseInt(q));
          const val = enhanced.quartosNumerico || 0;
          const match = allowed.some(a => (a === 5 ? val >= 5 : val === a));
          if (!match) return false;
        }
      } catch (e) { /* ignore */ }

      // Parking filter (multi)
      try {
        if (!filters.vagas.includes('all')) {
          const allowed = filters.vagas.map(v => v === '4+' ? 4 : parseInt(v));
          const val = enhanced.garagemNumerico || 0;
          const match = allowed.some(a => (a === 4 ? val >= 4 : val === a));
          if (!match) return false;
        }
      } catch (e) {}

      // Bathrooms filter (multi)
      try {
        if (filters.banhos && filters.banhos.length > 0) {
          const allowed = filters.banhos.map(b => b === '4+' ? 4 : parseInt(b));
          const rawBanhos = (enhanced as any).banhos || (enhanced as any).banheiros || (enhanced as any).banho || '';
          const val = (enhanced as any).banhosNumerico || (rawBanhos ? parseNumericValue(String(rawBanhos)) : 0);
          // If property's bathrooms info is missing, treat as 0
          const matchBathrooms = allowed.some(a => (a === 4 ? val >= 4 : val === a));
          if (!matchBathrooms) return false;
        }
      } catch (e) {}

      // Distance filter (support infinite)
      try {
        if (userLocation && enhanced.distancia != null) {
          if (filters.distanciaMax < INFINITE && enhanced.distancia > filters.distanciaMax) {
            return false;
          }
        }
      } catch (e) {}

      // Status filters (na planta, em construção, leilão)
      try {
        const tags = (enhanced.tags || []).map(t => String(t).toLowerCase());
        const na = tags.some(t => t.includes('na planta') || t.includes('naplanta'));
        const em = tags.some(t => t.includes('constru') || t.includes('em construção') || t.includes('em_construcao'));
        const le = tags.some(t => t.includes('leil') || t.includes('leilão') || t.includes('leilao'));

        const selectedCount = (statusFilters.naPlanta?1:0) + (statusFilters.emConstrucao?1:0) + (statusFilters.leilao?1:0);
        const allSelected = selectedCount === 3;
        // If none selected, do not filter by status; if all selected, do not filter; otherwise require a match
        if (!allSelected && selectedCount > 0) {
          const matches = (statusFilters.naPlanta && na) || (statusFilters.emConstrucao && em) || (statusFilters.leilao && le);
          if (!matches) return false;
        }
      } catch (e) {
        // ignore
      }

      return true;
    });
  };

      // Update filtered properties when properties or filters change
  useEffect(() => {
    // First deduplicate the properties
    const deduplicatedProperties = removeDuplicateProperties(properties);

    // If duplicates were found, update the state
    if (deduplicatedProperties.length !== properties.length) {
      setProperties(deduplicatedProperties);
      return; // Exit early, will trigger this useEffect again with deduplicated data
    }

    // Use raw properties and let applyFilters enhance each property (avoid double-enhance side-effects)
    const filtered = applyFilters(properties);
    const sorted = sortProperties(filtered);
    setFilteredProperties(sorted);
  }, [properties, filters, userLocation, sortOption]);

  // Tag helpers: store tags inside properties state (and optionally persist to localStorage)
  const saveTagsForProperty = (propertyId: string, tags: string[]) => {
    setProperties(prev => prev.map(p => p.id === propertyId ? { ...p, tags } : p));
    try {
      // persist minimal tag map
      const tagMap = JSON.parse(localStorage.getItem('propertyTags') || '{}');
      tagMap[propertyId] = tags;
      localStorage.setItem('propertyTags', JSON.stringify(tagMap));
    } catch (e) {}
  };

  // initialize tags from localStorage on mount
  useEffect(() => {
    try {
      const tagMap = JSON.parse(localStorage.getItem('propertyTags') || '{}');
      if (tagMap && typeof tagMap === 'object') {
        setProperties(prev => prev.map(p => ({ ...p, tags: tagMap[p.id] || p.tags || [] })));
      }
    } catch (e) {}
  }, []);

  const handleSaveLocation = async () => {
    if (!locationInput.trim()) {
      toast.error("Por favor, insira um endereço válido");
      return;
    }

    toast.info("Buscando coordenadas do endereço...");
    const coords = await geocodeAddress(locationInput);

    if (coords) {
      const newLocation: UserLocation = {
        address: locationInput,
        latitude: coords.lat,
        longitude: coords.lng
      };
      setUserLocation(newLocation);
      localStorage.setItem('userLocation', JSON.stringify(newLocation));
      setIsSettingsOpen(false);
      toast.success("Localização salva com sucesso!");
    } else {
      toast.error("Não foi possível encontrar as coordenadas para este endereço");
    }
  };

    // Swipe handling functions
  const handleTouchStart = (e: React.TouchEvent, propertyId: string) => {
    setTouchStart({
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY
    });
  };

  const handleTouchMove = (e: React.TouchEvent, propertyId: string) => {
    setTouchEnd({
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY
    });
  };

  const handleTouchEnd = (propertyId: string) => {
    if (!touchStart || !touchEnd) return;

    const distanceX = touchStart.x - touchEnd.x;
    const distanceY = touchStart.y - touchEnd.y;
    const isLeftSwipe = distanceX > 50;
    const isRightSwipe = distanceX < -50;
    const isVerticalSwipe = Math.abs(distanceY) > Math.abs(distanceX);

    if (!isVerticalSwipe) {
      if (isLeftSwipe) {
        handleDislike(propertyId);
      } else if (isRightSwipe) {
        handleLike(propertyId);
      }
    }

    setTouchStart(null);
    setTouchEnd(null);
  };

    const handleLike = (propertyId: string) => {
    const property = properties.find(p => p.id === propertyId);
    if (!property) return;

    const cur = currentUser;
    if (!cur) {
      toast.error('Você precisa estar logado para curtir imóveis');
      return;
    }

    setSwipedCard(propertyId);
    setIsActionLoading(true);
    setTimeout(async () => {
      try {
        const createdMatches = await addLikeForUser(cur.id, property);
        console.log('Created matches:', createdMatches);

        // update local state
        const updatedUser = await getCurrentUser();
        setLikedProperties(updatedUser?.likedProperties || []);

        if (createdMatches && createdMatches.length > 0) {
          console.log('Match found! Showing overlay...');
          const matchedUserId = createdMatches[0];
          const matchedUser = await getUserById(matchedUserId);
          console.log('Matched user:', matchedUser);
          setMatchOverlay({
            isOpen: true,
            property,
            matchedWith: matchedUser?.username || "seu colega",
          });
          toast.success(`Match com ${matchedUser?.username || 'seu colega'}!`);
        } else {
          console.log('No matches created');
        }

        // Remove do imóvel da lista principal para que desapareça da tela inicial
        setProperties(prev => prev.filter(p => p.id !== propertyId));

        // Avançar para o próximo imóvel no modo Match sem remover da lista
        if (isMatchModeOpen) {
          setCurrentMatchIndex(prev => prev + 1);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error('Erro ao curtir:', errorMsg);
        toast.error(`Erro ao curtir imóvel: ${errorMsg}`);
        setSwipedCard(null);
        setIsActionLoading(false);
        return;
      }

      setSwipedCard(null);
      setIsActionLoading(false);
    }, 300);
  };

  const handleDislike = (propertyId: string) => {
    const property = properties.find(p => p.id === propertyId);
    if (!property) return;

    const cur = currentUser;
    if (!cur) {
      toast.error('Você precisa estar logado para rejeitar imóveis');
      return;
    }

    setSwipedCard(propertyId);
    setIsActionLoading(true);
    setTimeout(async () => {
      try {
        await addDislikeForUser(cur.id, property);
        const updatedUser = await getCurrentUser();
        setDislikedProperties(updatedUser?.dislikedProperties || []);

        // Remove do imóvel da lista principal para que desapareça da tela inicial
        setProperties(prev => prev.filter(p => p.id !== propertyId));

        // Avançar para o próximo imóvel no modo Match sem remover da lista
        if (isMatchModeOpen) {
          setCurrentMatchIndex(prev => prev + 1);
        }
      } catch (error) {
        console.error('Erro ao rejeitar:', error);
        toast.error('Erro ao rejeitar imóvel');
        setSwipedCard(null);
        setIsActionLoading(false);
        return;
      }

      setSwipedCard(null);
      setIsActionLoading(false);
    }, 300);
  };

  const handleDeleteLike = async (propertyId: string) => {
    const property = likedProperties.find(p => p.id === propertyId);
    if (!property) return;

    // Remove do estado local
    setLikedProperties(prev => prev.filter(p => p.id !== propertyId));
    setIsActionLoading(true);

    const cur = currentUser;
    try {
      if (cur) {
        // Se há usuário logado, remover do banco de dados
        await removeLikeForUser(cur.id, property);
        toast.success("Casa removida das curtidas");
      } else {
        // Se não há usuário, atualizar localStorage
        const updated = likedProperties.filter(p => p.id !== propertyId);
        localStorage.setItem('likedProperties', JSON.stringify(updated));
        toast.success("Casa removida das curtidas");
      }
    } catch (error) {
      console.error('Erro ao remover curtida:', error);
      // Restaurar o estado se houver erro
      setLikedProperties(prev => [...prev, property]);
      toast.error("Erro ao remover curtida");
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleDeleteDislike = async (propertyId: string) => {
    const property = dislikedProperties.find(p => p.id === propertyId);
    if (!property) return;

    // Remove do estado local
    setDislikedProperties(prev => prev.filter(p => p.id !== propertyId));
    setIsActionLoading(true);

    const cur = currentUser;
    try {
      if (cur) {
        // Se há usuário logado, remover do banco de dados
        await removeDislikeForUser(cur.id, property);
        toast.success("Casa removida das rejeitadas");
      } else {
        // Se não há usuário, atualizar localStorage
        const updated = dislikedProperties.filter(p => p.id !== propertyId);
        localStorage.setItem('dislikedProperties', JSON.stringify(updated));
        toast.success("Casa removida das rejeitadas");
      }
    } catch (error) {
      console.error('Erro ao remover rejeitada:', error);
      // Restaurar o estado se houver erro
      setDislikedProperties(prev => [...prev, property]);
      toast.error("Erro ao remover rejeitada");
    } finally {
      setIsActionLoading(false);
    }
  };

  // Sorting function
  const sortProperties = (propertiesToSort: Property[]): Property[] => {
    return [...propertiesToSort].sort((a, b) => {
      let aValue: number, bValue: number;

      switch (sortOption.field) {
        case 'valor':
          aValue = a.valorNumerico || 0;
          bValue = b.valorNumerico || 0;
          break;
        case 'distancia':
          aValue = a.distancia || 999;
          bValue = b.distancia || 999;
          break;
        case 'tamanho':
          aValue = a.m2Numerico || 0;
          bValue = b.m2Numerico || 0;
          break;
        default:
          return 0;
      }

      return sortOption.direction === 'asc' ? aValue - bValue : bValue - aValue;
    });
  };

    // Load user location and liked/disliked properties from localStorage on component mount
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Check for Supabase configuration
        const hasSupabase = !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY;
        if (!hasSupabase) {
          toast.info("Supabase não configurado. O login e compartilhamento funcionarão apenas neste navegador (Modo Local).", {
            duration: 5000,
          });
        }

        await initializeAuth();

        const savedLocation = localStorage.getItem('userLocation');
        if (savedLocation) {
          try {
            setUserLocation(JSON.parse(savedLocation));
          } catch (error) {
            console.error('Error loading saved location:', error);
          }
        }

        // Load auth users and current user
        const users = await getAllUsers();
        setAllUsers(users);

        const cur = await getCurrentUser();
        setCurrentUser(cur);

        // Load previously scraped properties (prefer sessionStorage for current session, fallback to localStorage)
        let savedScraped = sessionStorage.getItem('scrapedProperties');
        if (!savedScraped) {
          savedScraped = localStorage.getItem('scrapedProperties');
        }
        if (savedScraped) {
          try {
            setProperties(JSON.parse(savedScraped));
          } catch (e) { console.error('Error loading scraped properties', e); }
        }

        // Load liked/disliked depending on current user
        if (cur) {
          setLikedProperties(cur.likedProperties || []);
          setDislikedProperties(cur.dislikedProperties || []);
        } else {
          const savedLiked = localStorage.getItem('likedProperties');
          const savedDisliked = localStorage.getItem('dislikedProperties');
          if (savedLiked) {
            try {
              const likedData = JSON.parse(savedLiked);
              const deduplicatedLiked = removeDuplicateProperties(likedData);
              setLikedProperties(deduplicatedLiked);
              if (deduplicatedLiked.length !== likedData.length) {
                localStorage.setItem('likedProperties', JSON.stringify(deduplicatedLiked));
                console.log(`Removed ${likedData.length - deduplicatedLiked.length} duplicate liked properties`);
              }
            } catch (error) { console.error('Error loading liked properties:', error); }
          }
          if (savedDisliked) {
            try {
              const dislikedData = JSON.parse(savedDisliked);
              const deduplicatedDisliked = removeDuplicateProperties(dislikedData);
              setDislikedProperties(deduplicatedDisliked);
              if (deduplicatedDisliked.length !== dislikedData.length) {
                localStorage.setItem('dislikedProperties', JSON.stringify(deduplicatedDisliked));
                console.log(`Removed ${dislikedData.length - deduplicatedDisliked.length} duplicate disliked properties`);
              }
            } catch (error) { console.error('Error loading disliked properties:', error); }
          }
        }
      } catch (error) {
        console.error('Error initializing app:', error);
      } finally {
        setIsInitializing(false);
      }
    };

    initializeApp();
  }, []);

  useEffect(() => {
    if (properties.length > 0) {
      sessionStorage.setItem('scrapedProperties', JSON.stringify(properties));
      // Também persistir em localStorage para durabilidade entre sessões
      localStorage.setItem('scrapedProperties', JSON.stringify(properties));
    }
  }, [properties]);

  const navigate = useNavigate();

  useEffect(() => { if (isMatchModeOpen) setCurrentMatchIndex(0); }, [isMatchModeOpen]);

  const [selectedSites, setSelectedSites] = useState({
    netimoveis: false,
    casamineira: false,
    imovelweb: false,
    zapimoveis: false,
    vivareal: false,
    olx: false,
    quintoandar: false,
    loft: false,
    chavesnamao: false,
  });
  const [cidadeScraping, setCidadeScraping] = useState("Belo Horizonte");
  const [bairroScraping, setBairroScraping] = useState("");

  const sanitizeImageUrl = (url?: string) => {
    if (!url || url.trim().length === 0) return "https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=400&h=300&fit=crop";
    if (url.startsWith("http:")) return url.replace(/^http:/, "https:");
    if (url.startsWith("//")) return `https:${url}`;
    return url;
  };

  const handleStartScraping = async () => {
    try {
      setIsScrapingActive(true);
      toast.info("Iniciando scraping com Python...");

      const getApiBase = () => {
        // runtime overrides: window.__API_BASE or localStorage 'API_BASE' take precedence
        // fallback to build-time VITE_API_BASE
        try {
          const win: any = window as any;
          if (win && win.__API_BASE) return win.__API_BASE.replace(/\/$/, '');
        } catch {}
        try {
          const stored = localStorage.getItem('API_BASE');
          if (stored) return stored.replace(/\/$/, '');
        } catch {}
        return (import.meta as any).env?.VITE_API_BASE || '';
      };

      const API_BASE = getApiBase() || (typeof window !== 'undefined' ? window.location.origin.replace(/\/$/, '') : '');
      if (!API_BASE) {
        throw new Error('API base is not configured. Set VITE_API_BASE at build-time or window.__API_BASE/localStorage["API_BASE"] at runtime to point to the backend. Alternatively ensure window.location.origin is correct.');
      }

      const FINAL_API_BASE = API_BASE;

      const response = await fetch(`${FINAL_API_BASE}/api/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sites: selectedSites,
          filtros: {
            quartos: filters.quartos.includes('all') ? '' : filters.quartos.join(','),
            valorMax: filters.valorMax,
            valorMin: filters.valorMin,
            areaMin: String(filters.m2Min || ''),
            areaMax: String(filters.m2Max >= INFINITE ? '' : (filters.m2Max || '')),
            vagas: filters.vagas.includes('all') ? '' : filters.vagas.join(','),
            banhos: filters.banhos.includes('all') ? '' : filters.banhos.join(','),
            cidade: cidadeScraping,
            tipo_imovel: filters.tipo_imovel === 'indiferente' ? '' : filters.tipo_imovel,
            endereco: bairroScraping ? `${bairroScraping}, ${cidadeScraping}` : cidadeScraping,
            characteristics: filters.characteristics.length > 0 ? filters.characteristics.join(',') : '',
            amenities: filters.amenities.length > 0 ? filters.amenities.join(',') : '',
            location_options: filters.location_options.length > 0 ? filters.location_options.join(',') : '',
            tour_virtual: filters.tour_virtual,
            video: filters.video,
          }
        })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error || `Falha ao iniciar scraping (HTTP ${response.status})`);
      }
      const { results } = await response.json();

      if (Array.isArray(results)) {
        const normalized: Property[] = results.map((row: any, index: number) => {
          let site = row.site || "";
          if (!site && row.link) {
            try { site = new URL(row.link).hostname.replace(/^www\./, ""); } catch {}
          }
          return {
            id: row.id || `scraped-${Date.now()}-${index}`,
            nome: row.nome || `Imóvel ${index + 1}`,
            imagem: sanitizeImageUrl(row.imagem),
            valor: row.valor || "R$ 0",
            m2: row.m2 || "0 m²",
            localizacao: row.localizacao || "",
            link: row.link || "#",
            quartos: row.quartos || "",
            garagem: row.garagem || "0",
            banhos: row.banhos || row.banheiros || "",
            site,
          };
        });

        setProperties(prev => {
          const merged = [...prev];
          for (const p of normalized) {
            if (!isDuplicateProperty(p, merged)) merged.push(p);
          }
          return merged;
        });
        toast.success(`${results.length} imóveis coletados!`);
      } else {
        toast.info("Nenhum resultado retornado.");
      }
    } catch (e: any) {
      toast.error(e?.message || "Erro ao executar scraping");
      console.error(e);
    } finally {
      setIsScrapingActive(false);
    }
  };

  const handleStartScrapingStream = async () => {
    try {
      setIsScrapingActive(true);
      toast.info("Iniciando scraping (stream)...");

      const API_BASE = (() => {
        try { const win: any = window as any; if (win && win.__API_BASE) return win.__API_BASE.replace(/\/$/, ''); } catch {}
        try { const stored = localStorage.getItem('API_BASE'); if (stored) return stored.replace(/\/$/, ''); } catch {}
        return (import.meta as any).env?.VITE_API_BASE || '';
      })();

      const API_BASE_WITH_FALLBACK = API_BASE || (typeof window !== 'undefined' ? window.location.origin.replace(/\/$/, '') : '');

      if (!API_BASE_WITH_FALLBACK) {
        throw new Error('API base is not configured. Set VITE_API_BASE at build-time or window.__API_BASE/localStorage["API_BASE"] at runtime to point to the backend. Alternatively ensure window.location.origin is correct.');
      }

      const FINAL_API_BASE = API_BASE_WITH_FALLBACK;

      const response = await fetch(`${FINAL_API_BASE}/api/scrape-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sites: selectedSites,
          filtros: {
            quartos: filters.quartos.includes('all') ? '' : filters.quartos.join(','),
            valorMax: filters.valorMax,
            valorMin: filters.valorMin,
            areaMin: String(filters.m2Min || ''),
            areaMax: String(filters.m2Max >= INFINITE ? '' : (filters.m2Max || '')),
            vagas: filters.vagas.includes('all') ? '' : filters.vagas.join(','),
            banhos: filters.banhos.includes('all') ? '' : filters.banhos.join(','),
            cidade: cidadeScraping,
            tipo_imovel: filters.tipo_imovel === 'indiferente' ? '' : filters.tipo_imovel,
            endereco: bairroScraping ? `${bairroScraping}, ${cidadeScraping}` : cidadeScraping,
            characteristics: filters.characteristics.length > 0 ? filters.characteristics.join(',') : '',
            amenities: filters.amenities.length > 0 ? filters.amenities.join(',') : '',
            location_options: filters.location_options.length > 0 ? filters.location_options.join(',') : '',
            tour_virtual: filters.tour_virtual,
            video: filters.video,
          }
        })
      });

      if (!response.ok) {
        let txt = null;
        try { txt = await response.text(); } catch (e) { /* ignore */ }
        throw new Error(`Falha ao iniciar scraping em stream (HTTP ${response.status})${txt ? ': ' + txt : ''}`);
      }

      if (!response.body) {
        throw new Error(`Falha ao iniciar scraping em stream: corpo da resposta indisponível`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let total = 0;

      const pushProps = (rows: any[]) => {
        const normalized: Property[] = rows.map((row: any) => {
          let site = row.site || "";
          if (!site && row.link) {
            try { site = new URL(row.link).hostname.replace(/^www\./, ""); } catch {}
          }
          return {
            id: row.id || `scraped-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            nome: row.nome || `Imóvel`,
            imagem: sanitizeImageUrl(row.imagem),
            valor: row.valor || "R$ 0",
            m2: row.m2 || "0 m²",
            localizacao: row.localizacao || "",
            link: row.link || "#",
            quartos: row.quartos || "",
            garagem: row.garagem || "0",
            banhos: row.banhos || row.banheiros || "",
            site,
          };
        });
        setProperties(prev => {
          const merged = [...prev];
          for (const p of normalized) {
            if (!isDuplicateProperty(p, merged)) {
              merged.push(p);
              total++;
            }
          }
          return merged;
        });
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (!line) continue;
          try {
            const parsed = JSON.parse(line);
            if (Array.isArray(parsed)) {
              pushProps(parsed);
            } else if (parsed && Array.isArray(parsed.results)) {
              pushProps(parsed.results);
            } else if (parsed && (parsed.nome || parsed.link || parsed.valor)) {
              pushProps([parsed]);
            } else if (parsed && (parsed as any).error) {
              toast.error((parsed as any).error);
            }
          } catch {
            // ignore non-JSON lines
          }
        }
      }

      const tail = buffer.trim();
      if (tail) {
        try {
          const parsedTail = JSON.parse(tail);
          if (Array.isArray(parsedTail)) pushProps(parsedTail);
        } catch {}
      }

      if (total > 0) {
        toast.success(`${total} imóveis coletados!`);
      } else {
        toast.info("Nenhum resultado retornado.");
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Erro ao executar scraping em stream - usando modo padrão");
      await handleStartScraping();
    } finally {
      setIsScrapingActive(false);
    }
  };

  const handleStopScraping = () => {
    setIsScrapingActive(false);
    toast.info("Scraping pausado.");
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];
          
          // Convert Excel data to our Property interface
          const importedProperties: Property[] = jsonData.map((row, index) => ({
            id: `imported-${Date.now()}-${index}`,
            nome: row.Nome || row.nome || `Im��vel Importado ${index + 1}`,
            imagem: row.Imagem || row.imagem || "https://cdn.builder.io/api/v1/image/assets%2FTEMP%2Fdefault-house",
            valor: row.Valor || row.valor || "R$ 0",
            m2: row["M²"] || row.m2 || "0 m²",
            localizacao: row["Localização"] || row.localizacao || "Localização não informada",
            link: row.Link || row.link || "#",
            quartos: row.Quartos || row.quartos || "0 quartos",
            garagem: row.Garagem || row.garagem || "0"
          }));
          
                    // Filter out duplicates based on link
          setProperties(prev => {
            const newProperties = importedProperties.filter(newProp =>
              !isDuplicateProperty(newProp, prev)
            );

            const duplicatesCount = importedProperties.length - newProperties.length;

            if (duplicatesCount > 0) {
              toast.info(`${newProperties.length} novos imóveis importados, ${duplicatesCount} duplicatas ignoradas`);
            } else {
              toast.success(`${newProperties.length} imóveis importados do arquivo ${file.name}!`);
            }

            return [...prev, ...newProperties];
          });
        } catch (error) {
          toast.error("Erro ao processar o arquivo Excel. Verifique o formato.");
          console.error("Error parsing Excel file:", error);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      toast.error("Por favor, selecione um arquivo Excel (.xlsx ou .xls)");
    }
    
    // Reset input value
    if (event.target) {
      event.target.value = '';
    }
  };

  const handleExportData = () => {
    // Create worksheet from properties data
    const exportData = properties.map(property => ({
      Nome: property.nome,
      Imagem: property.imagem,
      Valor: property.valor,
      "M²": property.m2,
      "Localização": property.localizacao,
      Link: property.link,
      Quartos: property.quartos,
      Garagem: property.garagem
    }));
    
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Imóveis");
    
    // Generate Excel file and download
    XLSX.writeFile(workbook, `imoveis_export_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success("Dados exportados para Excel com sucesso!");
  };

  const handleManualAdd = (newProperty: Property) => {
    setProperties(prev => [newProperty, ...prev]);
    toast.success("Imóvel adicionado manualmente!");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Loading Overlay */}
      {(isInitializing || isActionLoading) && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-[9999]">
          <div className="bg-white rounded-lg p-8 shadow-lg">
            <div className="flex flex-col items-center gap-4">
              <div className="relative w-12 h-12">
                <div className="absolute inset-0 border-4 border-blue-100 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-transparent border-t-blue-600 rounded-full animate-spin"></div>
              </div>
              <p className="text-gray-700 font-medium">
                {isInitializing ? 'Carregando...' : 'Salvando...'}
              </p>
            </div>
          </div>
        </div>
      )}

      {matchOverlay.isOpen && matchOverlay.property && (
        <MatchOverlay
          isOpen={matchOverlay.isOpen}
          property={matchOverlay.property}
          matchedWith={matchOverlay.matchedWith}
          onClose={() => setMatchOverlay(prev => ({ ...prev, isOpen: false }))}
          onViewRanking={() => {
            setMatchOverlay(prev => ({ ...prev, isOpen: false }));
            navigate('/ranking');
          }}
        />
      )}

      <ManualPropertyEntry
        isOpen={isManualEntryOpen}
        onClose={() => setIsManualEntryOpen(false)}
        onAdd={handleManualAdd}
      />

      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-30">
        <div className="container mx-auto px-3 sm:px-6 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
              <div className="p-2 bg-blue-600 rounded-lg flex-shrink-0">
                <Home className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-2xl font-bold text-gray-900 truncate">Melhor Casa</h1>
                <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">Ferramenta elegante para coleta de imóveis</p>
              </div>
            </div>

            <div className="flex items-center gap-1 sm:gap-2 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0">
              <Link to="/dislikes" className="flex-shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-2 h-8 sm:h-10 whitespace-nowrap"
                  title="Rejeitadas"
                >
                  <ThumbsDown className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                  <span className="hidden sm:inline">Rejeitadas</span>

                  {dislikedProperties.length > 0 && (
                    <Badge variant="destructive" className="ml-1 text-xs px-1.5 py-0">
                      {dislikedProperties.length}
                    </Badge>
                  )}
                </Button>
              </Link>

              <Dialog open={isLikedModalOpen} onOpenChange={setIsLikedModalOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-2 h-8 sm:h-10 whitespace-nowrap flex-shrink-0"
                    title="Curtidas"
                  >
                    <Heart className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                    <span className="hidden sm:inline">Curtidas</span>

                    {likedProperties.length > 0 && (
                      <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
                        {likedProperties.length}
                      </Badge>
                    )}
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-4xl max-h-[80vh] overflow-hidden">
                  <DialogHeader>
                    <DialogTitle>Casas Curtidas ❤️</DialogTitle>
                  </DialogHeader>
                  <div className="overflow-y-auto max-h-[60vh] space-y-4">
                    {likedProperties.length === 0 ? (
                      <div className="text-center py-8">
                        <Heart className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-600">Nenhuma casa curtida ainda</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {likedProperties.map((property) => (
                          <Card key={property.id} className="overflow-hidden">
                            <div className="relative">
                              <img
                                src={property.imagem || "https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=400&h=300&fit=crop"}
                                alt={property.nome}
                                className="w-full h-32 object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=400&h=300&fit=crop";
                                }}
                              />
                            </div>
                            <CardContent className="p-4">
                              <h4 className="font-semibold text-sm mb-2 line-clamp-1">{property.nome}</h4>
                              <p className="text-lg font-bold text-green-600 mb-2">{property.valor}</p>
                              <div className="flex gap-1 mb-3">
                                <Badge variant="secondary" className="text-xs">{property.m2}</Badge>
                                <Badge variant="secondary" className="text-xs">{property.quartos}</Badge>
                                <Badge variant="secondary" className="text-xs">{property.garagem} vagas</Badge>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => window.open(property.link, '_blank')}
                                  className="flex-1"
                                >
                                  Ver Detalhes
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleDeleteLike(property.id)}
                                  className="flex-shrink-0"
                                  title="Remover das curtidas"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                </DialogContent>
              </Dialog>

              <Link to="/leilao" className="flex-shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-2 h-8 sm:h-10 whitespace-nowrap"
                  title="Leilão"
                >
                  <Archive className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                  <span className="hidden sm:inline">Leilão</span>
                </Button>
              </Link>

              <Link to="/matches" className="flex-shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-2 h-8 sm:h-10 whitespace-nowrap"
                  title="Matches"
                >
                  <Heart className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                  <span className="hidden sm:inline">Matches</span>
                </Button>
              </Link>

              <Link to="/ranking" className="flex-shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-2 h-8 sm:h-10 whitespace-nowrap"
                  title="Ranking"
                >
                  <ListOrdered className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                  <span className="hidden sm:inline">Ranking</span>

                  {likedProperties.length > 0 && (
                    <Badge variant="outline" className="ml-1 text-xs px-1.5 py-0">
                      {likedProperties.length}
                    </Badge>
                  )}
                </Button>
              </Link>

              <Link to="/visits" className="flex-shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-2 h-8 sm:h-10 whitespace-nowrap"
                  title="Visitas Agendadas"
                >
                  <Calendar className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                  <span className="hidden sm:inline">Visitas</span>
                </Button>
              </Link>

              <Link to="/cofrinho" className="flex-shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-2 h-8 sm:h-10 whitespace-nowrap"
                  title="Cofrinho"
                >
                  <PiggyBank className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                  <span className="hidden sm:inline">Cofrinho</span>
                </Button>
              </Link>

              <Button
                variant="outline"
                size="sm"
                className="gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-2 h-8 sm:h-10 whitespace-nowrap flex-shrink-0"
                onClick={() => setIsMatchModeOpen(true)}
                title="Modo Match"
              >
                <Maximize2 className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                <span className="hidden sm:inline">Modo Match</span>
              </Button>

              <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-2 h-8 sm:h-10 whitespace-nowrap flex-shrink-0"
                    title="Configurações"
                  >
                    <Settings className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                    <span className="hidden sm:inline">Configurações</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Configurações de Localização</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="apiBase">URL da API (Cloudflare Tunnel ou Local)</Label>
                      <Input
                        id="apiBase"
                        placeholder="Ex: https://xyz.trycloudflare.com ou http://localhost:8080"
                        value={apiBaseInput}
                        onChange={(e) => setApiBaseInput(e.target.value)}
                      />
                      <Button onClick={handleSaveApiBase} className="w-full" size="sm" variant="secondary">
                        Salvar URL da API
                      </Button>
                    </div>

                    <div className="space-y-2 border-t pt-4">
                      <Label className="font-bold">Sincronização (Supabase)</Label>
                      <p className="text-xs text-gray-500 mb-2">Configure para habilitar login e compartilhamento em nuvem.</p>

                      <div className="space-y-1">
                        <Label htmlFor="sUrl" className="text-xs">Supabase URL</Label>
                        <Input
                          id="sUrl"
                          placeholder="https://xyz.supabase.co"
                          value={supabaseUrlInput}
                          onChange={(e) => setSupabaseUrlInput(e.target.value)}
                        />
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="sKey" className="text-xs">Anon Key</Label>
                        <Input
                          id="sKey"
                          placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                          type="password"
                          value={supabaseAnonKeyInput}
                          onChange={(e) => setSupabaseAnonKeyInput(e.target.value)}
                        />
                      </div>

                      <Button onClick={handleSaveSupabaseConfig} className="w-full mt-2" size="sm" variant="secondary">
                        Salvar Configuração Supabase
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="location">Minha Localização</Label>
                      <Input
                        id="location"
                        placeholder="Ex: Rua das Flores, 123, Savassi, Belo Horizonte - MG"
                        value={locationInput}
                        onChange={(e) => setLocationInput(e.target.value)}
                      />
                      {userLocation && (
                        <p className="text-sm text-gray-600">
                          Localização atual: {userLocation.address}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-3">
                      <Button onClick={handleSaveLocation} className="flex-1">
                        Salvar Localização
                      </Button>
                      <Button variant="outline" onClick={() => setIsSettingsOpen(false)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-2 h-8 sm:h-10 whitespace-nowrap flex-shrink-0"
                title="Importar Excel"
              >
                <Upload className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                <span className="hidden sm:inline">Importar</span>
              </Button>

              <Button
                variant="default"
                size="sm"
                onClick={() => setIsManualEntryOpen(true)}
                className="gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-2 h-8 sm:h-10 whitespace-nowrap flex-shrink-0 bg-pink-600 hover:bg-pink-700 text-white"
              >
                <Plus className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                <span className="hidden sm:inline">Adicionar</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportData}
                className="gap-2 flex-1 sm:flex-none"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Exportar Dados</span>
                <span className="sm:hidden">Export</span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  try {
                    const users = localStorage.getItem('app_users_v1') || '[]';
                    const blob = new Blob([users], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'users.json';
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                    toast.success('Exportado users.json');
                  } catch (e) { toast.error('Falha ao exportar usuários'); }
                }}
                className="gap-2"
              >
                Exportar Usuários
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Match Mode Dialog */}
      <Dialog open={isMatchModeOpen} onOpenChange={setIsMatchModeOpen}>
        <DialogContent className="w-full max-w-5xl h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Modo Match</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col md:flex-row h-full">
            <div className="flex-1 flex items-center justify-center">
              {filteredProperties.length === 0 && (
                <div className="text-center">
                  <p className="text-gray-600">Nenhum imóvel disponível para dar match com os filtros atuais.</p>
                  <p className="text-sm text-gray-500 mt-2">Tente ajustar os filtros (ou ative "Sem limite" em Tamanho/Distância). Temos {properties.length} imóveis disponíveis.</p>
                </div>
              )}

              {filteredProperties.length > 0 && currentMatchIndex >= filteredProperties.length && (
                <div className="text-center">
                  <p className="text-gray-600">Você terminou todos os imóveis.</p>
                </div>
              )}

              {filteredProperties.length > 0 && currentMatchIndex < filteredProperties.length && (
                <div className="relative w-full md:max-w-md h-[60vh]">
                  {filteredProperties.slice(currentMatchIndex, currentMatchIndex + 3).map((prop, idx) => {
                    const zIndex = 100 - idx;
                    const top = idx * 8;
                    const isTop = idx === 0;
                    return (
                      <div key={prop.id} className="absolute left-0 right-0 mx-auto" style={{ top: `${top}px`, zIndex }}>
                        <div
                          onPointerDown={isTop ? (e: any) => { dragStartX.current = e.clientX; setIsDragging(true); } : undefined}
                          onPointerMove={isTop ? (e: any) => { if (!isDragging) return; const dx = e.clientX - (dragStartX.current || 0); setDragX(dx); } : undefined}
                          onPointerUp={isTop ? (e: any) => { setIsDragging(false); const dx = dragX; if (dx > 120) { handleLike(prop.id); setCurrentMatchIndex(prev => Math.min(filteredProperties.length, prev + 1)); } else if (dx < -120) { handleDislike(prop.id); setCurrentMatchIndex(prev => Math.min(filteredProperties.length, prev + 1)); } setDragX(0); dragStartX.current = null; } : undefined}
                          onClick={isTop ? (e: any) => { if (Math.abs(dragX) < 10 && prop.link) window.open(prop.link, '_blank'); } : undefined}
                          style={{ transform: `translateX(${isTop ? Math.max(-300, Math.min(300, dragX)) : 0}px) rotate(${isTop ? dragX / 20 : 0}deg)`, transition: isDragging && isTop ? 'none' : 'transform 200ms ease' }}
                          className="bg-white rounded-lg shadow-lg overflow-hidden max-w-full w-full"
                        >
                          <img src={prop.imagem || 'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=800&h=600&fit=crop'} alt={prop.nome} className="w-full h-48 sm:h-56 md:h-64 object-cover" />
                          <div className="p-4">
                            <h3 className="font-bold text-lg">{prop.nome}</h3>
                            <p className="text-green-600 font-bold">{prop.valor}</p>
                            <p className="text-sm text-gray-600">{prop.localizacao}</p>

                            <div className="flex flex-wrap gap-2 mt-3 items-center text-sm text-gray-700">
                              <span className="px-2 py-1 bg-gray-100 rounded">{prop.m2 || (prop.m2Numerico ? `${prop.m2Numerico} m²` : '—')}</span>
                              <span className="px-2 py-1 bg-gray-100 rounded">{prop.quartos || (prop.quartosNumerico ? `${prop.quartosNumerico} quartos` : '—')}</span>
                              <span className="px-2 py-1 bg-gray-100 rounded">{prop.garagem || (prop.garagemNumerico ? `${prop.garagemNumerico} vagas` : '—')}</span>
                              <span className="px-2 py-1 bg-gray-100 rounded">{(prop as any).banhos || (prop as any).banheiros || ((prop as any).banhosNumerico ? `${(prop as any).banhosNumerico} banheiros` : '—')}</span>
                            </div>

                            <div className="flex flex-wrap gap-2 mt-2">
                              {(prop.tags || []).map((t: string) => (
                                <span key={t} className="text-xs bg-gray-200 px-2 py-1 rounded-full">{t}</span>
                              ))}
                              <button className="text-xs text-blue-600 ml-2" onClick={(e) => { e.stopPropagation(); setSelectedPropertyForTag(prop); setIsTagModalOpen(true); }}>Editar tags</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="w-full md:w-80 p-4 flex flex-col gap-4">
              <div className="flex-1">
                <h4 className="text-lg font-semibold">Instruções</h4>
                <p className="text-sm text-gray-600">Deslize para a esquerda para rejeitar, para a direita para curtir. Use os botões abaixo para controlar.</p>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => {
                  // dislike
                  const prop = filteredProperties[currentMatchIndex];
                  if (!prop) return;
                  handleDislike(prop.id);
                  setCurrentMatchIndex(prev => Math.min(filteredProperties.length, prev + 1));
                }}>Rejeitar</Button>
                <Button className="flex-1" onClick={() => {
                  const prop = filteredProperties[currentMatchIndex];
                  if (!prop) return;
                  handleLike(prop.id);
                  setCurrentMatchIndex(prev => Math.min(filteredProperties.length, prev + 1));
                }}>Curtir</Button>
              </div>

              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => { setCurrentMatchIndex(0); }}>Recomeçar</Button>
                <Button variant="outline" onClick={() => setIsMatchModeOpen(false)}>Fechar</Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Controls */}
      <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <Card className="mb-8 bg-white/60 backdrop-blur-sm">
          <CardHeader>
                        <CardTitle className="text-xl">Procura</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {Object.entries(selectedSites).map(([key, val]) => (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={val}
                      onChange={(e) => setSelectedSites((prev) => ({ ...prev, [key]: e.target.checked }))}
                    />
                    <span className="capitalize">{key.replace(/([a-z])([A-Z])/g, '$1 $2')}</span>
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-4">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs sm:text-sm font-medium">Cidade</Label>
                  <Input
                    value={cidadeScraping}
                    onChange={(e) => setCidadeScraping(e.target.value)}
                    placeholder="Ex: BH"
                    className="text-xs sm:text-sm h-8 sm:h-10"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs sm:text-sm font-medium">Bairro</Label>
                  <Input
                    value={bairroScraping}
                    onChange={(e) => setBairroScraping(e.target.value)}
                    placeholder="Opcional"
                    className="text-xs sm:text-sm h-8 sm:h-10"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs sm:text-sm font-medium">Tipo</Label>
                  <Select value={filters.tipo_imovel} onValueChange={(value) => setFilters(prev => ({ ...prev, tipo_imovel: value }))}>
                    <SelectTrigger className="h-8 sm:h-10 text-xs sm:text-sm">
                      <SelectValue placeholder="Tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="indiferente">Indiferente</SelectItem>
                      <SelectItem value="apartamentos">Apartamentos</SelectItem>
                      <SelectItem value="casas">Casas</SelectItem>
                      <SelectItem value="garagens">Garagem</SelectItem>
                      <SelectItem value="estacionamento">Estacionamento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <Button
                  onClick={handleStartScrapingStream}
                  disabled={isScrapingActive}
                  className="gap-2 bg-green-600 hover:bg-green-700 text-sm px-3 py-2"
                >
                  <Play className="h-4 w-4 flex-shrink-0" />
                  <span className="hidden sm:inline">{isScrapingActive ? "Scraping..." : "Iniciar"}</span>
                  <span className="sm:hidden">{isScrapingActive ? "Ativo..." : "Iniciar"}</span>
                </Button>

                <Button
                  onClick={handleStopScraping}
                  disabled={!isScrapingActive}
                  variant="destructive"
                  className="gap-2 text-sm px-3 py-2"
                >
                  <Square className="h-4 w-4 flex-shrink-0" />
                  Parar
                </Button>

                <div className="flex items-center gap-2 sm:ml-auto">
                  <div className={`w-2 h-2 sm:w-3 sm:h-3 rounded-full flex-shrink-0 ${isScrapingActive ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                  <span className="text-xs sm:text-sm text-gray-600">
                    <span className="hidden sm:inline">{isScrapingActive ? "Coletando dados..." : "Pausado"}</span>
                    <span className="sm:hidden">{isScrapingActive ? "Ativo" : "Parado"}</span>
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
                </Card>

                {/* Filters */}
        <Card className="mb-8 bg-white/60 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-lg sm:text-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
                <span className="hidden sm:inline">Filtros e Ordenação</span>
                <span className="sm:hidden">Filtros</span>
              </div>
              <Select value={`${sortOption.field}-${sortOption.direction}`} onValueChange={(value) => {
                const [field, direction] = value.split('-') as [SortOption['field'], SortOption['direction']];
                setSortOption({ field, direction });
              }}>
                <SelectTrigger className="w-full sm:w-48 text-xs sm:text-sm h-8 sm:h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="valor-desc">
                    <div className="flex items-center gap-2">
                      <ArrowUpDown className="h-4 w-4" />
                      Maior Valor
                    </div>
                  </SelectItem>
                  <SelectItem value="valor-asc">
                    <div className="flex items-center gap-2">
                      <ArrowUpDown className="h-4 w-4" />
                      Menor Valor
                    </div>
                  </SelectItem>
                  <SelectItem value="tamanho-desc">
                    <div className="flex items-center gap-2">
                      <ArrowUpDown className="h-4 w-4" />
                      Maior Tamanho
                    </div>
                  </SelectItem>
                  <SelectItem value="tamanho-asc">
                    <div className="flex items-center gap-2">
                      <ArrowUpDown className="h-4 w-4" />
                      Menor Tamanho
                    </div>
                  </SelectItem>
                  {userLocation && (
                    <>
                      <SelectItem value="distancia-asc">
                        <div className="flex items-center gap-2">
                          <ArrowUpDown className="h-4 w-4" />
                          Mais Próximo
                        </div>
                      </SelectItem>
                      <SelectItem value="distancia-desc">
                        <div className="flex items-center gap-2">
                          <ArrowUpDown className="h-4 w-4" />
                          Mais Distante
                        </div>
                      </SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
              <label className="flex items-center gap-2 text-xs sm:text-sm">
                <input type="checkbox" checked={filters.m2Max >= INFINITE} onChange={(e) => setFilters(prev => ({ ...prev, m2Max: e.target.checked ? INFINITE : 10000 }))} className="h-4 w-4" />
                <span className="font-medium">Tamanho sem limite</span>
              </label>
              <label className="flex items-center gap-2 text-xs sm:text-sm">
                <input type="checkbox" checked={filters.distanciaMax >= INFINITE} onChange={(e) => setFilters(prev => ({ ...prev, distanciaMax: e.target.checked ? INFINITE : 50 }))} className="h-4 w-4" />
                <span className="font-medium">Distância sem limite</span>
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {/* Price Filter */}
              <div className="space-y-2 sm:space-y-3">
                <Label className="text-xs sm:text-sm font-medium">Valor (R$)</Label>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Mínimo"
                      value={filters.valorMin}
                      onChange={(e) => setFilters(prev => ({ ...prev, valorMin: e.target.value }))}
                      className="flex-1 text-xs sm:text-sm h-8 sm:h-10"
                    />
                    <Input
                      placeholder="Máximo"
                      value={filters.valorMax}
                      onChange={(e) => setFilters(prev => ({ ...prev, valorMax: e.target.value }))}
                      className="flex-1 text-xs sm:text-sm h-8 sm:h-10"
                    />
                  </div>
                  <div className="text-xs text-gray-500 text-center">
                    Ex: 500000 ou 1500000
                  </div>
                </div>
              </div>

              {/* Size Filter */}
              <div className="space-y-2 sm:space-y-3">
                <Label className="text-xs sm:text-sm font-medium">Tamanho (m²)</Label>
                <div className="space-y-2">
                  <Slider
                    value={[filters.m2Min, filters.m2Max >= INFINITE ? 10000 : filters.m2Max]}
                    onValueChange={([min, max]) =>
                      setFilters(prev => ({ ...prev, m2Min: min, m2Max: max }))
                    }
                    max={10000}
                    min={0}
                    step={10}
                    className="w-full"
                  />
                  <div className="flex justify-between items-center text-xs text-gray-500">
                    <span>{filters.m2Min} m²</span>
                    <span>{filters.m2Max >= INFINITE ? 'Sem limite' : `${filters.m2Max} m²`}</span>
                  </div>
                </div>
              </div>

              {/* Distance Filter */}
              {userLocation && (
                <div className="space-y-2 sm:space-y-3">
                  <Label className="text-xs sm:text-sm font-medium">Distância máxima (km)</Label>
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <Slider
                        value={[filters.distanciaMax >= INFINITE ? 100 : filters.distanciaMax]}
                        onValueChange={([max]) => setFilters(prev => ({ ...prev, distanciaMax: max }))}
                        max={100}
                        min={0}
                        step={1}
                        className="flex-1"
                      />
                    </div>
                    <div className="flex justify-between text-xs text-gray-600">
                      <span>0 km</span>
                      <span>{filters.distanciaMax >= INFINITE ? 'Sem limite' : `${filters.distanciaMax} km`}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Rooms Filter (multi-select checkboxes) */}
              <div className="space-y-2 sm:space-y-3">
                <Label className="text-xs sm:text-sm font-medium">Quartos</Label>
                <div className="flex flex-wrap gap-2">
                  {['1','2','3','4','5+'].map(opt => (
                    <label key={opt} className="flex items-center gap-1 text-xs sm:text-sm">
                      <input type="checkbox" checked={filters.quartos.includes(opt) || filters.quartos.includes('all')} onChange={(e) => {
                        const checked = e.target.checked;
                        setFilters(prev => {
                          const prevArr = prev.quartos.includes('all') ? [] : [...prev.quartos];
                          if (checked) {
                            return { ...prev, quartos: Array.from(new Set([...prevArr, opt])) };
                          } else {
                            const filtered = prevArr.filter(x => x !== opt);
                            return { ...prev, quartos: filtered.length === 0 ? ['all'] : filtered };
                          }
                        });
                      }} className="h-4 w-4" />
                      <span>{opt === '5+' ? '5+' : opt}</span>
                    </label>
                  ))}
                  <label className="flex items-center gap-1 text-xs sm:text-sm">
                    <input type="checkbox" checked={filters.quartos.includes('all')} onChange={(e) => setFilters(prev => ({ ...prev, quartos: e.target.checked ? ['all'] : [] }))} className="h-4 w-4" />
                    <span>Todos</span>
                  </label>
                </div>
              </div>

              {/* Parking Filter (multi-select) */}
              <div className="space-y-2 sm:space-y-3">
                <Label className="text-xs sm:text-sm font-medium">Vagas</Label>
                <div className="flex flex-wrap gap-2">
                  {['0','1','2','3','4+'].map(opt => (
                    <label key={opt} className="flex items-center gap-1 text-xs sm:text-sm">
                      <input type="checkbox" checked={filters.vagas.includes(opt) || filters.vagas.includes('all')} onChange={(e) => {
                        const checked = e.target.checked;
                        setFilters(prev => {
                          const prevArr = prev.vagas.includes('all') ? [] : [...prev.vagas];
                          if (checked) {
                            return { ...prev, vagas: Array.from(new Set([...prevArr, opt])) };
                          } else {
                            const filtered = prevArr.filter(x => x !== opt);
                            return { ...prev, vagas: filtered.length === 0 ? ['all'] : filtered };
                          }
                        });
                      }} className="h-4 w-4" />
                      <span>{opt === '4+' ? '4+' : opt}</span>
                    </label>
                  ))}
                  <label className="flex items-center gap-1 text-xs sm:text-sm">
                    <input type="checkbox" checked={filters.vagas.includes('all')} onChange={(e) => setFilters(prev => ({ ...prev, vagas: e.target.checked ? ['all'] : [] }))} className="h-4 w-4" />
                    <span>Todas</span>
                  </label>
                </div>
              </div>

              {/* Bathrooms Filter (multi-select) */}
              <div className="space-y-2 sm:space-y-3">
                <Label className="text-xs sm:text-sm font-medium">Banheiros</Label>
                <div className="flex flex-wrap gap-2">
                  {['1','2','3','4+'].map(opt => (
                    <label key={opt} className="flex items-center gap-1 text-xs sm:text-sm">
                      <input type="checkbox" checked={filters.banhos.includes(opt)} onChange={(e) => {
                        const checked = e.target.checked;
                        setFilters(prev => {
                          const prevArr = [...prev.banhos];
                          if (checked) return { ...prev, banhos: Array.from(new Set([...prevArr, opt])) };
                          return { ...prev, banhos: prevArr.filter(x => x !== opt) };
                        });
                      }} className="h-4 w-4" />
                      <span>{opt === '4+' ? '4+' : opt}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2 sm:space-y-3">
                <Label className="text-xs sm:text-sm font-medium">Status</Label>
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 items-start sm:items-center">
                  <label className="flex items-center gap-1 text-xs sm:text-sm"><input type="checkbox" checked={statusFilters.naPlanta} onChange={(e) => setStatusFilters(prev => ({ ...prev, naPlanta: e.target.checked }))} className="h-4 w-4" /> Na Planta</label>
                  <label className="flex items-center gap-1 text-xs sm:text-sm"><input type="checkbox" checked={statusFilters.emConstrucao} onChange={(e) => setStatusFilters(prev => ({ ...prev, emConstrucao: e.target.checked }))} className="h-4 w-4" /> Em Construção</label>
                  <label className="flex items-center gap-1 text-xs sm:text-sm"><input type="checkbox" checked={statusFilters.leilao} onChange={(e) => setStatusFilters(prev => ({ ...prev, leilao: e.target.checked }))} className="h-4 w-4" /> Leilão</label>
                </div>
              </div>

              {/* Virtual Tour & Video */}
              <div className="space-y-2 sm:space-y-3">
                <Label className="text-xs sm:text-sm font-medium">Mídia</Label>
                <div className="flex flex-col gap-2 sm:gap-3">
                  <label className="flex items-center gap-2 text-xs sm:text-sm">
                    <input type="checkbox" checked={filters.tour_virtual} onChange={(e) => setFilters(prev => ({ ...prev, tour_virtual: e.target.checked }))} className="h-4 w-4" />
                    <span>Tour Virtual</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs sm:text-sm">
                    <input type="checkbox" checked={filters.video} onChange={(e) => setFilters(prev => ({ ...prev, video: e.target.checked }))} className="h-4 w-4" />
                    <span>Tem Vídeo</span>
                  </label>
                </div>
              </div>

              {/* Characteristics */}
              <div className="space-y-2 sm:space-y-3">
                <Label className="text-xs sm:text-sm font-medium">Características</Label>
                <div className="flex flex-col gap-2">
                  {['piscina', 'acessivel', 'churrasqueira', 'porteiro24h', 'academia', 'varanda', 'mobiliado'].map(char => (
                    <label key={char} className="flex items-center gap-2 text-xs sm:text-sm">
                      <input
                        type="checkbox"
                        checked={filters.characteristics.includes(char)}
                        onChange={(e) => {
                          setFilters(prev => {
                            if (e.target.checked) {
                              return { ...prev, characteristics: [...prev.characteristics, char] };
                            } else {
                              return { ...prev, characteristics: prev.characteristics.filter(c => c !== char) };
                            }
                          });
                        }}
                        className="h-4 w-4"
                      />
                      <span>{
                        char === 'piscina' ? 'Piscina' :
                        char === 'acessivel' ? 'Acessível' :
                        char === 'churrasqueira' ? 'Churrasqueira' :
                        char === 'porteiro24h' ? 'Porteiro 24h' :
                        char === 'academia' ? 'Academia' :
                        char === 'varanda' ? 'Varanda' :
                        char === 'mobiliado' ? 'Mobiliado' : char
                      }</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Amenities */}
              <div className="space-y-2 sm:space-y-3">
                <Label className="text-xs sm:text-sm font-medium">Comodidades</Label>
                <div className="flex flex-col gap-2">
                  {['elevador', 'ar_condicionado', 'aquecimento', 'garagem_coberta', 'estacionamento', 'patio'].map(amenity => (
                    <label key={amenity} className="flex items-center gap-2 text-xs sm:text-sm">
                      <input
                        type="checkbox"
                        checked={filters.amenities.includes(amenity)}
                        onChange={(e) => {
                          setFilters(prev => {
                            if (e.target.checked) {
                              return { ...prev, amenities: [...prev.amenities, amenity] };
                            } else {
                              return { ...prev, amenities: prev.amenities.filter(a => a !== amenity) };
                            }
                          });
                        }}
                        className="h-4 w-4"
                      />
                      <span>{
                        amenity === 'elevador' ? 'Elevador' :
                        amenity === 'ar_condicionado' ? 'Ar Condicionado' :
                        amenity === 'aquecimento' ? 'Aquecimento' :
                        amenity === 'garagem_coberta' ? 'Garagem Coberta' :
                        amenity === 'estacionamento' ? 'Estacionamento' :
                        amenity === 'patio' ? 'Pátio' : amenity
                      }</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Location Options */}
              <div className="space-y-2 sm:space-y-3">
                <Label className="text-xs sm:text-sm font-medium">Localização</Label>
                <div className="flex flex-col gap-2">
                  {['proximo_escola', 'proximo_hospital', 'proximo_parque', 'proximo_metro', 'proximo_transporte'].map(locOpt => (
                    <label key={locOpt} className="flex items-center gap-2 text-xs sm:text-sm">
                      <input
                        type="checkbox"
                        checked={filters.location_options.includes(locOpt)}
                        onChange={(e) => {
                          setFilters(prev => {
                            if (e.target.checked) {
                              return { ...prev, location_options: [...prev.location_options, locOpt] };
                            } else {
                              return { ...prev, location_options: prev.location_options.filter(l => l !== locOpt) };
                            }
                          });
                        }}
                        className="h-4 w-4"
                      />
                      <span>{
                        locOpt === 'proximo_escola' ? 'Próximo a Escola' :
                        locOpt === 'proximo_hospital' ? 'Próximo a Hospital' :
                        locOpt === 'proximo_parque' ? 'Próximo a Parque' :
                        locOpt === 'proximo_metro' ? 'Próximo a Metrô' :
                        locOpt === 'proximo_transporte' ? 'Próximo a Transporte Público' : locOpt
                      }</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Clear Filters */}
              <div className="flex items-end">
                <Button
                  variant="outline"
                  onClick={() => { setFilters({
                  valorMin: "",
                  valorMax: "",
                  m2Min: 0,
                  m2Max: 10000,
                  quartos: ['all'],
                  vagas: ['all'],
                  banhos: [],
                  distanciaMax: 50,
                  location: "",
                  tipo_imovel: "apartamentos",
                  characteristics: [],
                  amenities: [],
                  location_options: [],
                  tour_virtual: false,
                  video: false
                }); setStatusFilters({ naPlanta: true, emConstrucao: true, leilao: true }); }}
                  className="w-full text-xs sm:text-sm h-8 sm:h-10"
                >
                  Limpar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Preferências de Ranqueamento */}
        <Card className="mb-6 bg-white/60 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-500 flex-shrink-0" />
                <span className="hidden sm:inline">Preferências de Ranqueamento</span>
                <span className="sm:hidden">Ranqueamento</span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-2">
                <Label className="text-xs sm:text-sm font-medium">Tamanho mínimo (m²)</Label>
                <div className="flex items-center gap-2 flex-wrap">
                  <Input type="number" value={prefTamanhoValue ?? ''} onChange={(e) => setPrefTamanhoValue(e.target.value === '' ? null : Number(e.target.value))} className="w-20 sm:w-32 text-xs sm:text-sm h-8 sm:h-10" />
                  <Label className="text-xs sm:text-sm">Prioridade</Label>
                  <select value={prefTamanhoPriority} onChange={(e) => setPrefTamanhoPriority(Number(e.target.value))} className="border rounded p-1 text-xs h-8 sm:h-10">
                    {[1,2,3,4].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs sm:text-sm font-medium">Quartos mínimos</Label>
                <div className="flex items-center gap-2 flex-wrap">
                  <Input type="number" value={prefQuartosValue ?? ''} onChange={(e) => setPrefQuartosValue(e.target.value === '' ? null : Number(e.target.value))} className="w-20 sm:w-32 text-xs sm:text-sm h-8 sm:h-10" />
                  <Label className="text-xs sm:text-sm">Prioridade</Label>
                  <select value={prefQuartosPriority} onChange={(e) => setPrefQuartosPriority(Number(e.target.value))} className="border rounded p-1 text-xs h-8 sm:h-10">
                    {[1,2,3,4].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Banheiros mínimos</Label>
                <div className="flex items-center gap-2">
                  <Input type="number" value={prefBanheirosValue ?? ''} onChange={(e) => setPrefBanheirosValue(e.target.value === '' ? null : Number(e.target.value))} className="w-32" />
                  <Label className="text-sm">Prioridade</Label>
                  <select value={prefBanheirosPriority} onChange={(e) => setPrefBanheirosPriority(Number(e.target.value))} className="border rounded p-1">
                    {[1,2,3,4].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Distância máxima (km)</Label>
                <div className="flex items-center gap-2">
                  <Input type="number" value={prefDistanciaValue ?? ''} onChange={(e) => setPrefDistanciaValue(e.target.value === '' ? null : Number(e.target.value))} className="w-32" />
                  <Label className="text-sm">Prioridade</Label>
                  <select value={prefDistanciaPriority} onChange={(e) => setPrefDistanciaPriority(Number(e.target.value))} className="border rounded p-1">
                    {[1,2,3,4].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>

              <div className="md:col-span-2 flex items-center gap-3 mt-2">
                <Button onClick={calculateBestMatchFromIndex} className="bg-green-600 hover:bg-green-700 gap-2">
                  <Star className="h-4 w-4" />
                  Calcular melhor imóvel
                </Button>
                <Button variant="outline" onClick={() => { localStorage.removeItem(`propertyRankingOrder_${getCurrentUser()?.id ?? 'guest'}`); toast.info('Destaque removido'); }}>Remover destaque</Button>
                <div className="text-sm text-gray-600 ml-auto">A prioridade 1 recebe o maior peso.</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="bg-white/60 backdrop-blur-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total de Imóveis</p>
                                    <p className="text-3xl font-bold text-blue-600">
                    {filteredProperties.length}
                    {filteredProperties.length !== properties.length &&
                      <span className="text-lg text-gray-500">/{properties.length}</span>
                    }
                  </p>
                </div>
                <Home className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-white/60 backdrop-blur-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Fonte</p>
                  <p className="text-xl font-bold text-purple-600">{
                    (() => {
                      const set = new Set<string>();
                      for (const p of properties) {
                        const s = p.site || (function() { try { return new URL(p.link).hostname.replace(/^www\./, ""); } catch { return ""; } })();
                        if (s) set.add(s);
                      }
                      if (set.size === 0) return "—";
                      if (set.size === 1) return Array.from(set)[0];
                      return "Múltiplas fontes";
                    })()
                  }</p>
                </div>
                <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold text-sm">Q</span>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-white/60 backdrop-blur-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Última Atualização</p>
                  <p className="text-lg font-bold text-green-600">
                    {properties.length > 0 ? "Agora há pouco" : "Nenhuma"}
                  </p>
                </div>
                <div className={`w-3 h-3 rounded-full ${properties.length > 0 ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Featured Best Match Card */}
        {likedProperties.length > 0 && (function() {
          const scored = likedProperties.map(p => {
            const enhanced = enhanceProperty(p);
            return { item: enhanced, score: computeScoreForProperty(enhanced) };
          }).sort((a, b) => b.score - a.score);

          const bestMatch = scored[0];
          if (bestMatch && bestMatch.score > 0) {
            const property = bestMatch.item;
            return (
              <Card key={property.id} className="overflow-hidden bg-gradient-to-br from-yellow-50 to-orange-50 border-2 border-yellow-300 mb-8 hover:shadow-xl transition-all duration-300">
                <div className="relative">
                  <img
                    src={property.imagem || "https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=400&h=300&fit=crop"}
                    alt={property.nome}
                    className="w-full h-64 object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=400&h=300&fit=crop";
                    }}
                  />
                  <Badge className="absolute top-4 left-4 bg-yellow-500 text-yellow-900 text-sm font-bold">
                    ⭐ Melhor Imóvel
                  </Badge>
                  <Badge className="absolute top-4 right-4 bg-orange-600">
                    {(property.site || (function(){ try { return new URL(property.link).hostname.replace(/^www\./, ""); } catch { return "Fonte"; } })())}
                  </Badge>
                </div>
                <CardContent className="p-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900 mb-2">
                        {property.nome}
                      </h2>
                      <div className="flex items-center gap-2 mb-4">
                        <MapPin className="h-5 w-5 text-gray-500" />
                        <p className="text-lg text-gray-600">{property.localizacao}</p>
                      </div>
                      <p className="text-3xl font-bold text-green-600 mb-4">
                        {property.valor}
                      </p>
                      <div className="flex flex-wrap gap-2 mb-4">
                        <Badge variant="secondary" className="gap-1">
                          <Maximize2 className="h-4 w-4" />
                          {property.m2}
                        </Badge>
                        <Badge variant="secondary" className="gap-1">
                          <Home className="h-4 w-4" />
                          {property.quartos}
                        </Badge>
                        <Badge variant="secondary" className="gap-1">
                          <Car className="h-4 w-4" />
                          {property.garagem} vagas
                        </Badge>
                        {property.distancia && userLocation && (
                          <Badge variant="outline" className="gap-1 border-orange-200 text-orange-700">
                            <MapPin className="h-4 w-4" />
                            {property.distancia.toFixed(1)} km
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="bg-white rounded-lg p-6 border border-yellow-200">
                      <h3 className="font-semibold text-lg mb-4 text-yellow-900">Score de Compatibilidade</h3>
                      <div className="space-y-3">
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm font-medium text-gray-700">Compatibilidade Geral</span>
                            <span className="text-lg font-bold text-yellow-600">{(bestMatch.score * 100).toFixed(0)}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-3">
                            <div
                              className="bg-gradient-to-r from-yellow-400 to-orange-500 h-3 rounded-full transition-all duration-300"
                              style={{ width: `${bestMatch.score * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      <Button
                        onClick={() => window.open(property.link, '_blank')}
                        className="w-full mt-6 bg-yellow-600 hover:bg-yellow-700 gap-2"
                      >
                        <Star className="h-4 w-4" />
                        Ver este imóvel
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          }
          return null;
        })()}

                        {/* Properties Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {filteredProperties.map((property) => (
            <Card
              key={property.id}
              className={`overflow-hidden bg-white/80 backdrop-blur-sm hover:shadow-lg transition-all duration-300 hover:scale-[1.02] relative flex flex-col h-full
                ${swipedCard === property.id ? 'transform scale-95 opacity-50' : ''}
              `}
              onTouchStart={(e) => { const el = (e.target as HTMLElement); if (el.closest && el.closest('button, a, input, textarea, select')) return; handleTouchStart(e, property.id); }}
              onTouchMove={(e) => { const el = (e.target as HTMLElement); if (el.closest && el.closest('button, a, input, textarea, select')) return; handleTouchMove(e, property.id); }}
              onTouchEnd={(e) => { const el = (e.target as HTMLElement); if (el.closest && el.closest('button, a, input, textarea, select')) return; handleTouchEnd(property.id); }}
              style={{ touchAction: 'pan-y' }}
            >
              <div className="relative aspect-[4/3] w-full overflow-hidden">
                <img
                  src={property.imagem || "https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=400&h=300&fit=crop"}
                  alt={property.nome}
                  className="w-full h-full object-cover transition-transform duration-500 hover:scale-110"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=400&h=300&fit=crop";
                  }}
                />
                <Badge className="absolute top-3 right-3 bg-blue-600/90 backdrop-blur-sm border-none shadow-sm">
                  {(property.site || (function(){ try { return new URL(property.link).hostname.replace(/^www\./, ""); } catch { return "Fonte"; } })())}
                </Badge>
              </div>

              <CardContent className="p-4 sm:p-5 flex-grow flex flex-col">
                <div className="flex-grow">
                  <h3 className="font-bold text-base sm:text-lg text-gray-900 mb-2 line-clamp-2 h-12 sm:h-14 overflow-hidden">
                    {property.nome}
                  </h3>
                  {/* Tags */}
                  <div className="flex flex-wrap gap-1 mb-3">
                    {(property.tags || []).map((t: string) => (
                      <span key={t} className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{t}</span>
                    ))}
                    <button className="text-[10px] text-blue-600 ml-1 hover:underline" onClick={() => { setSelectedPropertyForTag(property); setIsTagModalOpen(true); }}>+ tags</button>
                  </div>

                  <div className="flex items-center gap-2 mb-3">
                    <MapPin className="h-3 w-3 sm:h-4 sm:w-4 text-gray-400" />
                    <p className="text-xs sm:text-sm text-gray-600 line-clamp-1">{property.localizacao}</p>
                  </div>

                  <div className="text-xl sm:text-2xl font-bold text-green-600 mb-4">
                    {property.valor}
                  </div>

                  <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-4">
                    <Badge variant="secondary" className="gap-1 text-[10px] sm:text-xs font-medium">
                      <Maximize2 className="h-3 w-3" />
                      {property.m2}
                    </Badge>
                    <Badge variant="secondary" className="gap-1 text-[10px] sm:text-xs font-medium">
                      <Home className="h-3 w-3" />
                      {property.quartos}
                    </Badge>
                    <Badge variant="secondary" className="gap-1 text-[10px] sm:text-xs font-medium">
                      <Car className="h-3 w-3" />
                      {property.garagem}
                    </Badge>
                    {(property as any).banheiros && (
                      <Badge variant="secondary" className="gap-1 text-[10px] sm:text-xs font-medium">
                        <Bath className="h-3 w-3" />
                        {(property as any).banheiros}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="space-y-2 mt-auto">
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDislike(property.id)}
                      className="flex-1 gap-2 border-gray-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
                    >
                      <ThumbsDown className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => window.open(property.link, '_blank')}
                      variant="outline"
                      className="flex-1 text-xs"
                    >
                      Ver
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleLike(property.id)}
                      className="flex-1 gap-2 bg-pink-600 hover:bg-pink-700 transition-colors"
                    >
                      <Heart className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="text-[10px] text-center text-gray-400 uppercase tracking-wider font-semibold">
                    Arraste para decidir
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

                {filteredProperties.length === 0 && properties.length === 0 && (
          <Card className="bg-white/60 backdrop-blur-sm">
            <CardContent className="p-12 text-center">
              <Home className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Nenhum imóvel encontrado
              </h3>
              <p className="text-gray-600 mb-6">
                Inicie o scraping para começar a coletar dados dos sites selecionados ou importe um arquivo Excel
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button onClick={handleStartScraping} className="gap-2">
                  <Play className="h-4 w-4" />
                  Iniciar Coleta
                </Button>
                <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-2">
                  <Upload className="h-4 w-4" />
                  Importar Excel
                </Button>
                <Button variant="outline" onClick={() => setIsManualEntryOpen(true)} className="gap-2 border-pink-200 text-pink-600 hover:bg-pink-50">
                  <Plus className="h-4 w-4" />
                  Adicionar Manualmente
                </Button>
              </div>
            </CardContent>
          </Card>
                )}

        {filteredProperties.length === 0 && properties.length > 0 && (
          <Card className="bg-white/60 backdrop-blur-sm">
            <CardContent className="p-12 text-center">
              <Filter className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Nenhum imóvel encontrado com esses filtros
              </h3>
              <p className="text-gray-600 mb-6">
                Tente ajustar os filtros para ver mais resultados. Temos {properties.length} imóveis disponíveis.
              </p>
                            <Button
                variant="outline"
                onClick={() => setFilters({
                  valorMin: "",
                  valorMax: "",
                  m2Min: 0,
                  m2Max: 10000,
                  quartos: ['all'],
                  vagas: ['all'],
                  banhos: [],
                  distanciaMax: 50
                })}
              >
                Limpar Filtros
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Tag Editor Dialog */}
      <Dialog open={isTagModalOpen} onOpenChange={setIsTagModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Tags</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 p-2">
            <div>
              <Label>Tags atuais</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {selectedPropertyForTag && (selectedPropertyForTag.tags || []).map(t => (
                  <span key={t} className="flex items-center gap-2 bg-gray-100 px-2 py-1 rounded-full text-sm">
                    {t}
                    <button className="text-red-500 text-xs" onClick={() => {
                      if (!selectedPropertyForTag) return;
                      const updated = (selectedPropertyForTag.tags || []).filter(x => x !== t);
                      setSelectedPropertyForTag({ ...selectedPropertyForTag, tags: updated });
                      saveTagsForProperty(selectedPropertyForTag.id, updated);
                    }}>x</button>
                  </span>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="newTag">Adicionar nova tag</Label>
              <div className="flex gap-2 mt-2">
                <Input id="newTag" placeholder="Digite a tag" value={newTagInput} onChange={(e) => setNewTagInput(e.target.value)} />
                <Button onClick={() => {
                  if (!selectedPropertyForTag || !newTagInput.trim()) return;
                  const t = newTagInput.trim();
                  const existing = selectedPropertyForTag.tags || [];
                  if (!existing.includes(t)) {
                    const updated = [...existing, t];
                    setSelectedPropertyForTag({ ...selectedPropertyForTag, tags: updated });
                    saveTagsForProperty(selectedPropertyForTag.id, updated);
                  }
                  setNewTagInput('');
                }}>Adicionar</Button>
              </div>
            </div>
            <div className="pt-2 flex justify-end">
              <Button variant="outline" onClick={() => setIsTagModalOpen(false)}>Fechar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFileUpload}
        className="hidden"
      />
    </div>
  );
}
