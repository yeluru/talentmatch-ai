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
  Sparkles
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
    },
    {
      icon: Target,
      title: 'Smart Job Matching',
      description: 'Our algorithm analyzes your skills, experience, and preferences to recommend jobs that truly fit your career goals.',
    },
    {
      icon: Bell,
      title: 'Real-time Alerts',
      description: 'Never miss an opportunity. Get instant notifications when jobs matching your profile are posted.',
    },
    {
      icon: TrendingUp,
      title: 'Career Insights',
      description: 'Understand your market value with salary insights and skill gap analysis for your target roles.',
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
    <div className="min-h-screen bg-background">
      <SEOHead 
        title="For Candidates | TalentMatch"
        description="Find your dream job with intelligent matching. Get resume analysis, personalized job recommendations, and career insights to land your next opportunity."
        keywords="job search, career, resume analysis, job matching, candidates, job seekers"
      />
      
      <Navbar />

      {/* Hero */}
      <section className="relative min-h-[80vh] flex items-center pt-24">
        {/* Background with candidate accent */}
        <div className="absolute inset-0 bg-gradient-to-br from-candidate/5 via-background to-candidate/10 -z-10" />
        <div className="absolute top-1/3 right-0 w-[600px] h-[600px] bg-candidate/10 rounded-full blur-3xl -z-10" />
        
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-candidate/10 text-candidate mb-6">
                <Sparkles className="h-4 w-4" />
                <span className="text-sm font-medium">For Job Seekers</span>
              </div>
              
              <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 leading-[1.1]">
                Land Your Dream Job{' '}
                <span className="text-candidate">Faster</span>
              </h1>
              
              <p className="text-lg text-muted-foreground mb-8 max-w-lg">
                Get matched with opportunities that fit your skills, experience, and career goals. 
                Our intelligent platform helps you stand out and find your perfect role.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <Button size="lg" variant="candidate" asChild>
                  <Link to="/auth">
                    Create Free Profile
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link to="/auth">
                    <Search className="mr-2 h-5 w-5" />
                    Browse Jobs
                  </Link>
                </Button>
              </div>
            </div>
            
            {/* Visual element */}
            <div className="relative hidden lg:block">
              <div className="absolute inset-0 bg-gradient-to-br from-candidate/20 to-candidate/5 rounded-3xl blur-2xl" />
              <div className="relative bg-card rounded-3xl border shadow-2xl p-8">
                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="h-16 w-16 rounded-2xl bg-candidate/10 flex items-center justify-center">
                      <BarChart3 className="h-8 w-8 text-candidate" />
                    </div>
                    <div>
                      <div className="text-3xl font-display font-bold text-candidate">94%</div>
                      <div className="text-sm text-muted-foreground">Profile Match Score</div>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="h-3 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-candidate rounded-full" style={{ width: '94%' }} />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Skills: 96%</span>
                      <span>Experience: 92%</span>
                      <span>Culture: 90%</span>
                    </div>
                  </div>
                  
                  <div className="pt-4 border-t">
                    <div className="text-sm font-medium mb-3">Top Matched Skills</div>
                    <div className="flex flex-wrap gap-2">
                      {['React', 'TypeScript', 'Node.js', 'AWS', 'Python'].map((skill) => (
                        <span key={skill} className="px-3 py-1 bg-candidate/10 text-candidate text-xs font-medium rounded-full">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="section-container">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="font-display text-3xl sm:text-4xl font-bold mb-4">
              Everything You Need to Succeed
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              From resume optimization to job matching, we provide the tools to accelerate your career.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature) => (
              <div key={feature.title} className="feature-card">
                <div className="h-12 w-12 rounded-xl bg-candidate/10 flex items-center justify-center mb-4">
                  <feature.icon className="h-6 w-6 text-candidate" />
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

      {/* How it works */}
      <section className="section-container bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="font-display text-3xl sm:text-4xl font-bold mb-4">
              How It Works
            </h2>
            <p className="text-muted-foreground text-lg">
              Get started in minutes and find your next opportunity
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {steps.map((step, index) => (
              <div key={step.number} className="relative">
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-8 left-full w-full h-0.5 bg-gradient-to-r from-candidate/50 to-transparent -translate-x-1/2" />
                )}
                <div className="text-center">
                  <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-candidate text-white font-display text-xl font-bold mb-4">
                    {step.number}
                  </div>
                  <h3 className="font-display text-xl font-semibold mb-2">{step.title}</h3>
                  <p className="text-muted-foreground text-sm">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="section-container">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="font-display text-3xl sm:text-4xl font-bold mb-6">
                Your Career, Elevated
              </h2>
              <p className="text-muted-foreground text-lg mb-8">
                Join thousands of professionals who have accelerated their careers with TalentMatch.
              </p>
              
              <ul className="space-y-4">
                {benefits.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
            
            <div className="bg-card rounded-3xl border p-8 shadow-lg">
              <h3 className="font-display text-xl font-semibold mb-6">Create Your Free Account</h3>
              <div className="space-y-4">
                <Button size="lg" variant="candidate" className="w-full" asChild>
                  <Link to="/auth">
                    Get Started Free
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
                <p className="text-center text-sm text-muted-foreground">
                  Already have an account?{' '}
                  <Link to="/auth" className="text-candidate hover:underline">
                    Sign in
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
