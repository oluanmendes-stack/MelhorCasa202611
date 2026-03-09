import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, MapPin, Calendar, Clock, DollarSign, StickyNote, Trash2, Edit2, Plus, ExternalLink, Bell, ImageOff, Link as LinkIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { getCurrentUser, addVisit, getVisits, updateVisit, deleteVisit, Visit } from "@/lib/auth";
import { requestNotificationPermission, checkUpcomingVisits, sendNotification, registerServiceWorker } from "@/lib/notifications";
import { Property } from "@/types/property";

export default function Visits() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVisit, setEditingVisit] = useState<Visit | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [likedProperties, setLikedProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    address: "",
    visitDate: "",
    visitTime: "",
    propertyPrice: "",
    notes: "",
    propertyImage: "",
    propertyData: undefined as Property | undefined,
  });
  const [propertySearch, setPropertySearch] = useState("");

  // Load visits and setup notifications
  useEffect(() => {
    const loadVisits = async () => {
      try {
        setIsLoading(true);
        const user = await getCurrentUser();
        if (user) {
          const userVisits = await getVisits(user.id);
          setVisits(userVisits);

          // Load liked properties
          setLikedProperties(user.likedProperties || []);

          // Request notification permission
          const permission = await requestNotificationPermission();
          setNotificationsEnabled(permission === "granted");

          // Register service worker for background notifications (non-critical)
          try {
            await registerServiceWorker();
          } catch (swError) {
            // Service worker registration is optional, don't break the app
            console.warn("Service worker registration failed:", swError);
          }

          // Check for upcoming visits
          const upcoming = checkUpcomingVisits(userVisits);
          if (upcoming.length > 0 && permission === "granted") {
            upcoming.forEach(visit => {
              const visitDateTime = new Date(`${visit.visitDate}T${visit.visitTime}`);
              const timeUntil = Math.round((visitDateTime.getTime() - new Date().getTime()) / 1000 / 60);
              if (timeUntil > 0 && timeUntil <= 60) {
                sendNotification("Visita próxima!", {
                  body: `Você tem uma visita em ${timeUntil} minutos:\n${visit.address}`,
                  tag: `visit-${visit.address}`,
                  requireInteraction: true,
                });
              }
            });
          }
        } else {
          toast.error("Você precisa estar logado para ver suas visitas");
          setVisits([]);
        }
      } catch (error) {
        console.error("Erro ao carregar visitas:", error);
        toast.error("Erro ao carregar visitas");
      } finally {
        setIsLoading(false);
      }
    };
    loadVisits();

    // Set up periodic check for upcoming visits (every minute)
    const notificationInterval = setInterval(async () => {
      const user = await getCurrentUser();
      if (user) {
        const userVisits = await getVisits(user.id);
        const upcoming = checkUpcomingVisits(userVisits);
        if (upcoming.length > 0 && notificationsEnabled) {
          upcoming.forEach(visit => {
            const visitDateTime = new Date(`${visit.visitDate}T${visit.visitTime}`);
            const timeUntil = Math.round((visitDateTime.getTime() - new Date().getTime()) / 1000 / 60);
            if (timeUntil > 0 && timeUntil <= 60) {
              sendNotification("Visita próxima!", {
                body: `Você tem uma visita em ${timeUntil} minutos:\n${visit.address}`,
                tag: `visit-${visit.address}`,
                requireInteraction: true,
              });
            }
          });
        }
      }
    }, 60000); // Check every minute

    return () => clearInterval(notificationInterval);
  }, [notificationsEnabled]);

  const handleOpenDialog = (visit?: Visit) => {
    if (visit) {
      setEditingVisit(visit);
      setFormData({
        address: visit.address,
        visitDate: visit.visitDate,
        visitTime: visit.visitTime,
        propertyPrice: visit.propertyPrice,
        notes: visit.notes,
        propertyImage: visit.propertyData?.imagem || "",
        propertyData: visit.propertyData,
      });
      setSelectedPropertyId(visit.propertyData?.id || null);
    } else {
      setEditingVisit(null);
      setFormData({
        address: "",
        visitDate: "",
        visitTime: "",
        propertyPrice: "",
        notes: "",
        propertyImage: "",
        propertyData: undefined,
      });
      setSelectedPropertyId(null);
    }
    setPropertySearch("");
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingVisit(null);
    setSelectedPropertyId(null);
  };

  const handlePropertySelect = (propertyId: string) => {
    const property = likedProperties.find(p => p.id === propertyId);
    if (property) {
      setSelectedPropertyId(propertyId);
      setFormData(prev => ({
        ...prev,
        address: property.localizacao || prev.address,
        propertyPrice: property.valor || prev.propertyPrice,
        propertyImage: property.imagem || prev.propertyImage,
        propertyData: property,
      }));
    }
  };

  const filteredProperties = propertySearch.trim()
    ? likedProperties.filter(p =>
        `${p.nome} ${p.localizacao}`.toLowerCase().includes(propertySearch.toLowerCase())
      )
    : likedProperties;

  const handleSaveVisit = async () => {
    if (!formData.address || !formData.visitDate || !formData.visitTime) {
      toast.error("Preencha endereço, data e hora");
      return;
    }

    const user = await getCurrentUser();
    if (!user) {
      toast.error("Você precisa estar logado");
      return;
    }

    setIsActionLoading(true);
    try {
      // Prepare visit data with image
      const visitData = {
        ...formData,
        propertyData: formData.propertyData ? {
          ...formData.propertyData,
          imagem: formData.propertyImage || formData.propertyData.imagem
        } : undefined
      };

      if (editingVisit) {
        // Update existing visit
        const updated = await updateVisit(user.id, editingVisit.id, visitData);
        setVisits(prev => prev.map(v => v.id === updated.id ? updated : v));
        toast.success("Visita atualizada!");
      } else {
        // Add new visit
        const newVisit = await addVisit(user.id, visitData);
        setVisits(prev => [...prev, newVisit].sort((a, b) => {
          const dateCompare = a.visitDate.localeCompare(b.visitDate);
          return dateCompare !== 0 ? dateCompare : a.visitTime.localeCompare(b.visitTime);
        }));
        toast.success("Visita agendada!");
      }
      handleCloseDialog();
    } catch (error) {
      console.error("Erro ao salvar visita:", error);
      toast.error("Erro ao salvar visita");
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleDeleteVisit = async (visitId: string) => {
    if (!confirm("Tem certeza que deseja deletar esta visita?")) return;

    const user = await getCurrentUser();
    if (!user) return;

    setIsActionLoading(true);
    try {
      await deleteVisit(user.id, visitId);
      setVisits(prev => prev.filter(v => v.id !== visitId));
      toast.success("Visita removida!");
    } catch (error) {
      console.error("Erro ao deletar visita:", error);
      toast.error("Erro ao deletar visita");
    } finally {
      setIsActionLoading(false);
    }
  };

  const openMapLink = (address: string) => {
    const encodedAddress = encodeURIComponent(address);
    const mapsUrl = `https://maps.apple.com/?address=${encodedAddress}`;
    window.open(mapsUrl, "_blank");
  };

  const isVisitToday = (visitDate: string) => {
    const today = new Date().toISOString().split("T")[0];
    return visitDate === today;
  };

  const isVisitPast = (visitDate: string, visitTime: string) => {
    const now = new Date();
    const visitDateTime = new Date(`${visitDate}T${visitTime}`);
    return visitDateTime < now;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 flex items-center justify-center">
        <div className="bg-white rounded-lg p-8 shadow-lg">
          <div className="flex flex-col items-center gap-4">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 border-4 border-blue-100 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-transparent border-t-blue-600 rounded-full animate-spin"></div>
            </div>
            <p className="text-gray-700 font-medium">Carregando visitas...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50">
      {isActionLoading && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-[9999]">
          <div className="bg-white rounded-lg p-8 shadow-lg">
            <div className="flex flex-col items-center gap-4">
              <div className="relative w-12 h-12">
                <div className="absolute inset-0 border-4 border-blue-100 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-transparent border-t-blue-600 rounded-full animate-spin"></div>
              </div>
              <p className="text-gray-700 font-medium">Processando...</p>
            </div>
          </div>
        </div>
      )}

      {/* Notification Permission Banner */}
      {!notificationsEnabled && (
        <div className="bg-blue-50 border-t border-b border-blue-200 sticky top-0 z-40">
          <div className="container mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3 text-sm text-blue-900">
              <Bell className="h-4 w-4 flex-shrink-0" />
              <span>Ative notificações para receber alertas sobre suas visitas</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="ml-4"
              onClick={async () => {
                const permission = await requestNotificationPermission();
                setNotificationsEnabled(permission === "granted");
                if (permission === "granted") {
                  toast.success("Notificações ativadas!");
                }
              }}
            >
              Ativar
            </Button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-50">
        <div className="container mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link to="/">
                <Button variant="outline" size="sm" className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Voltar
                </Button>
              </Link>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Visitas Agendadas</h1>
                <p className="text-sm text-gray-600">Gerencie suas visitas a imóveis</p>
              </div>
            </div>

            <Button
              onClick={() => handleOpenDialog()}
              className="gap-2 bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Nova Visita
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Statistics */}
        <Card className="mb-8 bg-white/60 backdrop-blur-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total de Visitas Agendadas</p>
                <p className="text-3xl font-bold text-blue-600">{visits.length}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-blue-600 text-xl">📅</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Visits List */}
        {visits.length === 0 ? (
          <Card className="bg-white/60 backdrop-blur-sm">
            <CardContent className="p-12 text-center">
              <div className="text-6xl mb-4">🏠</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Nenhuma visita agendada
              </h3>
              <p className="text-gray-600 mb-6">
                Comece agendando uma visita para um imóvel que você interesse!
              </p>
              <Button
                onClick={() => handleOpenDialog()}
                className="gap-2 bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                Agendar Primeira Visita
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {visits.map((visit) => {
              const today = isVisitToday(visit.visitDate);
              const past = isVisitPast(visit.visitDate, visit.visitTime);

              return (
                <Card
                  key={visit.id}
                  className={`overflow-hidden transition-all ${
                    today
                      ? "bg-yellow-50/80 border-2 border-yellow-300 shadow-lg"
                      : "bg-white/80 backdrop-blur-sm hover:shadow-lg"
                  } ${past ? "opacity-60" : ""}`}
                >
                  <CardContent className="p-6">
                    <div className="flex flex-col sm:flex-row gap-6">
                      {/* Property Image */}
                      {visit.propertyData?.imagem && (
                        <div className="w-full sm:w-48 flex-shrink-0">
                          <img
                            src={visit.propertyData.imagem}
                            alt={visit.propertyData.nome}
                            className="w-full h-40 sm:h-48 object-cover rounded-lg border border-gray-200"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        </div>
                      )}

                      <div className="flex-1 space-y-3">
                        {/* Address */}
                        <div className="flex items-start gap-3">
                          <MapPin className="h-5 w-5 text-blue-600 mt-1 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <h3 className="text-lg font-semibold text-gray-900 break-words">
                              {visit.address}
                            </h3>
                            {visit.propertyData?.nome && (
                              <p className="text-sm text-gray-600 mt-1">{visit.propertyData.nome}</p>
                            )}
                            {today && (
                              <Badge className="mt-2 bg-yellow-600">📍 Visita de Hoje</Badge>
                            )}
                            {past && (
                              <Badge variant="secondary" className="mt-2">Visita passada</Badge>
                            )}
                          </div>
                        </div>

                        {/* Property Link */}
                        {visit.propertyData?.link && (
                          <div className="flex items-center gap-2">
                            <LinkIcon className="h-4 w-4 text-blue-500 flex-shrink-0" />
                            <a
                              href={visit.propertyData.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-blue-600 hover:underline break-all"
                            >
                              Ver anúncio original
                            </a>
                          </div>
                        )}

                        {/* Date and Time */}
                        <div className="flex flex-wrap gap-4 sm:gap-6">
                          <div className="flex items-center gap-2 text-gray-700">
                            <Calendar className="h-4 w-4 text-gray-500" />
                            <span className="text-sm">
                              {new Date(visit.visitDate).toLocaleDateString("pt-BR")}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-gray-700">
                            <Clock className="h-4 w-4 text-gray-500" />
                            <span className="text-sm">{visit.visitTime}</span>
                          </div>
                        </div>

                        {/* Price */}
                        {visit.propertyPrice && (
                          <div className="flex items-center gap-2 text-gray-700">
                            <DollarSign className="h-4 w-4 text-gray-500" />
                            <span className="text-sm font-medium">{visit.propertyPrice}</span>
                          </div>
                        )}

                        {/* Notes */}
                        {visit.notes && (
                          <div className="mt-3 bg-gray-100 rounded-lg p-3 text-sm text-gray-700">
                            <p className="flex items-center gap-2 font-medium mb-1">
                              <StickyNote className="h-4 w-4" />
                              Anotações
                            </p>
                            <p className="ml-6 text-gray-600">{visit.notes}</p>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-2 sm:w-32">
                        <Button
                          onClick={() => openMapLink(visit.address)}
                          variant="outline"
                          size="sm"
                          className="gap-2"
                        >
                          <ExternalLink className="h-4 w-4" />
                          Ver Mapa
                        </Button>
                        <Button
                          onClick={() => handleOpenDialog(visit)}
                          variant="outline"
                          size="sm"
                          className="gap-2"
                        >
                          <Edit2 className="h-4 w-4" />
                          Editar
                        </Button>
                        <Button
                          onClick={() => handleDeleteVisit(visit.id)}
                          variant="destructive"
                          size="sm"
                          className="gap-2"
                        >
                          <Trash2 className="h-4 w-4" />
                          Deletar
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Add/Edit Visit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingVisit ? "Editar Visita" : "Agendar Nova Visita"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {likedProperties.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="property">Selecionar Imóvel Curtido (opcional)</Label>
                <div className="relative">
                  <Input
                    id="property"
                    placeholder="Buscar imóvel curtido..."
                    value={propertySearch}
                    onChange={(e) => setPropertySearch(e.target.value)}
                    className="pr-10"
                  />
                  {propertySearch && filteredProperties.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-10 max-h-48 overflow-y-auto">
                      {filteredProperties.map((property) => (
                        <button
                          key={property.id}
                          type="button"
                          onClick={() => {
                            handlePropertySelect(property.id);
                            setPropertySearch("");
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-100 last:border-b-0 transition-colors"
                        >
                          <p className="font-medium text-sm text-gray-900">{property.nome}</p>
                          <p className="text-xs text-gray-600">{property.localizacao}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {selectedPropertyId && formData.propertyData && (
                  <div className="mt-2 p-2 bg-blue-50 rounded border border-blue-200 text-xs text-blue-900">
                    <p>✓ Imóvel selecionado: {formData.propertyData.nome}</p>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="address">Endereço do Imóvel *</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) =>
                  setFormData({ ...formData, address: e.target.value })
                }
                placeholder="Ex: Rua das Flores, 123, São Paulo"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="visitDate">Data da Visita *</Label>
                <Input
                  id="visitDate"
                  type="date"
                  value={formData.visitDate}
                  onChange={(e) =>
                    setFormData({ ...formData, visitDate: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="visitTime">Hora da Visita *</Label>
                <Input
                  id="visitTime"
                  type="time"
                  value={formData.visitTime}
                  onChange={(e) =>
                    setFormData({ ...formData, visitTime: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="propertyPrice">Valor do Imóvel</Label>
              <Input
                id="propertyPrice"
                value={formData.propertyPrice}
                onChange={(e) =>
                  setFormData({ ...formData, propertyPrice: e.target.value })
                }
                placeholder="Ex: R$ 350.000"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="propertyImage">URL da Imagem do Imóvel</Label>
              <Input
                id="propertyImage"
                type="url"
                value={formData.propertyImage}
                onChange={(e) =>
                  setFormData({ ...formData, propertyImage: e.target.value })
                }
                placeholder="https://..."
              />
              {formData.propertyImage && (
                <div className="mt-2 relative w-full h-32 rounded-lg overflow-hidden border border-gray-200">
                  <img
                    src={formData.propertyImage}
                    alt="Preview"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.src = "https://images.unsplash.com/photo-1560518883-ce09059eeffa?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80";
                    }}
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Anotações</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                placeholder="Adicione observações sobre o imóvel, a visita, etc."
                rows={4}
              />
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancelar
            </Button>
            <Button onClick={handleSaveVisit} className="bg-blue-600 hover:bg-blue-700">
              {editingVisit ? "Atualizar" : "Agendar"} Visita
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
