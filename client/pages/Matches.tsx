import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getCurrentUser, getUserMatches, getUserById } from '@/lib/auth';
import { Home } from 'lucide-react';

export default function Matches() {
  const [user, setUser] = React.useState<any>(null);
  const [matches, setMatches] = React.useState<any[]>([]);
  const [usersData, setUsersData] = React.useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        const u = await getCurrentUser();
        setUser(u);
        if (u) {
          const m = await getUserMatches(u.id);
          setMatches(m);

          // Carregar todos os usuários mencionados em matches em batch
          const uniqueUserIds = Array.from(new Set(m.map(match => match.withUserId).filter(Boolean)));
          if (uniqueUserIds.length > 0) {
            const userDataMap: Record<string, any> = {};
            // Carregar todos os usuários em paralelo
            const userPromises = uniqueUserIds.map(userId =>
              getUserById(userId).then(userData => ({
                id: userId,
                data: userData
              }))
            );
            const results = await Promise.all(userPromises);
            results.forEach(({ id, data }) => {
              if (data) userDataMap[id] = data;
            });
            setUsersData(userDataMap);
          }
        } else {
          setMatches([]);
        }
      } catch (error) {
        console.error('Error loading matches:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center">
        <div className="bg-white rounded-lg p-8 shadow-lg">
          <div className="flex flex-col items-center gap-4">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 border-4 border-blue-100 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-transparent border-t-blue-600 rounded-full animate-spin"></div>
            </div>
            <p className="text-gray-700 font-medium">Carregando matches...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">Matches</h1>
        {(!user) && (
          <Card className="p-6 mb-4">
            <CardContent>
              <p className="text-gray-700">Você precisa entrar para ver seus matches.</p>
            </CardContent>
          </Card>
        )}

        {user && matches.length === 0 && (
          <Card className="p-6 mb-4">
            <CardContent>
              <div className="text-center">
                <Home className="mx-auto mb-4 text-gray-400" />
                <p className="text-gray-700">Nenhum match encontrado ainda.</p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {matches.map((m, idx) => {
            const property = m.property || m;
            const otherUserId = m.withUserId;
            const other = usersData[otherUserId] || null;

            return (
              <Card key={`${property.id}-${idx}`} className="overflow-hidden flex flex-col h-full bg-white/80 backdrop-blur-sm hover:shadow-lg transition-all duration-300">
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-gray-100">
                  <img
                    src={property.imagem || 'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=400&h=300&fit=crop'}
                    alt={property.nome}
                    className="w-full h-full object-cover transition-transform duration-500 hover:scale-110"
                  />
                </div>
                <CardContent className="p-4 sm:p-5 flex-grow flex flex-col">
                  <div className="flex-grow">
                    <h3 className="font-bold text-base sm:text-lg text-gray-900 mb-2 line-clamp-2 h-12 sm:h-14 overflow-hidden">{property.nome}</h3>
                    <p className="text-xl font-bold text-green-600 mb-2">{property.valor}</p>
                    <p className="text-sm text-gray-600 mb-2 line-clamp-1">{property.localizacao}</p>
                    <p className="text-xs text-pink-600 font-semibold mb-4">Match com: {other ? other.username : '—'}</p>
                  </div>
                  <div className="mt-auto flex gap-2">
                    <Button size="sm" className="w-full bg-pink-600 hover:bg-pink-700" onClick={() => { if (property.link) window.open(property.link, '_blank'); }}>Ver Detalhes</Button>
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
