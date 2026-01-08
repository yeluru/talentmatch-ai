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
  Clock
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
    },
    {
      icon: TrendingUp,
      title: 'Hiring Metrics',
      description: 'Monitor time-to-fill, cost-per-hire, and quality-of-hire across all positions and departments.',
    },
    {
      icon: PieChart,
      title: 'Pipeline Visibility',
      description: 'Get a bird\'s eye view of all active searches, bottlenecks, and opportunities for improvement.',
    },
    {
      icon: Shield,
      title: 'Compliance & Security',
      description: 'Ensure hiring practices meet regulatory requirements with audit trails and compliance reporting.',
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
    <div className="min-h-screen bg-background">
      <SEOHead 
        title="For Account Managers | TalentMatch"
        description="Get complete visibility into your hiring operations with analytics, team management, and performance insights. Make data-driven recruitment decisions."
        keywords="hiring manager, recruitment analytics, team management, hiring metrics, HR dashboard"
      />
      
      <Navbar />

      {/* Hero */}
      <section className="relative min-h-[80vh] flex items-center pt-24">
        {/* Background with manager accent */}
        <div className="absolute inset-0 bg-gradient-to-br from-manager/5 via-background to-manager/10 -z-10" />
        <div className="absolute top-1/3 right-0 w-[600px] h-[600px] bg-manager/10 rounded-full blur-3xl -z-10" />
        
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-manager/10 text-manager mb-6">
                <Sparkles className="h-4 w-4" />
                <span className="text-sm font-medium">For Account Managers</span>
              </div>
              
              <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 leading-[1.1]">
                Lead with{' '}
                <span className="text-manager">Data-Driven</span> Insights
              </h1>
              
              <p className="text-lg text-muted-foreground mb-8 max-w-lg">
                Get complete visibility into your hiring operations. Track performance, 
                optimize processes, and make strategic decisions with confidence.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <Button size="lg" variant="manager" asChild>
                  <Link to="/auth">
                    Get Started
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link to="/auth">
                    <BarChart3 className="mr-2 h-5 w-5" />
                    View Demo
                  </Link>
                </Button>
              </div>
            </div>
            
            {/* Visual element - Dashboard preview */}
            <div className="relative hidden lg:block">
              <div className="absolute inset-0 bg-gradient-to-br from-manager/20 to-manager/5 rounded-3xl blur-2xl" />
              <div className="relative bg-card rounded-3xl border shadow-2xl p-8">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-display text-lg font-semibold">Hiring Overview</h3>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>Last 30 days</span>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 mb-6">
                  {metrics.map((metric) => (
                    <div key={metric.label} className="bg-muted/50 rounded-xl p-4">
                      <div className="text-sm text-muted-foreground mb-1">{metric.label}</div>
                      <div className="flex items-end gap-2">
                        <span className="text-2xl font-display font-bold">{metric.value}</span>
                        <span className="text-xs text-success font-medium pb-1">{metric.trend}</span>
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium">Team Performance</span>
                    <span className="text-xs text-muted-foreground">View all</span>
                  </div>
                  <div className="space-y-2">
                    {[
                      { name: 'Sarah Chen', hires: 8, color: 'bg-manager' },
                      { name: 'Marcus Johnson', hires: 6, color: 'bg-manager/80' },
                      { name: 'Emily Rodriguez', hires: 5, color: 'bg-manager/60' },
                    ].map((recruiter) => (
                      <div key={recruiter.name} className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                          {recruiter.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium">{recruiter.name}</div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1">
                            <div className={`h-full ${recruiter.color} rounded-full`} style={{ width: `${recruiter.hires * 12}%` }} />
                          </div>
                        </div>
                        <span className="text-sm font-medium">{recruiter.hires} hires</span>
                      </div>
                    ))}
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
              Complete Hiring Visibility
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Monitor, measure, and optimize every aspect of your recruitment operation.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature) => (
              <div key={feature.title} className="feature-card">
                <div className="h-12 w-12 rounded-xl bg-manager/10 flex items-center justify-center mb-4">
                  <feature.icon className="h-6 w-6 text-manager" />
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
              Set Up in Minutes
            </h2>
            <p className="text-muted-foreground text-lg">
              Get your team up and running quickly with our intuitive platform
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {steps.map((step, index) => (
              <div key={step.number} className="relative">
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-8 left-full w-full h-0.5 bg-gradient-to-r from-manager/50 to-transparent -translate-x-1/2" />
                )}
                <div className="text-center">
                  <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-manager text-white font-display text-xl font-bold mb-4">
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
                Make Better Hiring Decisions
              </h2>
              <p className="text-muted-foreground text-lg mb-8">
                Empower your team with the insights they need to build world-class organizations.
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
              <h3 className="font-display text-xl font-semibold mb-6">Get Started as a Manager</h3>
              <div className="space-y-4">
                <Button size="lg" variant="manager" className="w-full" asChild>
                  <Link to="/auth">
                    Create Manager Account
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
                <p className="text-center text-sm text-muted-foreground">
                  Already have an account?{' '}
                  <Link to="/auth" className="text-manager hover:underline">
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
