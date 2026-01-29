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
import { toast } from 'sonner';
import { Loader2, Bell, Plus, Trash2, Edit2, MapPin, Briefcase } from 'lucide-react';

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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold">Job Alerts</h1>
            <p className="mt-1">Get notified when new jobs match your criteria</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create Alert
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editingAlert ? 'Edit Alert' : 'Create Job Alert'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Alert Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Senior React Developer"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="keywords">Keywords (comma separated)</Label>
                  <Input
                    id="keywords"
                    placeholder="e.g., React, TypeScript, Remote"
                    value={formData.keywords}
                    onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="locations">Locations (comma separated)</Label>
                  <Input
                    id="locations"
                    placeholder="e.g., New York, San Francisco"
                    value={formData.locations}
                    onChange={(e) => setFormData({ ...formData, locations: e.target.value })}
                  />
                </div>
                {/* Salary filters removed (contracting-first product) */}
                <div className="space-y-2">
                  <Label htmlFor="frequency">Notification Frequency</Label>
                  <Select value={formData.frequency} onValueChange={(v) => setFormData({ ...formData, frequency: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="instant">Instant</SelectItem>
                      <SelectItem value="daily">Daily Digest</SelectItem>
                      <SelectItem value="weekly">Weekly Digest</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleSubmit} className="w-full">
                  {editingAlert ? 'Update Alert' : 'Create Alert'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {alerts.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Bell className="h-12 w-12mb-4" />
              <h3 className="text-lg font-semibold mb-2">No job alerts yet</h3>
              <p className="text-center mb-4">
                Create an alert to get notified about new jobs that match your criteria
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {alerts.map((alert) => (
              <Card key={alert.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-lg">{alert.name}</h3>
                        <Badge variant={alert.is_active ? 'default' : 'secondary'}>
                          {alert.is_active ? 'Active' : 'Paused'}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {alert.keywords?.map((keyword, i) => (
                          <Badge key={i} variant="outline">{keyword}</Badge>
                        ))}
                        {alert.locations?.map((location, i) => (
                          <Badge key={i} variant="outline">
                            <MapPin className="mr-1 h-3 w-3" />
                            {location}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-smmt-2">
                        {alert.frequency === 'instant' ? 'Instant notifications' : 
                         alert.frequency === 'daily' ? 'Daily digest' : 'Weekly digest'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={alert.is_active || false}
                        onCheckedChange={() => toggleAlert(alert)}
                      />
                      <Button variant="ghost" size="icon" onClick={() => editAlert(alert)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteAlert(alert.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
