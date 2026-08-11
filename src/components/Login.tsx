import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Truck, Lock, User, Eye, EyeOff, CheckCircle, KeyRound, ArrowLeft, RefreshCw, ShieldAlert } from 'lucide-react';
import { getStoredUsers, setStoredUsers } from '../data';
import { UserAccount } from '../types';

interface LoginProps {
  users?: UserAccount[];
  onLoginSuccess: (user: UserAccount) => void;
  onResetPassword?: (username: string, newPassword: string) => void;
}

export default function Login({ users = [], onLoginSuccess, onResetPassword }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Status messages for login
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Password reset state (temporary feature)
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [resetUsername, setResetUsername] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetStatus, setResetStatus] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!username.trim() || !password.trim()) {
      setError('Por favor, preencha todos os campos.');
      return;
    }

    const userList = users && users.length > 0 ? users : getStoredUsers();
    const user = userList.find(
      (u) => u.username.toLowerCase() === username.trim().toLowerCase()
    );

    if (!user || user.passwordHash !== password) {
      setError('Usuário ou senha incorretos.');
      return;
    }

    setSuccess(`Bem-vindo, ${user.fullName}!`);
    setTimeout(() => {
      onLoginSuccess(user);
    }, 800);
  };

  const handleConfirmReset = (e: React.FormEvent) => {
    e.preventDefault();
    setResetStatus(null);

    const targetUser = resetUsername.trim();
    if (!targetUser) {
      setResetStatus({ type: 'error', message: 'Por favor, selecione ou informe o nome do usuário.' });
      return;
    }

    if (!resetNewPassword.trim()) {
      setResetStatus({ type: 'error', message: 'Por favor, digite a nova senha.' });
      return;
    }

    if (resetNewPassword !== resetConfirmPassword) {
      setResetStatus({ type: 'error', message: 'As senhas digitadas não coincidem.' });
      return;
    }

    const currentUsers = users && users.length > 0 ? users : getStoredUsers();
    const existingUser = currentUsers.find(
      (u) => u.username.toLowerCase() === targetUser.toLowerCase()
    );

    if (!existingUser) {
      setResetStatus({ type: 'error', message: `Usuário "${targetUser}" não foi encontrado no sistema.` });
      return;
    }

    // Call parent handler if provided
    if (onResetPassword) {
      onResetPassword(targetUser, resetNewPassword);
    } else {
      // Fallback local update
      const updatedUsers = currentUsers.map((u) => {
        if (u.username.toLowerCase() === targetUser.toLowerCase()) {
          return { ...u, passwordHash: resetNewPassword };
        }
        return u;
      });
      setStoredUsers(updatedUsers);
    }

    // Update main login input state for convenience
    setUsername(targetUser);
    setPassword(resetNewPassword);

    setResetStatus({
      type: 'success',
      message: `Senha do usuário "${existingUser.fullName}" (@${existingUser.username}) redefinida com sucesso!`
    });

    // Reset fields
    setResetNewPassword('');
    setResetConfirmPassword('');
  };

  const availableUsers = users && users.length > 0 ? users : getStoredUsers();

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative overflow-hidden antialiased">
      
      {/* Decorative ambient background elements */}
      <div className="absolute top-0 -left-4 w-96 h-96 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob" />
      <div className="absolute bottom-0 -right-4 w-96 h-96 bg-emerald-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-2000" />
      
      <div className="w-full max-w-md relative z-10">
        
        {/* Brand identity header */}
        <div className="text-center mb-8">
          <div className="inline-flex p-3 bg-indigo-600 text-white rounded-2xl shadow-lg mb-4">
            <Truck className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white font-sans">
            Gerenciador de Expedição
          </h1>
          <p className="text-xs text-slate-400 mt-1 uppercase font-bold tracking-widest">
            Pedido x Saldo de Estoque
          </p>
        </div>

        {/* Auth container */}
        <div className="bg-slate-800/80 backdrop-blur-md border border-slate-700/60 rounded-2xl shadow-xl overflow-hidden">
          
          <div className="p-6 sm:p-8">
            
            {!isResettingPassword ? (
              /* LOGIN VIEW */
              <>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-bold text-white">
                    Acesse o Sistema
                  </h2>
                  <span className="text-[10px] bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 font-semibold px-2 py-0.5 rounded-full">
                    v1.0.0
                  </span>
                </div>

                {/* Error or Success Toast */}
                {error && (
                  <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-200 rounded-xl text-sm flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-red-400 rounded-full shrink-0" />
                    {error}
                  </div>
                )}

                {success && (
                  <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 rounded-xl text-sm flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
                    {success}
                  </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4">
                  
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                      Usuário
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Digite seu usuário"
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-900/60 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                      />
                      <User className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                      Senha
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-10 pr-10 py-2.5 bg-slate-900/60 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                      />
                      <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-3 text-slate-500 hover:text-slate-300 focus:outline-none cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-sm shadow-md hover:shadow-indigo-500/20 transition-all cursor-pointer flex items-center justify-center gap-2 mt-2"
                  >
                    Entrar no Painel
                  </button>
                </form>

                {/* TEMPORARY RESET PASSWORD BUTTON */}
                <div className="mt-6 pt-4 border-t border-slate-700/60 flex items-center justify-between">
                  <div className="text-xs text-slate-400">
                    Esqueceu a senha?
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsResettingPassword(true);
                      setResetUsername(username || (availableUsers.length > 0 ? availableUsers[0].username : ''));
                      setResetStatus(null);
                    }}
                    className="inline-flex items-center gap-1.5 text-xs bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 font-medium px-3 py-1.5 rounded-lg transition-all cursor-pointer"
                  >
                    <KeyRound className="h-3.5 w-3.5 text-amber-400" />
                    <span>Reset Senha</span>
                    <span className="text-[9px] bg-amber-500/20 text-amber-300 font-bold uppercase px-1 rounded ml-0.5">Temp</span>
                  </button>
                </div>
              </>
            ) : (
              /* RESET PASSWORD VIEW */
              <>
                <div className="flex items-center justify-between mb-4">
                  <button
                    type="button"
                    onClick={() => setIsResettingPassword(false)}
                    className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span>Voltar</span>
                  </button>
                  <span className="text-[10px] bg-amber-500/20 border border-amber-500/30 text-amber-300 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                    <KeyRound className="h-3 w-3" />
                    Reset Temporário
                  </span>
                </div>

                <h2 className="text-lg font-bold text-white mb-1">
                  Redefinir Senha
                </h2>
                <p className="text-xs text-slate-400 mb-5">
                  Selecione o usuário e defina a nova senha de acesso.
                </p>

                {/* Status Toast */}
                {resetStatus && (
                  <div
                    className={`mb-4 p-3 rounded-xl text-sm flex items-start gap-2 border ${
                      resetStatus.type === 'success'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                        : 'bg-red-500/10 border-red-500/30 text-red-200'
                    }`}
                  >
                    {resetStatus.type === 'success' ? (
                      <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <ShieldAlert className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                    )}
                    <div className="text-xs">{resetStatus.message}</div>
                  </div>
                )}

                <form onSubmit={handleConfirmReset} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                      Usuário
                    </label>
                    <div className="relative">
                      <select
                        value={resetUsername}
                        onChange={(e) => setResetUsername(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-900/60 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all cursor-pointer"
                      >
                        {availableUsers.map((u) => (
                          <option key={u.id} value={u.username} className="bg-slate-800 text-white">
                            {u.fullName} (@{u.username}) - {u.role}
                          </option>
                        ))}
                      </select>
                      <User className="absolute left-3.5 top-3 h-4 w-4 text-slate-500 pointer-events-none" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                      Nova Senha
                    </label>
                    <div className="relative">
                      <input
                        type={showResetPassword ? 'text' : 'password'}
                        required
                        value={resetNewPassword}
                        onChange={(e) => setResetNewPassword(e.target.value)}
                        placeholder="Digite a nova senha"
                        className="w-full pl-10 pr-10 py-2.5 bg-slate-900/60 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                      />
                      <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
                      <button
                        type="button"
                        onClick={() => setShowResetPassword(!showResetPassword)}
                        className="absolute right-3 top-3 text-slate-500 hover:text-slate-300 focus:outline-none cursor-pointer"
                      >
                        {showResetPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                      Confirmar Nova Senha
                    </label>
                    <div className="relative">
                      <input
                        type={showResetPassword ? 'text' : 'password'}
                        required
                        value={resetConfirmPassword}
                        onChange={(e) => setResetConfirmPassword(e.target.value)}
                        placeholder="Repita a nova senha"
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-900/60 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                      />
                      <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
                    </div>
                  </div>

                  <div className="pt-2 flex flex-col sm:flex-row gap-2">
                    <button
                      type="submit"
                      className="flex-1 py-2.5 px-4 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-xl text-sm shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
                    >
                      <RefreshCw className="h-4 w-4" />
                      <span>Alterar Senha</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsResettingPassword(false)}
                      className="py-2.5 px-4 bg-slate-700 hover:bg-slate-600 text-slate-300 font-semibold rounded-xl text-sm transition-all cursor-pointer"
                    >
                      Ir para Login
                    </button>
                  </div>
                </form>
              </>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

