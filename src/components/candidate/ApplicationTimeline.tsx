import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, CheckCircle2, Clock, XCircle, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';

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
  shortlisted: CheckCircle2,
  interviewing: Clock,
  offered: CheckCircle2,
  hired: CheckCircle2,
  rejected: XCircle,
  withdrawn: XCircle,
};

const statusColors: Record<string, string> = {
  applied: 'bg-blue-500',
  reviewing: 'bg-yellow-500',
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
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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
          <p className="text-muted-foreground text-sm">No status updates yet.</p>
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
              const Icon = statusIcons[item.new_status] || Clock;
              const colorClass = statusColors[item.new_status] || 'bg-gray-500';
              
              return (
                <div key={item.id} className="relative pl-10">
                  <div className={`absolute left-2 w-5 h-5 rounded-full ${colorClass} flex items-center justify-center`}>
                    <Icon className="h-3 w-3 text-white" />
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      {item.old_status && (
                        <>
                          <Badge variant="outline" className="capitalize text-xs">
                            {item.old_status.replace('_', ' ')}
                          </Badge>
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        </>
                      )}
                      <Badge className="capitalize text-xs">
                        {item.new_status.replace('_', ' ')}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
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
