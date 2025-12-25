import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Briefcase, Users, TrendingUp, Clock } from 'lucide-react';

export default function ManagerDashboard() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Account Manager Dashboard</h1>
          <p className="text-muted-foreground mt-1">Organization overview and team performance</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Open Positions" value="24" icon={Briefcase} />
          <StatCard title="Team Members" value="6" icon={Users} />
          <StatCard title="Hire Rate" value="68%" change="+5% from last month" changeType="positive" icon={TrendingUp} />
          <StatCard title="Avg. Time to Fill" value="21 days" change="-3 days improvement" changeType="positive" icon={Clock} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Hiring Pipeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { stage: 'Applied', count: 145, color: 'bg-info' },
                  { stage: 'Reviewed', count: 89, color: 'bg-accent' },
                  { stage: 'Interviewing', count: 34, color: 'bg-warning' },
                  { stage: 'Offered', count: 12, color: 'bg-recruiter' },
                  { stage: 'Hired', count: 8, color: 'bg-success' },
                ].map((item) => (
                  <div key={item.stage} className="flex items-center gap-4">
                    <span className="w-24 text-sm text-muted-foreground">{item.stage}</span>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full ${item.color}`} style={{ width: `${(item.count / 145) * 100}%` }} />
                    </div>
                    <span className="w-12 text-sm font-medium text-right">{item.count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Team Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { name: 'Sarah Chen', hires: 12, active: 8 },
                  { name: 'Mike Johnson', hires: 9, active: 6 },
                  { name: 'Emily Davis', hires: 7, active: 10 },
                ].map((member) => (
                  <div key={member.name} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <span className="font-medium">{member.name}</span>
                    <div className="flex gap-4 text-sm">
                      <span className="text-success">{member.hires} hires</span>
                      <span className="text-muted-foreground">{member.active} active</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}