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
  MessageSquare
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

  const howItHelps = [
    {
      icon: FileText,
      title: 'Resume Analysis',
      description: 'Upload your resume and get actionable feedback on how to improve it. See which skills are missing for jobs you want.',
    },
    {
      icon: Search,
      title: 'Smart Job Matching',
      description: 'Instead of scrolling through hundreds of listings, see jobs ranked by how well they fit your experience.',
    },
    {
      icon: Clock,
      title: 'Save Time Sourcing',
      description: 'Recruiters can filter candidates by skills, experience, and availability instead of reading every application.',
    },
    {
      icon: MessageSquare,
      title: 'Better Communication',
      description: 'Keep all candidate conversations and notes in one place. No more lost emails or spreadsheets.',
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <SEOHead 
        title="TalentMatch - A Better Way to Match Talent with Jobs"
        description="A recruitment platform that helps candidates find relevant jobs and helps recruiters find qualified candidates. Resume analysis, job matching, and pipeline management."
        keywords="recruitment, job search, resume analysis, hiring platform, candidate matching"
      />
      
      <Navbar />

      {/* Hero */}
      <section className="pt-28 md:pt-32 pb-16 md:pb-24 hero-gradient border-b">
        <div className="container mx-auto px-4 relative">
          <div className="mx-auto max-w-5xl">
            <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
              <div className="text-center lg:text-left">
                <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-white/80">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent ai-pulse" />
                  AI-powered recruiting + candidate coaching
                </p>

                <h1 className="mt-5 text-balance text-4xl sm:text-5xl lg:text-6xl font-display font-bold tracking-tight text-white">
                  Hire faster. Apply smarter.{" "}
                  <span className="text-accent">Stay in control.</span>
                </h1>

                <p className="mt-5 text-balance text-lg sm:text-xl leading-relaxed text-white/80">
                  TalentMatch helps candidates understand their resume gaps against real job requirements, and helps hiring teams find the
                  best-fit talent without drowning in noise.
                </p>

                <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
                  <Button size="lg" className="btn-glow" asChild>
                    <Link to={user ? getDashboardLink() : '/auth'}>
                      {user ? 'Go to Dashboard' : "Get Started — It's Free"}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                  <Button size="lg" variant="outline" className="bg-white/5 border-white/20 text-white hover:bg-white/10" asChild>
                    <Link to="/recruiters">See recruiter workflow</Link>
                  </Button>
                </div>

                <div className="mt-7 flex flex-wrap items-center justify-center gap-3 text-sm text-white/70 lg:justify-start">
                  {[
                    'Invite-only staff onboarding',
                    'Tenant isolation (RLS)',
                    'Platform audit logs',
                  ].map((t) => (
                    <span key={t} className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1">
                      <CheckCircle2 className="h-4 w-4 text-accent" />
                      {t}
                    </span>
                  ))}
                </div>
              </div>

              {/* Visual / proof card */}
              <div className="relative">
                <div className="glass rounded-3xl p-5 md:p-7 border-white/15">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">Today’s focus</p>
                      <p className="text-xs text-muted-foreground">A clean pipeline + clear insights</p>
                    </div>
                    <div className="h-9 w-9 rounded-xl bg-accent/15 flex items-center justify-center">
                      <Sparkles className="h-5 w-5 text-accent" />
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <div className="card-elevated p-4">
                      <p className="text-xs font-medium text-muted-foreground">Candidates scored</p>
                      <p className="mt-1 text-2xl font-display font-bold">128</p>
                      <p className="mt-1 text-xs text-muted-foreground">Top matches surfaced first</p>
                    </div>
                    <div className="card-elevated p-4">
                      <p className="text-xs font-medium text-muted-foreground">Time saved / req</p>
                      <p className="mt-1 text-2xl font-display font-bold">3.4h</p>
                      <p className="mt-1 text-xs text-muted-foreground">Less screening, more conversations</p>
                    </div>
                    <div className="card-elevated p-4 md:col-span-2">
                      <p className="text-xs font-medium text-muted-foreground">Candidate coaching</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Resume check highlights missing skills and recommends improvements—without rewriting your story.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {['Matched: React', 'Matched: Postgres', 'Missing: RLS', 'Missing: React Query'].map((b) => (
                          <span key={b} className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                            {b}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[32px] bg-accent/10 blur-3xl" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* What this app actually does */}
      <section className="section-container">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-4">
              Here's what TalentMatch actually does
            </h2>
            <p className="text-muted-foreground text-lg">
              No vague promises. These are the specific problems we help solve.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {howItHelps.map((item) => (
              <div key={item.title} className="feature-card">
                <div className="flex items-start gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <item.icon className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-display font-semibold text-foreground mb-2 text-lg">{item.title}</h3>
                    <p className="text-muted-foreground leading-relaxed">{item.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Audience Cards */}
      <section className="section-container bg-muted/30 border-y">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-4">
              Built for three types of users
            </h2>
            <p className="text-muted-foreground text-lg">
              Pick your path based on what you need.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Candidates */}
            <Link to="/candidates" className="group">
              <div className="card-interactive bg-card border rounded-2xl p-6 h-full hover:border-candidate/50">
                <div className="h-12 w-12 rounded-2xl bg-candidate/10 flex items-center justify-center mb-4">
                  <Users className="h-6 w-6 text-candidate" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">I'm looking for a job</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  Upload your resume, see how it matches against real jobs, and track your applications.
                </p>
                <ul className="space-y-2 mb-4">
                  {['Get resume feedback', 'Find matching jobs', 'Track applications'].map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-4 w-4 text-candidate flex-shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <span className="inline-flex items-center text-sm font-medium text-candidate">
                  Learn more <ArrowRight className="h-4 w-4 ml-1" />
                </span>
              </div>
            </Link>

            {/* Recruiters */}
            <Link to="/recruiters" className="group">
              <div className="card-interactive bg-card border rounded-2xl p-6 h-full hover:border-recruiter/50">
                <div className="h-12 w-12 rounded-2xl bg-recruiter/10 flex items-center justify-center mb-4">
                  <Briefcase className="h-6 w-6 text-recruiter" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">I'm hiring people</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  Post jobs, search for candidates, and manage your hiring pipeline without the chaos.
                </p>
                <ul className="space-y-2 mb-4">
                  {['Search by skills', 'Manage pipeline', 'Send outreach'].map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-4 w-4 text-recruiter flex-shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <span className="inline-flex items-center text-sm font-medium text-recruiter">
                  Learn more <ArrowRight className="h-4 w-4 ml-1" />
                </span>
              </div>
            </Link>

            {/* Account Managers */}
            <Link to="/managers" className="group">
              <div className="card-interactive bg-card border rounded-2xl p-6 h-full hover:border-manager/50">
                <div className="h-12 w-12 rounded-2xl bg-manager/10 flex items-center justify-center mb-4">
                  <BarChart3 className="h-6 w-6 text-manager" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">I manage a team</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  See how your recruiting team is performing and where the bottlenecks are.
                </p>
                <ul className="space-y-2 mb-4">
                  {['Team performance', 'Hiring metrics', 'Pipeline reports'].map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-4 w-4 text-manager flex-shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <span className="inline-flex items-center text-sm font-medium text-manager">
                  Learn more <ArrowRight className="h-4 w-4 ml-1" />
                </span>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* Simple CTA */}
      <section className="section-container">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-5xl">
            <div className="relative overflow-hidden rounded-3xl border bg-card p-8 md:p-12">
              <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
              <div className="absolute -left-24 -bottom-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
              <div className="relative grid gap-8 md:grid-cols-2 md:items-center">
                <div>
                  <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-3">
                    Ready to try it?
                  </h2>
                  <p className="text-muted-foreground text-lg">
                    Create a free account and see if it helps. No credit card required.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 md:justify-end">
                  <Button size="lg" className="btn-glow" asChild>
                    <Link to="/auth">
                      Create Free Account
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                  <Button size="lg" variant="outline" asChild>
                    <Link to="/terms">Read Terms</Link>
                  </Button>
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
