import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, CheckCircle2, Clock, XCircle, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { StatusBadge } from '@/components/ui/status-badge';
import { applicationStageColumnKey } from '@/lib/statusOptions';

interface StatusHistory {
  id: string;
  old_status: string | null;
  new_status: string;
  notes: string | null;
  created_at: string;
}

interface ApplicationTimelineProps {
  applicationId: string;
}

const statusIcons: Record<string, React.ElementType> = {
  applied: Clock,
  reviewing: Clock,
  reviewed: Clock,
  screening: Clock,
  shortlisted: CheckCircle2,
  interviewing: Clock,
  offered: CheckCircle2,
  hired: CheckCircle2,
  rejected: XCircle,
  withdrawn: XCircle,
};

const statusDotColors: Record<string, string> = {
  applied: 'bg-blue-500',
  reviewing: 'bg-blue-500',
  reviewed: 'bg-blue-500',
  screening: 'bg-yellow-500',
  shortlisted: 'bg-green-500',
  interviewing: 'bg-purple-500',
  offered: 'bg-green-600',
  hired: 'bg-green-700',
  rejected: 'bg-red-500',
  withdrawn: 'bg-gray-500',
};

export function ApplicationTimeline({ applicationId }: ApplicationTimelineProps) {
  const [history, setHistory] = useState<StatusHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, [applicationId]);

  const fetchHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('application_status_history')
        .select('*')
        .eq('application_id', applicationId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setHistory(data || []);
    } catch (error) {
      console.error('Error fetching application history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Application Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm">No status updates yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Application Timeline</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
          <div className="space-y-6">
            {history.map((item, index) => {
              const newKey = applicationStageColumnKey(item.new_status) || item.new_status;
              const oldKey = applicationStageColumnKey(item.old_status) || item.old_status;
              const Icon = statusIcons[String(newKey || '')] || Clock;
              const colorClass = statusDotColors[String(newKey || '')] || 'bg-gray-500';
              
              return (
                <div key={item.id} className="relative pl-10">
                  <div className={`absolute left-2 w-5 h-5 rounded-full ${colorClass} flex items-center justify-center`}>
                    <Icon className="h-3 w-3 text-white" />
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      {item.old_status && (
                        <>
                          <StatusBadge status={String(oldKey)} className="text-xs" />
                          <ArrowRight className="h-3 w-3" />
                        </>
                      )}
                      <StatusBadge status={String(newKey)} className="text-xs" />
                    </div>
                    <p className="text-xs">
                      {format(new Date(item.created_at), 'MMM d, yyyy • h:mm a')}
                    </p>
                    {item.notes && (
                      <p className="text-sm mt-2">{item.notes}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
