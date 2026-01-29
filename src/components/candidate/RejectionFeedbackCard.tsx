import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Info } from 'lucide-react';

interface RejectionFeedbackCardProps {
  reason: string | null;
  feedback: string | null;
}

const reasonLabels: Record<string, string> = {
  skill_mismatch: 'Skills do not match requirements',
  experience_gap: 'Insufficient experience level',
  overqualified: 'Overqualified for the position',
  culture_fit: 'Not a cultural fit',
  salary_mismatch: 'Salary expectations not aligned',
  location: 'Location/relocation constraints',
  better_candidate: 'A stronger candidate was selected',
  position_filled: 'Position was already filled',
  other: 'Other reason'
};

export function RejectionFeedbackCard({ reason, feedback }: RejectionFeedbackCardProps) {
  if (!reason) return null;

  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 text-destructive">
          <AlertCircle className="h-4 w-4" />
          Application Feedback
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-sm font-medium">Reason:</p>
          <p className="text-sm">{reasonLabels[reason] || reason}</p>
        </div>
        
        {feedback && (
          <div>
            <p className="text-sm font-medium">Additional Feedback:</p>
            <p className="text-sm">{feedback}</p>
          </div>
        )}

        <div className="flex items-start gap-2 pt-2 text-xsbg-muted/50 p-3 rounded-lg">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <p>
            This feedback is meant to help you improve future applications. 
            Don't be discouraged - each application is a learning opportunity!
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
