
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  BarChart3,
  Users,
  TrendingUp,
  Shield,
  CheckCircle2,
  Sparkles,
  PieChart,
  Clock,
  Zap,
  Briefcase
} from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import { Navbar } from '@/components/landing/Navbar';
import { Footer } from '@/components/landing/Footer';

export default function ManagersLanding() {
  const features = [
    {
      icon: BarChart3,
      title: 'Team Analytics',
      description: 'Track recruiter performance, hiring metrics, and team productivity with real-time dashboards.',
      bg: 'bg-orange-500/10',
      color: 'text-orange-500'
    },
    {
      icon: TrendingUp,
      title: 'Hiring Metrics',
      description: 'Monitor time-to-fill, cost-per-hire, and quality-of-hire across all positions and departments.',
      bg: 'bg-amber-500/10',
      color: 'text-amber-500'
    },
    {
      icon: PieChart,
      title: 'Pipeline Visibility',
      description: 'Get a bird\'s eye view of all active searches, bottlenecks, and opportunities for improvement.',
      bg: 'bg-rose-500/10',
      color: 'text-rose-500'
    },
    {
      icon: Shield,
      title: 'Compliance & Security',
      description: 'Ensure hiring practices meet regulatory requirements with audit trails and compliance reporting.',
      bg: 'bg-emerald-500/10',
      color: 'text-emerald-500'
    },
  ];

  const steps = [
    {
      number: '01',
      title: 'Connect Your Team',
      description: 'Invite recruiters and set up your organization structure with role-based permissions.',
    },
    {
      number: '02',
      title: 'Set Goals & KPIs',
      description: 'Define hiring targets, budgets, and performance metrics for your recruitment operation.',
    },
    {
      number: '03',
      title: 'Monitor & Optimize',
      description: 'Use data-driven insights to continuously improve your hiring outcomes and team efficiency.',
    },
  ];

  const benefits = [
    'Real-time visibility into hiring progress',
    'Automated reporting and executive dashboards',
    'Team performance benchmarking',
    'Budget tracking and forecasting',
    'Diversity and inclusion metrics',
    'Integration with HR systems',
  ];

  const metrics = [
    { label: 'Active Jobs', value: '24', trend: '+3' },
    { label: 'Pipeline Value', value: '847', trend: '+12%' },
    { label: 'Time to Fill', value: '18d', trend: '-4d' },
    { label: 'Offer Rate', value: '42%', trend: '+5%' },
  ];

  return (
    <div className="min-h-screen bg-background font-sans selection:bg-orange-500/30">
      <SEOHead
        title="For Account Managers | UltraHire"
        description="Get complete visibility into your hiring operations with analytics, team management, and performance insights. Make data-driven recruitment decisions."
        keywords="hiring manager, recruitment analytics, team management, hiring metrics, HR dashboard"
      />

      <Navbar />

      {/* Hero */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 mesh-gradient-bg opacity-30 dark:opacity-20 select-none pointer-events-none" style={{ filter: 'hue-rotate(-45deg)' }} />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 contrast-150 brightness-100 mix-blend-overlay pointer-events-none" />

        <div className="container relative mx-auto px-4 z-10">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div className="text-center lg:text-left animate-fade-in-up">
              <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/20 bg-orange-500/5 px-4 py-1.5 text-sm font-medium text-orange-500 backdrop-blur-md mb-8 shadow-sm">
                <BarChart3 className="h-4 w-4" />
                For Account Managers
              </div>

              <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold mb-6 leading-[1.1] tracking-tight">
                Lead with <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-500">Data-Driven Insights.</span>
              </h1>

              <p className="text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto lg:mx-0 mb-10">
                Get complete visibility into your hiring operations. Track performance,
                optimize processes, and make strategic decisions with confidence.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Button size="xl" className="h-14 px-8 text-lg rounded-full btn-primary-glow font-semibold" asChild>
                  <Link to="/auth">
                    Get Started
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
                <Button size="xl" variant="ghost" className="h-14 px-8 text-lg rounded-full hover:bg-muted/50" asChild>
                  <Link to="/auth">
                    <PieChart className="mr-2 h-5 w-5" />
                    View Demo
                  </Link>
                </Button>
              </div>
            </div>

            {/* Visual element - Dashboard preview */}
            <div className="relative mx-auto w-full max-w-[500px] lg:max-w-none perspective-1000">
              <div className="absolute -top-20 -right-20 w-80 h-80 bg-orange-500/20 rounded-full blur-3xl animate-pulse-subtle" />
              <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-amber-500/20 rounded-full blur-3xl animate-pulse-subtle animation-delay-500" />

              <div className="relative glass-card rounded-[2.5rem] p-8 shadow-xl animate-float border border-white/10">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="font-display text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-orange-600 to-amber-600">Hiring Overview</h3>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Last 30 days</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-8">
                  {metrics.map((metric) => (
                    <div key={metric.label} className="bg-background/50 border border-white/5 rounded-2xl p-5 hover:bg-background/80 transition-colors">
                      <div className="text-sm text-muted-foreground mb-2">{metric.label}</div>
                      <div className="flex items-end gap-2">
                        <span className="text-3xl font-display font-bold text-foreground">{metric.value}</span>
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${metric.trend.startsWith('+') ? 'bg-green-500/10 text-green-500' : 'bg-green-500/10 text-green-500'}`}>{metric.trend}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-white/10 pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Team Performance</span>
                    <span className="text-xs text-orange-500 font-medium cursor-pointer hover:underline">View Details</span>
                  </div>
                  <div className="space-y-4">
                    {[
                      { name: 'Sarah Chen', hires: 8, color: 'bg-orange-500' },
                      { name: 'Marcus Johnson', hires: 6, color: 'bg-orange-400' },
                      { name: 'Emily Rodriguez', hires: 5, color: 'bg-amber-400' },
                    ].map((recruiter) => (
                      <div key={recruiter.name} className="flex items-center gap-4">
                        <div className="h-8 w-8 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-xs font-bold text-orange-600 dark:text-orange-400">
                          {recruiter.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div className="flex-1">
                          <div className="flex justify-between mb-1.5">
                            <span className="text-sm font-medium">{recruiter.name}</span>
                            <span className="text-xs font-bold text-muted-foreground">{recruiter.hires} hires</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div className={`h-full ${recruiter.color} rounded-full`} style={{ width: `${recruiter.hires * 10}%` }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Floating Elements */}
                <div className="absolute -right-8 top-20 glass-panel p-4 rounded-xl shadow-lg animate-float-delayed hidden sm:block border-l-4 border-l-orange-500">
                  <div className="text-center">
                    <p className="text-xs font-bold text-muted-foreground uppercase">Hiring Velocity</p>
                    <p className="text-2xl font-display font-bold text-foreground">+24%</p>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 bg-muted/20 relative">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-20 animate-in-view">
            <h2 className="text-sm font-bold text-orange-500 tracking-widest uppercase mb-4">Complete Visibility</h2>
            <h3 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-6">
              Complete Hiring <span className="text-gradient-premium">Visibility.</span>
            </h3>
            <p className="text-xl text-muted-foreground">
              Monitor, measure, and optimize every aspect of your recruitment operation.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature) => (
              <div key={feature.title} className="group p-8 rounded-[2rem] border bg-card hover:bg-card/50 transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
                <div className={`h-14 w-14 rounded-2xl ${feature.bg} ${feature.color} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
                  <feature.icon className="h-7 w-7" />
                </div>
                <h3 className="font-display text-xl font-bold mb-3">{feature.title}</h3>
                <p className="text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 relative overflow-hidden">
        <div className="container mx-auto px-4">
          <div className="text-center mb-20">
            <h2 className="font-display text-4xl md:text-5xl font-bold mb-6">Set Up in Minutes</h2>
            <p className="text-xl text-muted-foreground">Get your team up and running quickly with our intuitive platform</p>
          </div>

          <div className="grid md:grid-cols-3 gap-12 max-w-5xl mx-auto relative z-10">
            {steps.map((step, index) => (
              <div key={step.number} className="relative group text-center">
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-10 left-1/2 w-full h-[2px] bg-gradient-to-r from-orange-500/20 to-transparent z-0" />
                )}

                <div className="relative z-10 inline-flex items-center justify-center h-20 w-20 rounded-3xl bg-white dark:bg-slate-800 shadow-xl border border-orange-100 dark:border-orange-900/30 mb-8 group-hover:scale-110 transition-transform duration-500">
                  <span className="text-3xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-br from-orange-600 to-amber-500">{step.number}</span>
                </div>

                <h3 className="font-display text-2xl font-bold mb-4">{step.title}</h3>
                <p className="text-muted-foreground leading-relaxed px-4">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-24 bg-muted/20">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/10 text-orange-600 text-xs font-bold uppercase tracking-wider mb-6">
                Strategic Hiring
              </div>
              <h2 className="font-display text-4xl md:text-5xl font-bold mb-6 leading-tight">
                Make Better <span className="text-orange-500">Decisions.</span>
              </h2>
              <p className="text-xl text-muted-foreground mb-8">
                Empower your team with the insights they need to build world-class organizations.
              </p>

              <ul className="space-y-4">
                {benefits.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-4 p-4 rounded-xl bg-background border border-border/50 hover:border-orange-500/30 transition-colors">
                    <div className="p-1 rounded-full bg-green-500/10 text-green-500 mb-auto mt-0.5">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                    <span className="font-medium">{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-tr from-orange-600 to-amber-600 rounded-[2.5rem] rotate-3 opacity-20 blur-2xl" />
              <div className="relative glass-card rounded-[2.5rem] p-10 border border-white/20 shadow-2xl text-center">
                <div className="mb-8">
                  <div className="h-20 w-20 mx-auto rounded-full bg-orange-500/10 flex items-center justify-center mb-6">
                    <Shield className="h-10 w-10 text-orange-500" />
                  </div>
                  <h3 className="font-display text-3xl font-bold mb-4">Start Leading Now</h3>
                  <p className="text-muted-foreground text-lg">Create your account and take control of your hiring pipeline.</p>
                </div>

                <div className="space-y-4 max-w-sm mx-auto">
                  <Button size="xl" className="w-full h-14 rounded-full btn-primary-glow text-lg font-bold" asChild>
                    <Link to="/auth">
                      Create Manager Account
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Link>
                  </Button>
                  <p className="text-sm text-muted-foreground">
                    Already have an account?{' '}
                    <Link to="/auth" className="text-foreground font-semibold hover:underline">
                      Sign in
                    </Link>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

