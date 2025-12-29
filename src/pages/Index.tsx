import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Users, Briefcase, BarChart3, ArrowRight, CheckCircle2, Sparkles } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { SEOHead } from '@/components/SEOHead';
import logo from '@/assets/logo.png';

export default function Index() {
  const { user, currentRole } = useAuth();

  const getDashboardLink = () => {
    if (!user) return '/auth';
    if (currentRole === 'candidate') return '/candidate';
    if (currentRole === 'recruiter') return '/recruiter';
    return '/manager';
  };

  return (
    <div className="min-h-screen bg-background">
      <SEOHead 
        title="TalentMatch AI - AI-Powered Recruitment Platform"
        description="Transform your hiring process with AI-powered candidate matching, resume analysis, and intelligent talent sourcing. Connect top talent with great opportunities."
        keywords="AI recruitment, talent matching, resume analysis, ATS, applicant tracking system, hiring platform, job matching"
      />
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={logo} alt="TalMatch AI" className="h-10 w-auto" />
          </Link>
          <nav className="flex items-center gap-4">
            {user ? (
              <Button asChild>
                <Link to={getDashboardLink()}>Go to Dashboard</Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" asChild>
                  <Link to="/auth">Sign In</Link>
                </Button>
                <Button asChild>
                  <Link to="/auth">Get Started</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 hero-gradient text-primary-foreground">
        <div className="container mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/20 mb-6">
            <Sparkles className="h-4 w-4" />
            <span className="text-sm font-medium">AI-Powered Recruitment</span>
          </div>
          <h1 className="font-display text-4xl md:text-6xl lg:text-7xl font-bold mb-6 max-w-4xl mx-auto leading-tight">
            Find the Perfect Match with
            <span className="text-accent"> AI Precision</span>
          </h1>
          <p className="text-lg md:text-xl text-primary-foreground/80 mb-8 max-w-2xl mx-auto">
            Connect top talent with great opportunities using our intelligent matching engine. 
            Smart resume analysis, automated sourcing, and data-driven insights.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="bg-accent hover:bg-accent/90 text-accent-foreground" asChild>
              <Link to="/auth">
                Start Free <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="border-white/30 text-white hover:bg-white/10">
              See How It Works
            </Button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
              Three Portals, One Platform
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Whether you're looking for a job, hiring talent, or managing a team, TalentMatch AI has you covered.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-8 rounded-2xl border bg-card card-interactive">
              <div className="h-14 w-14 rounded-xl bg-candidate/10 flex items-center justify-center mb-6">
                <Users className="h-7 w-7 text-candidate" />
              </div>
              <h3 className="font-display text-xl font-bold mb-3">For Candidates</h3>
              <p className="text-muted-foreground mb-4">
                Build your profile, get AI-powered resume feedback, and find jobs that match your skills.
              </p>
              <ul className="space-y-2">
                {['AI Resume Analysis', 'Smart Job Matching', 'Application Tracking'].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-8 rounded-2xl border bg-card card-interactive">
              <div className="h-14 w-14 rounded-xl bg-recruiter/10 flex items-center justify-center mb-6">
                <Briefcase className="h-7 w-7 text-recruiter" />
              </div>
              <h3 className="font-display text-xl font-bold mb-3">For Recruiters</h3>
              <p className="text-muted-foreground mb-4">
                Post jobs, source candidates with AI, and manage your hiring pipeline efficiently.
              </p>
              <ul className="space-y-2">
                {['AI Candidate Matching', 'Pipeline Management', 'Job Board Integration'].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-8 rounded-2xl border bg-card card-interactive">
              <div className="h-14 w-14 rounded-xl bg-manager/10 flex items-center justify-center mb-6">
                <BarChart3 className="h-7 w-7 text-manager" />
              </div>
              <h3 className="font-display text-xl font-bold mb-3">For Managers</h3>
              <p className="text-muted-foreground mb-4">
                Get full visibility into your team's performance with analytics and reporting.
              </p>
              <ul className="space-y-2">
                {['Team Analytics', 'Hiring Metrics', 'Performance Insights'].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12">
        <div className="container mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <img src={logo} alt="TalMatch AI" className="h-10 w-auto" />
          </div>
          <p className="text-muted-foreground text-sm">
            © 2024 TalentMatch AI. AI-Powered Recruitment Platform.
          </p>
        </div>
      </footer>
    </div>
  );
}