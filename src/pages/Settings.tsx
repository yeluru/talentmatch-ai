import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { User, Bell, Shield, Palette, Loader2, Save, Camera } from 'lucide-react';
import { toast } from 'sonner';

interface UserSettings {
  email_notifications: boolean;
  push_notifications: boolean;
  job_alert_frequency: string;
  application_updates: boolean;
  marketing_emails: boolean;
  theme: string;
  language: string;
}

export default function Settings() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  
  const [profileForm, setProfileForm] = useState({
    full_name: '',
    phone: '',
    location: '',
    bio: '',
    linkedin_url: '',
  });

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['user-settings', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data as UserSettings | null;
    },
    enabled: !!user?.id,
  });

  const [notificationSettings, setNotificationSettings] = useState<UserSettings>({
    email_notifications: true,
    push_notifications: true,
    job_alert_frequency: 'daily',
    application_updates: true,
    marketing_emails: false,
    theme: 'system',
    language: 'en',
  });

  useEffect(() => {
    if (profile) {
      setProfileForm({
        full_name: profile.full_name || '',
        phone: profile.phone || '',
        location: profile.location || '',
        bio: profile.bio || '',
        linkedin_url: profile.linkedin_url || '',
      });
    }
  }, [profile]);

  useEffect(() => {
    if (settings) {
      setNotificationSettings({
        email_notifications: settings.email_notifications ?? true,
        push_notifications: settings.push_notifications ?? true,
        job_alert_frequency: settings.job_alert_frequency || 'daily',
        application_updates: settings.application_updates ?? true,
        marketing_emails: settings.marketing_emails ?? false,
        theme: settings.theme || 'system',
        language: settings.language || 'en',
      });
    }
  }, [settings]);

  const updateProfile = useMutation({
    mutationFn: async (data: typeof profileForm) => {
      const { error } = await supabase
        .from('profiles')
        .update(data)
        .eq('user_id', user?.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast.success('Profile updated successfully');
    },
    onError: () => toast.error('Failed to update profile'),
  });

  const updateSettings = useMutation({
    mutationFn: async (data: UserSettings) => {
      const { error } = await supabase
        .from('user_settings')
        .upsert({ user_id: user?.id, ...data }, { onConflict: 'user_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-settings'] });
      toast.success('Settings saved');
    },
    onError: () => toast.error('Failed to save settings'),
  });

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Manage your account settings and preferences</p>
        </div>

        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="profile" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">Profile</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              <span className="hidden sm:inline">Notifications</span>
            </TabsTrigger>
            <TabsTrigger value="appearance" className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              <span className="hidden sm:inline">Appearance</span>
            </TabsTrigger>
            <TabsTrigger value="security" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">Security</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <Card>
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
                <CardDescription>Update your personal details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center gap-6">
                  <Avatar className="h-20 w-20">
                    <AvatarImage src={profile?.avatar_url || ''} />
                    <AvatarFallback className="text-2xl bg-accent text-accent-foreground">
                      {profile?.full_name?.charAt(0) || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <Button variant="outline" size="sm">
                    <Camera className="h-4 w-4 mr-2" />
                    Change Photo
                  </Button>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="full_name">Full Name</Label>
                    <Input
                      id="full_name"
                      value={profileForm.full_name}
                      onChange={(e) => setProfileForm(p => ({ ...p, full_name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" value={user?.email || ''} disabled />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      value={profileForm.phone}
                      onChange={(e) => setProfileForm(p => ({ ...p, phone: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="location">Location</Label>
                    <Input
                      id="location"
                      value={profileForm.location}
                      onChange={(e) => setProfileForm(p => ({ ...p, location: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="linkedin">LinkedIn URL</Label>
                    <Input
                      id="linkedin"
                      value={profileForm.linkedin_url}
                      onChange={(e) => setProfileForm(p => ({ ...p, linkedin_url: e.target.value }))}
                      placeholder="https://linkedin.com/in/yourprofile"
                    />
                  </div>
                </div>

                <Button 
                  onClick={() => updateProfile.mutate(profileForm)}
                  disabled={updateProfile.isPending}
                >
                  {updateProfile.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notifications">
            <Card>
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
                <CardDescription>Choose how you want to be notified</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Email Notifications</Label>
                      <p className="text-sm text-muted-foreground">Receive notifications via email</p>
                    </div>
                    <Switch
                      checked={notificationSettings.email_notifications}
                      onCheckedChange={(checked) => 
                        setNotificationSettings(s => ({ ...s, email_notifications: checked }))
                      }
                    />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Push Notifications</Label>
                      <p className="text-sm text-muted-foreground">Receive browser push notifications</p>
                    </div>
                    <Switch
                      checked={notificationSettings.push_notifications}
                      onCheckedChange={(checked) => 
                        setNotificationSettings(s => ({ ...s, push_notifications: checked }))
                      }
                    />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Application Updates</Label>
                      <p className="text-sm text-muted-foreground">Get notified when your application status changes</p>
                    </div>
                    <Switch
                      checked={notificationSettings.application_updates}
                      onCheckedChange={(checked) => 
                        setNotificationSettings(s => ({ ...s, application_updates: checked }))
                      }
                    />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Marketing Emails</Label>
                      <p className="text-sm text-muted-foreground">Receive tips and product updates</p>
                    </div>
                    <Switch
                      checked={notificationSettings.marketing_emails}
                      onCheckedChange={(checked) => 
                        setNotificationSettings(s => ({ ...s, marketing_emails: checked }))
                      }
                    />
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <Label>Job Alert Frequency</Label>
                    <Select
                      value={notificationSettings.job_alert_frequency}
                      onValueChange={(value) => 
                        setNotificationSettings(s => ({ ...s, job_alert_frequency: value }))
                      }
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="instant">Instant</SelectItem>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="never">Never</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button 
                  onClick={() => updateSettings.mutate(notificationSettings)}
                  disabled={updateSettings.isPending}
                >
                  {updateSettings.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <Save className="h-4 w-4 mr-2" />
                  Save Preferences
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="appearance">
            <Card>
              <CardHeader>
                <CardTitle>Appearance</CardTitle>
                <CardDescription>Customize how the app looks</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Theme</Label>
                  <Select
                    value={notificationSettings.theme}
                    onValueChange={(value) => 
                      setNotificationSettings(s => ({ ...s, theme: value }))
                    }
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">Light</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                      <SelectItem value="system">System</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Language</Label>
                  <Select
                    value={notificationSettings.language}
                    onValueChange={(value) => 
                      setNotificationSettings(s => ({ ...s, language: value }))
                    }
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="es">Spanish</SelectItem>
                      <SelectItem value="fr">French</SelectItem>
                      <SelectItem value="de">German</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button 
                  onClick={() => updateSettings.mutate(notificationSettings)}
                  disabled={updateSettings.isPending}
                >
                  {updateSettings.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <Save className="h-4 w-4 mr-2" />
                  Save Appearance
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle>Security</CardTitle>
                <CardDescription>Manage your account security</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <Label>Password</Label>
                    <p className="text-sm text-muted-foreground mb-2">
                      Change your password to keep your account secure
                    </p>
                    <Button variant="outline" onClick={() => {
                      supabase.auth.resetPasswordForEmail(user?.email || '');
                      toast.success('Password reset email sent');
                    }}>
                      Reset Password
                    </Button>
                  </div>
                  <Separator />
                  <div>
                    <Label>Active Sessions</Label>
                    <p className="text-sm text-muted-foreground mb-2">
                      Manage your active sessions across devices
                    </p>
                    <Button variant="outline" onClick={async () => {
                      await supabase.auth.signOut({ scope: 'others' });
                      toast.success('Other sessions signed out');
                    }}>
                      Sign Out Other Sessions
                    </Button>
                  </div>
                  <Separator />
                  <div>
                    <Label className="text-destructive">Danger Zone</Label>
                    <p className="text-sm text-muted-foreground mb-2">
                      Permanently delete your account and all data
                    </p>
                    <Button variant="destructive">Delete Account</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
