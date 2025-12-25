import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Briefcase, Users, Sparkles, Clock, PlusCircle, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function RecruiterDashboard() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold">Recruiter Dashboard</h1>
            <p className="text-muted-foreground mt-1">Manage your jobs and candidates</p>
          </div>
          <Button asChild>
            <Link to="/recruiter/jobs/new">
              <PlusCircle className="mr-2 h-4 w-4" /> Post a Job
            </Link>
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Open Jobs" value="8" icon={Briefcase} />
          <StatCard title="Total Candidates" value="156" change="+23 this week" changeType="positive" icon={Users} />
          <StatCard title="Avg. Match Score" value="76%" icon={Sparkles} />
          <StatCard title="Avg. Time to Hire" value="18 days" icon={Clock} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>AI Candidate Matching</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Let AI find the best candidates for your open positions automatically.
              </p>
              <Button asChild>
                <Link to="/recruiter/ai-matching">
                  Find Matches <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Applications</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Review new applications and manage your hiring pipeline.
              </p>
              <Button variant="outline" asChild>
                <Link to="/recruiter/candidates">
                  View Candidates <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}