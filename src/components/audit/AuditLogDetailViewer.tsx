import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eye, Code, GitCompare, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

interface AuditLog {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: any;
  user_name?: string;
  created_at: string;
  ip_address?: string | null;
}

interface AuditLogDetailViewerProps {
  log: AuditLog;
}

export function AuditLogDetailViewer({ log }: AuditLogDetailViewerProps) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(JSON.stringify(log.details, null, 2));
    setCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  // Extract changes from details
  const getChanges = () => {
    if (!log.details) return [];

    const changes: Array<{ field: string; old: any; new: any }> = [];

    if (log.details.old && log.details.new) {
      const oldObj = log.details.old;
      const newObj = log.details.new;

      // Find all changed fields
      const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

      allKeys.forEach((key) => {
        const oldVal = oldObj[key];
        const newVal = newObj[key];

        // Skip internal fields
        if (['id', 'created_at', 'updated_at', 'organization_id'].includes(key)) {
          return;
        }

        // Check if values are different
        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
          changes.push({
            field: key,
            old: oldVal,
            new: newVal,
          });
        }
      });
    }

    return changes;
  };

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return '(empty)';
    if (typeof value === 'string') return value;
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  };

  const formatFieldName = (field: string): string => {
    return field
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const changes = getChanges();
  const hasChanges = changes.length > 0;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5">
          <Eye className="h-3 w-3" />
          Details
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Audit Log Details
            <Badge variant="outline" className="ml-auto">
              {log.entity_type}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {log.user_name} • {new Date(log.created_at).toLocaleString()}
            {log.ip_address && ` • IP: ${log.ip_address}`}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="changes" className="mt-4">
          <TabsList>
            <TabsTrigger value="changes" className="gap-2">
              <GitCompare className="h-4 w-4" />
              Changes ({changes.length})
            </TabsTrigger>
            <TabsTrigger value="context" className="gap-2">
              <Eye className="h-4 w-4" />
              Full Context
            </TabsTrigger>
            <TabsTrigger value="raw" className="gap-2">
              <Code className="h-4 w-4" />
              Raw JSON
            </TabsTrigger>
          </TabsList>

          {/* Changes Tab - Show Before/After Diff */}
          <TabsContent value="changes" className="space-y-4">
            {hasChanges ? (
              <div className="space-y-3">
                {changes.map((change, idx) => (
                  <div
                    key={idx}
                    className="border rounded-lg p-4 bg-muted/30 space-y-2"
                  >
                    <div className="font-medium text-sm flex items-center gap-2">
                      {formatFieldName(change.field)}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {/* Old Value */}
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground font-medium">
                          Before
                        </div>
                        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded p-3 text-sm">
                          <code className="text-red-700 dark:text-red-400 whitespace-pre-wrap break-all">
                            {formatValue(change.old)}
                          </code>
                        </div>
                      </div>

                      {/* New Value */}
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground font-medium">
                          After
                        </div>
                        <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded p-3 text-sm">
                          <code className="text-green-700 dark:text-green-400 whitespace-pre-wrap break-all">
                            {formatValue(change.new)}
                          </code>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                {log.action === 'insert' ? (
                  <p>This was a new record creation. See Full Context for details.</p>
                ) : log.action === 'delete' ? (
                  <p>This record was deleted. See Full Context for what was removed.</p>
                ) : (
                  <p>No changes detected in this log entry.</p>
                )}
              </div>
            )}
          </TabsContent>

          {/* Full Context Tab */}
          <TabsContent value="context" className="space-y-4">
            {log.details.new && (
              <div>
                <h4 className="text-sm font-medium mb-2">Current/New State</h4>
                <div className="bg-muted rounded-lg p-4 overflow-auto">
                  <pre className="text-xs">
                    {JSON.stringify(log.details.new, null, 2)}
                  </pre>
                </div>
              </div>
            )}

            {log.details.old && (
              <div>
                <h4 className="text-sm font-medium mb-2">Previous State</h4>
                <div className="bg-muted rounded-lg p-4 overflow-auto">
                  <pre className="text-xs">
                    {JSON.stringify(log.details.old, null, 2)}
                  </pre>
                </div>
              </div>
            )}

            {/* Show any additional metadata */}
            {log.details.metadata && (
              <div>
                <h4 className="text-sm font-medium mb-2">Metadata</h4>
                <div className="bg-muted rounded-lg p-4 overflow-auto">
                  <pre className="text-xs">
                    {JSON.stringify(log.details.metadata, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Raw JSON Tab */}
          <TabsContent value="raw" className="space-y-2">
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={copyToClipboard}
                className="gap-2"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy JSON
                  </>
                )}
              </Button>
            </div>
            <div className="bg-muted rounded-lg p-4 overflow-auto max-h-[500px]">
              <pre className="text-xs">{JSON.stringify(log.details, null, 2)}</pre>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Helper function to generate human-readable audit log descriptions
 */
export function getAuditLogDescription(log: AuditLog): string {
  const action = log.action.toLowerCase();
  const entity = log.entity_type;

  // Handle specific entity types
  if (entity === 'clients') {
    const name = log.details.new?.name || log.details.old?.name;
    if (action === 'insert') return `Created client "${name}"`;
    if (action === 'update') {
      const changes = Object.keys(log.details.new || {}).filter(
        (key) => log.details.old?.[key] !== log.details.new?.[key]
      );
      if (changes.length === 1) {
        return `Updated ${changes[0].replace(/_/g, ' ')} for "${name}"`;
      }
      return `Updated ${changes.length} fields for "${name}"`;
    }
    if (action === 'delete') return `Deleted client "${name}"`;
  }

  if (entity === 'user_roles') {
    if (action === 'grant_role') {
      const role = log.details.granted_role;
      const target = log.details.target_user_id;
      return `Granted ${role} role to user`;
    }
    if (action === 'insert') {
      const role = log.details.new?.role;
      return `Assigned ${role} role`;
    }
  }

  if (entity === 'candidate_profiles') {
    const name = log.details.new?.full_name || log.details.old?.full_name || 'candidate';
    if (action === 'insert') return `Created candidate profile for ${name}`;
    if (action === 'update') return `Updated candidate profile for ${name}`;
    if (action === 'delete') return `Deleted candidate ${name}`;
  }

  if (entity === 'jobs') {
    const title = log.details.new?.title || log.details.old?.title || 'job';
    if (action === 'insert') return `Created job "${title}"`;
    if (action === 'update') return `Updated job "${title}"`;
    if (action === 'delete') return `Deleted job "${title}"`;
  }

  // Fallback to generic description
  const formattedAction = action.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  const formattedEntity = entity.replace(/_/g, ' ');
  return `${formattedAction} ${formattedEntity}`;
}
