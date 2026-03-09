import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Property } from '@/types/property';
import { ExternalLink, Trophy, X } from 'lucide-react';

interface MatchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  property: Property;
  matchedWith: string; // Username of the person matched with
  onViewRanking: () => void;
}

export const MatchOverlay: React.FC<MatchOverlayProps> = ({
  isOpen,
  onClose,
  property,
  matchedWith,
  onViewRanking,
}) => {
  useEffect(() => {
    if (isOpen) {
      const duration = 5 * 1000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };

      const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

      const interval: any = setInterval(function() {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
          return clearInterval(interval);
        }

        const particleCount = 50 * (timeLeft / duration);
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
      }, 250);

      return () => clearInterval(interval);
    }
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        >
          <motion.div
            initial={{ scale: 0.8, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.8, y: 20 }}
            className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl"
          >
            <button
              onClick={onClose}
              className="absolute right-4 top-4 z-10 rounded-full bg-black/10 p-2 text-black/50 hover:bg-black/20 hover:text-black"
            >
              <X className="h-6 w-6" />
            </button>

            <div className="flex flex-col items-center p-8 text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', damping: 12, stiffness: 200, delay: 0.2 }}
                className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-pink-100 text-pink-600"
              >
                <Heart className="h-10 w-10 fill-current" />
              </motion.div>

              <h2 className="mb-2 text-4xl font-bold text-gray-900">DEU MATCH!</h2>
              <p className="mb-6 text-lg text-gray-600">
                Você e <span className="font-bold text-pink-600">{matchedWith}</span> gostaram do mesmo imóvel!
              </p>

              <Card className="mb-8 w-full overflow-hidden border-2 border-pink-100 shadow-lg">
                <div className="relative aspect-video w-full overflow-hidden">
                  <img
                    src={property.imagem || "https://images.unsplash.com/photo-1560518883-ce09059eeffa?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80"}
                    alt={property.nome}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4 text-left">
                    <h3 className="text-xl font-bold text-white line-clamp-1">{property.nome}</h3>
                    <p className="text-sm text-white/80 line-clamp-1">{property.localizacao}</p>
                  </div>
                </div>
                <CardContent className="p-4 flex items-center justify-between bg-white">
                   <div className="text-left">
                     <p className="text-2xl font-bold text-pink-600">{property.valor}</p>
                     <p className="text-sm text-gray-500">{property.m2} • {property.quartos} qtos</p>
                   </div>
                   <div className="flex gap-2">
                     <Button variant="outline" size="sm" className="rounded-full border-pink-200 text-pink-600 hover:bg-pink-50" asChild>
                       <a href={property.link} target="_blank" rel="noopener noreferrer">
                         <ExternalLink className="mr-2 h-4 w-4" />
                         Ver Imóvel
                       </a>
                     </Button>
                   </div>
                </CardContent>
              </Card>

              <div className="grid w-full grid-cols-2 gap-4">
                <Button
                  onClick={onViewRanking}
                  variant="default"
                  className="w-full rounded-2xl bg-pink-600 py-6 text-lg font-bold hover:bg-pink-700"
                >
                  <Trophy className="mr-2 h-5 w-5" />
                  Ir para o Ranking
                </Button>
                <Button
                  onClick={onClose}
                  variant="outline"
                  className="w-full rounded-2xl border-2 border-gray-200 py-6 text-lg font-bold hover:bg-gray-50"
                >
                  Continuar Vendo
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// Simple Heart icon since Lucide might have different naming or imports in this project
function Heart(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </svg>
  );
}
