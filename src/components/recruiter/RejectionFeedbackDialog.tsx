import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface RejectionFeedbackDialogProps {
  applicationId: string;
  candidateName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const rejectionReasons = [
  { value: 'skill_mismatch', label: 'Skills do not match requirements' },
  { value: 'experience_gap', label: 'Insufficient experience level' },
  { value: 'overqualified', label: 'Overqualified for the position' },
  { value: 'culture_fit', label: 'Not a cultural fit' },
  { value: 'salary_mismatch', label: 'Salary expectations not aligned' },
  { value: 'location', label: 'Location/relocation constraints' },
  { value: 'better_candidate', label: 'Stronger candidate selected' },
  { value: 'position_filled', label: 'Position already filled' },
  { value: 'other', label: 'Other reason' }
];

export function RejectionFeedbackDialog({
  applicationId,
  candidateName,
  open,
  onOpenChange,
  onSuccess
}: RejectionFeedbackDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState('');

  const handleSubmit = async () => {
    if (!reason) {
      toast.error('Please select a rejection reason');
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('applications')
        .update({
          status: 'rejected',
          rejection_reason: reason,
          rejection_feedback: feedback || null
        })
        .eq('id', applicationId);

      if (error) throw error;

      toast.success('Application rejected with feedback');
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error('Error rejecting application:', error);
      toast.error('Failed to update application');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reject Application</DialogTitle>
          <DialogDescription>
            Provide feedback for {candidateName}. This helps candidates understand why they weren't selected.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 pt-4">
          <div className="space-y-3">
            <Label>Rejection Reason *</Label>
            <RadioGroup value={reason} onValueChange={setReason}>
              {rejectionReasons.map((r) => (
                <div key={r.value} className="flex items-center space-x-2">
                  <RadioGroupItem value={r.value} id={r.value} />
                  <Label htmlFor={r.value} className="cursor-pointer font-normal">
                    {r.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedback">Additional Feedback (Optional)</Label>
            <Textarea
              id="feedback"
              placeholder="Provide constructive feedback that could help the candidate in future applications..."
              rows={4}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
            <p className="text-xs">
              This feedback will be visible to the candidate
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <Button 
              variant="outline" 
              onClick={() => onOpenChange(false)} 
              className="flex-1"
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleSubmit} 
              className="flex-1"
              disabled={isLoading}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reject Application
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
