import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { Menu, X, Moon, Sun, LogOut, LayoutDashboard } from 'lucide-react';
import { useState, useEffect } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

// Custom wordmark logo component
function Logo({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-primary-foreground" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      </div>
      <span className="font-display font-bold text-xl tracking-tight">
        Ultra<span className="text-accent">Hire</span>
      </span>
    </div>
  );
}

export function Navbar() {
  const navigate = useNavigate();
  const { user, currentRole, profile, signOut } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return false;
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      setIsDark(true);
    } else if (savedTheme === 'light') {
      setIsDark(false);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setIsDark(true);
    }
  }, []);

  const getDashboardLink = () => {
    if (!user) return '/auth';
    if (currentRole === 'candidate') return '/candidate';
    if (currentRole === 'recruiter') return '/recruiter';
    if (currentRole === 'org_admin') return '/org-admin';
    if (currentRole === 'super_admin') return '/admin';
    return '/manager';
  };

  const navLinks = [
    { label: 'For Candidates', href: '/candidates' },
    { label: 'For Recruiters', href: '/recruiters' },
    { label: 'For Account Managers', href: '/managers' },
  ];

  return (
    <header className="fixed top-6 left-0 right-0 z-50 px-4">
      <nav className="mx-auto max-w-5xl rounded-full border border-white/20 bg-white/70 dark:bg-black/70 backdrop-blur-xl shadow-lg shadow-black/5 px-6 py-3 flex items-center justify-between transition-all duration-300 hover:shadow-xl hover:bg-white/80 dark:hover:bg-black/80">
        {/* Logo */}
        <Link to="/" className="shrink-0 group">
          <Logo className="transition-transform duration-300 group-hover:scale-105" />
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              className="px-4 py-2 text-sm font-medium hover:text-foreground transition-all duration-300 rounded-full hover:bg-muted/50"
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Desktop Auth & Theme Toggle */}
        <div className="hidden md:flex items-center gap-3">
          <button
            onClick={() => setIsDark(!isDark)}
            className="p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Toggle theme"
          >
            {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>

          <div className="h-6 w-px bg-border/50 mx-1" />

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2 rounded-full pl-1 pr-3 hover:bg-muted">
                  <Avatar className="h-8 w-8 border border-white/20">
                    <AvatarImage src={profile?.avatar_url || ''} />
                    <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-xs">
                      {(profile?.full_name || profile?.email || 'U').slice(0, 1).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="max-w-[10rem] truncate text-sm font-medium hidden lg:block">
                    {profile?.full_name || profile?.email || 'Account'}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-2xl p-2 glass-panel">
                <DropdownMenuItem
                  onClick={() => navigate(getDashboardLink())}
                  className="gap-2 rounded-xl focus:bg-accent/10 focus:text-accent cursor-pointer"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  Go to dashboard
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-border/50 my-1" />
                <DropdownMenuItem
                  onClick={async () => {
                    await signOut();
                    navigate('/');
                  }}
                  className="gap-2 text-destructive focus:bg-destructive/10 focus:text-destructive rounded-xl cursor-pointer"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Button variant="ghost" size="sm" className="rounded-full font-medium" asChild>
                <Link to="/auth">Sign In</Link>
              </Button>
              <Button size="sm" className="rounded-full px-5 btn-primary-glow font-semibold" asChild>
                <Link to="/auth">Get Started</Link>
              </Button>
            </>
          )}
        </div>

        {/* Mobile Menu & Theme Toggle */}
        <div className="md:hidden flex items-center gap-2">
          <button
            onClick={() => setIsDark(!isDark)}
            className="p-2 rounded-full bg-muted/50 hover:bg-muted border border-border/50 transition-colors text-foreground"
            aria-label="Toggle theme"
          >
            {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <button
            className="p-2 rounded-full bg-primary/10 hover:bg-primary/20 border border-primary/30 transition-all text-primary"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden mt-2 mx-auto max-w-5xl rounded-2xl p-4 animate-fade-in bg-white/95 dark:bg-black/95 backdrop-blur-xl border border-white/20 shadow-xl">
          <div className="flex flex-col gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className="px-4 py-3 text-sm font-medium text-foreground hover:bg-muted rounded-lg transition-colors"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <hr className="my-2 border-border" />
            {user ? (
              <div className="flex flex-col gap-2">
                <Button asChild className="w-full" variant="outline">
                  <Link to={getDashboardLink()} onClick={() => setIsMobileMenuOpen(false)}>
                    Go to Dashboard
                  </Link>
                </Button>
                <Button
                  className="w-full"
                  variant="destructive"
                  onClick={async () => {
                    setIsMobileMenuOpen(false);
                    await signOut();
                    navigate('/');
                  }}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Button variant="outline" asChild className="w-full">
                  <Link to="/auth" onClick={() => setIsMobileMenuOpen(false)}>
                    Sign In
                  </Link>
                </Button>
                <Button asChild className="w-full">
                  <Link to="/auth" onClick={() => setIsMobileMenuOpen(false)}>
                    Get Started
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
