import React, { useState, useMemo } from 'react';
import { 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  Shield, 
  User, 
  UserPlus, 
  X, 
  Check, 
  AlertCircle,
  Clock
} from 'lucide-react';
import { UserAccount, UserRole } from '../types';

interface UsersTableProps {
  currentUser: UserAccount;
  users: UserAccount[];
  onAddUser: (user: Omit<UserAccount, 'id' | 'createdAt'>) => void;
  onEditUser: (user: UserAccount) => void;
  onDeleteUser: (id: string) => void;
}

export default function UsersTable({
  currentUser,
  users,
  onAddUser,
  onEditUser,
  onDeleteUser
}: UsersTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form Fields
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole>('vendedor');
  const [formError, setFormError] = useState('');

  const isAdmin = currentUser.role === 'admin';

  // Filter users based on search
  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      return (
        user.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.role.toLowerCase().includes(searchTerm.toLowerCase())
      );
    });
  }, [users, searchTerm]);

  const handleOpenAddModal = () => {
    setEditingUser(null);
    setFullName('');
    setUsername('');
    setPassword('');
    setSelectedRole('vendedor');
    setFormError('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (user: UserAccount) => {
    setEditingUser(user);
    setFullName(user.fullName);
    setUsername(user.username);
    setPassword(user.passwordHash); // Show existing password for easy demo
    setSelectedRole(user.role);
    setFormError('');
    setIsModalOpen(true);
  };

  const handleOpenDeleteConfirm = (id: string) => {
    if (id === currentUser.id) {
      alert('Você não pode excluir sua própria conta enquanto estiver conectado!');
      return;
    }
    setDeletingId(id);
    setIsDeleteConfirmOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!fullName.trim() || !username.trim() || !password.trim()) {
      setFormError('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    if (password.length < 4) {
      setFormError('A senha deve conter no mínimo 4 caracteres.');
      return;
    }

    // Check if username already exists (excluding the user we are currently editing)
    const usernameExists = users.some(user => 
      user.username.toLowerCase() === username.trim().toLowerCase() && 
      (!editingUser || user.id !== editingUser.id)
    );

    if (usernameExists) {
      setFormError('Este nome de usuário já está em uso.');
      return;
    }

    if (editingUser) {
      onEditUser({
        ...editingUser,
        fullName: fullName.trim(),
        username: username.trim().toLowerCase(),
        passwordHash: password,
        role: selectedRole
      });
    } else {
      onAddUser({
        fullName: fullName.trim(),
        username: username.trim().toLowerCase(),
        passwordHash: password,
        role: selectedRole
      });
    }

    setIsModalOpen(false);
  };

  const confirmDelete = () => {
    if (deletingId) {
      onDeleteUser(deletingId);
      setIsDeleteConfirmOpen(false);
      setDeletingId(null);
    }
  };

  // Helper to format role names elegantly
  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'admin':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
            Administrador
          </span>
        );
      case 'vendedor':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-sky-50 text-sky-700 border border-sky-200">
            <span className="w-1.5 h-1.5 bg-sky-500 rounded-full" />
            Vendedor
          </span>
        );
      case 'almoxarife':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
            Almoxarife
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Search and Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-3xs">
        
        {/* Search Field */}
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Buscar por nome, usuário ou perfil..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
          />
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        </div>

        {/* Create Button */}
        {isAdmin ? (
          <button
            onClick={handleOpenAddModal}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg text-sm shadow-xs hover:shadow-indigo-500/10 transition-all cursor-pointer"
          >
            <UserPlus className="h-4 w-4" />
            Cadastrar Usuário
          </button>
        ) : (
          <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-100 px-3 py-2 rounded-lg border border-slate-200">
            <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
            <span>Apenas administradores podem gerenciar usuários.</span>
          </div>
        )}
      </div>

      {/* Users List Card */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[11px] font-bold uppercase tracking-wider">
                <th className="py-3 px-6">Usuário / Colaborador</th>
                <th className="py-3 px-6">Identificação (@)</th>
                <th className="py-3 px-6">Perfil / Regra</th>
                <th className="py-3 px-6">Data de Cadastro</th>
                {isAdmin && <th className="py-3 px-6 text-right">Ações</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 text-sm">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 5 : 4} className="py-12 text-center text-slate-400">
                    <User className="h-10 w-10 mx-auto text-slate-300 mb-2" />
                    <p className="font-semibold text-slate-500">Nenhum usuário encontrado</p>
                    <p className="text-xs mt-1">Experimente buscar por outros termos.</p>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                    
                    {/* Full Name & Avatar */}
                    <td className="py-3.5 px-6">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 bg-slate-100 text-slate-700 font-bold text-xs rounded-full border border-slate-200 flex items-center justify-center uppercase shadow-3xs select-none">
                          {user.fullName.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900 flex items-center gap-1.5">
                            {user.fullName}
                            {user.id === currentUser.id && (
                              <span className="bg-indigo-50 text-indigo-600 text-[9px] font-bold px-1.5 py-0.5 rounded border border-indigo-100">Você</span>
                            )}
                          </p>
                          <span className="text-xs text-slate-400 font-mono">Senha: {user.passwordHash}</span>
                        </div>
                      </div>
                    </td>

                    {/* Username */}
                    <td className="py-3.5 px-6">
                      <span className="text-xs font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                        @{user.username}
                      </span>
                    </td>

                    {/* Role Badge */}
                    <td className="py-3.5 px-6">
                      {getRoleBadge(user.role)}
                    </td>

                    {/* Created At */}
                    <td className="py-3.5 px-6">
                      <div className="flex items-center gap-1 text-xs text-slate-500 font-mono">
                        <Clock className="h-3 w-3 text-slate-400" />
                        {new Date(user.createdAt).toLocaleDateString('pt-BR')}
                      </div>
                    </td>

                    {/* Actions (Admin Only) */}
                    {isAdmin && (
                      <td className="py-3.5 px-6 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleOpenEditModal(user)}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                            title="Editar usuário"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          
                          {user.id !== currentUser.id ? (
                            <button
                              onClick={() => handleOpenDeleteConfirm(user.id)}
                              className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                              title="Excluir usuário"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          ) : (
                            <div className="p-1.5 w-7 h-7 text-slate-300 cursor-not-allowed" title="Você não pode excluir a si mesmo" />
                          )}
                        </div>
                      </td>
                    )}

                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Counter footer info */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400 font-mono">
          <span>Exibindo {filteredUsers.length} de {users.length} cadastrados</span>
          <span>Perfis ativos: Admin ({users.filter(u => u.role === 'admin').length}), Vendedor ({users.filter(u => u.role === 'vendedor').length}), Almoxarife ({users.filter(u => u.role === 'almoxarife').length})</span>
        </div>

      </div>

      {/* Permission Matrix Info Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-3xs space-y-3">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <Shield className="h-4 w-4 text-indigo-600" />
          Matriz de Permissões de Perfis
        </h3>
        <p className="text-xs text-slate-500">
          O sistema opera com regras de acesso baseadas no perfil do colaborador para garantir a segurança dos dados e o fluxo correto de expedição:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div className="bg-emerald-50/50 border border-emerald-100 p-3 rounded-lg space-y-1">
            <h4 className="text-xs font-bold text-emerald-800">Administrador</h4>
            <p className="text-[11px] text-emerald-600 leading-relaxed">
              Acesso total e irrestrito. Pode gerenciar usuários, lançar e editar saldos de estoque e gerenciar a carteira de pedidos em aberto.
            </p>
          </div>
          <div className="bg-sky-50/50 border border-sky-100 p-3 rounded-lg space-y-1">
            <h4 className="text-xs font-bold text-sky-800">Vendedor (Vendas)</h4>
            <p className="text-[11px] text-sky-600 leading-relaxed">
              Foco comercial. Pode incluir, editar ou remover pedidos da carteira. Tem acesso para visualizar o estoque atualizado, mas não pode alterá-lo.
            </p>
          </div>
          <div className="bg-amber-50/50 border border-amber-100 p-3 rounded-lg space-y-1">
            <h4 className="text-xs font-bold text-amber-800">Almoxarife (Logística)</h4>
            <p className="text-[11px] text-amber-600 leading-relaxed">
              Foco operacional. Pode incluir, editar ou remover lançamentos e saldos de estoque por depósitos. Visualiza os pedidos, mas não pode alterá-los.
            </p>
          </div>
        </div>
      </div>

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Shield className="h-4 w-4 text-indigo-600" />
                {editingUser ? 'Editar Colaborador' : 'Cadastrar Novo Colaborador'}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              
              {/* Error Alert */}
              {formError && (
                <div className="p-3 bg-red-50 text-red-600 text-xs font-semibold rounded-lg flex items-center gap-2 border border-red-100">
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full shrink-0" />
                  {formError}
                </div>
              )}

              {/* Full Name */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Carlos Roberto Silva"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-indigo-500 transition-all"
                />
              </div>

              {/* Username */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Nome de Usuário (@) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-slate-400 text-sm font-semibold select-none">@</span>
                  <input
                    type="text"
                    required
                    placeholder="carlossilva"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-7 pr-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-indigo-500 transition-all font-mono"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Senha Provisória *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Mínimo 4 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-indigo-500 transition-all font-mono"
                />
              </div>

              {/* Role Select */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Perfil de Acesso / Regra *
                </label>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2 border border-slate-200 bg-white rounded-lg text-sm text-slate-800 focus:outline-none focus:border-indigo-500 transition-all cursor-pointer"
                >
                  <option value="vendedor">Vendedor (Vendas e Carteira de Pedidos)</option>
                  <option value="almoxarife">Almoxarife (Estoque e Lançamentos)</option>
                  <option value="admin">Administrador (Controle Geral e Acesso Total)</option>
                </select>
              </div>

              {/* Form Buttons */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-slate-500 hover:text-slate-700 font-semibold text-sm rounded-lg hover:bg-slate-50 transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm rounded-lg shadow-xs hover:shadow-indigo-500/10 transition-all cursor-pointer"
                >
                  <Check className="h-4 w-4" />
                  {editingUser ? 'Salvar Alterações' : 'Salvar Colaborador'}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 text-center space-y-4">
              <div className="inline-flex p-3 bg-red-50 text-red-600 rounded-full border border-red-100">
                <Trash2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-base">Confirmar Exclusão</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Tem certeza que deseja excluir esta conta de usuário? Essa ação não poderá ser desfeita.
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 pt-2">
                <button
                  onClick={() => setIsDeleteConfirmOpen(false)}
                  className="px-4 py-2 text-slate-500 hover:text-slate-700 font-semibold text-sm rounded-lg hover:bg-slate-50 transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmDelete}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-semibold text-sm rounded-lg shadow-xs hover:shadow-red-500/10 transition-all cursor-pointer"
                >
                  Excluir Conta
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
