export interface Property {
  id: string;
  nome: string;
  imagem: string;
  valor: string;
  m2: string;
  localizacao: string;
  link: string;
  quartos: string;
  garagem: string;
  vagas?: string;
  banheiros?: string;
  site?: string;
  latitude?: number;
  longitude?: number;
  valorNumerico?: number;
  m2Numerico?: number;
  quartosNumerico?: number;
  garagemNumerico?: number;
  vagasNumerico?: number;
  banheirosNumerico?: number;
  distancia?: number;
  tags?: string[];
}

export type PropertySnapshot = Property;
