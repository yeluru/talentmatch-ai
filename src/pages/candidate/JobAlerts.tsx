import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Loader2, Bell, Plus, Trash2, Edit2, MapPin, Briefcase, Clock } from 'lucide-react';

interface JobAlert {
  id: string;
  name: string;
  keywords: string[] | null;
  locations: string[] | null;
  job_types: string[] | null;
  frequency: string | null;
  is_active: boolean | null;
  last_sent_at: string | null;
}

export default function JobAlerts() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<JobAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAlert, setEditingAlert] = useState<JobAlert | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    keywords: '',
    locations: '',
    job_types: [] as string[],
    frequency: 'daily'
  });

  useEffect(() => {
    if (user) {
      fetchAlerts();
    }
  }, [user]);

  const fetchAlerts = async () => {
    try {
      const { data, error } = await supabase
        .from('job_alerts')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAlerts(data || []);
    } catch (error) {
      console.error('Error fetching alerts:', error);
      toast.error('Failed to load job alerts');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error('Please enter an alert name');
      return;
    }

    try {
      const alertData = {
        user_id: user!.id,
        name: formData.name,
        keywords: formData.keywords ? formData.keywords.split(',').map(k => k.trim()).filter(Boolean) : null,
        locations: formData.locations ? formData.locations.split(',').map(l => l.trim()).filter(Boolean) : null,
        job_types: formData.job_types.length > 0 ? formData.job_types : null,
        frequency: formData.frequency,
        is_active: true
      };

      if (editingAlert) {
        const { error } = await supabase
          .from('job_alerts')
          .update(alertData)
          .eq('id', editingAlert.id);
        if (error) throw error;
        toast.success('Alert updated');
      } else {
        const { error } = await supabase
          .from('job_alerts')
          .insert([alertData]);
        if (error) throw error;
        toast.success('Alert created');
      }

      setIsDialogOpen(false);
      resetForm();
      fetchAlerts();
    } catch (error) {
      console.error('Error saving alert:', error);
      toast.error('Failed to save alert');
    }
  };

  const toggleAlert = async (alert: JobAlert) => {
    try {
      const { error } = await supabase
        .from('job_alerts')
        .update({ is_active: !alert.is_active })
        .eq('id', alert.id);
      if (error) throw error;
      fetchAlerts();
    } catch (error) {
      console.error('Error toggling alert:', error);
      toast.error('Failed to update alert');
    }
  };

  const deleteAlert = async (id: string) => {
    try {
      const { error } = await supabase
        .from('job_alerts')
        .delete()
        .eq('id', id);
      if (error) throw error;
      toast.success('Alert deleted');
      fetchAlerts();
    } catch (error) {
      console.error('Error deleting alert:', error);
      toast.error('Failed to delete alert');
    }
  };

  const editAlert = (alert: JobAlert) => {
    setEditingAlert(alert);
    setFormData({
      name: alert.name,
      keywords: alert.keywords?.join(', ') || '',
      locations: alert.locations?.join(', ') || '',
      job_types: alert.job_types || [],
      frequency: alert.frequency || 'daily'
    });
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setEditingAlert(null);
    setFormData({
      name: '',
      keywords: '',
      locations: '',
      job_types: [],
      frequency: 'daily'
    });
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" strokeWidth={1.5} />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 w-full">
        <div className="shrink-0 flex flex-col gap-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20">
                  <Bell className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground">
                  Job <span className="text-gradient-candidate">Alerts</span>
                </h1>
              </div>
              <p className="text-lg text-muted-foreground font-sans">
                Get notified when new jobs match your criteria.
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
            <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button className="rounded-lg shadow-lg h-11 px-6 border border-blue-500/20 bg-blue-500/10 hover:bg-blue-500/20 text-blue-700 dark:text-blue-300 font-sans font-semibold">
                  <Plus className="mr-2 h-5 w-5" strokeWidth={1.5} />
                  Create New Alert
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md max-w-full rounded-xl border border-border bg-card">
                <DialogHeader>
                  <DialogTitle className="font-display text-xl font-bold">{editingAlert ? 'Edit Alert' : 'Create Job Alert'}</DialogTitle>
                </DialogHeader>
                <div className="space-y-5 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-sm font-sans font-medium text-muted-foreground">Alert Name</Label>
                    <Input
                      id="name"
                      placeholder="e.g., Senior React Developer"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="rounded-lg border-border bg-background h-11 focus:ring-2 focus:ring-blue-500/20 font-sans"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="keywords" className="text-sm font-sans font-medium text-muted-foreground">Keywords (comma separated)</Label>
                    <Input
                      id="keywords"
                      placeholder="e.g., React, TypeScript, Remote"
                      value={formData.keywords}
                      onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                      className="rounded-lg border-border bg-background h-11 focus:ring-2 focus:ring-blue-500/20 font-sans"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="locations" className="text-sm font-sans font-medium text-muted-foreground">Locations (comma separated)</Label>
                    <Input
                      id="locations"
                      placeholder="e.g., New York, San Francisco"
                      value={formData.locations}
                      onChange={(e) => setFormData({ ...formData, locations: e.target.value })}
                      className="rounded-lg border-border bg-background h-11 focus:ring-2 focus:ring-blue-500/20 font-sans"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="frequency" className="text-sm font-sans font-medium text-muted-foreground">Notification Frequency</Label>
                    <Select value={formData.frequency} onValueChange={(v) => setFormData({ ...formData, frequency: v })}>
                      <SelectTrigger className="rounded-lg border-border bg-background h-11 focus:ring-2 focus:ring-blue-500/20 font-sans">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="instant">Instant</SelectItem>
                        <SelectItem value="daily">Daily Digest</SelectItem>
                        <SelectItem value="weekly">Weekly Digest</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleSubmit} className="w-full rounded-lg h-11 border border-blue-500/20 bg-blue-500/10 hover:bg-blue-500/20 text-blue-700 dark:text-blue-300 font-sans font-semibold">
                    {editingAlert ? 'Update Alert' : 'Create Alert'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-6 pt-6 pb-6">
          {alerts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-blue-500/20 bg-blue-500/5 p-12 flex flex-col items-center justify-center text-center transition-all hover:bg-blue-500/10">
              <div className="h-20 w-20 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-6">
                <Bell className="h-10 w-10 text-blue-500" strokeWidth={1.5} />
              </div>
              <h3 className="text-2xl font-display font-bold text-foreground mb-2">No job alerts yet</h3>
              <p className="text-muted-foreground font-sans mb-8 max-w-md text-base">
                Create an alert to get notified about new jobs that match your criteria. We'll email you matches.
              </p>
              <Button onClick={() => setIsDialogOpen(true)} variant="outline" className="rounded-lg border border-blue-500/20 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 font-sans font-semibold">
                <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
                Create First Alert
              </Button>
            </div>
          ) : (
            <div className="grid gap-4">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className="group rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-blue-500/30 hover:bg-blue-500/5 hover:shadow-md focus-within:ring-2 focus-within:ring-blue-500/30 focus-within:ring-offset-2 focus-within:outline-none"
                >
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-3">
                        <h3 className="font-display text-xl font-bold text-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{alert.name}</h3>
                        <Badge variant={alert.is_active ? 'default' : 'secondary'} className="uppercase tracking-wider text-xs font-sans border-blue-500/20">
                          {alert.is_active ? 'Active' : 'Paused'}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {/* Keywords */}
                        {alert.keywords?.map((keyword, i) => (
                          <Badge key={`k-${i}`} variant="secondary" className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 font-sans">
                            {keyword}
                          </Badge>
                        ))}
                        {/* Locations */}
                        {alert.locations?.map((location, i) => (
                          <Badge key={`l-${i}`} variant="outline" className="border-border font-sans">
                            <MapPin className="mr-1 h-3 w-3 text-muted-foreground" strokeWidth={1.5} />
                            {location}
                          </Badge>
                        ))}
                      </div>

                      <div className="flex items-center gap-2 text-sm font-sans text-muted-foreground">
                        <Clock className="h-4 w-4" strokeWidth={1.5} />
                        <span>
                          {alert.frequency === 'instant' ? 'Instant notifications' :
                            alert.frequency === 'daily' ? 'Daily digest' : 'Weekly digest'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2 md:pt-0 border-t border-border md:border-t-0 mt-2 md:mt-0">
                      <div className="flex items-center gap-2 mr-2">
                        <Label htmlFor={`alert-switch-${alert.id}`} className="text-xs font-sans uppercase font-semibold text-muted-foreground hidden md:block">
                          {alert.is_active ? 'On' : 'Off'}
                        </Label>
                        <Switch
                          id={`alert-switch-${alert.id}`}
                          checked={alert.is_active || false}
                          onCheckedChange={() => toggleAlert(alert)}
                          className="data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500"
                        />
                      </div>
                      <Separator orientation="vertical" className="h-8 bg-border hidden md:block mx-1" />
                      <Button variant="ghost" size="icon" onClick={() => editAlert(alert)} className="rounded-lg hover:bg-blue-500/10 hover:text-blue-600 dark:hover:text-blue-400">
                        <Edit2 className="h-4 w-4" strokeWidth={1.5} />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteAlert(alert.id)} className="rounded-lg hover:bg-red-500/10 hover:text-red-500">
                        <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
