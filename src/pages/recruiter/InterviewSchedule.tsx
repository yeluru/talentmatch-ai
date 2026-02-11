import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { orgIdForRecruiterSuite, effectiveRecruiterOwnerId } from '@/lib/org';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Calendar as CalendarIcon, Clock, Video, MapPin, Loader2, Users, Check, X } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';

interface Interview {
  id: string;
  application_id: string;
  interviewer_id: string;
  interview_type: string;
  scheduled_at: string;
  duration_minutes: number;
  location: string | null;
  meeting_link: string | null;
  notes: string | null;
  status: string;
  applications?: {
    id: string;
    candidate_profiles?: {
      full_name: string | null;
      email: string | null;
      current_title: string | null;
    } | null;
    jobs?: { title: string } | null;
  } | null;
}

const INTERVIEW_TYPES = [
  { value: 'video', label: 'Video Call', icon: Video },
  { value: 'phone', label: 'Phone Screen', icon: Clock },
  { value: 'onsite', label: 'On-site', icon: MapPin },
];

export default function InterviewSchedule() {
  const { user, roles, currentRole } = useAuth();
  const [searchParams] = useSearchParams();
  const ownerId = effectiveRecruiterOwnerId(currentRole ?? null, user?.id, searchParams.get('owner'));
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogReopenKey, setDialogReopenKey] = useState(0);
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [form, setForm] = useState({
    application_id: '',
    interview_type: 'video',
    time: '10:00',
    duration_minutes: 60,
    location: '',
    meeting_link: '',
    notes: '',
  });

  const organizationId = orgIdForRecruiterSuite(roles);
  const DRAFT_KEY = useMemo(() => `interview_schedule:draft:${organizationId || 'no-org'}:${user?.id || 'no-user'}`, [organizationId, user?.id]);

  const { data: interviews, isLoading } = useQuery({
    queryKey: ['interviews', organizationId, ownerId],
    queryFn: async () => {
      if (!organizationId && !user?.id) return [];

      // Load interviews for applications that belong to org (and to this recruiter's jobs when ownerId is set).
      let orgApplicationIds: string[] = [];
      if (organizationId) {
        let appsQuery = supabase
          .from('applications')
          .select('id, jobs!inner(organization_id, recruiter_id)')
          .eq('jobs.organization_id', organizationId)
          .limit(5000);
        if (ownerId) appsQuery = appsQuery.eq('jobs.recruiter_id', ownerId);
        const { data: apps, error: appsErr } = await appsQuery;
        if (appsErr) throw appsErr;
        orgApplicationIds = Array.from(new Set((apps || []).map((a: any) => a?.id).filter(Boolean)));
      }

      let q = supabase.from('interview_schedules').select('*').order('scheduled_at', { ascending: true });
      if (orgApplicationIds.length) q = q.in('application_id', orgApplicationIds);
      else if (user?.id) q = q.eq('interviewer_id', user.id);

      const { data: rows, error } = await q;
      if (error) throw error;

      const applicationIds = Array.from(new Set((rows || []).map((r: any) => r?.application_id).filter(Boolean)));
      const appsById = new Map<string, any>();
      if (applicationIds.length) {
        const { data: apps, error: appErr } = await supabase
          .from('applications')
          .select(
            `
            id,
            candidate_profiles(full_name, email, current_title),
            jobs(title)
          `,
          )
          .in('id', applicationIds);
        if (appErr) {
          // Don't fail the entire interviews list if we can't embed application details.
          // We'll still render the interview rows (with "Unknown/No title" placeholders).
          console.error('[InterviewSchedule] failed to load applications for interviews:', appErr);
        } else {
          (apps || []).forEach((a: any) => {
            if (a?.id) appsById.set(String(a.id), a);
          });
        }
      }

      return (rows || []).map((r: any) => ({
        ...r,
        applications: appsById.get(String(r.application_id)) || null,
      })) as Interview[];
    },
    enabled: !!organizationId || !!user?.id,
  });

  const { data: applications } = useQuery({
    queryKey: ['schedulable-applications', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('applications')
        .select(`
          id,
          candidate_profiles(full_name, email),
          jobs!inner(title, organization_id)
        `)
        .eq('jobs.organization_id', organizationId)
        // Allow scheduling interviews starting from screening stage.
        .in('status', ['screening', 'rtr_rate', 'submission', 'client_shortlist', 'client_interview']);
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  const createInterview = useMutation({
    mutationFn: async () => {
      if (!selectedDate) throw new Error('Please select a date');
      if (!form.application_id) throw new Error('Please select a candidate');
      const [hours, minutes] = form.time.split(':');
      const scheduledAt = new Date(selectedDate);
      scheduledAt.setHours(parseInt(hours), parseInt(minutes));

      const { error } = await supabase.from('interview_schedules').insert({
        application_id: form.application_id,
        interviewer_id: user?.id,
        interview_type: form.interview_type,
        scheduled_at: scheduledAt.toISOString(),
        duration_minutes: form.duration_minutes,
        location: form.location || null,
        meeting_link: form.meeting_link || null,
        notes: form.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      // Query key includes interviewer id; invalidate broadly to refetch immediately.
      queryClient.invalidateQueries({ queryKey: ['interviews'], exact: false });
      toast.success('Interview scheduled');
      setIsDialogOpen(false);
      resetForm();
      try {
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {
        // ignore
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to schedule'),
  });

  const updateInterviewStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('interview_schedules')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['interviews'], exact: false });
      toast.success('Interview updated');
    },
  });

  const resetForm = () => {
    setForm({
      application_id: '',
      interview_type: 'video',
      time: '10:00',
      duration_minutes: 60,
      location: '',
      meeting_link: '',
      notes: '',
    });
    setSelectedDate(undefined);
  };

  // Re-show Schedule Interview dialog when user returns to the tab/window (e.g. from copying a Zoom link).
  useEffect(() => {
    const reopenIfOpen = () => {
      if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
      if (isDialogOpen) setDialogReopenKey((k) => k + 1);
    };
    document.addEventListener('visibilitychange', reopenIfOpen);
    window.addEventListener('focus', reopenIfOpen);
    return () => {
      document.removeEventListener('visibilitychange', reopenIfOpen);
      window.removeEventListener('focus', reopenIfOpen);
    };
  }, [isDialogOpen]);

  // Draft persistence (form + date only). Do not restore isDialogOpen — dialog should open only when user clicks "Schedule Interview" or drags to Screening on pipeline.
  useEffect(() => {
    if (!organizationId || !user?.id) return;
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.form) setForm((prev) => ({ ...prev, ...parsed.form }));
      if (parsed?.selectedDate) setSelectedDate(new Date(parsed.selectedDate));
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [DRAFT_KEY]);

  useEffect(() => {
    if (!organizationId || !user?.id) return;
    if (!isDialogOpen) return;
    try {
      sessionStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          ts: Date.now(),
          selectedDate: selectedDate ? selectedDate.toISOString() : null,
          form,
        }),
      );
      sessionStorage.setItem('interviews-schedule-dialog-open', '1');
    } catch {
      // ignore
    }
  }, [DRAFT_KEY, organizationId, user?.id, isDialogOpen, selectedDate, form]);

  // Re-open Schedule Interview dialog when user navigates back to this page (restore from draft).
  useEffect(() => {
    if (!organizationId || !user?.id) return;
    try {
      if (sessionStorage.getItem('interviews-schedule-dialog-open') !== '1') return;
      sessionStorage.removeItem('interviews-schedule-dialog-open');
      setIsDialogOpen(true);
    } catch {
      // ignore
    }
  }, [DRAFT_KEY, organizationId, user?.id]);

  // Clear "dialog was open" flag when user closes the dialog so we don't reopen on next visit.
  useEffect(() => {
    if (isDialogOpen) return;
    try {
      sessionStorage.removeItem('interviews-schedule-dialog-open');
    } catch {
      // ignore
    }
  }, [isDialogOpen]);

  const upcomingInterviews = interviews?.filter(i =>
    i.status === 'scheduled' && new Date(i.scheduled_at) >= new Date()
  ) || [];

  const pastInterviews = interviews?.filter(i =>
    i.status !== 'scheduled' || new Date(i.scheduled_at) < new Date()
  ) || [];

  const getStatusBadge = (status: string) => {
    const config: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
      scheduled: { label: 'Scheduled', variant: 'default' },
      completed: { label: 'Completed', variant: 'secondary' },
      cancelled: { label: 'Cancelled', variant: 'destructive' },
      no_show: { label: 'No Show', variant: 'destructive' },
    };
    const c = config[status] || config.scheduled;
    return <Badge variant={c.variant}>{c.label}</Badge>;
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 w-full">
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-6 pb-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 rounded-xl bg-recruiter/10 text-recruiter border border-recruiter/20">
                <CalendarIcon className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground">
                Interview <span className="text-gradient-recruiter">Schedule</span>
              </h1>
            </div>
            <p className="text-lg text-muted-foreground font-sans">Manage your upcoming interviews</p>
          </div>
          <Dialog
            key={`schedule-${dialogReopenKey}`}
            modal={false}
            open={isDialogOpen}
            onOpenChange={(open) => {
              if (open) setIsDialogOpen(true);
              else if (document.hasFocus()) setIsDialogOpen(false);
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Schedule Interview
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-w-full">
              <DialogHeader>
                <DialogTitle>Schedule Interview</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Candidate</Label>
                  <Select
                    value={form.application_id}
                    onValueChange={(value) => setForm(f => ({ ...f, application_id: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a candidate" />
                    </SelectTrigger>
                    <SelectContent>
                      {applications?.map((app: any) => (
                        <SelectItem key={app.id} value={app.id}>
                          {app.candidate_profiles?.full_name || (app.candidate_profiles?.email ? String(app.candidate_profiles.email).split('@')[0] : '') || 'Candidate'} - {app.jobs?.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left", !selectedDate && "")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {selectedDate ? format(selectedDate, 'PPP') : 'Pick a date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={selectedDate}
                          onSelect={setSelectedDate}
                          disabled={(date) => date < new Date()}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-2">
                    <Label>Time</Label>
                    <Input
                      type="time"
                      value={form.time}
                      onChange={(e) => setForm(f => ({ ...f, time: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select
                      value={form.interview_type}
                      onValueChange={(value) => setForm(f => ({ ...f, interview_type: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {INTERVIEW_TYPES.map(type => (
                          <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Duration</Label>
                    <Select
                      value={form.duration_minutes.toString()}
                      onValueChange={(value) => setForm(f => ({ ...f, duration_minutes: parseInt(value) }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="30">30 minutes</SelectItem>
                        <SelectItem value="45">45 minutes</SelectItem>
                        <SelectItem value="60">1 hour</SelectItem>
                        <SelectItem value="90">1.5 hours</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Meeting Link</Label>
                  <Input
                    value={form.meeting_link}
                    onChange={(e) => setForm(f => ({ ...f, meeting_link: e.target.value }))}
                    placeholder="https://zoom.us/j/..."
                  />
                </div>

                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={form.notes}
                    onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Interview focus areas, topics to cover..."
                    rows={3}
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                  <Button onClick={() => createInterview.mutate()} disabled={createInterview.isPending}>
                    {createInterview.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Schedule
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5" />
                Upcoming Interviews
              </CardTitle>
            </CardHeader>
            <CardContent>
              {upcomingInterviews.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="No upcoming interviews"
                  description="Schedule an interview to get started"
                />
              ) : (
                <div className="space-y-4">
                  {upcomingInterviews.map(interview => (
                    <div key={interview.id} className="glass-panel p-4 hover-card-premium group rounded-xl flex items-start gap-4">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-accent text-accent-foreground">
                          {(interview.applications?.candidate_profiles?.full_name || 'U').charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">
                          {interview.applications?.candidate_profiles?.full_name || (interview.applications?.candidate_profiles?.email ? String(interview.applications.candidate_profiles.email).split('@')[0] : null) || 'Applicant'}
                        </p>
                        <p className="text-sm">
                          {interview.applications?.jobs?.title}
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-sm">
                          <span className="flex items-center gap-1">
                            <CalendarIcon className="h-3 w-3" />
                            {format(new Date(interview.scheduled_at), 'MMM d, yyyy')}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {format(new Date(interview.scheduled_at), 'h:mm a')}
                          </span>
                        </div>
                        <div className="flex gap-2 mt-3">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateInterviewStatus.mutate({ id: interview.id, status: 'completed' })}
                          >
                            <Check className="h-3 w-3 mr-1" />
                            Complete
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => updateInterviewStatus.mutate({ id: interview.id, status: 'cancelled' })}
                          >
                            <X className="h-3 w-3 mr-1" />
                            Cancel
                          </Button>
                        </div>
                      </div>
                      {getStatusBadge(interview.status)}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Past Interviews</CardTitle>
            </CardHeader>
            <CardContent>
              {pastInterviews.length === 0 ? (
                <EmptyState
                  icon={Clock}
                  title="No past interviews"
                  description="Completed interviews will appear here"
                />
              ) : (
                <div className="space-y-3">
                  {pastInterviews.slice(0, 5).map(interview => (
                    <div key={interview.id} className="glass-panel p-3 hover-card-premium group rounded-xl flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">
                          {interview.applications?.candidate_profiles?.full_name || (interview.applications?.candidate_profiles?.email ? String(interview.applications.candidate_profiles.email).split('@')[0] : null) || 'Applicant'}
                        </p>
                        <p className="text-xs">
                          {format(new Date(interview.scheduled_at), 'MMM d, yyyy')}
                        </p>
                      </div>
                      {getStatusBadge(interview.status)}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          </div>
        </div>
      </div>
      </div>
    </DashboardLayout>
  );
}
