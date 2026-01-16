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
import { toast } from "sonner";
import { Loader2, Mail, Trash2, Users, Shield, FileText } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { StatCard } from "@/components/ui/stat-card";
import { useSearchParams } from "react-router-dom";

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

  const [allUsersSearch, setAllUsersSearch] = useState("");

  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditCursor, setAuditCursor] = useState<string | null>(null);
  const [auditHasMore, setAuditHasMore] = useState(false);
  const [auditExpanded, setAuditExpanded] = useState(false);
  const [auditSearch, setAuditSearch] = useState("");
  const [auditSearchDebounced, setAuditSearchDebounced] = useState("");
  const auditCutoffIso = useMemo(() => new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), []);
  const excludedPlatformActions = useMemo(
    () => ["invite_org_admin", "revoke_org_admin", "bootstrap_super_admin"],
    [],
  );

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
    const rows = [...staff, ...candidates].sort((a, b) => a.full_name.localeCompare(b.full_name));

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
      const { data: candidateProfiles } = await sb
        .from("candidate_profiles")
        .select("user_id, recruiter_status, recruiter_notes")
        .eq("organization_id", organizationId);

      const candidateUserIds = (candidateProfiles ?? []).map((c: any) => c.user_id).filter(Boolean) as string[];
      const { data: candidateProfilesRows } = await sb
        .from("profiles")
        .select("user_id, email, full_name")
        .in("user_id", candidateUserIds);

      const combinedCandidates: CandidateRow[] = (candidateProfiles ?? []).map((c: any) => ({
        user_id: c.user_id,
        recruiter_status: c.recruiter_status ?? null,
        recruiter_notes: c.recruiter_notes ?? null,
        email: candidateProfilesRows?.find((p) => p.user_id === c.user_id)?.email || "",
        full_name: candidateProfilesRows?.find((p) => p.user_id === c.user_id)?.full_name || "Candidate",
      }));
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
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
                  <p className="text-xs text-muted-foreground">Invite link (local email may be skipped)</p>
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
              <Card className="card-elevated">
                <CardHeader>
                  <CardTitle>Pending account manager invitations</CardTitle>
                  <CardDescription>{pendingInvites.length} pending</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {pendingInvites.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between rounded-md border p-3">
                      <div>
                        <p className="font-medium">{inv.full_name || inv.email}</p>
                        <p className="text-sm text-muted-foreground">{inv.email}</p>
                        <p className="mt-1 text-xs text-muted-foreground break-all">
                          Invite link: {buildInviteUrl(inv.invite_token)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          onClick={async () => {
                            await navigator.clipboard.writeText(buildInviteUrl(inv.invite_token));
                            toast.success("Copied invite link");
                          }}
                        >
                          Copy link
                        </Button>
                        <Button variant="outline" onClick={() => window.open(buildInviteUrl(inv.invite_token), "_blank")}>
                          Open
                        </Button>
                        <Button variant="outline" onClick={() => reInviteManager(inv)}>
                          Re-invite
                        </Button>
                        <Button variant="outline" onClick={() => cancelInvite(inv.id)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <Card className="card-elevated">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Account Managers
                </CardTitle>
                <CardDescription>{managers.length} account manager(s)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {managers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No account managers yet.</p>
                ) : (
                  managers.map((m) => (
                    <div key={m.user_id} className="flex items-center justify-between rounded-md border p-3">
                      <div>
                        <p className="font-medium">{m.full_name}</p>
                        <p className="text-sm text-muted-foreground">{m.email}</p>
                      </div>
                      {m.user_id !== user?.id ? (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive">
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
                        <Badge variant="secondary">You</Badge>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users" className="mt-6">
            <Card className="card-elevated">
              <CardHeader>
                <CardTitle>All users in organization</CardTitle>
                <CardDescription>
                  Staff roles come from <code className="font-mono">user_roles</code>. Candidates come from{" "}
                  <code className="font-mono">candidate_profiles</code>.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="max-w-sm">
                  <Input
                    value={allUsersSearch}
                    onChange={(e) => setAllUsersSearch(e.target.value)}
                    placeholder="Search name / email / role…"
                  />
                </div>

                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Roles</TableHead>
                        <TableHead>Candidate status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {combinedUsers.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                            No users found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        combinedUsers.map((r) => (
                          <TableRow key={r.user_id}>
                            <TableCell>
                              <div>
                                <p className="font-medium">{r.full_name}</p>
                                <p className="text-sm text-muted-foreground">{r.email}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {r.roles.includes("candidate") ? "Candidate" : "Staff"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {r.roles.map((role) => (
                                  <Badge key={role} variant="secondary" className="text-xs">
                                    {role === "account_manager" ? "account manager" : role.replace("_", " ")}
                                  </Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{r.candidate_status || "—"}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audit_logs" className="mt-6 space-y-6">
            <Card className="card-elevated">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Audit Logs</CardTitle>
                  <CardDescription>
                    Tenant activity for your organization. Platform admin actions are hidden by default.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    placeholder="Search audit logs…"
                    className="w-[260px]"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setAuditExpanded(false);
                      setAuditCursor(null);
                      fetchOrgAuditLogs(true);
                    }}
                    disabled={auditLoading}
                  >
                    {auditLoading ? "Refreshing…" : "Refresh"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Entity</TableHead>
                        <TableHead>IP</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditLogs.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                            No audit logs found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        auditLogs.map((log: any) => (
                          <TableRow key={log.id}>
                            <TableCell className="text-muted-foreground whitespace-nowrap">
                              {format(new Date(log.created_at), "MMM d, yyyy HH:mm:ss")}
                            </TableCell>
                            <TableCell className="max-w-[220px]">
                              <span className="truncate block">{log.user_full_name || log.user_email || "Unknown"}</span>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {log.action}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {log.entity_type}
                              {log.entity_id ? ` (${String(log.entity_id).slice(0, 8)}…)` : ""}
                            </TableCell>
                            <TableCell className="text-muted-foreground">{log.ip_address || "—"}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">
                    {!auditSearchDebounced && !auditExpanded ? "Showing last 4 hours" : "Showing full history (paged)"}
                  </div>
                  <div className="flex gap-2">
                    {!auditSearchDebounced && !auditExpanded && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setAuditExpanded(true);
                          fetchOrgAuditLogs(false);
                        }}
                        disabled={auditLoading || !auditHasMore}
                      >
                        Load older logs (100)
                      </Button>
                    )}
                    {(auditSearchDebounced || auditExpanded) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fetchOrgAuditLogs(false)}
                        disabled={auditLoading || !auditHasMore}
                      >
                        Load more (100)
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="recruiters" className="mt-6 space-y-6">
            <Card className="card-elevated">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Recruiters</CardTitle>
                  <CardDescription>Invite and manage recruiters in your organization.</CardDescription>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline">
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
                          <p className="text-xs text-muted-foreground">Invite link (local email may be skipped)</p>
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
              </CardHeader>
              <CardContent className="space-y-3">
                {pendingRecruiterInvites.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Pending recruiter invitations</p>
                    {pendingRecruiterInvites.map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between rounded-md border p-3">
                        <div>
                          <p className="font-medium">{inv.full_name || inv.email}</p>
                          <p className="text-sm text-muted-foreground">{inv.email}</p>
                          <p className="mt-1 text-xs text-muted-foreground break-all">
                            Invite link: {buildInviteUrl(inv.invite_token)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            onClick={async () => {
                              await navigator.clipboard.writeText(buildInviteUrl(inv.invite_token));
                              toast.success("Copied invite link");
                            }}
                          >
                            Copy link
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => window.open(buildInviteUrl(inv.invite_token), "_blank")}
                          >
                            Open
                          </Button>
                          <Button variant="outline" onClick={() => reInviteRecruiter(inv)}>
                            Re-invite
                          </Button>
                          <Button variant="outline" onClick={() => cancelRecruiterInvite(inv.id)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {recruiters.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No recruiters yet.</p>
                ) : (
                  recruiters.map((r) => (
                    <div key={r.user_id} className="flex items-center justify-between rounded-md border p-3">
                      <div>
                        <p className="font-medium">{r.full_name}</p>
                        <p className="text-sm text-muted-foreground">{r.email}</p>
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive">
                            <Trash2 className="h-4 w-4 mr-2" />
                            Remove
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
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="candidates" className="mt-6 space-y-6">
            <Card className="card-elevated">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Candidates in your organization</CardTitle>
                  <CardDescription>
                    Public candidates are not visible by default. Link a candidate to your org by email to manage them here.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex-1 space-y-2">
                    <Label>Link candidate by email</Label>
                    <Input value={linkCandidateEmail} onChange={(e) => setLinkCandidateEmail(e.target.value)} placeholder="candidate@example.com" />
                  </div>
                  <Button onClick={linkCandidateByEmail} disabled={linkingCandidate || !linkCandidateEmail.trim()}>
                    {linkingCandidate && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Link candidate
                  </Button>
                </div>

                {orgCandidates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No org-linked candidates yet.</p>
                ) : (
                  orgCandidates.map((c) => (
                    <div key={c.user_id} className="flex items-start justify-between rounded-md border p-3">
                      <div>
                        <p className="font-medium">{c.full_name}</p>
                        <p className="text-sm text-muted-foreground">{c.email}</p>
                        {(c.recruiter_status || c.recruiter_notes) && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            {c.recruiter_status ? `Status: ${c.recruiter_status}` : ""}
                            {c.recruiter_status && c.recruiter_notes ? " • " : ""}
                            {c.recruiter_notes ? `Notes: ${c.recruiter_notes}` : ""}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={() => openEditCandidate(c)}>Edit</Button>
                        <Button variant="destructive" onClick={() => unlinkCandidate(c.user_id)}>Unlink</Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

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
    </OrgAdminLayout>
  );
}


