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
import { User, Bell, Shield, Palette, Loader2, Save, Camera, Eye, Settings as SettingsIcon } from 'lucide-react';
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
  const { user, profile, currentRole } = useAuth();
  const queryClient = useQueryClient();
  const isCandidate = currentRole === 'candidate';
  
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

  const { data: candidateProfile, isLoading: candidateProfileLoading } = useQuery({
    queryKey: ['candidate-profile-marketplace', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('candidate_profiles')
        .select('id, marketplace_opt_in')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      return data as { id: string; marketplace_opt_in: boolean | null } | null;
    },
    enabled: !!user?.id && isCandidate,
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

  const updateMarketplaceOptIn = useMutation({
    mutationFn: async (optIn: boolean) => {
      const { error } = await supabase
        .from('candidate_profiles')
        .update({
          marketplace_opt_in: optIn,
          marketplace_visibility_level: optIn ? 'full' : 'anonymous',
        } as any)
        .eq('user_id', user?.id);
      if (error) throw error;
    },
    onSuccess: (_, optIn) => {
      queryClient.invalidateQueries({ queryKey: ['candidate-profile-marketplace'] });
      toast.success(optIn ? 'Your profile is now discoverable by recruiters' : 'Your profile is no longer discoverable');
    },
    onError: () => toast.error('Failed to update discoverability'),
  });

  return (
    <DashboardLayout>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 w-full">
        <header className="shrink-0 flex flex-col gap-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20">
                  <SettingsIcon className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground">
                  Account <span className="text-gradient-candidate">Settings</span>
                </h1>
              </div>
              <p className="text-lg text-muted-foreground font-sans">Manage your account settings and preferences</p>
            </div>
          </div>
        </header>

        <Tabs defaultValue="profile" className="flex flex-col flex-1 min-h-0">
          <TabsList className={`shrink-0 grid w-full mt-6 ${isCandidate ? 'grid-cols-5' : 'grid-cols-4'}`}>
            <TabsTrigger value="profile" className="flex items-center gap-2 font-sans">
              <User className="h-4 w-4" strokeWidth={1.5} />
              <span className="hidden sm:inline">Profile</span>
            </TabsTrigger>
            {isCandidate && (
              <TabsTrigger value="privacy" className="flex items-center gap-2 font-sans">
                <Eye className="h-4 w-4" strokeWidth={1.5} />
                <span className="hidden sm:inline">Privacy</span>
              </TabsTrigger>
            )}
            <TabsTrigger value="notifications" className="flex items-center gap-2 font-sans">
              <Bell className="h-4 w-4" strokeWidth={1.5} />
              <span className="hidden sm:inline">Notifications</span>
            </TabsTrigger>
            <TabsTrigger value="appearance" className="flex items-center gap-2 font-sans">
              <Palette className="h-4 w-4" strokeWidth={1.5} />
              <span className="hidden sm:inline">Appearance</span>
            </TabsTrigger>
            <TabsTrigger value="security" className="flex items-center gap-2 font-sans">
              <Shield className="h-4 w-4" strokeWidth={1.5} />
              <span className="hidden sm:inline">Security</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="flex-1 min-h-0 flex flex-col data-[state=inactive]:hidden">
            <div className="flex-1 min-h-0 overflow-y-auto pt-6 pb-6">
              <Card className="rounded-xl border border-border bg-card">
                <CardHeader className="border-b border-blue-500/10 bg-blue-500/5">
                  <CardTitle className="font-display font-bold">Profile Information</CardTitle>
                  <CardDescription className="font-sans text-muted-foreground">Update your personal details</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 p-6">
                <div className="flex items-center gap-6">
                  <Avatar className="h-20 w-20">
                    <AvatarImage src={profile?.avatar_url || ''} />
                    <AvatarFallback className="text-2xl bg-accent text-accent-foreground">
                      {profile?.full_name?.charAt(0) || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <Button variant="outline" size="sm" className="rounded-lg border-border hover:bg-blue-500/10">
                    <Camera className="h-4 w-4 mr-2" strokeWidth={1.5} />
                    Change Photo
                  </Button>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="full_name" className="text-sm font-sans">Full Name</Label>
                    <Input
                      id="full_name"
                      value={profileForm.full_name}
                      onChange={(e) => setProfileForm(p => ({ ...p, full_name: e.target.value }))}
                      className="h-11 rounded-lg border-border focus:ring-2 focus:ring-blue-500/20 font-sans"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-sans">Email</Label>
                    <Input id="email" value={user?.email || ''} disabled className="h-11 rounded-lg border-border font-sans" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-sm font-sans">Phone</Label>
                    <Input
                      id="phone"
                      value={profileForm.phone}
                      onChange={(e) => setProfileForm(p => ({ ...p, phone: e.target.value }))}
                      className="h-11 rounded-lg border-border focus:ring-2 focus:ring-blue-500/20 font-sans"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="location" className="text-sm font-sans">Location</Label>
                    <Input
                      id="location"
                      value={profileForm.location}
                      onChange={(e) => setProfileForm(p => ({ ...p, location: e.target.value }))}
                      className="h-11 rounded-lg border-border focus:ring-2 focus:ring-blue-500/20 font-sans"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="linkedin" className="text-sm font-sans">LinkedIn URL</Label>
                    <Input
                      id="linkedin"
                      value={profileForm.linkedin_url}
                      onChange={(e) => setProfileForm(p => ({ ...p, linkedin_url: e.target.value }))}
                      placeholder="https://linkedin.com/in/yourprofile"
                      className="h-11 rounded-lg border-border focus:ring-2 focus:ring-blue-500/20 font-sans"
                    />
                  </div>
                </div>

                <Button
                  onClick={() => updateProfile.mutate(profileForm)}
                  disabled={updateProfile.isPending}
                  className="rounded-lg border border-blue-500/20 hover:bg-blue-500/10"
                >
                  {updateProfile.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" strokeWidth={1.5} />}
                  <Save className="h-4 w-4 mr-2" strokeWidth={1.5} />
                  Save Changes
                </Button>
              </CardContent>
            </Card>
            </div>
          </TabsContent>

          {isCandidate && (
            <TabsContent value="privacy" className="flex-1 min-h-0 flex flex-col data-[state=inactive]:hidden">
              <div className="flex-1 min-h-0 overflow-y-auto pt-6 pb-6">
                <Card className="rounded-xl border border-border bg-card">
                  <CardHeader className="border-b border-blue-500/10 bg-blue-500/5">
                    <CardTitle className="font-display font-bold">Profile discoverability</CardTitle>
                    <CardDescription className="font-sans text-muted-foreground">
                      Control whether recruiters can find and view your profile in the talent marketplace.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6 p-6">
                    {candidateProfileLoading ? (
                      <div className="flex items-center gap-2 text-muted-foreground font-sans">
                        <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
                        <span className="text-sm">Loading…</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-base font-sans font-medium">Allow recruiters to discover my profile</Label>
                          <p className="text-sm text-muted-foreground font-sans mt-1">
                            When on, your profile can appear in recruiter search and marketplace. When off, only recruiters you apply to or who have your link can see your profile.
                          </p>
                        </div>
                        <Switch
                          checked={candidateProfile?.marketplace_opt_in ?? false}
                          onCheckedChange={(checked) => updateMarketplaceOptIn.mutate(checked)}
                          disabled={updateMarketplaceOptIn.isPending}
                        />
                      </div>
                    )}
                    {updateMarketplaceOptIn.isPending && (
                      <p className="text-sm text-muted-foreground font-sans flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
                        Updating…
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          )}

          <TabsContent value="notifications" className="flex-1 min-h-0 flex flex-col data-[state=inactive]:hidden">
            <div className="flex-1 min-h-0 overflow-y-auto pt-6 pb-6">
              <Card className="rounded-xl border border-border bg-card">
                <CardHeader className="border-b border-blue-500/10 bg-blue-500/5">
                  <CardTitle className="font-display font-bold">Notification Preferences</CardTitle>
                  <CardDescription className="font-sans text-muted-foreground">Choose how you want to be notified</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 p-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-sans">Email Notifications</Label>
                        <p className="text-sm text-muted-foreground font-sans">Receive notifications via email</p>
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
                        <Label className="text-sm font-sans">Push Notifications</Label>
                        <p className="text-sm text-muted-foreground font-sans">Receive browser push notifications</p>
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
                        <Label className="text-sm font-sans">Application Updates</Label>
                        <p className="text-sm text-muted-foreground font-sans">Get notified when your application status changes</p>
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
                        <Label className="text-sm font-sans">Marketing Emails</Label>
                        <p className="text-sm text-muted-foreground font-sans">Receive tips and product updates</p>
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
                      <Label className="text-sm font-sans">Job Alert Frequency</Label>
                      <Select
                        value={notificationSettings.job_alert_frequency}
                        onValueChange={(value) =>
                          setNotificationSettings(s => ({ ...s, job_alert_frequency: value }))
                        }
                      >
                        <SelectTrigger className="w-48 h-11 rounded-lg border-border focus:ring-2 focus:ring-blue-500/20 font-sans">
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
                    className="rounded-lg border border-blue-500/20 hover:bg-blue-500/10"
                  >
                    {updateSettings.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" strokeWidth={1.5} />}
                    <Save className="h-4 w-4 mr-2" strokeWidth={1.5} />
                    Save Preferences
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="appearance" className="flex-1 min-h-0 flex flex-col data-[state=inactive]:hidden">
            <div className="flex-1 min-h-0 overflow-y-auto pt-6 pb-6">
              <Card className="rounded-xl border border-border bg-card">
                <CardHeader className="border-b border-blue-500/10 bg-blue-500/5">
                  <CardTitle className="font-display font-bold">Appearance</CardTitle>
                  <CardDescription className="font-sans text-muted-foreground">Customize how the app looks</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 p-6">
                  <div className="space-y-2">
                    <Label className="text-sm font-sans">Theme</Label>
                    <Select
                      value={notificationSettings.theme}
                      onValueChange={(value) =>
                        setNotificationSettings(s => ({ ...s, theme: value }))
                      }
                    >
                      <SelectTrigger className="w-48 h-11 rounded-lg border-border focus:ring-2 focus:ring-blue-500/20 font-sans">
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
                    <Label className="text-sm font-sans">Language</Label>
                    <Select
                      value={notificationSettings.language}
                      onValueChange={(value) =>
                        setNotificationSettings(s => ({ ...s, language: value }))
                      }
                    >
                      <SelectTrigger className="w-48 h-11 rounded-lg border-border focus:ring-2 focus:ring-blue-500/20 font-sans">
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
                    className="rounded-lg border border-blue-500/20 hover:bg-blue-500/10"
                  >
                    {updateSettings.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" strokeWidth={1.5} />}
                    <Save className="h-4 w-4 mr-2" strokeWidth={1.5} />
                    Save Appearance
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="security" className="flex-1 min-h-0 flex flex-col data-[state=inactive]:hidden">
            <div className="flex-1 min-h-0 overflow-y-auto pt-6 pb-6">
              <Card className="rounded-xl border border-border bg-card">
                <CardHeader className="border-b border-blue-500/10 bg-blue-500/5">
                  <CardTitle className="font-display font-bold">Security</CardTitle>
                  <CardDescription className="font-sans text-muted-foreground">Manage your account security</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 p-6">
                  <div className="space-y-4">
                    <div>
                      <Label className="text-sm font-sans">Password</Label>
                      <p className="text-sm text-muted-foreground font-sans mb-2">
                        Change your password to keep your account secure
                      </p>
                      <Button variant="outline" className="rounded-lg border-border hover:bg-blue-500/10" onClick={() => {
                        supabase.auth.resetPasswordForEmail(user?.email || '');
                        toast.success('Password reset email sent');
                      }}>
                        Reset Password
                      </Button>
                    </div>
                    <Separator />
                    <div>
                      <Label className="text-sm font-sans">Active Sessions</Label>
                      <p className="text-sm text-muted-foreground font-sans mb-2">
                        Manage your active sessions across devices
                      </p>
                      <Button variant="outline" className="rounded-lg border-border hover:bg-blue-500/10" onClick={async () => {
                        await supabase.auth.signOut({ scope: 'others' });
                        toast.success('Other sessions signed out');
                      }}>
                        Sign Out Other Sessions
                      </Button>
                    </div>
                    <Separator />
                    <div>
                      <Label className="text-destructive font-sans">Danger Zone</Label>
                      <p className="text-sm text-muted-foreground font-sans mb-2">
                        Permanently delete your account and all data
                      </p>
                      <Button variant="destructive" className="rounded-lg">Delete Account</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
