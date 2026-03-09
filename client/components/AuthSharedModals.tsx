import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getAllUsers, getCurrentUser, registerUser, loginUser, logoutUser, addInvite, acceptInvite, getUserById } from '@/lib/auth';
import { toast } from 'sonner';
import { X } from 'lucide-react';

export default function AuthSharedModals() {
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login'|'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSharedOpen, setIsSharedOpen] = useState(false);

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const users = await getAllUsers();
        setAllUsers(users);
        const cur = await getCurrentUser();
        setCurrentUser(cur);
      } catch (error) {
        console.error('Error loading users:', error);
      }
    };
    loadUsers();
  }, []);

  const doLoginOrRegister = async () => {
    if (authMode === 'login') {
      const res = await loginUser(username, password);
      if (!res.success) toast.error(res.message || 'Erro ao entrar');
      else { 
        setCurrentUser(res.user); 
        const users = await getAllUsers();
        setAllUsers(users);
        setIsAuthOpen(false);
        setUsername('');
        setPassword('');
        toast.success('Conectado'); 
      }
    } else {
      const res = await registerUser(username, password);
      if (!res.success) toast.error(res.message || 'Erro ao registrar');
      else { 
        setCurrentUser(res.user); 
        const users = await getAllUsers();
        setAllUsers(users);
        setIsAuthOpen(false);
        setUsername('');
        setPassword('');
        toast.success('Registrado e conectado'); 
      }
    }
  };

  const handleCloseAuth = () => {
    setIsAuthOpen(false);
    setUsername('');
    setPassword('');
  };

  return (
    <>
      {/* Auth Buttons - Bottom Right positioning to avoid header overlap */}
      <div className="fixed bottom-6 right-6 z-40 flex gap-2 flex-wrap justify-end">
        {!currentUser ? (
          <>
            <Button 
              onClick={() => { setAuthMode('login'); setIsAuthOpen(true); }} 
              size="sm" 
              variant="outline"
              className="text-xs sm:text-sm px-2 sm:px-4 py-1 sm:py-2"
            >
              Entrar
            </Button>
            <Button 
              onClick={() => { setAuthMode('register'); setIsAuthOpen(true); }} 
              size="sm"
              className="text-xs sm:text-sm px-2 sm:px-4 py-1 sm:py-2"
            >
              Registrar
            </Button>
          </>
        ) : (
          <>
            <Button 
              onClick={() => setIsSharedOpen(true)} 
              size="sm" 
              variant="outline"
              className="text-xs sm:text-sm px-2 sm:px-4 py-1 sm:py-2"
            >
              Casa
            </Button>
            <Button 
              onClick={async () => { 
                logoutUser(); 
                setCurrentUser(null); 
                const users = await getAllUsers();
                setAllUsers(users);
                toast.success('Desconectado'); 
              }} 
              size="sm"
              className="text-xs sm:text-sm px-2 sm:px-4 py-1 sm:py-2"
            >
              Sair
            </Button>
          </>
        )}
      </div>

      {/* Auth Dialog Modal */}
      {isAuthOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40 bg-black/50"
            onClick={handleCloseAuth}
          />
          
          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-auto">
              <div className="flex items-center justify-between p-6 border-b">
                <h3 className="text-lg font-bold">{authMode === 'login' ? 'Entrar' : 'Registrar'}</h3>
                <button 
                  onClick={handleCloseAuth}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X size={24} />
                </button>
              </div>
              
              <div className="p-6">
                <Input 
                  placeholder="Usuário" 
                  value={username} 
                  onChange={(e: any) => setUsername(e.target.value)}
                  onKeyPress={(e: any) => e.key === 'Enter' && doLoginOrRegister()}
                  className="mb-4 text-base" 
                  autoFocus
                />
                <Input 
                  placeholder="Senha" 
                  type="password" 
                  value={password}
                  onChange={(e: any) => setPassword(e.target.value)}
                  onKeyPress={(e: any) => e.key === 'Enter' && doLoginOrRegister()}
                  className="mb-6 text-base" 
                />
                <div className="flex gap-3">
                  <Button 
                    onClick={doLoginOrRegister} 
                    className="flex-1 text-base py-2"
                  >
                    {authMode === 'login' ? 'Entrar' : 'Registrar'}
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={handleCloseAuth}
                    className="flex-1 text-base py-2"
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Shared House Dialog Modal */}
      {isSharedOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setIsSharedOpen(false)}
          />
          
          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-auto">
              <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white">
                <h3 className="text-lg font-bold">Casa Compartilhada</h3>
                <button 
                  onClick={() => setIsSharedOpen(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-6">
                {!currentUser && (
                  <p className="text-gray-600 text-center py-8">Faça login para usar a casa compartilhada.</p>
                )}
                
                {currentUser && (
                  <div className="space-y-6">
                    <div>
                      <p className="text-sm font-semibold text-gray-700 mb-3">Usuários Cadastrados:</p>
                      <div className="space-y-2 max-h-56 overflow-auto">
                        {allUsers.filter(u => u.id !== currentUser.id).length === 0 ? (
                          <p className="text-sm text-gray-500">Nenhum outro usuário cadastrado</p>
                        ) : (
                          allUsers.filter(u => u.id !== currentUser.id).map(u => (
                            <div key={u.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                              <span className="font-medium text-sm">{u.username}</span>
                              <div className="flex gap-2">
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  onClick={async () => {
                                    const res = await addInvite(u.id, currentUser.id);
                                    if (!res.success) toast.error(res.message || 'Erro ao enviar convite');
                                    else toast.success('Convite enviado');
                                    const users = await getAllUsers();
                                    setAllUsers(users);
                                  }}
                                  className="text-xs sm:text-sm px-2 sm:px-3 py-1"
                                >
                                  Convidar
                                </Button>
                                <Button 
                                  size="sm" 
                                  onClick={async () => {
                                    const acc = await acceptInvite(currentUser.id, u.id);
                                    if (acc.success) { 
                                      toast.success('Agora são colegas de casa'); 
                                      const users = await getAllUsers();
                                      setAllUsers(users);
                                      const cur = await getCurrentUser();
                                      setCurrentUser(cur);
                                    } else toast.error(acc.message || 'Erro');
                                  }}
                                  className="text-xs sm:text-sm px-2 sm:px-3 py-1"
                                >
                                  Adicionar
                                </Button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="border-t pt-6">
                      <p className="text-sm font-semibold text-gray-700 mb-3">Convites Recebidos:</p>
                      <div className="space-y-2 max-h-56 overflow-auto">
                        {currentUser.invites.length === 0 ? (
                          <p className="text-sm text-gray-500">Nenhum convite recebido</p>
                        ) : (
                          currentUser.invites.map((inv: any) => (
                            <div key={inv.fromId} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                              <span className="font-medium text-sm">{inv.fromUsername}</span>
                              <Button 
                                size="sm" 
                                onClick={async () => { 
                                  const res = await acceptInvite(currentUser.id, inv.fromId); 
                                  if (res.success) { 
                                    const users = await getAllUsers();
                                    setAllUsers(users);
                                    const cur = await getCurrentUser();
                                    setCurrentUser(cur);
                                    toast.success('Convite aceito'); 
                                  } else toast.error(res.message || 'Erro'); 
                                }}
                                className="text-xs sm:text-sm px-2 sm:px-3 py-1"
                              >
                                Aceitar
                              </Button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6 border-t sticky bottom-0 bg-white">
                <Button 
                  onClick={() => setIsSharedOpen(false)} 
                  className="w-full text-base py-2"
                >
                  Fechar
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
