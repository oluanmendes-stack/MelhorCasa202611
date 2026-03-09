import React, { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Maximize2, Home, Car, Bath } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Property } from '@/types/property';
import { MatchOverlay } from '@/components/MatchOverlay';
import { getCurrentUser, addLikeForUser, getUserById } from '@/lib/auth';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const modalidades_venda: Record<string, string> = {
  '': 'Todas as Modalidades',
  '4': '1º Leilão SFI',
  '5': '2º Leilão SFI',
  '2': 'Concorrência Pública',
  '14': 'Leilão SFI - Edital Único',
  '21': 'Licitação Aberta',
  '9': 'Venda Direta FAR',
  '34': 'Venda Direta Online',
  '33': 'Venda Online',
  '30': 'Exercício de Direito de Preferência',
};

const cidades_mg: Record<string, string> = {
  '': 'Todas as Cidades',
  '2803': 'BELO HORIZONTE',
  '3031': 'CONTAGEM',
  '2811': 'BETIM',
  '3533': 'NOVA LIMA',
  '3778': 'SABARA',
  '3743': 'RIBEIRAO DAS NEVES',
  '3803': 'SANTA LUZIA',
  '4138': 'VESPASIANO',
  '3384': 'LAGOA SANTA',
  '3925': 'SAO JOAOQUIM DE BICAS',
  '3258': 'IBIRITE',
  '4005': 'SARZEDO',
  '3438': 'MARIO CAMPOS',
  '3138': 'ESMERALDAS',
};

const faixas_valor: Record<string, string> = {
  '1': 'Até R$100.000,00',
  '2': 'De R$100.000,01 até R$200.000,00',
  '3': 'De R$200.000,01 até R$400.000,00',
  '4': 'De R$400.000,01 até R$750.000,00',
  '5': 'Acima de R$750.000,00',
  '0': 'Indiferente',
};

const tipos_imovel: Record<string, string> = {
  '1': 'Casa',
  '2': 'Apartamento',
  '3': 'Outros',
  '4': 'Indiferente',
};

const quartos_opcoes: Record<string, string> = {
  '1': '1 quarto',
  '2': '2 quartos',
  '3': '3 ou mais quartos',
  '0': 'Indiferente',
};

const vagas_garagem_opcoes: Record<string, string> = {
  '1': '1 vaga',
  '2': '2 vagas',
  '3': '3 ou mais vagas',
  '0': 'Indiferente',
};

const area_util_opcoes: Record<string, string> = {
  '1': 'Até 60m²',
  '2': '61 a 90m²',
  '3': '91 a 120m²',
  '4': '121 a 200m²',
  '5': '201 a 300m²',
  '6': 'Acima de 301m²',
  '0': 'Indiferente',
};

export default function Leilao() {
  const [selectedModalidades, setSelectedModalidades] = useState<string[]>([]);
  const [todasModalidades, setTodasModalidades] = useState(false);
  const [selectedCidades, setSelectedCidades] = useState<string[]>([]);
  const [citiesOpen, setCitiesOpen] = useState(false);
  const [faixaValor, setFaixaValor] = useState('');
  const [tipoImovel, setTipoImovel] = useState('4');
  const [quartos, setQuartos] = useState('0');
  const [vagas, setVagas] = useState('0');
  const [areaUtil, setAreaUtil] = useState('0');
  const [verificarFinanciamento, setVerificarFinanciamento] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [likes, setLikes] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('leilaoLikes') || '{}'); } catch { return {}; }
  });
  const [dislikes, setDislikes] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('leilaoDislikes') || '{}'); } catch { return {}; }
  });
  const [orderBy, setOrderBy] = useState<string>('default');
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [matchOverlay, setMatchOverlay] = useState<{
    isOpen: boolean;
    property: Property | null;
    matchedWith: string;
  }>({
    isOpen: false,
    property: null,
    matchedWith: "",
  });

  useEffect(() => {
    getCurrentUser().then(setCurrentUser);
  }, []);

  const addToLikedStorage = (prop: any) => {
    try {
      const key = 'likedProperties';
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      // build normalized property
      const property = {
        id: prop.Matrícula || prop.matricula || prop.Edital || ('leilao_' + (prop.Descritivo || prop.descritivo || Math.random()).replace(/\s+/g, '_')),
        nome: prop.Descritivo || prop.descritivo || '',
        imagem: prop.Foto || prop.foto || prop.imagem || '',
        valor: prop.Valor || prop.valor || '',
        m2: prop.Area || prop.area || '',
        localizacao: prop.Endereço || prop.Endereco || prop.endereco || prop.Cidade || prop.cidade || '',
        link: prop.Matrícula || prop.matricula || prop.Edital || prop.edital || '',
        quartos: prop.Quartos || prop.quartos || '',
        garagem: prop.Vagas || prop.vagas || '',
      };
      // avoid duplicates by id
      const filtered = existing.filter((p: any) => p.id !== property.id);
      filtered.unshift(property);
      localStorage.setItem(key, JSON.stringify(filtered));
    } catch (e) {
      console.error('Failed to persist liked property', e);
    }
  };

  const removeFromLikedStorage = (prop: any) => {
    try {
      const key = 'likedProperties';
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      const filtered = existing.filter((p: any) => p.id !== (prop.id || prop.Matrícula || prop.matricula || prop.Edital));
      localStorage.setItem(key, JSON.stringify(filtered));
    } catch (e) {
      console.error('Failed to remove liked property', e);
    }
  };

  const addToDislikedStorage = (prop: any) => {
    try {
      const key = 'dislikedProperties';
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      const property = {
        id: prop.Matrícula || prop.matricula || prop.Edital || ('leilao_' + (prop.Descritivo || prop.descritivo || Math.random()).replace(/\s+/g, '_')),
        nome: prop.Descritivo || prop.descritivo || '',
        imagem: prop.Foto || prop.foto || prop.imagem || '',
        valor: prop.Valor || prop.valor || '',
        localizacao: prop.Endereço || prop.Endereco || prop.endereco || prop.Cidade || prop.cidade || '',
      };
      const filtered = existing.filter((p: any) => p.id !== property.id);
      filtered.unshift(property);
      localStorage.setItem(key, JSON.stringify(filtered));
    } catch (e) {
      console.error('Failed to persist disliked property', e);
    }
  };

  const toggle = (arr: string[], setArr: (v: string[]) => void, value: string) => {
    const copy = [...arr];
    const idx = copy.indexOf(value);
    if (idx >= 0) copy.splice(idx, 1);
    else copy.push(value);
    setArr(copy);
  };

  // persist likes/dislikes to localStorage
  useEffect(() => {
    try { localStorage.setItem('leilaoLikes', JSON.stringify(likes)); } catch (e) {}
  }, [likes]);
  useEffect(() => {
    try { localStorage.setItem('leilaoDislikes', JSON.stringify(dislikes)); } catch (e) {}
  }, [dislikes]);

  const parseMoney = (v: any) => {
    if (!v) return 0;
    try {
      let s = String(v);
      s = s.replace(/R\$|\s/g, '');
      // remove thousand dots
      s = s.replace(/\./g, '');
      // replace decimal comma with dot
      s = s.replace(/,/g, '.');
      const n = parseFloat(s);
      return isNaN(n) ? 0 : n;
    } catch {
      return 0;
    }
  };

  const parseIntSafe = (v: any) => {
    if (!v) return 0;
    const s = String(v).replace(/[^0-9]/g, '');
    const n = parseInt(s || '0', 10);
    return isNaN(n) ? 0 : n;
  };

  const sortResults = (arr: any[], order: string) => {
    if (!arr || !Array.isArray(arr)) return [];
    const copy = [...arr];
    switch (order) {
      case 'price_asc':
        return copy.sort((a, b) => parseMoney(a.Valor || a.valor) - parseMoney(b.Valor || b.valor));
      case 'price_desc':
        return copy.sort((a, b) => parseMoney(b.Valor || b.valor) - parseMoney(a.Valor || a.valor));
      case 'quartos_desc':
        return copy.sort((a, b) => parseIntSafe(b.Quartos || b.quartos) - parseIntSafe(a.Quartos || a.quartos));
      case 'quartos_asc':
        return copy.sort((a, b) => parseIntSafe(a.Quartos || a.quartos) - parseIntSafe(b.Quartos || b.quartos));
      case 'city_asc':
        return copy.sort((a, b) => String(a.Cidade || a.cidade || '').localeCompare(String(b.Cidade || b.cidade || '')));
      default:
        return copy;
    }
  };

  const displayedResults = useMemo(() => sortResults(results, orderBy), [results, orderBy]);

  const doCapture = async () => {
    console.log('[leilao] doCapture called');
    setLoading(true);
    try {
      const body = {
        modalidades: selectedModalidades,
        cidades: selectedCidades,
        faixa_valor: faixaValor,
        tipo_imovel: tipoImovel,
        quartos,
        vagas,
        area_util: areaUtil,
        verificar_financiamento: verificarFinanciamento,
      };
      console.log('[leilao] sending body', body);
      const getApiBase = () => {
        try { const win: any = window as any; if (win && win.__API_BASE) return win.__API_BASE.replace(/\/$/, ''); } catch {}
        try { const stored = localStorage.getItem('API_BASE'); if (stored) return stored.replace(/\/$/, ''); } catch {}
        return (import.meta as any).env?.VITE_API_BASE || '';
      };
      const API_BASE = getApiBase();
      const url = API_BASE ? `${API_BASE}/api/leilao` : `/api/leilao`;

      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      console.log('[leilao] response status', res.status);

      if (!res.ok) {
        let txt: string | null = null;
        try { txt = await res.text(); } catch (e) { txt = null; }
        throw new Error(`Falha ao iniciar captura (HTTP ${res.status})${txt ? ': ' + txt : ''}`);
      }

      const json = await res.json();
      setResults(Array.isArray(json.results) ? json.results : json.results || []);
    } catch (e: any) {
      console.error('[leilao] capture error', e);
      alert(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
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
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-4">Leilão (Caixa)</h1>

        <Card className="mb-6">
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div>
                <Label className="mb-2">Modalidades</Label>
                <div className="bg-surface rounded p-3 border overflow-y-auto max-h-40">
                  <label className="flex items-center gap-2 mb-2">
                    <input type="checkbox" checked={todasModalidades} onChange={(e) => { const v = (e.target as HTMLInputElement).checked; setTodasModalidades(v); if (v) setSelectedModalidades([]); }} />
                    <span className="text-sm">Todas as Modalidades</span>
                  </label>

                  {Object.entries(modalidades_venda).map(([id, label]) => (
                    id === '' ? null : (
                      <label key={id} className="flex items-center gap-2 mb-1">
                        <input type="checkbox" checked={!todasModalidades && selectedModalidades.includes(id)} disabled={todasModalidades} onChange={() => { setTodasModalidades(false); toggle(selectedModalidades, setSelectedModalidades, id); }} />
                        <span className="text-sm">{label}</span>
                      </label>
                    )
                  ))}
                </div>
              </div>

              <div>
                <Label className="mb-2">Cidades</Label>
                <div className="relative">
                  <button type="button" onClick={() => setCitiesOpen(prev => !prev)} className="w-full border rounded p-2 text-left bg-white">
                    <span className="text-sm text-gray-700">{selectedCidades.length === 0 ? 'Selecione' : selectedCidades.map(id => (cidades_mg as any)[id]).join(', ')}</span>
                  </button>

                  {citiesOpen && (
                    <div className="absolute z-50 mt-1 w-full bg-white border rounded shadow max-h-40 overflow-auto p-2">
                      {Object.entries(cidades_mg).map(([id, label]) => (
                        id === '' ? null : (
                          <label key={id} className="flex items-center gap-2 mb-1">
                            <input type="checkbox" checked={selectedCidades.includes(id)} onChange={() => toggle(selectedCidades, setSelectedCidades, id)} />
                            <span className="text-sm">{label}</span>
                          </label>
                        )
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <Label className="mb-2">Filtros</Label>
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm">Faixa de Valor</Label>
                    <Select onValueChange={(v) => setFaixaValor(v)}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(faixas_valor).map(([id, label]) => (
                          <SelectItem key={id} value={id}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-sm">Tipo de Imóvel</Label>
                    <Select onValueChange={(v) => setTipoImovel(v)}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(tipos_imovel).map(([id, label]) => (
                          <SelectItem key={id} value={id}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-sm">Quartos</Label>
                      <Select onValueChange={(v) => setQuartos(v)}>
                        <SelectTrigger className="w-full"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(quartos_opcoes).map(([id, label]) => (<SelectItem key={id} value={id}>{label}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-sm">Vagas</Label>
                      <Select onValueChange={(v) => setVagas(v)}>
                        <SelectTrigger className="w-full"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(vagas_garagem_opcoes).map(([id, label]) => (<SelectItem key={id} value={id}>{label}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm">Área Útil</Label>
                    <Select onValueChange={(v) => setAreaUtil(v)}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(area_util_opcoes).map(([id, label]) => (<SelectItem key={id} value={id}>{label}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-2">
                    <input id="vf" type="checkbox" checked={verificarFinanciamento} onChange={(e) => setVerificarFinanciamento((e.target as HTMLInputElement).checked)} />
                    <label htmlFor="vf">Verificar aceitação de financiamento</label>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-col md:flex-row md:items-center md:gap-4">
              <div className="w-full md:w-1/3">
                <Label className="text-sm">Ordenar por</Label>
                <Select onValueChange={(v) => setOrderBy(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Padrão" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Padrão</SelectItem>
                    <SelectItem value="price_asc">Menor valor</SelectItem>
                    <SelectItem value="price_desc">Maior valor</SelectItem>
                    <SelectItem value="quartos_desc">Mais quartos</SelectItem>
                    <SelectItem value="quartos_asc">Menos quartos</SelectItem>
                    <SelectItem value="city_asc">Cidade A‑Z</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="mt-2 md:mt-0 flex gap-2">
                <Button onClick={doCapture} disabled={loading}>{loading ? 'Capturando...' : 'Capturar'}</Button>
                <Button variant="outline" onClick={() => { setResults([]); setSelectedModalidades([]); setSelectedCidades([]); setFaixaValor(''); setTipoImovel('4'); setQuartos('0'); setVagas('0'); setAreaUtil('0'); setVerificarFinanciamento(false); }}>Limpar</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {displayedResults.map((r: any, idx: number) => {
            const idKey = (r?.Matrícula || r?.matricula || r?.Edital || r?.edital || ('leilao_' + ((r?.Descritivo || r?.descritivo || Math.random()) + '').replace(/\s+/g, '_'))).toString();
            const property: Property = {
              id: idKey,
              nome: r.Descritivo || r.descritivo || '',
              imagem: r.Foto || r.foto || r.imagem || 'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=400&h=300&fit=crop',
              valor: r.Valor || r.valor || '—',
              m2: r.Area || r.area || '—',
              localizacao: r.Endereço || r.Endereco || r.endereco || r.Cidade || r.cidade || '',
              link: r.Matrícula || r.matricula || r.Edital || r.edital || '#',
              quartos: r.Quartos || r.quartos || '—',
              garagem: r.Vagas || r.vagas || '—',
            };

            return (
              <Card key={idx} className="overflow-hidden flex flex-col h-full bg-white/80 backdrop-blur-sm hover:shadow-lg transition-all duration-300">
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-gray-100">
                  <img src={property.imagem} alt={property.nome} className="w-full h-full object-cover transition-transform duration-500 hover:scale-110" />
                </div>
                <CardContent className="p-4 sm:p-5 flex-grow flex flex-col">
                  <div className="flex-grow">
                    <h3 className="font-bold text-base sm:text-lg text-gray-900 mb-2 line-clamp-2 h-12 sm:h-14 overflow-hidden">{property.nome}</h3>
                    <div className="space-y-1 mb-4">
                      <p className="text-sm font-semibold text-green-600">Valor: {property.valor}</p>
                      <p className="text-xs text-gray-600">Cidade: {r.Cidade || r.cidade || '—'}</p>
                      <p className="text-xs text-gray-600">Quartos: {property.quartos}</p>
                      <p className="text-xs text-gray-600">Vagas: {property.garagem}</p>
                      <p className="text-xs text-gray-600 line-clamp-1">Endereço: {property.localizacao}</p>
                      <p className="text-[10px] text-gray-500 italic">Aceita financiamento: {r['Aceita Financiamento'] || r['aceita_financiamento'] || '—'}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-4">
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
                    </div>
                    <div className="flex gap-2 mb-4">
                      {(r.Matrícula || r.matricula) && <a className="text-[10px] text-blue-600 underline font-medium" href={r.Matrícula || r.matricula} target="_blank" rel="noreferrer">Matrícula</a>}
                      {(r.Edital || r.edital) && <a className="text-[10px] text-blue-600 underline font-medium" href={r.Edital || r.edital} target="_blank" rel="noreferrer">Edital</a>}
                    </div>
                  </div>

                  <div className="mt-auto flex items-center gap-2 pt-4 border-t border-gray-100">
                    <Button
                      variant={likes[idKey] ? 'secondary' : 'default'}
                      size="sm"
                      className={`flex-1 ${likes[idKey] ? 'bg-pink-100 text-pink-600 hover:bg-pink-200' : 'bg-pink-600 hover:bg-pink-700 text-white'}`}
                      onClick={async () => {
                        const willLike = !likes[idKey];
                        setLikes(prev => ({ ...prev, [idKey]: willLike }));
                        setDislikes(prev => { const copy = { ...prev }; delete copy[idKey]; return copy; });

                        if (willLike) {
                          addToLikedStorage(r);
                          if (currentUser) {
                            const createdMatches = await addLikeForUser(currentUser.id, property);
                            if (createdMatches && createdMatches.length > 0) {
                              const matchedUserId = createdMatches[0];
                              const matchedUser = await getUserById(matchedUserId);
                              setMatchOverlay({
                                isOpen: true,
                                property,
                                matchedWith: matchedUser?.username || "seu colega",
                              });
                            }
                          }
                          // remove from dislikedProperties stored list
                          try {
                            const dKey = 'dislikedProperties';
                            const d = JSON.parse(localStorage.getItem(dKey) || '[]').filter((p: any) => p.id !== idKey);
                            localStorage.setItem(dKey, JSON.stringify(d));
                          } catch (e) {}
                        } else {
                          removeFromLikedStorage(r);
                        }
                      }}
                    >
                      {likes[idKey] ? 'Curtido' : 'Curtir'}
                    </Button>

                    <Button
                      variant={dislikes[idKey] ? 'destructive' : 'outline'}
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => {
                        const willDislike = !dislikes[idKey];
                        setDislikes(prev => ({ ...prev, [idKey]: willDislike }));
                        setLikes(prev => { const copy = { ...prev }; delete copy[idKey]; return copy; });
                        if (willDislike) {
                          addToDislikedStorage(r);
                          try {
                            const lKey = 'likedProperties';
                            const l = JSON.parse(localStorage.getItem(lKey) || '[]').filter((p: any) => p.id !== idKey);
                            localStorage.setItem(lKey, JSON.stringify(l));
                          } catch (e) {}
                        } else {
                          try { removeFromLikedStorage(r); } catch (e) {}
                        }
                      }}
                    >
                      {dislikes[idKey] ? 'Ignorado' : 'Ignorar'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
