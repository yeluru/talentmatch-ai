import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { 
  ArrowRight, 
  Users, 
  Briefcase, 
  BarChart3, 
  CheckCircle2,
  Target,
  Zap,
  Shield,
  TrendingUp
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
    return '/manager';
  };

  const features = [
    {
      icon: Target,
      title: 'Precision Matching',
      description: 'Advanced algorithms analyze skills, experience, and culture fit to connect the right candidates with the right opportunities.',
    },
    {
      icon: Zap,
      title: 'Instant Analysis',
      description: 'Get comprehensive resume feedback and job compatibility scores in seconds, not hours.',
    },
    {
      icon: Shield,
      title: 'Enterprise Security',
      description: 'Bank-level encryption and compliance with global data protection standards keep your information safe.',
    },
    {
      icon: TrendingUp,
      title: 'Data-Driven Insights',
      description: 'Make smarter hiring decisions with real-time analytics and market intelligence.',
    },
  ];

  const stats = [
    { value: '50K+', label: 'Successful Placements' },
    { value: '98%', label: 'Match Accuracy' },
    { value: '3x', label: 'Faster Hiring' },
    { value: '500+', label: 'Companies Trust Us' },
  ];

  return (
    <div className="min-h-screen bg-background">
      <SEOHead 
        title="TalentMatch - Intelligent Talent Matching Platform"
        description="Connect top talent with great opportunities through intelligent matching. Smart resume analysis, automated sourcing, and data-driven insights for candidates, recruiters, and managers."
        keywords="recruitment, talent matching, resume analysis, ATS, applicant tracking, hiring platform"
      />
      
      <Navbar />

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center hero-gradient text-white overflow-hidden">
        {/* Background elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-pulse-subtle" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/20 rounded-full blur-3xl animate-pulse-subtle animation-delay-500" />
        </div>
        
        <div className="container mx-auto px-4 pt-32 pb-20 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/20 mb-8 backdrop-blur-sm animate-fade-in">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
              </span>
              <span className="text-sm font-medium">Intelligent Recruitment Platform</span>
            </div>
            
            {/* Headline */}
            <h1 className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold mb-6 leading-[1.1] animate-fade-in animation-delay-100">
              Find the Perfect Match,{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-purple-200 to-purple-300">
                Every Time
              </span>
            </h1>
            
            {/* Subheadline */}
            <p className="text-lg sm:text-xl text-white/70 mb-10 max-w-2xl mx-auto leading-relaxed animate-fade-in animation-delay-200">
              Connect top talent with great opportunities through intelligent matching. 
              Smart resume analysis, automated sourcing, and data-driven insights.
            </p>
            
            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in animation-delay-300">
              <Button size="xl" variant="hero-primary" asChild>
                <Link to={user ? getDashboardLink() : '/auth'}>
                  {user ? 'Go to Dashboard' : 'Get Started Free'}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button size="xl" variant="hero-secondary" asChild>
                <Link to="/candidates">
                  Explore Platform
                </Link>
              </Button>
            </div>
          </div>
          
          {/* Stats */}
          <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-8 max-w-3xl mx-auto animate-fade-in animation-delay-400">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="font-display text-3xl sm:text-4xl font-bold text-white mb-1">
                  {stat.value}
                </div>
                <div className="text-sm text-white/60">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
        
        {/* Bottom gradient fade */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
      </section>

      {/* Audience Cards */}
      <section className="section-container relative -mt-16 z-20">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
            {/* Candidates */}
            <Link to="/candidates" className="group">
              <div className="card-elevated p-8 h-full hover:border-candidate/50">
                <div className="h-14 w-14 rounded-2xl bg-candidate/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <Users className="h-7 w-7 text-candidate" />
                </div>
                <h3 className="font-display text-xl font-semibold mb-3">For Candidates</h3>
                <p className="text-muted-foreground mb-6">
                  Build your profile, get resume feedback, and find jobs that match your skills and goals.
                </p>
                <ul className="space-y-2 mb-6">
                  {['Resume Analysis', 'Job Matching', 'Application Tracking'].map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <span className="inline-flex items-center text-sm font-medium text-candidate group-hover:gap-2 transition-all">
                  Learn more <ArrowRight className="h-4 w-4 ml-1" />
                </span>
              </div>
            </Link>

            {/* Recruiters */}
            <Link to="/recruiters" className="group">
              <div className="card-elevated p-8 h-full hover:border-recruiter/50">
                <div className="h-14 w-14 rounded-2xl bg-recruiter/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <Briefcase className="h-7 w-7 text-recruiter" />
                </div>
                <h3 className="font-display text-xl font-semibold mb-3">For Recruiters</h3>
                <p className="text-muted-foreground mb-6">
                  Post jobs, source candidates efficiently, and manage your hiring pipeline with ease.
                </p>
                <ul className="space-y-2 mb-6">
                  {['Candidate Matching', 'Pipeline Management', 'Outreach Campaigns'].map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <span className="inline-flex items-center text-sm font-medium text-recruiter group-hover:gap-2 transition-all">
                  Learn more <ArrowRight className="h-4 w-4 ml-1" />
                </span>
              </div>
            </Link>

            {/* Managers */}
            <Link to="/managers" className="group">
              <div className="card-elevated p-8 h-full hover:border-manager/50">
                <div className="h-14 w-14 rounded-2xl bg-manager/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <BarChart3 className="h-7 w-7 text-manager" />
                </div>
                <h3 className="font-display text-xl font-semibold mb-3">For Managers</h3>
                <p className="text-muted-foreground mb-6">
                  Get full visibility into team performance with analytics, metrics, and reporting.
                </p>
                <ul className="space-y-2 mb-6">
                  {['Team Analytics', 'Hiring Metrics', 'Performance Insights'].map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <span className="inline-flex items-center text-sm font-medium text-manager group-hover:gap-2 transition-all">
                  Learn more <ArrowRight className="h-4 w-4 ml-1" />
                </span>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="section-container">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="font-display text-3xl sm:text-4xl font-bold mb-4">
              Why Teams Choose TalentMatch
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Built for modern recruitment teams who value efficiency, accuracy, and great candidate experiences.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature) => (
              <div key={feature.title} className="feature-card">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-display text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="section-container">
        <div className="container mx-auto px-4">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary to-accent p-8 md:p-12 lg:p-16 text-center">
            {/* Background decoration */}
            <div className="absolute inset-0 overflow-hidden">
              <div className="absolute -top-24 -right-24 w-96 h-96 bg-white/10 rounded-full blur-3xl" />
              <div className="absolute -bottom-24 -left-24 w-80 h-80 bg-white/10 rounded-full blur-3xl" />
            </div>
            
            <div className="relative z-10">
              <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4">
                Ready to Transform Your Hiring?
              </h2>
              <p className="text-white/80 text-lg mb-8 max-w-xl mx-auto">
                Join thousands of companies and candidates already using TalentMatch to find their perfect match.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button size="xl" variant="hero-primary" asChild>
                  <Link to="/auth">
                    Start Free Today
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
