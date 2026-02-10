import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { RtrStatusBadge } from "./RtrStatusBadge";
import { Button } from "@/components/ui/button";
import { ExternalLink, FileText } from "lucide-react";
import { format } from "date-fns";

interface RtrDocumentsListProps {
  candidateId: string;
}

interface RtrDocument {
  id: string;
  docuseal_submission_id: string;
  signing_url: string;
  status: "sent" | "viewed" | "completed" | "declined";
  sent_at: string;
  viewed_at: string | null;
  completed_at: string | null;
  declined_at: string | null;
  signed_document_url: string | null;
  rtr_fields: Record<string, any> | null;
}

export function RtrDocumentsList({ candidateId }: RtrDocumentsListProps) {
  const { data: rtrDocs, isLoading } = useQuery({
    queryKey: ["rtr-documents", candidateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rtr_documents")
        .select("*")
        .eq("candidate_id", candidateId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as RtrDocument[];
    },
  });

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading RTR documents...</div>;
  }

  if (!rtrDocs || rtrDocs.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No RTR documents sent yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium flex items-center gap-2">
        <FileText className="h-4 w-4" />
        RTR Documents ({rtrDocs.length})
      </h3>

      <div className="space-y-2">
        {rtrDocs.map((doc) => (
          <div
            key={doc.id}
            className="flex items-center justify-between p-3 border rounded-lg bg-card"
          >
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  {format(new Date(doc.sent_at), "MMM d, yyyy")}
                </span>
                <RtrStatusBadge status={doc.status} />
              </div>

              {doc.rtr_fields?.position_title && (
                <p className="text-xs text-muted-foreground">
                  Position: {doc.rtr_fields.position_title}
                </p>
              )}

              {doc.completed_at && (
                <p className="text-xs text-green-600 dark:text-green-400">
                  Signed on {format(new Date(doc.completed_at), "MMM d, yyyy 'at' h:mm a")}
                </p>
              )}

              {doc.viewed_at && doc.status === "viewed" && (
                <p className="text-xs text-yellow-600 dark:text-yellow-400">
                  Viewed on {format(new Date(doc.viewed_at), "MMM d, yyyy 'at' h:mm a")}
                </p>
              )}

              {doc.declined_at && (
                <p className="text-xs text-red-600 dark:text-red-400">
                  Declined on {format(new Date(doc.declined_at), "MMM d, yyyy 'at' h:mm a")}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              {doc.status === "completed" && doc.signed_document_url && (
                <Button
                  size="sm"
                  variant="outline"
                  asChild
                >
                  <a
                    href={doc.signed_document_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    View Signed
                  </a>
                </Button>
              )}

              {(doc.status === "sent" || doc.status === "viewed") && (
                <Button
                  size="sm"
                  variant="ghost"
                  asChild
                >
                  <a
                    href={doc.signing_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Signing Link
                  </a>
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
