import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Mail, Lock, Shield, UserPlus, AlertCircle, Command, ChevronRight, Eye, EyeOff, CheckCircle2, Circle } from 'lucide-react';
import { apiUrl } from '@/lib/api';

const Requirement = ({ fulfilled, text }: { fulfilled: boolean, text: string }) => (
    <div className={`flex items-center gap-1.5 text-[10px] uppercase tracking-wider transition-colors duration-300 ${fulfilled ? 'text-green-400 font-bold' : 'text-gray-600'}`}>
        {fulfilled ? <CheckCircle2 size={14} /> : <Circle size={14} />}
        <span>{text}</span>
    </div>
);

const Login = () => {
    const [activeTab, setActiveTab] = useState<'signin' | 'register'>('signin');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const mode = (params.get("mode") || "").toLowerCase();
        if (mode === "register") {
            setActiveTab("register");
            return;
        }
        if (mode === "signin" || mode === "login") {
            setActiveTab("signin");
        }
    }, [location.search]);

    // Clear errors when switching tabs
    useEffect(() => {
        setError('');
        setPassword('');
        setConfirmPassword('');
    }, [activeTab]);

    const hasLength = password.length >= 8;
    const hasUpper = /[A-Z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);
    const isPasswordValid = hasLength && hasUpper && hasNumber && hasSpecial;
    const passwordsMatch = password === confirmPassword && password !== '';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const isRegistering = activeTab === 'register';

            if (isRegistering) {
                if (!emailRegex.test(email)) throw new Error("Invalid email format.");
                if (!isPasswordValid) throw new Error("Security requirements not met.");
                if (!passwordsMatch) throw new Error("Keys do not match.");
            }

            const response = await fetch(apiUrl(`/api/${isRegistering ? 'register' : 'token'}`), {
                method: 'POST',
                headers: isRegistering
                    ? { 'Content-Type': 'application/json' }
                    : { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: isRegistering
                    ? JSON.stringify({ username: email, password: password })
                    : new URLSearchParams({ username: email, password: password })
            });

            // Prevent React from crashing if Python spits out raw HTML errors
            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                throw new Error("Server error. Check Python terminal.");
            }

            const data = await response.json();

            if (response.ok) {
                if (isRegistering) {
                    alert("Profile Registered Locally. You can now Sign In.");
                    setActiveTab('signin');
                } else {
                    // 1. SAVE THE TOKEN
                    localStorage.setItem('token', data.access_token || data.token);
                    localStorage.setItem('username', String(data.username || email).trim().toLowerCase());
                    // 2. FORCE NAVIGATION TO DASHBOARD
                    navigate('/dashboard', { replace: true });
                }
            } else {
                setError(data.detail || "Authentication Failed.");
            }
        } catch (err: unknown) {
            console.error("Auth Error:", err);
            const message = err instanceof Error ? err.message : "Authentication failed.";
            setError(message === "Failed to fetch" ? "Backend Offline. Run python main.py" : message);
        } finally {
            setIsLoading(false);
        }
    };

    const isRegister = activeTab === 'register';

    return (
        <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4 font-sans text-gray-200 selection:bg-green-500/30 relative overflow-hidden">
            {/* Animated Background Elements */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-green-500/5 rounded-full blur-[120px] animate-pulse"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-green-500/5 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }}></div>
            
            <div className="glass-card p-10 rounded-[2rem] w-full max-w-md transition-all duration-500 relative z-10">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-px bg-gradient-to-r from-transparent via-green-500/50 to-transparent"></div>

                <div className="flex flex-col items-center mb-10 text-center">
                    <div className="w-16 h-16 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center mb-5 text-green-500 shadow-[0_0_20px_rgba(34,197,94,0.15)] group hover:scale-110 transition-transform duration-300">
                        <Command size={32} className="group-hover:rotate-12 transition-transform" />
                    </div>
                    <h1 className="text-2xl font-black text-white tracking-widest uppercase text-shadow-glow">Arbitrage Bot</h1>
                    <div className="flex items-center gap-2 mt-2">
                        <span className="h-px w-4 bg-gray-700"></span>
                        <p className="text-[10px] text-gray-400 uppercase tracking-[0.3em] font-bold">
                            {isRegister ? 'Operator Deployment' : 'Neural Access'}
                        </p>
                        <span className="h-px w-4 bg-gray-700"></span>
                    </div>
                </div>

                <div className="flex bg-black/40 p-1.5 rounded-2xl mb-10 border border-white/5 shadow-inner">
                    <button
                        type="button"
                        onClick={() => setActiveTab('signin')}
                        className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-300 flex items-center justify-center gap-2 ${!isRegister ? 'bg-green-500 text-black shadow-[0_0_15px_rgba(34,197,94,0.3)]' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}
                    >
                        <Shield size={14} /> Neural Sign In
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('register')}
                        className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-300 flex items-center justify-center gap-2 ${isRegister ? 'bg-green-500 text-black shadow-[0_0_15px_rgba(34,197,94,0.3)]' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}
                    >
                        <UserPlus size={14} /> Register Node
                    </button>
                </div>

                <button
                    type="button"
                    onClick={() => navigate('/')}
                    className="mb-6 w-full rounded-xl border border-white/10 bg-white/[0.03] py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 transition hover:border-white/20 hover:text-white"
                >
                    Back To Home
                </button>

                <form onSubmit={handleAuth} className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 ml-2">Operator ID</label>
                        <div className="relative flex items-center group">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <Mail className="text-gray-500 group-focus-within:text-green-500 transition-colors" size={18} />
                            </div>
                            <input
                                type="email"
                                placeholder="operator@arbitragebot.io"
                                value={email}
                                required
                                onChange={e => setEmail(e.target.value)}
                                className="w-full bg-black/40 border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-sm text-white outline-none focus:border-green-500/50 focus:ring-1 focus:ring-green-500/50 transition-all placeholder:text-gray-700 font-medium"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 ml-2">Neural Key</label>
                        <div className="relative flex items-center group">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <Lock className="text-gray-500 group-focus-within:text-green-500 transition-colors" size={18} />
                            </div>
                            <input
                                type={showPassword ? "text" : "password"}
                                placeholder="••••••••••••"
                                value={password}
                                required
                                onChange={e => setPassword(e.target.value)}
                                className="w-full bg-black/40 border border-white/5 rounded-2xl py-4 pl-12 pr-14 text-sm text-white outline-none focus:border-green-500/50 focus:ring-1 focus:ring-green-500/50 transition-all placeholder:text-gray-700 font-medium"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-4 text-gray-500 hover:text-green-500 transition-colors p-2"
                            >
                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>

                    {isRegister && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 ml-2">Verify Key</label>
                                <div className={`relative flex items-center border rounded-2xl transition-all ${confirmPassword ? (passwordsMatch ? 'border-green-500/50' : 'border-red-500/50') : 'border-white/5'}`}>
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <Lock className={`${confirmPassword ? (passwordsMatch ? 'text-green-500' : 'text-red-500') : 'text-gray-500'}`} size={18} />
                                    </div>
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        placeholder="Repeat encryption key"
                                        value={confirmPassword}
                                        required
                                        onChange={e => setConfirmPassword(e.target.value)}
                                        className="w-full bg-black/40 rounded-2xl py-4 pl-12 pr-4 text-sm text-white outline-none font-medium placeholder:text-gray-700"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 border-t border-white/5 pt-4">
                                <Requirement fulfilled={hasLength} text="8+ Symb" />
                                <Requirement fulfilled={hasUpper} text="Upper Case" />
                                <Requirement fulfilled={hasNumber} text="Numeral" />
                                <Requirement fulfilled={hasSpecial} text="Special" />
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 p-4 rounded-2xl text-red-400 text-[11px] font-bold uppercase tracking-wider animate-in shake duration-300">
                            <AlertCircle size={18} className="shrink-0" />
                            <p>{error}</p>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isLoading || (isRegister && (!isPasswordValid || !passwordsMatch))}
                        className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-500/90 hover:to-green-600/90 text-black font-black uppercase tracking-[0.2em] py-5 rounded-2xl flex items-center justify-center gap-3 transition-all duration-300 disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed mt-8 group relative overflow-hidden shadow-[0_10px_30px_rgba(34,197,94,0.2)] active:scale-95"
                    >
                        <div className="absolute top-0 left-[-100%] w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:left-[100%] transition-all duration-700"></div>
                        {isLoading ? (
                            <span className="flex items-center gap-3">
                                <div className="w-5 h-5 border-[3px] border-black/20 border-t-black rounded-full animate-spin"></div>
                                Processing...
                            </span>
                        ) : (
                            <>
                                {isRegister ? 'Initialize Node' : 'Initialize Session'}
                                <ChevronRight size={20} className="group-hover:translate-x-1.5 transition-transform" />
                            </>
                        )}
                    </button>
                    
                    {!isRegister && (
                        <p className="text-center text-[10px] text-gray-600 font-bold uppercase tracking-[0.2em] pt-4">
                            Secured by Arbitrage Bot Cryptographic Core
                        </p>
                    )}
                </form>
            </div>
        </div>
    );
};

export default Login;
