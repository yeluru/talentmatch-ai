import { Badge } from "@/components/ui/badge";

interface RtrStatusBadgeProps {
  status: "sent" | "viewed" | "completed" | "declined";
}

export function RtrStatusBadge({ status }: RtrStatusBadgeProps) {
  const config = {
    sent: {
      label: "Sent",
      variant: "secondary" as const,
      className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
    },
    viewed: {
      label: "Viewed",
      variant: "secondary" as const,
      className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
    },
    completed: {
      label: "Signed",
      variant: "default" as const,
      className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
    },
    declined: {
      label: "Declined",
      variant: "destructive" as const,
      className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
    }
  };

  const { label, variant, className } = config[status] || config.sent;

  return (
    <Badge variant={variant} className={className}>
      {label}
    </Badge>
  );
}
