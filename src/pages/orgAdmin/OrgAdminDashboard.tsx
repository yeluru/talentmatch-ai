import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { OrgAdminLayout } from "@/components/layouts/OrgAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Mail, Trash2, Users, Shield, FileText, Search } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { format } from "date-fns";
import { StatCard } from "@/components/ui/stat-card";
import { useSearchParams } from "react-router-dom";
import { sortBy, type SortState } from "@/lib/sort";
import { useTableSort } from "@/hooks/useTableSort";
import OrgAdminAuditLogs from "./OrgAdminAuditLogs";

type TeamMember = {
  user_id: string;
  full_name: string;
  email: string;
  role: string;
};

type PendingInvite = {
  id: string;
  email: string;
  full_name: string | null;
  status: string;
  expires_at: string;
  created_at: string;
  invite_token: string;
};

type CandidateRow = {
  user_id: string;
  email: string;
  full_name: string;
  recruiter_status: string | null;
  recruiter_notes: string | null;
};

export default function OrgAdminDashboard() {
  const { user, organizationId } = useAuth();
  const sb = supabase as any;
  const [searchParams, setSearchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const [organizationName, setOrganizationName] = useState("");
  const tabFromUrl = (searchParams.get("tab") || "account_managers") as any;
  const [tab, setTab] = useState<"account_managers" | "recruiters" | "candidates" | "users" | "audit_logs">(tabFromUrl);

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [pendingRecruiterInvites, setPendingRecruiterInvites] = useState<PendingInvite[]>([]);
  const [orgCandidates, setOrgCandidates] = useState<CandidateRow[]>([]);
  const [amByRecruiter, setAmByRecruiter] = useState<Record<string, string>>({});

  const [allUsersSearch, setAllUsersSearch] = useState("");
  const usersSort = useTableSort<"full_name" | "user_type" | "roles" | "candidate_status">({
    key: "full_name",
    dir: "asc",
  });

  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditCursor, setAuditCursor] = useState<string | null>(null);
  const [auditHasMore, setAuditHasMore] = useState(false);
  const [auditExpanded, setAuditExpanded] = useState(false);
  const [auditSearch, setAuditSearch] = useState("");
  const [auditSearchDebounced, setAuditSearchDebounced] = useState("");
  const auditCutoffIso = useMemo(() => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), []);
  const excludedPlatformActions = useMemo(
    () => ["invite_org_admin", "revoke_org_admin", "bootstrap_super_admin"],
    [],
  );

  const auditTableSort = useTableSort<"created_at" | "user" | "action" | "entity" | "ip">({
    key: "created_at",
    dir: "desc",
  });

  useEffect(() => {
    const next = (searchParams.get("tab") || "account_managers") as any;
    if (next && next !== tab) setTab(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviting, setInviting] = useState(false);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);

  const [recruiterInviteEmail, setRecruiterInviteEmail] = useState("");
  const [recruiterInviteName, setRecruiterInviteName] = useState("");
  const [recruiterInviting, setRecruiterInviting] = useState(false);
  const [lastRecruiterInviteUrl, setLastRecruiterInviteUrl] = useState<string | null>(null);

  const [linkCandidateEmail, setLinkCandidateEmail] = useState("");
  const [linkingCandidate, setLinkingCandidate] = useState(false);

  const [editingCandidate, setEditingCandidate] = useState<CandidateRow | null>(null);
  const [editStatus, setEditStatus] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [savingCandidate, setSavingCandidate] = useState(false);

  const managers = useMemo(
    () => teamMembers.filter((m) => m.role === "account_manager"),
    [teamMembers],
  );
  const recruiters = useMemo(
    () => teamMembers.filter((m) => m.role === "recruiter"),
    [teamMembers],
  );

  const updateRecruiterAssignment = async (recruiterUserId: string, accountManagerUserId: string | null) => {
    if (!organizationId || !user) return;
    try {
      if (!accountManagerUserId) {
        await sb
          .from("account_manager_recruiter_assignments")
          .delete()
          .eq("organization_id", organizationId)
          .eq("recruiter_user_id", recruiterUserId);
        setAmByRecruiter((prev) => {
          const next = { ...prev };
          delete next[recruiterUserId];
          return next;
        });
        toast.success("Unassigned recruiter");
        return;
      }

      const { error } = await sb
        .from("account_manager_recruiter_assignments")
        .upsert(
          {
            organization_id: organizationId,
            recruiter_user_id: recruiterUserId,
            account_manager_user_id: accountManagerUserId,
            assigned_by: user.id,
          },
          { onConflict: "organization_id,recruiter_user_id" },
        );
      if (error) throw error;

      setAmByRecruiter((prev) => ({ ...prev, [recruiterUserId]: accountManagerUserId }));
      toast.success("Assigned recruiter");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to update assignment");
    }
  };

  const buildInviteUrl = (token: string) =>
    `${window.location.origin}/auth?invite=${token}`;

  const combinedUsers = useMemo(() => {
    const staffById: Record<string, { user_id: string; full_name: string; email: string; roles: string[] }> = {};
    teamMembers.forEach((m) => {
      const existing = staffById[m.user_id];
      if (!existing) {
        staffById[m.user_id] = { user_id: m.user_id, full_name: m.full_name, email: m.email, roles: [m.role] };
      } else {
        existing.roles.push(m.role);
      }
    });

    const candidates = orgCandidates
      .filter((c) => !staffById[c.user_id])
      .map((c) => ({
        user_id: c.user_id,
        full_name: c.full_name,
        email: c.email,
        roles: ["candidate"],
        candidate_status: c.recruiter_status,
      }));

    const staff = Object.values(staffById).map((s) => ({ ...s, candidate_status: null as string | null }));
    const rows = [...staff, ...candidates];

    const q = allUsersSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      return (
        r.full_name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.roles.some((x) => x.toLowerCase().includes(q))
      );
    });
  }, [allUsersSearch, orgCandidates, teamMembers]);

  const sortedUsers = useMemo(() => {
    return sortBy(combinedUsers, usersSort.sort, (row, key) => {
      switch (key) {
        case "full_name":
          return row.full_name;
        case "user_type":
          return row.roles.includes("candidate") ? "Candidate" : "Staff";
        case "roles":
          return (row.roles || []).join(", ");
        case "candidate_status":
          return row.candidate_status || "";
        default:
          return row.full_name;
      }
    });
  }, [combinedUsers, usersSort.sort]);

  const sortedAuditLogs = useMemo(() => {
    return sortBy(auditLogs, auditTableSort.sort, (r: any, key) => {
      switch (key) {
        case "created_at":
          return r.created_at;
        case "user":
          return r.user_full_name || r.user_email || "";
        case "action":
          return r.action || "";
        case "entity":
          return `${r.entity_type || ""} ${r.entity_id || ""}`.trim();
        case "ip":
          return r.ip_address || "";
        default:
          return r.created_at;
      }
    });
  }, [auditLogs, auditTableSort.sort]);

  useEffect(() => {
    const t = setTimeout(() => setAuditSearchDebounced(auditSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [auditSearch]);

  const buildAuditSearchOr = (q: string) => {
    const pattern = `%${q}%`;
    return [
      `action.ilike.${pattern}`,
      `entity_type.ilike.${pattern}`,
      `user_full_name.ilike.${pattern}`,
      `user_email.ilike.${pattern}`,
      `ip_address.ilike.${pattern}`,
      `details_text.ilike.${pattern}`,
    ].join(",");
  };

  const fetchOrgAuditLogs = async (reset: boolean) => {
    if (!organizationId) return;
    const PAGE = 100;
    setAuditLoading(true);
    try {
      let query = sb
        .from("audit_logs_enriched")
        .select(
          "id, created_at, organization_id, action, entity_type, entity_id, ip_address, details, user_full_name, user_email, details_text, actor_is_super_admin",
        )
        .eq("organization_id", organizationId)
        .eq("actor_is_super_admin", false)
        .order("created_at", { ascending: false })
        .limit(PAGE);

      // Hide platform actions by default for org admins
      query = query.not("action", "in", `(${excludedPlatformActions.map((a) => `"${a}"`).join(",")})`);

      if (!auditSearchDebounced) {
        if (!auditExpanded) query = query.gte("created_at", auditCutoffIso);
      } else {
        query = query.or(buildAuditSearchOr(auditSearchDebounced));
      }

      const cursor = reset ? null : auditCursor;
      if (cursor) query = query.lt("created_at", cursor);

      const { data, error } = await query;
      if (error) throw error;

      const rows = (data ?? []) as any[];
      const next = reset ? rows : [...auditLogs, ...rows];
      setAuditLogs(next);
      setAuditHasMore(rows.length === PAGE);
      setAuditCursor(rows[rows.length - 1]?.created_at || null);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load audit logs");
    } finally {
      setAuditLoading(false);
    }
  };

  const fetchData = async () => {
    if (!organizationId) return;
    setIsLoading(true);
    try {
      const { data: org } = await sb
        .from("organizations")
        .select("name")
        .eq("id", organizationId)
        .maybeSingle();
      setOrganizationName(org?.name || "");

      const { data: rolesData } = await sb
        .from("user_roles")
        .select("user_id, role")
        .eq("organization_id", organizationId);

      const userIds = (rolesData ?? []).map((r) => r.user_id);
      const { data: profiles } = await sb
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", userIds);

      const combined: TeamMember[] = (rolesData ?? []).map((r) => ({
        user_id: r.user_id,
        role: r.role,
        full_name: profiles?.find((p) => p.user_id === r.user_id)?.full_name || "User",
        email: profiles?.find((p) => p.user_id === r.user_id)?.email || "",
      }));

      setTeamMembers(combined);

      // Account manager → recruiter assignments
      const { data: assigns } = await sb
        .from("account_manager_recruiter_assignments")
        .select("recruiter_user_id, account_manager_user_id")
        .eq("organization_id", organizationId);
      const map: Record<string, string> = {};
      (assigns ?? []).forEach((a: any) => {
        if (a?.recruiter_user_id && a?.account_manager_user_id) {
          map[String(a.recruiter_user_id)] = String(a.account_manager_user_id);
        }
      });
      setAmByRecruiter(map);

      const { data: invites } = await sb
        .from("manager_invites")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      setPendingInvites((invites ?? []) as PendingInvite[]);

      const { data: recruiterInvites } = await sb
        .from("recruiter_invites")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      setPendingRecruiterInvites((recruiterInvites ?? []) as PendingInvite[]);

      // Org candidates (linked to this org)
      // NOTE: org linking is many-to-many via candidate_org_links.
      const { data: candidateLinks } = await sb
        .from("candidate_org_links")
        .select("candidate_profiles:candidate_id(user_id, recruiter_status, recruiter_notes)")
        .eq("organization_id", organizationId)
        .eq("status", "active");

      const candidateProfiles = (candidateLinks ?? [])
        .map((l: any) => l.candidate_profiles)
        .filter((cp: any) => Boolean(cp) && Boolean(cp.user_id)) as any[];

      const candidateUserIds = candidateProfiles.map((c: any) => c.user_id).filter(Boolean) as string[];
      const { data: candidateProfilesRows } = candidateUserIds.length
        ? await sb.from("profiles").select("user_id, email, full_name").in("user_id", candidateUserIds)
        : { data: [] as any[] };

      const combinedCandidates: CandidateRow[] = candidateProfiles.map((c: any) => {
        const p = (candidateProfilesRows ?? []).find((x: any) => x.user_id === c.user_id);
        const email = p?.email || "";
        const fullName = p?.full_name || (email ? email.split("@")[0] : "") || "Candidate";
        return {
          user_id: c.user_id,
          recruiter_status: c.recruiter_status ?? null,
          recruiter_notes: c.recruiter_notes ?? null,
          email,
          full_name: fullName,
        };
      });
      setOrgCandidates(combinedCandidates);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load org admin dashboard");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user && organizationId) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, organizationId]);

  // Load audit logs automatically when the user opens the Audit Logs tab,
  // and whenever the search string changes.
  useEffect(() => {
    if (tab !== "audit_logs") return;
    if (!organizationId) return;
    setAuditExpanded(false);
    setAuditCursor(null);
    fetchOrgAuditLogs(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, organizationId, auditSearchDebounced]);

  const sendManagerInvite = async () => {
    if (!organizationId || !organizationName) return;
    setInviting(true);
    setLastInviteUrl(null);
    try {
      const { data, error } = await sb.functions.invoke("send-manager-invite", {
        body: {
          email: inviteEmail,
          fullName: inviteName,
          organizationId,
          organizationName,
        },
      });

      if (error) throw error;
      const inviteUrl = (data as any)?.inviteUrl as string | undefined;
      if (inviteUrl) {
        setLastInviteUrl(inviteUrl);
        try {
          await navigator.clipboard.writeText(inviteUrl);
          toast.success("Account manager invite created (link copied to clipboard)");
          toast.message(inviteUrl);
        } catch {
          toast.success("Account manager invite created");
          toast.message(inviteUrl);
        }
      } else {
        toast.success(`Invitation created for ${inviteEmail}`);
      }

      setInviteEmail("");
      setInviteName("");
      await fetchData();
    } catch (e: any) {
      // "Failed to fetch" is usually because functions aren't being served locally.
      const msg = e?.message || "Failed to send invite";
      toast.error(msg.includes("Failed to fetch")
        ? "Failed to reach Edge Functions. Make sure `supabase functions serve` is running."
        : msg);
    } finally {
      setInviting(false);
    }
  };

  const reInviteManager = async (inv: PendingInvite) => {
    if (!organizationId || !organizationName) return;
    try {
      const { data, error } = await sb.functions.invoke("send-manager-invite", {
        body: {
          email: inv.email,
          fullName: inv.full_name || undefined,
          organizationId,
          organizationName,
        },
      });
      if (error) throw error;

      // Remove old pending invite so only the latest link remains.
      await sb.from("manager_invites").delete().eq("id", inv.id);

      const inviteUrl = (data as any)?.inviteUrl as string | undefined;
      if (inviteUrl) {
        try {
          await navigator.clipboard.writeText(inviteUrl);
          toast.success("Account manager re-invited (new link copied)");
        } catch {
          toast.success("Account manager re-invited");
        }
      } else {
        toast.success("Account manager re-invited");
      }

      await fetchData();
    } catch (e: any) {
      toast.error(e?.message || "Failed to re-invite account manager");
    }
  };

  const sendRecruiterInvite = async () => {
    if (!organizationId || !organizationName) return;
    setRecruiterInviting(true);
    setLastRecruiterInviteUrl(null);
    try {
      const { data, error } = await sb.functions.invoke("send-recruiter-invite", {
        body: {
          email: recruiterInviteEmail,
          fullName: recruiterInviteName,
          organizationId,
          organizationName,
        },
      });
      if (error) throw error;
      const inviteUrl = (data as any)?.inviteUrl as string | undefined;
      if (inviteUrl) {
        setLastRecruiterInviteUrl(inviteUrl);
        try {
          await navigator.clipboard.writeText(inviteUrl);
          toast.success("Recruiter invite created (link copied to clipboard)");
        } catch {
          toast.success("Recruiter invite created");
        }
      } else {
        toast.success(`Recruiter invitation created for ${recruiterInviteEmail}`);
      }

      setRecruiterInviteEmail("");
      setRecruiterInviteName("");
      await fetchData();
    } catch (e: any) {
      toast.error(e?.message || "Failed to invite recruiter");
    } finally {
      setRecruiterInviting(false);
    }
  };

  const reInviteRecruiter = async (inv: PendingInvite) => {
    if (!organizationId || !organizationName) return;
    try {
      const { data, error } = await sb.functions.invoke("send-recruiter-invite", {
        body: {
          email: inv.email,
          fullName: inv.full_name || undefined,
          organizationId,
          organizationName,
        },
      });
      if (error) throw error;

      await sb.from("recruiter_invites").delete().eq("id", inv.id);

      const inviteUrl = (data as any)?.inviteUrl as string | undefined;
      if (inviteUrl) {
        try {
          await navigator.clipboard.writeText(inviteUrl);
          toast.success("Recruiter re-invited (new link copied)");
        } catch {
          toast.success("Recruiter re-invited");
        }
      } else {
        toast.success("Recruiter re-invited");
      }

      await fetchData();
    } catch (e: any) {
      toast.error(e?.message || "Failed to re-invite recruiter");
    }
  };

  const cancelRecruiterInvite = async (inviteId: string) => {
    try {
      const { error } = await sb.from("recruiter_invites").delete().eq("id", inviteId);
      if (error) throw error;
      toast.success("Recruiter invitation cancelled");
      await fetchData();
    } catch (e: any) {
      toast.error(e?.message || "Failed to cancel recruiter invite");
    }
  };

  const removeRecruiter = async (recruiterUserId: string) => {
    try {
      const { error } = await sb.rpc("remove_recruiter_from_org", { _user_id: recruiterUserId });
      if (error) throw error;
      toast.success("Recruiter removed");
      await fetchData();
    } catch (e: any) {
      toast.error(e?.message || "Failed to remove recruiter");
    }
  };

  const linkCandidateByEmail = async () => {
    if (!linkCandidateEmail.trim()) return;
    setLinkingCandidate(true);
    try {
      const { error } = await sb.rpc("org_admin_link_candidate_by_email", {
        _email: linkCandidateEmail.trim(),
      });
      if (error) throw error;
      toast.success("Candidate linked to organization");
      setLinkCandidateEmail("");
      await fetchData();
    } catch (e: any) {
      toast.error(e?.message || "Failed to link candidate");
    } finally {
      setLinkingCandidate(false);
    }
  };

  const unlinkCandidate = async (candidateUserId: string) => {
    try {
      const { error } = await sb.rpc("org_admin_unlink_candidate", {
        _candidate_user_id: candidateUserId,
      });
      if (error) throw error;
      toast.success("Candidate unlinked from organization");
      await fetchData();
    } catch (e: any) {
      toast.error(e?.message || "Failed to unlink candidate");
    }
  };

  const openEditCandidate = (c: CandidateRow) => {
    setEditingCandidate(c);
    setEditStatus(c.recruiter_status || "");
    setEditNotes(c.recruiter_notes || "");
  };

  const saveCandidate = async () => {
    if (!editingCandidate) return;
    setSavingCandidate(true);
    try {
      const { error } = await sb.rpc("org_admin_update_candidate_admin_fields", {
        _candidate_user_id: editingCandidate.user_id,
        _recruiter_status: editStatus || null,
        _recruiter_notes: editNotes || null,
      });
      if (error) throw error;
      toast.success("Candidate updated");
      setEditingCandidate(null);
      await fetchData();
    } catch (e: any) {
      toast.error(e?.message || "Failed to update candidate");
    } finally {
      setSavingCandidate(false);
    }
  };

  const cancelInvite = async (inviteId: string) => {
    try {
      const { error } = await sb.from("manager_invites").delete().eq("id", inviteId);
      if (error) throw error;
      toast.success("Invitation cancelled");
      await fetchData();
    } catch (e: any) {
      toast.error(e?.message || "Failed to cancel invite");
    }
  };

  const removeManager = async (managerUserId: string) => {
    try {
      const { error } = await sb.rpc("remove_manager_from_org", { _user_id: managerUserId });
      if (error) throw error;
      toast.success("Account manager removed");
      await fetchData();
    } catch (e: any) {
      toast.error(e?.message || "Failed to remove account manager");
    }
  };

  if (isLoading) {
    return (
      <OrgAdminLayout orgName={organizationName}>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </OrgAdminLayout>
    );
  }

  return (
    <OrgAdminLayout orgName={organizationName}>
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <StatCard
            title="Account Managers"
            value={managers.length}
            icon={Users}
            href="/org-admin?tab=account_managers"
          />
          <StatCard
            title="Recruiters"
            value={recruiters.length}
            icon={Users}
            href="/org-admin?tab=recruiters"
          />
          <StatCard
            title="Candidates"
            value={orgCandidates.length}
            icon={Users}
            href="/org-admin?tab=candidates"
          />
          <StatCard
            title="All Users"
            value={combinedUsers.length}
            icon={Users}
            href="/org-admin?tab=users"
          />
          <StatCard
            title="Audit Logs"
            value={auditLogs.length}
            icon={FileText}
            href="/org-admin?tab=audit_logs"
          />
        </div>
        <div className="flex items-center justify-end">
          <Dialog>
            <DialogTrigger asChild>
              <Button>
                <Mail className="h-4 w-4 mr-2" />
                Invite Account Manager
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite Account Manager</DialogTitle>
                <DialogDescription>
                  Send an invite link to create an account manager account for this organization.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="accountmanager@example.com" />
                </div>
                <div className="space-y-2">
                  <Label>Full name</Label>
                  <Input value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Jane Doe" />
                </div>
              </div>
              {lastInviteUrl && (
                <div className="rounded-md border bg-muted/20 p-3">
                  <p className="text-xs">Invite link (local email may be skipped)</p>
                  <p className="mt-1 break-all text-sm font-medium">{lastInviteUrl}</p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        await navigator.clipboard.writeText(lastInviteUrl);
                        toast.success("Copied invite link");
                      }}
                    >
                      Copy
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(lastInviteUrl, "_blank")}
                    >
                      Open
                    </Button>
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button onClick={sendManagerInvite} disabled={inviting || !inviteEmail || !inviteName}>
                  {inviting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Send invite
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs
          value={tab}
          onValueChange={(v) => {
            const next = v as any;
            setTab(next);
            setSearchParams((prev) => {
              const p = new URLSearchParams(prev);
              p.set("tab", next);
              return p;
            });
          }}
        >
          <TabsList>
            <TabsTrigger value="account_managers">Account Managers</TabsTrigger>
            <TabsTrigger value="recruiters">Recruiters</TabsTrigger>
            <TabsTrigger value="candidates">Candidates</TabsTrigger>
            <TabsTrigger value="users">All Users</TabsTrigger>
            <TabsTrigger value="audit_logs">Audit Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="account_managers" className="mt-6 space-y-6">
            {pendingInvites.length > 0 && (
              <div className="glass-panel p-6 rounded-xl hover-card-premium">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold">Pending invitations</h3>
                  <p className="text-sm text-muted-foreground">{pendingInvites.length} pending</p>
                </div>
                <div className="space-y-3">
                  {pendingInvites.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between glass-panel p-4 rounded-xl hover:bg-white/5 transition-colors">
                      <div>
                        <p className="font-medium">{inv.full_name || inv.email}</p>
                        <p className="text-sm text-muted-foreground">{inv.email}</p>
                        <p className="mt-1 text-xs break-all opacity-70">
                          Invite link: {buildInviteUrl(inv.invite_token)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            await navigator.clipboard.writeText(buildInviteUrl(inv.invite_token));
                            toast.success("Copied invite link");
                          }}
                        >
                          Copy
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(buildInviteUrl(inv.invite_token), "_blank")}
                        >
                          Open
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => reInviteManager(inv)}>
                          Resend
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => cancelInvite(inv.id)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="glass-panel p-6 rounded-xl relative overflow-hidden">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    Account Managers
                  </h3>
                  <p className="text-sm text-muted-foreground">{managers.length} active members</p>
                </div>
              </div>

              <div className="space-y-3">
                {managers.length === 0 ? (
                  <div className="text-center py-12 border-2 border-dashed border-white/10 rounded-xl">
                    <Users className="h-10 w-10 mx-auto text-muted-foreground mb-3 opacity-50" />
                    <p className="text-sm text-muted-foreground">No account managers yet.</p>
                  </div>
                ) : (
                  managers.map((m) => (
                    <div key={m.user_id} className="flex items-center justify-between glass-panel p-4 rounded-xl hover-card-premium group">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="font-semibold text-primary">{m.full_name?.[0] || m.email[0]}</span>
                        </div>
                        <div>
                          <p className="font-medium">{m.full_name}</p>
                          <p className="text-sm text-muted-foreground">{m.email}</p>
                        </div>
                      </div>
                      {m.user_id !== user?.id ? (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Trash2 className="h-4 w-4 mr-2" />
                              Remove
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove account manager</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will revoke account manager access for <strong>{m.email}</strong>.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => removeManager(m.user_id)}
                              >
                                Remove
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      ) : (
                        <Badge variant="secondary" className="glass-panel">You</Badge>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="users" className="mt-6">
            <div className="glass-panel p-6 rounded-xl hover-card-premium relative overflow-hidden">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div className="space-y-1">
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    All users in organization
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Staff roles come from <code className="font-mono text-xs bg-white/5 px-1 py-0.5 rounded">user_roles</code>. Candidates come from <code className="font-mono text-xs bg-white/5 px-1 py-0.5 rounded">candidate_profiles</code>.
                  </p>
                </div>
                <div className="relative w-full md:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={allUsersSearch}
                    onChange={(e) => setAllUsersSearch(e.target.value)}
                    placeholder="Search name / email / role…"
                    className="pl-9 bg-black/20 border-white/10"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-white/5 overflow-hidden">
                <Table>
                  <TableHeader className="bg-white/5">
                    <TableRow className="hover:bg-white/5 border-white/5">
                      <SortableTableHead
                        label="User"
                        sortKey="full_name"
                        sort={usersSort.sort}
                        onToggle={usersSort.toggle}
                      />
                      <SortableTableHead
                        label="Type"
                        sortKey="user_type"
                        sort={usersSort.sort}
                        onToggle={usersSort.toggle}
                      />
                      <SortableTableHead
                        label="Roles"
                        sortKey="roles"
                        sort={usersSort.sort}
                        onToggle={usersSort.toggle}
                      />
                      <SortableTableHead
                        label="Candidate status"
                        sortKey="candidate_status"
                        sort={usersSort.sort}
                        onToggle={usersSort.toggle}
                      />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedUsers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                          <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                          No users found matching your search.
                        </TableCell>
                      </TableRow>
                    ) : (
                      sortedUsers.map((r) => (
                        <TableRow key={r.user_id} className="hover:bg-white/5 border-white/5 transition-colors">
                          <TableCell>
                            <div>
                              <p className="font-medium text-foreground">{r.full_name}</p>
                              <p className="text-sm text-muted-foreground">{r.email}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs border-white/10 bg-white/5">
                              {r.roles.includes("candidate") ? "Candidate" : "Staff"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {r.roles.map((role) => (
                                <Badge key={role} variant="secondary" className="text-xs bg-secondary/50 text-secondary-foreground border-transparent">
                                  {role === "account_manager" ? "account manager" : role.replace("_", " ")}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {r.candidate_status ? (
                              <Badge variant="outline" className="text-xs border-white/10">{r.candidate_status}</Badge>
                            ) : (
                              <span className="opacity-50">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="audit_logs" className="mt-6 space-y-6">
            <OrgAdminAuditLogs embedded />
          </TabsContent>

          <TabsContent value="recruiters" className="mt-6 space-y-6">
            <div className="glass-panel p-6 rounded-xl hover-card-premium relative overflow-hidden">
              <div className="flex flex-row items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    Recruiters
                  </h3>
                  <p className="text-sm text-muted-foreground">Invite and manage recruiters in your organization.</p>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button className="glass-panel text-primary-foreground hover:bg-primary/90">
                      <Mail className="h-4 w-4 mr-2" />
                      Invite Recruiter
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Invite Recruiter</DialogTitle>
                      <DialogDescription>
                        Send an invite link to create a recruiter account for this organization.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="space-y-2">
                        <Label>Email</Label>
                        <Input value={recruiterInviteEmail} onChange={(e) => setRecruiterInviteEmail(e.target.value)} placeholder="recruiter@example.com" />
                      </div>
                      <div className="space-y-2">
                        <Label>Full name</Label>
                        <Input value={recruiterInviteName} onChange={(e) => setRecruiterInviteName(e.target.value)} placeholder="Jane Doe" />
                      </div>
                      {lastRecruiterInviteUrl && (
                        <div className="rounded-md border bg-muted/20 p-3">
                          <p className="text-xs">Invite link (local email may be skipped)</p>
                          <p className="mt-1 break-all text-sm font-medium">{lastRecruiterInviteUrl}</p>
                          <div className="mt-2 flex gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={async () => {
                              await navigator.clipboard.writeText(lastRecruiterInviteUrl);
                              toast.success("Copied invite link");
                            }}>
                              Copy
                            </Button>
                            <Button type="button" variant="outline" size="sm" onClick={() => window.open(lastRecruiterInviteUrl, "_blank")}>
                              Open
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button onClick={sendRecruiterInvite} disabled={recruiterInviting || !recruiterInviteEmail || !recruiterInviteName}>
                        {recruiterInviting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Create invite
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="space-y-4">
                {pendingRecruiterInvites.length > 0 && (
                  <div className="space-y-2 mb-6 p-4 glass-panel rounded-xl bg-muted/5">
                    <p className="text-sm font-medium flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      Pending recruiter invitations
                    </p>
                    {pendingRecruiterInvites.map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between rounded-lg border border-white/5 bg-black/10 p-3">
                        <div>
                          <p className="font-medium">{inv.full_name || inv.email}</p>
                          <p className="text-sm text-muted-foreground">{inv.email}</p>
                          <p className="mt-1 text-xs break-all opacity-50">
                            Invite link: {buildInviteUrl(inv.invite_token)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              await navigator.clipboard.writeText(buildInviteUrl(inv.invite_token));
                              toast.success("Copied invite link");
                            }}
                          >
                            Copy
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(buildInviteUrl(inv.invite_token), "_blank")}
                          >
                            Open
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => reInviteRecruiter(inv)}>
                            Resend
                          </Button>
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => cancelRecruiterInvite(inv.id)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {recruiters.length === 0 ? (
                  <div className="text-center py-12 border-2 border-dashed border-white/10 rounded-xl">
                    <Users className="h-10 w-10 mx-auto text-muted-foreground mb-3 opacity-50" />
                    <p className="text-sm text-muted-foreground">No recruiters yet.</p>
                  </div>
                ) : (
                  recruiters.map((r) => (
                    <div key={r.user_id} className="flex items-start md:items-center justify-between glass-panel p-4 rounded-xl hover-card-premium group flex-col md:flex-row gap-4">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-full bg-secondary/20 flex items-center justify-center shrink-0">
                          <span className="font-semibold text-secondary-foreground">{r.full_name?.[0] || r.email[0]}</span>
                        </div>
                        <div>
                          <p className="font-medium">{r.full_name}</p>
                          <p className="text-sm text-muted-foreground">{r.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 w-full md:w-auto">
                        <div className="w-full md:w-[260px]">
                          <Select
                            value={amByRecruiter[String(r.user_id)] || "unassigned"}
                            onValueChange={(v) => updateRecruiterAssignment(String(r.user_id), v === "unassigned" ? null : String(v))}
                          >
                            <SelectTrigger className="bg-transparent border-white/10">
                              <SelectValue placeholder="Assign account manager" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unassigned">Unassigned</SelectItem>
                              {managers.map((m) => (
                                <SelectItem key={m.user_id} value={String(m.user_id)}>
                                  {m.full_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <div className="mt-1 text-[10px] text-muted-foreground px-1">
                            Assigned Account Manager
                          </div>
                        </div>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove recruiter</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will revoke recruiter access for <strong>{r.email}</strong>.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => removeRecruiter(r.user_id)}
                              >
                                Remove
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="candidates" className="mt-6 space-y-6">
            <div className="glass-panel p-6 rounded-xl hover-card-premium relative overflow-hidden">
              <div className="flex flex-row items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    Candidates in your organization
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Public candidates are not visible by default. Link a candidate to your org by email to manage them here.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end glass-panel p-4 rounded-xl bg-muted/5">
                  <div className="flex-1 space-y-2">
                    <Label>Link candidate by email</Label>
                    <Input
                      value={linkCandidateEmail}
                      onChange={(e) => setLinkCandidateEmail(e.target.value)}
                      placeholder="candidate@example.com"
                      className="bg-transparent border-white/10"
                    />
                  </div>
                  <Button onClick={linkCandidateByEmail} disabled={linkingCandidate || !linkCandidateEmail.trim()}>
                    {linkingCandidate && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Link candidate
                  </Button>
                </div>

                {orgCandidates.length === 0 ? (
                  <div className="text-center py-12 border-2 border-dashed border-white/10 rounded-xl">
                    <Users className="h-10 w-10 mx-auto text-muted-foreground mb-3 opacity-50" />
                    <p className="text-sm text-muted-foreground">No org-linked candidates yet.</p>
                  </div>
                ) : (
                  orgCandidates.map((c) => (
                    <div key={c.user_id} className="flex items-start justify-between glass-panel p-4 rounded-xl hover-card-premium group">
                      <div>
                        <p className="font-medium">{c.full_name}</p>
                        <p className="text-sm text-muted-foreground">{c.email}</p>
                        {(c.recruiter_status || c.recruiter_notes) && (
                          <div className="mt-2 text-xs flex gap-2 items-center text-muted-foreground/80">
                            {c.recruiter_status && <Badge variant="outline" className="text-[10px] h-5">{c.recruiter_status}</Badge>}
                            {c.recruiter_notes && <span>{c.recruiter_notes}</span>}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="sm" onClick={() => openEditCandidate(c)}>Edit</Button>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => unlinkCandidate(c.user_id)}>Unlink</Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <Dialog open={!!editingCandidate} onOpenChange={(open) => !open && setEditingCandidate(null)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit candidate</DialogTitle>
                  <DialogDescription>Update internal status and notes for this candidate in your organization.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Input value={editStatus} onChange={(e) => setEditStatus(e.target.value)} placeholder="e.g. New, Shortlisted, Rejected" />
                  </div>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Internal notes..." />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setEditingCandidate(null)}>Cancel</Button>
                  <Button onClick={saveCandidate} disabled={savingCandidate}>
                    {savingCandidate && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Save
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>
        </Tabs>
      </div>
    </OrgAdminLayout >
  );
}


