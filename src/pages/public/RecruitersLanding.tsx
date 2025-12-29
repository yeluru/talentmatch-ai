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
  BarChart3
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
    },
    {
      icon: Layers,
      title: 'Pipeline Management',
      description: 'Track candidates through every stage of your hiring process with a visual, intuitive pipeline interface.',
    },
    {
      icon: Mail,
      title: 'Outreach Campaigns',
      description: 'Create personalized email sequences to engage passive candidates and nurture talent relationships.',
    },
    {
      icon: Search,
      title: 'Talent Sourcing',
      description: 'Access a vast talent pool and use advanced filters to find candidates that match your exact requirements.',
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
    <div className="min-h-screen bg-background">
      <SEOHead 
        title="For Recruiters | TalentMatch"
        description="Find and hire top talent faster with intelligent candidate matching, pipeline management, and outreach automation. Transform your recruitment process."
        keywords="recruiting, hiring, talent acquisition, candidate matching, ATS, recruitment software"
      />
      
      <Navbar />

      {/* Hero */}
      <section className="relative min-h-[80vh] flex items-center pt-24">
        {/* Background with recruiter accent */}
        <div className="absolute inset-0 bg-gradient-to-br from-recruiter/5 via-background to-recruiter/10 -z-10" />
        <div className="absolute top-1/3 right-0 w-[600px] h-[600px] bg-recruiter/10 rounded-full blur-3xl -z-10" />
        
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-recruiter/10 text-recruiter mb-6">
                <Sparkles className="h-4 w-4" />
                <span className="text-sm font-medium">For Talent Acquisition</span>
              </div>
              
              <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 leading-[1.1]">
                Hire Smarter,{' '}
                <span className="text-recruiter">Not Harder</span>
              </h1>
              
              <p className="text-lg text-muted-foreground mb-8 max-w-lg">
                Transform your recruitment process with intelligent matching, automated sourcing, 
                and powerful pipeline management tools.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <Button size="lg" variant="recruiter" asChild>
                  <Link to="/auth">
                    Start Hiring Free
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link to="/auth">
                    <Users className="mr-2 h-5 w-5" />
                    View Talent Pool
                  </Link>
                </Button>
              </div>
            </div>
            
            {/* Visual element */}
            <div className="relative hidden lg:block">
              <div className="absolute inset-0 bg-gradient-to-br from-recruiter/20 to-recruiter/5 rounded-3xl blur-2xl" />
              <div className="relative bg-card rounded-3xl border shadow-2xl p-8">
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Active Candidates</div>
                      <div className="text-3xl font-display font-bold">247</div>
                    </div>
                    <div className="h-12 w-12 rounded-xl bg-recruiter/10 flex items-center justify-center">
                      <Users className="h-6 w-6 text-recruiter" />
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    {['Screening', 'Interview', 'Offer', 'Hired'].map((stage, i) => (
                      <div key={stage} className="flex items-center gap-3">
                        <div className="text-sm text-muted-foreground w-20">{stage}</div>
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-recruiter rounded-full" 
                            style={{ width: `${[85, 65, 40, 25][i]}%` }} 
                          />
                        </div>
                        <div className="text-sm font-medium w-8">{[142, 67, 28, 10][i]}</div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="pt-4 border-t flex items-center gap-4">
                    <div className="flex-1">
                      <div className="text-sm text-muted-foreground">Avg. Time to Hire</div>
                      <div className="text-xl font-display font-bold text-recruiter">12 days</div>
                    </div>
                    <div className="flex-1">
                      <div className="text-sm text-muted-foreground">Fill Rate</div>
                      <div className="text-xl font-display font-bold text-success">94%</div>
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
              Powerful Recruiting Tools
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Everything you need to find, engage, and hire the best talent for your team.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature) => (
              <div key={feature.title} className="feature-card">
                <div className="h-12 w-12 rounded-xl bg-recruiter/10 flex items-center justify-center mb-4">
                  <feature.icon className="h-6 w-6 text-recruiter" />
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
              Streamlined Hiring Process
            </h2>
            <p className="text-muted-foreground text-lg">
              From job posting to offer acceptance in record time
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {steps.map((step, index) => (
              <div key={step.number} className="relative">
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-8 left-full w-full h-0.5 bg-gradient-to-r from-recruiter/50 to-transparent -translate-x-1/2" />
                )}
                <div className="text-center">
                  <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-recruiter text-white font-display text-xl font-bold mb-4">
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
                Recruit Like a Pro
              </h2>
              <p className="text-muted-foreground text-lg mb-8">
                Join leading companies who have transformed their hiring with TalentMatch.
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
              <h3 className="font-display text-xl font-semibold mb-6">Start Recruiting Today</h3>
              <div className="space-y-4">
                <Button size="lg" variant="recruiter" className="w-full" asChild>
                  <Link to="/auth">
                    Create Recruiter Account
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
                <p className="text-center text-sm text-muted-foreground">
                  Already have an account?{' '}
                  <Link to="/auth" className="text-recruiter hover:underline">
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
