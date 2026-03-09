import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { X, Plus, Home, MapPin, DollarSign, Link as LinkIcon, Maximize2, Bed, Car, Bath } from 'lucide-react';
import { Property } from '@/types/property';

interface ManualPropertyEntryProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (property: Property) => void;
}

export const ManualPropertyEntry: React.FC<ManualPropertyEntryProps> = ({
  isOpen,
  onClose,
  onAdd,
}) => {
  const [formData, setFormData] = useState({
    nome: '',
    valor: '',
    link: '',
    imagem: '',
    localizacao: '',
    m2: '',
    quartos: '',
    vagas: '',
    banheiros: '',
  });

  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');

  const handleAddTag = () => {
    if (newTag && !tags.includes(newTag)) {
      setTags([...tags, newTag]);
      setNewTag('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.valor || !formData.link) {
      alert('Valor e Link são obrigatórios!');
      return;
    }

    const newProperty: Property = {
      id: `manual-${Date.now()}`,
      nome: formData.nome || 'Imóvel Manual',
      imagem: formData.imagem || 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80',
      valor: formData.valor.startsWith('R$') ? formData.valor : `R$ ${formData.valor}`,
      m2: formData.m2 ? `${formData.m2} m²` : '',
      localizacao: formData.localizacao || 'Localização não informada',
      link: formData.link,
      quartos: formData.quartos || '0',
      garagem: formData.vagas || '0',
      vagas: formData.vagas,
      banheiros: formData.banheiros,
      tags: tags,
    };

    onAdd(newProperty);
    setFormData({
      nome: '',
      valor: '',
      link: '',
      imagem: '',
      localizacao: '',
      m2: '',
      quartos: '',
      vagas: '',
      banheiros: '',
    });
    setTags([]);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <Plus className="h-6 w-6 text-pink-600" />
            Adicionar Imóvel Manualmente
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Required Fields */}
            <div className="space-y-2 col-span-1 md:col-span-2">
              <Label htmlFor="nome" className="flex items-center gap-2">
                <Home className="h-4 w-4" /> Nome do Imóvel
              </Label>
              <Input
                id="nome"
                placeholder="Ex: Apartamento no Centro"
                value={formData.nome}
                onChange={e => setFormData({ ...formData, nome: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="valor" className="flex items-center gap-2 text-pink-600 font-bold">
                <DollarSign className="h-4 w-4" /> Valor (Obrigatório) *
              </Label>
              <Input
                id="valor"
                required
                placeholder="Ex: 500.000"
                value={formData.valor}
                onChange={e => setFormData({ ...formData, valor: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="link" className="flex items-center gap-2 text-pink-600 font-bold">
                <LinkIcon className="h-4 w-4" /> Link (Obrigatório) *
              </Label>
              <Input
                id="link"
                required
                type="url"
                placeholder="https://..."
                value={formData.link}
                onChange={e => setFormData({ ...formData, link: e.target.value })}
              />
            </div>

            {/* Optional Fields */}
            <div className="space-y-2">
              <Label htmlFor="localizacao" className="flex items-center gap-2">
                <MapPin className="h-4 w-4" /> Localização
              </Label>
              <Input
                id="localizacao"
                placeholder="Ex: Bairro, Cidade"
                value={formData.localizacao}
                onChange={e => setFormData({ ...formData, localizacao: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="imagem" className="flex items-center gap-2">
                <LinkIcon className="h-4 w-4" /> URL da Imagem
              </Label>
              <Input
                id="imagem"
                placeholder="https://..."
                value={formData.imagem}
                onChange={e => setFormData({ ...formData, imagem: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="m2" className="flex items-center gap-2">
                <Maximize2 className="h-4 w-4" /> Tamanho (m²)
              </Label>
              <Input
                id="m2"
                type="number"
                placeholder="Ex: 80"
                value={formData.m2}
                onChange={e => setFormData({ ...formData, m2: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="quartos" className="flex items-center gap-2">
                <Bed className="h-4 w-4" /> Quartos
              </Label>
              <Input
                id="quartos"
                type="number"
                placeholder="Ex: 3"
                value={formData.quartos}
                onChange={e => setFormData({ ...formData, quartos: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="vagas" className="flex items-center gap-2">
                <Car className="h-4 w-4" /> Vagas de Garagem
              </Label>
              <Input
                id="vagas"
                type="number"
                placeholder="Ex: 2"
                value={formData.vagas}
                onChange={e => setFormData({ ...formData, vagas: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="banheiros" className="flex items-center gap-2">
                <Bath className="h-4 w-4" /> Banheiros
              </Label>
              <Input
                id="banheiros"
                type="number"
                placeholder="Ex: 2"
                value={formData.banheiros}
                onChange={e => setFormData({ ...formData, banheiros: e.target.value })}
              />
            </div>
          </div>

          {/* Leisure Areas Tags */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              Áreas de Lazer (Tags)
            </Label>
            <div className="flex gap-2">
              <Input
                placeholder="Ex: Piscina, Sauna..."
                value={newTag}
                onChange={e => setNewTag(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
              />
              <Button type="button" onClick={handleAddTag} variant="secondary">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {tags.map(tag => (
                <Badge key={tag} variant="secondary" className="px-3 py-1 bg-pink-50 text-pink-600 border-pink-100 flex items-center gap-1">
                  {tag}
                  <button type="button" onClick={() => handleRemoveTag(tag)} className="hover:text-pink-800">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" className="bg-pink-600 hover:bg-pink-700">
              Salvar Imóvel
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
