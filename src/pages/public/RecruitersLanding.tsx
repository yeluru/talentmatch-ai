
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  Users,
  Target,
  Mail,
  Layers,
  CheckCircle2,
  Sparkles,
  Search,
  Zap,
  Briefcase
} from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import { Navbar } from '@/components/landing/Navbar';
import { Footer } from '@/components/landing/Footer';

export default function RecruitersLanding() {
  const features = [
    {
      icon: Target,
      title: 'Candidate Matching',
      description: 'Find the best candidates instantly with our intelligent matching algorithm that analyzes skills, experience, and culture fit.',
      bg: 'bg-purple-500/10',
      color: 'text-purple-500'
    },
    {
      icon: Layers,
      title: 'Pipeline Management',
      description: 'Track candidates through every stage of your hiring process with a visual, intuitive pipeline interface.',
      bg: 'bg-indigo-500/10',
      color: 'text-indigo-500'
    },
    {
      icon: Mail,
      title: 'Outreach Campaigns',
      description: 'Create personalized email sequences to engage passive candidates and nurture talent relationships.',
      bg: 'bg-pink-500/10',
      color: 'text-pink-500'
    },
    {
      icon: Search,
      title: 'Talent Sourcing',
      description: 'Access a vast talent pool and use advanced filters to find candidates that match your exact requirements.',
      bg: 'bg-blue-500/10',
      color: 'text-blue-500'
    },
  ];

  const steps = [
    {
      number: '01',
      title: 'Post Your Jobs',
      description: 'Create detailed job listings with requirements, skills, and company culture information.',
    },
    {
      number: '02',
      title: 'Get Matched Candidates',
      description: 'Receive ranked candidate recommendations based on job requirements and compatibility.',
    },
    {
      number: '03',
      title: 'Hire Top Talent',
      description: 'Streamline interviews, manage offers, and close hires faster than ever before.',
    },
  ];

  const benefits = [
    'Reduce time-to-hire by up to 60%',
    'Access pre-qualified candidate pools',
    'Automated candidate screening and ranking',
    'Collaborative hiring with team workflows',
    'Integrated communication tools',
    'Detailed analytics and reporting',
  ];

  return (
    <div className="min-h-screen bg-background font-sans selection:bg-purple-500/30">
      <SEOHead
        title="For Recruiters | UltraHire"
        description="Find and hire top talent faster with intelligent candidate matching, pipeline management, and outreach automation. Transform your recruitment process."
        keywords="recruiting, hiring, talent acquisition, candidate matching, ATS, recruitment software"
      />

      <Navbar />

      {/* Hero */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 mesh-gradient-bg opacity-30 dark:opacity-20 select-none pointer-events-none" style={{ filter: 'hue-rotate(45deg)' }} />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 contrast-150 brightness-100 mix-blend-overlay pointer-events-none" />

        <div className="container relative mx-auto px-4 z-10">
          <div className="mx-auto max-w-6xl">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              <div className="text-center lg:text-left animate-fade-in-up">
                <div className="inline-flex items-center gap-2 rounded-full border border-purple-500/20 bg-purple-500/5 px-4 py-1.5 text-sm font-medium text-purple-500 backdrop-blur-md mb-8 shadow-sm">
                  <Briefcase className="h-4 w-4" />
                  For Talent Acquisition
                </div>

                <h1 className="text-6xl sm:text-7xl lg:text-8xl font-display font-extrabold tracking-tight leading-[1.1] mb-6">
                  Hire Smarter, <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500">Not Harder.</span>
                </h1>

                <p className="text-xl sm:text-2xl text-muted-foreground/90 leading-relaxed max-w-2xl mx-auto lg:mx-0 mb-10 text-balance">
                Transform your recruitment process with intelligent matching, automated sourcing,
                and powerful pipeline management tools.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Button size="xl" className="h-14 px-8 text-lg rounded-full btn-primary-glow font-semibold" asChild>
                  <Link to="/auth">
                    Start Hiring Free
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
                <Button size="xl" variant="ghost" className="h-14 px-8 text-lg rounded-full hover:bg-muted/50" asChild>
                  <Link to="/auth">
                    <Users className="mr-2 h-5 w-5" />
                    View Talent Pool
                  </Link>
                </Button>
              </div>
              </div>

              {/* Visual element */}
              <div className="relative mx-auto w-full max-w-[500px] lg:max-w-none perspective-1000">
                <div className="absolute -top-20 -right-20 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl animate-pulse-subtle" />
              <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-pink-500/20 rounded-full blur-3xl animate-pulse-subtle animation-delay-500" />

              <div className="relative glass-card rounded-[2.5rem] p-8 shadow-xl animate-float border border-white/10">
                <div className="space-y-8">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">Active Candidates</div>
                      <div className="text-5xl font-display font-bold text-foreground">247</div>
                    </div>
                    <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
                      <Users className="h-8 w-8 text-white" />
                    </div>
                  </div>

                  <div className="space-y-4">
                    {['Screening', 'Interview', 'Offer', 'Hired'].map((stage, i) => (
                      <div key={stage} className="space-y-2">
                        <div className="flex justify-between text-sm font-medium">
                          <span>{stage}</span>
                          <span>{[142, 67, 28, 10][i]}</span>
                        </div>
                        <div className="h-3 bg-muted/50 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
                            style={{ width: `${[85, 65, 40, 25][i]}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-6 border-t border-white/10 flex items-center gap-8">
                    <div className="flex-1">
                      <div className="text-sm text-muted-foreground uppercase tracking-wider font-bold mb-1">Time to Hire</div>
                      <div className="text-2xl font-display font-bold text-purple-500">12 days</div>
                    </div>
                    <div className="flex-1">
                      <div className="text-sm text-muted-foreground uppercase tracking-wider font-bold mb-1">Fill Rate</div>
                      <div className="text-2xl font-display font-bold text-green-500">94%</div>
                    </div>
                  </div>
                </div>

                {/* Floating Badge */}
                <div className="absolute -left-6 bottom-20 glass-panel p-4 rounded-xl shadow-lg animate-float-delayed hidden sm:block border-r-4 border-r-purple-500">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-500/10 rounded-full">
                      <Zap className="h-4 w-4 text-purple-500" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-muted-foreground uppercase">AI Sourcing</p>
                      <p className="text-sm font-bold">Active</p>
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
            <h2 className="text-sm font-bold text-purple-500 tracking-widest uppercase mb-4">Powerful Recruiting Tools</h2>
            <h3 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-6">
              Hire the Best, <span className="text-gradient-premium">Faster.</span>
            </h3>
            <p className="text-xl text-muted-foreground">
              Everything you need to find, engage, and hire the best talent for your team.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-6xl mx-auto">
            {features.map((feature) => (
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
            <h2 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-6">Streamlined Hiring Process</h2>
            <p className="text-xl text-muted-foreground">From job posting to offer acceptance in record time</p>
          </div>

          <div className="grid md:grid-cols-3 gap-12 max-w-5xl mx-auto relative z-10">
            {steps.map((step, index) => (
              <div key={step.number} className="relative group text-center">
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-10 left-1/2 w-full h-[2px] bg-gradient-to-r from-purple-500/20 to-transparent z-0" />
                )}

                <div className="relative z-10 inline-flex items-center justify-center h-20 w-20 rounded-3xl bg-white dark:bg-slate-800 shadow-xl border border-purple-100 dark:border-purple-900/30 mb-8 group-hover:scale-110 transition-transform duration-500">
                  <span className="text-3xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-br from-purple-600 to-pink-500">{step.number}</span>
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
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 text-purple-600 text-xs font-bold uppercase tracking-wider mb-6">
                Efficiency First
              </div>
              <h2 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-6 leading-tight">
                Recruit Like <span className="text-purple-500">a Pro.</span>
              </h2>
              <p className="text-xl text-muted-foreground mb-8">
                Join leading companies who have transformed their hiring with UltraHire.
              </p>

              <ul className="space-y-4">
                {benefits.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-4 p-4 rounded-xl bg-background border border-border/50 hover:border-purple-500/30 transition-colors">
                    <div className="p-1 rounded-full bg-green-500/10 text-green-500 mb-auto mt-0.5">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                    <span className="font-medium">{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-tr from-purple-600 to-pink-600 rounded-[2.5rem] rotate-3 opacity-20 blur-2xl" />
              <div className="relative glass-card rounded-[2.5rem] p-10 border border-white/20 shadow-2xl text-center">
                <div className="mb-8">
                  <div className="h-20 w-20 mx-auto rounded-full bg-purple-500/10 flex items-center justify-center mb-6">
                    <Sparkles className="h-10 w-10 text-purple-500" />
                  </div>
                  <h3 className="text-3xl font-display font-bold text-foreground mb-4">Start Hiring Today</h3>
                  <p className="text-muted-foreground text-lg">Create your account and find your next team member in minutes.</p>
                </div>

                <div className="space-y-4 max-w-sm mx-auto">
                  <Button size="xl" className="w-full h-14 rounded-full btn-primary-glow text-lg font-bold" asChild>
                    <Link to="/auth">
                      Create Recruiter Account
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

