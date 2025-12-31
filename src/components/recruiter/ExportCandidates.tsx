import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Download, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';

interface Candidate {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  current_title: string | null;
  current_company: string | null;
  years_of_experience: number | null;
  recruiter_status: string | null;
}

interface ExportCandidatesProps {
  candidates: Candidate[];
  selectedIds?: string[];
}

const exportFields = [
  { key: 'full_name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'location', label: 'Location' },
  { key: 'current_title', label: 'Current Title' },
  { key: 'current_company', label: 'Current Company' },
  { key: 'years_of_experience', label: 'Years of Experience' },
  { key: 'recruiter_status', label: 'Status' },
];

export function ExportCandidates({ candidates, selectedIds }: ExportCandidatesProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFields, setSelectedFields] = useState<string[]>(exportFields.map(f => f.key));

  const toggleField = (key: string) => {
    setSelectedFields(prev =>
      prev.includes(key) ? prev.filter(f => f !== key) : [...prev, key]
    );
  };

  const handleExport = () => {
    const candidatesToExport = selectedIds?.length 
      ? candidates.filter(c => selectedIds.includes(c.id))
      : candidates;

    if (candidatesToExport.length === 0) {
      toast.error('No candidates to export');
      return;
    }

    // Create CSV header
    const headers = selectedFields.map(key => 
      exportFields.find(f => f.key === key)?.label || key
    );

    // Create CSV rows
    const rows = candidatesToExport.map(candidate =>
      selectedFields.map(key => {
        const value = candidate[key as keyof Candidate];
        if (value === null || value === undefined) return '';
        // Escape commas and quotes in CSV
        const stringValue = String(value);
        if (stringValue.includes(',') || stringValue.includes('"')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      })
    );

    // Combine into CSV string
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `candidates_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success(`Exported ${candidatesToExport.length} candidates`);
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export Candidates</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <p className="text-sm text-muted-foreground">
            {selectedIds?.length 
              ? `Export ${selectedIds.length} selected candidates`
              : `Export all ${candidates.length} candidates`}
          </p>
          
          <div className="space-y-3">
            <Label>Select fields to export:</Label>
            <div className="grid grid-cols-2 gap-2">
              {exportFields.map(field => (
                <div key={field.key} className="flex items-center space-x-2">
                  <Checkbox
                    id={field.key}
                    checked={selectedFields.includes(field.key)}
                    onCheckedChange={() => toggleField(field.key)}
                  />
                  <label 
                    htmlFor={field.key} 
                    className="text-sm cursor-pointer"
                  >
                    {field.label}
                  </label>
                </div>
              ))}
            </div>
          </div>

          <Button onClick={handleExport} className="w-full">
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Export to CSV
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
