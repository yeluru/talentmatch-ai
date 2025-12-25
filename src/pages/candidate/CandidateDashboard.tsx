import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { FileText, Briefcase, Sparkles, TrendingUp, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function CandidateDashboard() {
  const { profile } = useAuth();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold">
            Welcome back, {profile?.full_name?.split(' ')[0] || 'there'}! 👋
          </h1>
          <p className="text-muted-foreground mt-1">
            Here's your job search overview
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Profile Completeness"
            value="75%"
            change="Add skills to boost"
            icon={TrendingUp}
          />
          <StatCard
            title="Applications"
            value="12"
            change="+3 this week"
            changeType="positive"
            icon={Briefcase}
          />
          <StatCard
            title="Resume Views"
            value="48"
            change="+12 this week"
            changeType="positive"
            icon={FileText}
          />
          <StatCard
            title="AI Match Score"
            value="82%"
            change="Excellent fit"
            changeType="positive"
            icon={Sparkles}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-accent" />
                AI Resume Check
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Get instant AI-powered feedback on your resume. See how well you match job descriptions and get suggestions to improve.
              </p>
              <Button asChild>
                <Link to="/candidate/ai-analysis">
                  Analyze My Resume <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recommended Jobs</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Based on your profile, we found jobs that match your skills and experience.
              </p>
              <Button variant="outline" asChild>
                <Link to="/candidate/jobs">
                  Browse Jobs <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}