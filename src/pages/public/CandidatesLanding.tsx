
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  FileText,
  Target,
  Bell,
  TrendingUp,
  CheckCircle2,
  Search,
  BarChart3,
  Sparkles,
  Zap
} from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import { Navbar } from '@/components/landing/Navbar';
import { Footer } from '@/components/landing/Footer';

export default function CandidatesLanding() {
  const features = [
    {
      icon: FileText,
      title: 'Resume Analysis',
      description: 'Get detailed feedback on your resume with actionable suggestions to improve your chances of landing interviews.',
      color: 'text-blue-500',
      bg: 'bg-blue-500/10'
    },
    {
      icon: Target,
      title: 'Smart Job Matching',
      description: 'Our algorithm analyzes your skills, experience, and preferences to recommend jobs that truly fit your career goals.',
      color: 'text-purple-500',
      bg: 'bg-purple-500/10'
    },
    {
      icon: Bell,
      title: 'Real-time Alerts',
      description: 'Never miss an opportunity. Get instant notifications when jobs matching your profile are posted.',
      color: 'text-amber-500',
      bg: 'bg-amber-500/10'
    },
    {
      icon: TrendingUp,
      title: 'Career Insights',
      description: 'Understand your market value with salary insights and skill gap analysis for your target roles.',
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10'
    },
  ];

  const steps = [
    {
      number: '01',
      title: 'Create Your Profile',
      description: 'Upload your resume and let us extract your skills, experience, and career preferences automatically.',
    },
    {
      number: '02',
      title: 'Get Matched',
      description: 'Our intelligent matching system finds opportunities that align with your goals and qualifications.',
    },
    {
      number: '03',
      title: 'Apply with Confidence',
      description: 'Apply to jobs knowing you\'re a great fit, with insights on how your profile compares to requirements.',
    },
  ];

  const benefits = [
    'Personalized job recommendations based on your unique profile',
    'Resume scoring and improvement suggestions',
    'Track all your applications in one place',
    'Interview preparation resources',
    'Salary benchmarking for your role and location',
    'Direct connection with top recruiters',
  ];

  return (
    <div className="min-h-screen bg-background font-sans selection:bg-blue-500/30">
      <SEOHead
        title="For Candidates | UltraHire"
        description="Find your dream job with intelligent matching. Get resume analysis, personalized job recommendations, and career insights to land your next opportunity."
        keywords="job search, career, resume analysis, job matching, candidates, job seekers"
      />

      <Navbar />

      {/* Hero */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 mesh-gradient-bg opacity-30 dark:opacity-20 select-none pointer-events-none" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 contrast-150 brightness-100 mix-blend-overlay pointer-events-none" />

        <div className="container relative mx-auto px-4 z-10">
          <div className="mx-auto max-w-6xl">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              <div className="text-center lg:text-left animate-fade-in-up">
                <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/5 px-4 py-1.5 text-sm font-medium text-blue-500 backdrop-blur-md mb-8 shadow-sm">
                  <Sparkles className="h-4 w-4" />
                  For Job Seekers
                </div>

                <h1 className="text-6xl sm:text-7xl lg:text-8xl font-display font-extrabold tracking-tight leading-[1.1] mb-6">
                Land Your Dream Job <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-500">Faster Than Ever.</span>
              </h1>

                <p className="text-xl sm:text-2xl text-muted-foreground/90 leading-relaxed max-w-2xl mx-auto lg:mx-0 mb-10 text-balance">
                Get matched with opportunities that fit your skills, experience, and career goals.
                Our intelligent platform helps you stand out and find your perfect role.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Button size="xl" className="h-14 px-8 text-lg rounded-full btn-primary-glow font-semibold" asChild>
                  <Link to="/auth">
                    Create Free Profile
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
                <Button size="xl" variant="ghost" className="h-14 px-8 text-lg rounded-full hover:bg-muted/50" asChild>
                  <Link to="/auth">
                    <Search className="mr-2 h-5 w-5" />
                    Browse Jobs
                  </Link>
                </Button>
              </div>
              </div>

              {/* Visual element */}
              <div className="relative mx-auto w-full max-w-[500px] lg:max-w-none perspective-1000">
              <div className="absolute -top-20 -right-20 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl animate-pulse-subtle" />
              <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-cyan-500/20 rounded-full blur-3xl animate-pulse-subtle animation-delay-500" />

              <div className="relative glass-card rounded-[2.5rem] p-8 shadow-xl animate-float border border-white/10">
                <div className="space-y-8">
                  <div className="flex items-center gap-6">
                    <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shadow-lg">
                      <BarChart3 className="h-10 w-10 text-white" />
                    </div>
                    <div>
                      <div className="text-5xl font-display font-bold text-foreground">94%</div>
                      <div className="text-sm font-medium text-muted-foreground uppercase tracking-wider mt-1">Profile Match Score</div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm font-medium">
                        <span>Skills Match</span>
                        <span>96%</span>
                      </div>
                      <div className="h-3 bg-muted/50 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full animate-pulse" style={{ width: '96%' }} />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm font-medium">
                        <span>Experience Fit</span>
                        <span>92%</span>
                      </div>
                      <div className="h-3 bg-muted/50 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full" style={{ width: '92%' }} />
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-white/10">
                    <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">Top Matched Skills</div>
                    <div className="flex flex-wrap gap-2">
                      {['React', 'TypeScript', 'Node.js', 'AWS', 'Python'].map((skill) => (
                        <span key={skill} className="px-4 py-1.5 bg-blue-500/10 text-blue-500 text-sm font-semibold rounded-full border border-blue-500/20">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Floating Badge */}
                <div className="absolute -right-6 top-10 glass-panel p-4 rounded-xl shadow-lg animate-float-delayed hidden sm:block border-l-4 border-l-blue-500">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-500/10 rounded-full">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-muted-foreground">Status</p>
                      <p className="text-sm font-bold">Interview Requested</p>
                    </div>
                  </div>
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
            <h2 className="text-sm font-bold text-blue-500 tracking-widest uppercase mb-4">Why UltraHire?</h2>
            <h3 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-6">
              Everything You Need to <span className="text-gradient-premium">Succeed.</span>
            </h3>
            <p className="text-xl text-muted-foreground">
              From resume optimization to job matching, we provide the tools to accelerate your career.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-6xl mx-auto">
            {features.map((feature, i) => (
              <div key={feature.title} className="group p-8 rounded-[2rem] border bg-card hover:bg-card/50 transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
                <div className={`h-14 w-14 rounded-2xl ${feature.bg} ${feature.color} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
                  <feature.icon className="h-7 w-7" />
                </div>
                <h4 className="text-2xl font-display font-bold text-foreground mb-3">{feature.title}</h4>
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
          <div className="text-center max-w-3xl mx-auto mb-20">
            <h2 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-6">How It Works</h2>
            <p className="text-xl text-muted-foreground">Get started in minutes and find your next opportunity</p>
          </div>

          <div className="grid md:grid-cols-3 gap-12 max-w-5xl mx-auto relative z-10">
            {steps.map((step, index) => (
              <div key={step.number} className="relative group text-center">
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-10 left-1/2 w-full h-[2px] bg-gradient-to-r from-blue-500/20 to-transparent z-0" />
                )}

                <div className="relative z-10 inline-flex items-center justify-center h-20 w-20 rounded-3xl bg-white dark:bg-slate-800 shadow-xl border border-blue-100 dark:border-blue-900/30 mb-8 group-hover:scale-110 transition-transform duration-500">
                  <span className="text-3xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-br from-blue-600 to-cyan-500">{step.number}</span>
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
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 text-blue-600 text-xs font-bold uppercase tracking-wider mb-6">
                Premium Benefits
              </div>
              <h2 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-6 leading-tight">
                Your Career, <span className="text-blue-500">Elevated.</span>
              </h2>
              <p className="text-xl text-muted-foreground mb-8">
                Join thousands of professionals who have accelerated their careers with UltraHire's intelligent platform.
              </p>

              <ul className="space-y-4">
                {benefits.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-4 p-4 rounded-xl bg-background border border-border/50 hover:border-blue-500/30 transition-colors">
                    <div className="p-1 rounded-full bg-green-500/10 text-green-500 mb-auto mt-0.5">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                    <span className="font-medium">{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-tr from-blue-600 to-purple-600 rounded-[2.5rem] rotate-3 opacity-20 blur-2xl" />
              <div className="relative glass-card rounded-[2.5rem] p-10 border border-white/20 shadow-2xl text-center">
                <div className="mb-8">
                  <div className="h-20 w-20 mx-auto rounded-full bg-blue-500/10 flex items-center justify-center mb-6">
                    <Zap className="h-10 w-10 text-blue-500" />
                  </div>
                  <h3 className="text-3xl font-display font-bold text-foreground mb-4">Ready to Start?</h3>
                  <p className="text-muted-foreground text-lg">Create your profile today and let the opportunities come to you.</p>
                </div>

                <div className="space-y-4 max-w-sm mx-auto">
                  <Button size="xl" className="w-full h-14 rounded-full btn-primary-glow text-lg font-bold" asChild>
                    <Link to="/auth">
                      Get Started Free
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

