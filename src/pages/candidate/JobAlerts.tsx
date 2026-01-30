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
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="space-y-6 max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-4xl font-bold tracking-tight text-gradient-premium">Job Alerts</h1>
              <p className="mt-2 text-lg text-muted-foreground/80">
                Get notified when new jobs match your criteria.
              </p>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button className="btn-primary-glow shadow-lg h-12 px-6">
                  <Plus className="mr-2 h-5 w-5" />
                  Create New Alert
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md glass-panel border-white/10">
                <DialogHeader>
                  <DialogTitle className="font-display text-2xl">{editingAlert ? 'Edit Alert' : 'Create Job Alert'}</DialogTitle>
                </DialogHeader>
                <div className="space-y-5 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-base">Alert Name</Label>
                    <Input
                      id="name"
                      placeholder="e.g., Senior React Developer"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="bg-background/50 border-white/10 h-11 focus:ring-accent"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="keywords" className="text-base">Keywords (comma separated)</Label>
                    <Input
                      id="keywords"
                      placeholder="e.g., React, TypeScript, Remote"
                      value={formData.keywords}
                      onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                      className="bg-background/50 border-white/10 h-11 focus:ring-accent"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="locations" className="text-base">Locations (comma separated)</Label>
                    <Input
                      id="locations"
                      placeholder="e.g., New York, San Francisco"
                      value={formData.locations}
                      onChange={(e) => setFormData({ ...formData, locations: e.target.value })}
                      className="bg-background/50 border-white/10 h-11 focus:ring-accent"
                    />
                  </div>
                  {/* Salary filters removed (contracting-first product) */}
                  <div className="space-y-2">
                    <Label htmlFor="frequency" className="text-base">Notification Frequency</Label>
                    <Select value={formData.frequency} onValueChange={(v) => setFormData({ ...formData, frequency: v })}>
                      <SelectTrigger className="bg-background/50 border-white/10 h-11 focus:ring-accent">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="instant">Instant</SelectItem>
                        <SelectItem value="daily">Daily Digest</SelectItem>
                        <SelectItem value="weekly">Weekly Digest</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleSubmit} className="w-full btn-primary-glow h-11">
                    {editingAlert ? 'Update Alert' : 'Create Alert'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {alerts.length === 0 ? (
            <div className="glass-panel p-12 flex flex-col items-center justify-center text-center border-dashed border-2 border-white/20">
              <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
                <Bell className="h-10 w-10 text-primary" />
              </div>
              <h3 className="text-2xl font-bold mb-2">No job alerts yet</h3>
              <p className="text-muted-foreground mb-8 max-w-md text-lg">
                Create an alert to get notified about new jobs that match your criteria. We'll email you matches.
              </p>
              <Button onClick={() => setIsDialogOpen(true)} variant="outline" className="border-primary/20 hover:bg-primary/10 hover:text-primary">
                <Plus className="mr-2 h-4 w-4" />
                Create First Alert
              </Button>
            </div>
          ) : (
            <div className="grid gap-4">
              {alerts.map((alert) => (
                <div key={alert.id} className="glass-panel p-6 animate-in-view transition-all duration-300 hover:bg-white/5">
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-3">
                        <h3 className="font-display text-xl font-bold">{alert.name}</h3>
                        <Badge variant={alert.is_active ? 'default' : 'secondary'} className="uppercase tracking-wider text-xs">
                          {alert.is_active ? 'Active' : 'Paused'}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {/* Keywords */}
                        {alert.keywords?.map((keyword, i) => (
                          <Badge key={`k-${i}`} variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                            {keyword}
                          </Badge>
                        ))}
                        {/* Locations */}
                        {alert.locations?.map((location, i) => (
                          <Badge key={`l-${i}`} variant="outline" className="border-dashed border-white/30">
                            <MapPin className="mr-1 h-3 w-3 text-muted-foreground" />
                            {location}
                          </Badge>
                        ))}
                      </div>

                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span>
                          {alert.frequency === 'instant' ? 'Instant notifications' :
                            alert.frequency === 'daily' ? 'Daily digest' : 'Weekly digest'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2 md:pt-0 border-t border-white/5 md:border-t-0 mt-2 md:mt-0">
                      <div className="flex items-center gap-2 mr-2">
                        <Label htmlFor={`alert-switch-${alert.id}`} className="text-xs uppercase font-semibold text-muted-foreground hidden md:block">
                          {alert.is_active ? 'On' : 'Off'}
                        </Label>
                        <Switch
                          id={`alert-switch-${alert.id}`}
                          checked={alert.is_active || false}
                          onCheckedChange={() => toggleAlert(alert)}
                          className="data-[state=checked]:bg-primary"
                        />
                      </div>
                      <Separator orientation="vertical" className="h-8 bg-white/10 hidden md:block mx-1" />
                      <Button variant="ghost" size="icon" onClick={() => editAlert(alert)} className="hover:bg-white/10 hover:text-accent">
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteAlert(alert.id)} className="hover:bg-red-500/10 hover:text-red-500">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
