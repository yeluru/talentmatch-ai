import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { 
  ArrowRight, 
  Users, 
  Briefcase, 
  BarChart3, 
  CheckCircle2,
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

      {/* Hero Section - Clean and honest */}
      <section className="pt-32 pb-20 bg-background border-b">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl">
            <h1 className="text-4xl sm:text-5xl font-bold text-foreground mb-6 leading-tight">
              Finding the right job—or the right candidate—shouldn't take forever.
            </h1>
            
            <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
              TalentMatch helps candidates understand how their resume stacks up against real job requirements, 
              and helps recruiters quickly find people who actually match what they're looking for.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4">
              <Button size="lg" asChild>
                <Link to={user ? getDashboardLink() : '/auth'}>
                  {user ? 'Go to Dashboard' : "Get Started — It's Free"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/candidates">
                  See How It Works
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* What this app actually does */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-4">
              Here's what TalentMatch actually does
            </h2>
            <p className="text-muted-foreground text-lg">
              No vague promises. These are the specific problems we help solve.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {howItHelps.map((item) => (
              <div key={item.title} className="flex gap-4">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <item.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground mb-2">{item.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Audience Cards */}
      <section className="py-20 bg-muted/30 border-y">
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
              <div className="bg-card border rounded-lg p-6 h-full hover:border-candidate/50 hover:shadow-sm transition-all">
                <div className="h-12 w-12 rounded-lg bg-candidate/10 flex items-center justify-center mb-4">
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
              <div className="bg-card border rounded-lg p-6 h-full hover:border-recruiter/50 hover:shadow-sm transition-all">
                <div className="h-12 w-12 rounded-lg bg-recruiter/10 flex items-center justify-center mb-4">
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

            {/* Managers */}
            <Link to="/managers" className="group">
              <div className="bg-card border rounded-lg p-6 h-full hover:border-manager/50 hover:shadow-sm transition-all">
                <div className="h-12 w-12 rounded-lg bg-manager/10 flex items-center justify-center mb-4">
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
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl font-bold text-foreground mb-4">
              Ready to try it?
            </h2>
            <p className="text-muted-foreground text-lg mb-8">
              Create a free account and see if it helps. No credit card required.
            </p>
            <Button size="lg" asChild>
              <Link to="/auth">
                Create Free Account
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
