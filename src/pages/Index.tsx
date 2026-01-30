import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  Users,
  Briefcase,
  BarChart3,
  CheckCircle2,
  Sparkles,
  FileText,
  Search,
  Clock,
  MessageSquare,
  ShieldCheck,
  Zap,
  Globe
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { SEOHead } from '@/components/SEOHead';
import { Navbar } from '@/components/landing/Navbar';
import { Footer } from '@/components/landing/Footer';

export default function Index() {
  const { user, currentRole } = useAuth();

  const getDashboardLink = () => {
    if (!user) return '/auth';
    if (currentRole === 'candidate') return '/candidate';
    if (currentRole === 'recruiter') return '/recruiter';
    if (currentRole === 'org_admin') return '/org-admin';
    if (currentRole === 'super_admin') return '/admin';
    return '/manager';
  };

  const features = [
    {
      icon: FileText,
      title: 'Resume Analysis',
      description: 'Upload your resume and get actionable feedback. We tell you exactly what skills are missing for your dream job.',
      color: 'text-blue-500',
      bg: 'bg-blue-500/10'
    },
    {
      icon: Search,
      title: 'Smart Matching',
      description: 'Stop searching. We rank jobs by how well they fit your experience, so you apply to the ones you\'ll actually get.',
      color: 'text-purple-500',
      bg: 'bg-purple-500/10'
    },
    {
      icon: Clock,
      title: 'Auto-Sourcing',
      description: 'Recruiters: filter candidates by skills, experience, and availability instantly. No more manual screening.',
      color: 'text-amber-500',
      bg: 'bg-amber-500/10'
    },
    {
      icon: MessageSquare,
      title: 'Unified Comms',
      description: 'Keep all candidate conversations, notes, and feedback in one place. Your team stays in sync, always.',
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10'
    },
  ];

  return (
    <div className="min-h-screen bg-background font-sans selection:bg-accent/30">
      <SEOHead
        title="TalentMatch - The Future of Hiring is Intelligent"
        description="A premium recruitment platform that uses AI to match candidates to jobs and helps recruiters build world-class teams."
        keywords="recruitment, job search, resume analysis, hiring platform, candidate matching, AI recruiting"
      />

      <Navbar />

      {/* Hero Section - Immersive Mesh Gradient */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 mesh-gradient-bg opacity-40 dark:opacity-20 select-none pointer-events-none" />

        {/* Animated grid background overlay */}
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 contrast-150 brightness-100 mix-blend-overlay pointer-events-none" />

        <div className="container relative mx-auto px-4 z-10">
          <div className="mx-auto max-w-6xl">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">

              {/* Left Column: Copy */}
              <div className="text-center lg:text-left animate-fade-in-up">
                <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-4 py-1.5 text-sm font-medium text-accent backdrop-blur-md mb-8 shadow-sm">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
                  </span>
                  AI-Powered Recruiting Intelligence
                </div>

                <h1 className="text-6xl sm:text-7xl lg:text-8xl font-display font-extrabold tracking-tight text-foreground leading-[1.1] mb-6">
                  Match <span className="text-gradient-premium">Talent</span> <br />
                  <span className="text-foreground/80">With Speed.</span>
                </h1>

                <p className="text-xl sm:text-2xl text-muted-foreground/90 leading-relaxed max-w-2xl mx-auto lg:mx-0 mb-10 text-balance">
                  Stop analyzing resumes manually. TalentMatch uses deep learning to connect the right candidates with the right opportunities instantly.
                </p>

                <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start items-center">
                  <Button size="xl" className="h-14 px-8 text-lg rounded-full btn-primary-glow bg-foreground text-background hover:bg-foreground/90 font-semibold" asChild>
                    <Link to={user ? getDashboardLink() : '/auth'}>
                      {user ? 'Go to Dashboard' : "Start For Free"}
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Link>
                  </Button>
                  <Button size="xl" variant="ghost" className="h-14 px-8 text-lg rounded-full hover:bg-muted/50" asChild>
                    <Link to="/recruiters">View Demo</Link>
                  </Button>
                </div>

                <div className="mt-10 flex items-center justify-center lg:justify-start gap-6 text-sm text-muted-foreground font-medium">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-emerald-500" />
                    <span>GDPR Compliant</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-amber-500" />
                    <span>Instant Analysis</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Globe className="h-5 w-5 text-blue-500" />
                    <span>Global Reach</span>
                  </div>
                </div>
              </div>

              {/* Right Column: Visual Interaction */}
              <div className="relative mx-auto w-full max-w-[500px] lg:max-w-none perspective-1000">
                {/* Abstract decorative elements */}
                <div className="absolute -top-20 -right-20 w-64 h-64 bg-accent/20 rounded-full blur-3xl animate-pulse-subtle" />
                <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl animate-pulse-subtle animation-delay-500" />

                {/* Main Glass Card */}
                <div className="relative glass-card rounded-[2rem] p-6 sm:p-8 animate-float shadow-glow">
                  {/* Card Header */}
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
                        <Sparkles className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <h3 className="font-display font-bold text-lg">Top Candidates</h3>
                        <p className="text-xs text-muted-foreground">AI Match Score &gt; 90%</p>
                      </div>
                    </div>
                    <div className="px-3 py-1 rounded-full bg-green-500/10 text-green-600 text-xs font-bold border border-green-500/20">
                      Live Updates
                    </div>
                  </div>

                  {/* List of "Candidates" */}
                  <div className="space-y-4">
                    {[
                      { name: 'Sarah Jenkins', role: 'Senior Product Designer', score: 98, img: 'https://i.pravatar.cc/150?u=a042581f4e29026024d' },
                      { name: 'David Chen', role: 'Full Stack Engineer', score: 95, img: 'https://i.pravatar.cc/150?u=a042581f4e29026704d' },
                      { name: 'Emily Ross', role: 'Marketing Manager', score: 92, img: 'https://i.pravatar.cc/150?u=a04258114e29026302d' },
                    ].map((c, i) => (
                      <div key={c.name} className="group relative flex items-center gap-4 p-3 rounded-2xl hover:bg-muted/50 transition-all duration-300 border border-transparent hover:border-accent/20 cursor-default">
                        <img src={c.img} alt={c.name} className="h-12 w-12 rounded-full object-cover border-2 border-background shadow-sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-foreground truncate">{c.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{c.role}</p>
                        </div>
                        <div className="text-right">
                          <span className={`block text-lg font-display font-bold ${i === 0 ? 'text-green-600' : 'text-foreground'}`}>
                            {c.score}%
                          </span>
                          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Match</span>
                        </div>

                        {/* Hover reveal action */}
                        <div className="absolute right-2 opacity-0 group-hover:opacity-100 transition-opacity translate-x-2 group-hover:translate-x-0">
                          <div className="h-8 w-8 rounded-full bg-foreground text-background flex items-center justify-center shadow-md">
                            <ArrowRight className="h-4 w-4" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Floating Elements on top of card */}
                  <div className="absolute -left-12 bottom-20 glass-panel p-4 rounded-2xl shadow-xl animate-float-delayed hidden sm:block border-l-4 border-l-accent">
                    <p className="text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wider">Time Saved</p>
                    <p className="text-2xl font-display font-bold text-foreground">12 hrs/wk</p>
                  </div>

                  <div className="absolute -right-8 top-32 glass-panel p-4 rounded-2xl shadow-xl animate-float animation-delay-200 hidden sm:block border-l-4 border-l-green-500">
                    <p className="text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wider">Candidates</p>
                    <p className="text-2xl font-display font-bold text-foreground">Top 2%</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Section with Bento Grid feel */}
      <section className="py-24 bg-muted/20 relative">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-20 animate-in-view">
            <h2 className="text-sm font-bold text-accent tracking-widest uppercase mb-4">Powerful Features</h2>
            <h3 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-6">
              Specifically designed for <br /> <span className="text-gradient-premium">modern hiring teams.</span>
            </h3>
            <p className="text-xl text-muted-foreground">
              We stripped away the complexity of traditional ATS software and built a tool that actually helps you hire people.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-6xl mx-auto">
            {features.map((feature, i) => (
              <div
                key={feature.title}
                className={`group p-8 rounded-[2rem] border bg-card hover:bg-card/50 transition-all duration-500 hover:shadow-xl hover:-translate-y-2 ${i % 3 === 0 ? 'md:col-span-2 lg:col-span-1' : ''}`}
              >
                <div className={`h-14 w-14 rounded-2xl ${feature.bg} ${feature.color} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500`}>
                  <feature.icon className="h-7 w-7" />
                </div>
                <h4 className="text-2xl font-display font-bold text-foreground mb-3">{feature.title}</h4>
                <p className="text-lg text-muted-foreground leading-relaxed">{feature.description}</p>

                <div className="mt-6 flex items-center text-sm font-semibold text-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-300 translate-y-2 group-hover:translate-y-0">
                  <span className="border-b-2 border-foreground/20 pb-0.5">Learn more</span>
                  <ArrowRight className="ml-2 h-4 w-4" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Audience Segments - The "Choose your character" section */}
      <section className="py-32 relative overflow-hidden">
        {/* Background blobs */}
        <div className="absolute top-1/2 left-0 w-[500px] h-[500px] bg-purple-500/5 rounded-full blur-3xl -translate-y-1/2 -translate-x-1/2 pointer-events-none" />
        <div className="absolute top-1/2 right-0 w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-4">
              Who are you?
            </h2>
            <p className="text-xl text-muted-foreground">Select your role to see how TalentMatch empowers you.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-7xl mx-auto">
            {/* Candidate Card */}
            <Link to="/candidates" className="group">
              <div className="relative h-full bg-white dark:bg-card rounded-[2.5rem] p-2 border transition-all duration-500 hover:shadow-2xl hover:-translate-y-2">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-cyan-500/5 rounded-[2.5rem]" />
                <div className="relative h-full flex flex-col p-8 rounded-[2rem] overflow-hidden">
                  <div className="mb-8">
                    <div className="h-16 w-16 rounded-2xl bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-6 shadow-sm group-hover:scale-110 transition-transform">
                      <Users className="h-8 w-8" />
                    </div>
                    <h3 className="text-3xl font-display font-bold text-foreground mb-2">Candidates</h3>
                    <p className="text-muted-foreground font-medium">Find your dream job faster.</p>
                  </div>

                  <div className="space-y-4 mb-8 flex-grow">
                    {['Resume Feedback Analysis', 'Match Score Transparency', 'One-Click Apply'].map((item) => (
                      <div key={item} className="flex items-center gap-3">
                        <div className="h-6 w-6 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                          <CheckCircle2 className="h-3.5 w-3.5 text-blue-600" />
                        </div>
                        <span className="text-sm font-medium">{item}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-auto">
                    <span className="inline-flex items-center justify-center w-full py-4 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 font-bold text-sm tracking-wide uppercase transition-colors group-hover:bg-blue-600 group-hover:text-white">
                      Explore Candidate Features
                    </span>
                  </div>
                </div>
              </div>
            </Link>

            {/* Recruiter Card */}
            <Link to="/recruiters" className="group">
              <div className="relative h-full bg-white dark:bg-card rounded-[2.5rem] p-2 border border-accent/20 transition-all duration-500 hover:shadow-glow hover:-translate-y-2 scale-105 z-10 shadow-xl">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-pink-500/5 rounded-[2.5rem]" />
                <div className="relative h-full flex flex-col p-8 rounded-[2rem] overflow-hidden">
                  <div className="absolute top-6 right-6">
                    <span className="px-3 py-1 rounded-full bg-accent text-white text-xs font-bold uppercase tracking-wider shadow-sm">Most Popular</span>
                  </div>

                  <div className="mb-8">
                    <div className="h-16 w-16 rounded-2xl bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-6 shadow-sm group-hover:scale-110 transition-transform">
                      <Briefcase className="h-8 w-8" />
                    </div>
                    <h3 className="text-3xl font-display font-bold text-foreground mb-2">Recruiters</h3>
                    <p className="text-muted-foreground font-medium">Hire the top 1% instantly.</p>
                  </div>

                  <div className="space-y-4 mb-8 flex-grow">
                    {['AI Candidate Ranking', 'Automated Outreach', 'Pipeline Analytics'].map((item) => (
                      <div key={item} className="flex items-center gap-3">
                        <div className="h-6 w-6 rounded-full bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                          <CheckCircle2 className="h-3.5 w-3.5 text-purple-600" />
                        </div>
                        <span className="text-sm font-medium">{item}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-auto">
                    <span className="inline-flex items-center justify-center w-full py-4 rounded-xl bg-accent text-white font-bold text-sm tracking-wide uppercase transition-all shadow-lg group-hover:shadow-glow">
                      Explore Recruiter Suite
                    </span>
                  </div>
                </div>
              </div>
            </Link>

            {/* Manager Card */}
            <Link to="/managers" className="group">
              <div className="relative h-full bg-white dark:bg-card rounded-[2.5rem] p-2 border transition-all duration-500 hover:shadow-2xl hover:-translate-y-2">
                <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-amber-500/5 rounded-[2.5rem]" />
                <div className="relative h-full flex flex-col p-8 rounded-[2rem] overflow-hidden">
                  <div className="mb-8">
                    <div className="h-16 w-16 rounded-2xl bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 flex items-center justify-center mb-6 shadow-sm group-hover:scale-110 transition-transform">
                      <BarChart3 className="h-8 w-8" />
                    </div>
                    <h3 className="text-3xl font-display font-bold text-foreground mb-2">Managers</h3>
                    <p className="text-muted-foreground font-medium">Build high-performing teams.</p>
                  </div>

                  <div className="space-y-4 mb-8 flex-grow">
                    {['Team Performance View', 'Hiring Bottlenecks', 'Budget Management'].map((item) => (
                      <div key={item} className="flex items-center gap-3">
                        <div className="h-6 w-6 rounded-full bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                          <CheckCircle2 className="h-3.5 w-3.5 text-orange-600" />
                        </div>
                        <span className="text-sm font-medium">{item}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-auto">
                    <span className="inline-flex items-center justify-center w-full py-4 rounded-xl bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-300 font-bold text-sm tracking-wide uppercase transition-colors group-hover:bg-orange-600 group-hover:text-white">
                      Explore Management Tools
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 relative overflow-hidden">
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-5xl mx-auto bg-foreground rounded-[3rem] p-8 md:p-16 text-center text-background relative overflow-hidden shadow-2xl">
            {/* Pattern overlay */}
            <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:20px_20px]" />

            <div className="relative z-10">
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold mb-6 tracking-tight text-background">
                Ready to transform your <br /> hiring process?
              </h2>
              <p className="text-xl text-background/80 max-w-2xl mx-auto mb-10">
                Join thousands of companies and candidates who are already using TalentMatch to find their perfect fit.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button size="xl" className="h-16 px-10 text-lg rounded-full bg-background text-foreground hover:bg-background/90 hover:scale-105 transition-all duration-300 font-bold shadow-lg" asChild>
                  <Link to="/auth">
                    Get Started Now
                  </Link>
                </Button>
              </div>

              <p className="mt-6 text-sm text-background/50">
                No credit card required. Free for candidates.
              </p>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
