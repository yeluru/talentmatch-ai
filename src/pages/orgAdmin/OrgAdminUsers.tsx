import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { Loader2, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { sortBy } from "@/lib/sort";
import { useTableSort } from "@/hooks/useTableSort";

type Row = {
  user_id: string;
  full_name: string;
  email: string;
  roles: string[];
  user_type: "Staff" | "Candidate";
};

export default function OrgAdminUsers() {
  const { organizationId, isLoading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const tableSort = useTableSort<"full_name" | "user_type" | "roles">({ key: "full_name", dir: "asc" });

  useEffect(() => {
    if (authLoading) return;
    if (!organizationId) {
      setLoading(false);
      return;
    }
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, authLoading]);

  const fetchUsers = async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      // Staff users: from user_roles in this org
      const { data: roleRows, error: roleErr } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("organization_id", organizationId);
      if (roleErr) throw roleErr;

      const staffUserIds = [...new Set((roleRows ?? []).map((r: any) => r.user_id).filter(Boolean))] as string[];

      const { data: staffProfiles, error: profErr } = staffUserIds.length
        ? await supabase.from("profiles").select("user_id, full_name, email").in("user_id", staffUserIds)
        : { data: [] as any[], error: null };
      if (profErr) throw profErr;

      const rolesByUser: Record<string, string[]> = {};
      (roleRows ?? []).forEach((r: any) => {
        rolesByUser[r.user_id] = rolesByUser[r.user_id] || [];
        rolesByUser[r.user_id].push(r.role);
      });

      const staff: Row[] = (staffProfiles ?? []).map((p: any) => ({
        user_id: p.user_id,
        full_name: p.full_name,
        email: p.email,
        roles: rolesByUser[p.user_id] || [],
        user_type: "Staff",
      }));

      // Candidates linked to this org: via candidate_org_links -> candidate_profiles -> profiles
      const { data: candidateLinks, error: candErr } = await supabase
        .from("candidate_org_links")
        .select("candidate_profiles:candidate_id(user_id)")
        .eq("organization_id", organizationId)
        .eq("status", "active");
      if (candErr) throw candErr;

      const candidateUserIds = [
        ...new Set(
          (candidateLinks ?? [])
            .map((l: any) => l?.candidate_profiles?.user_id)
            .filter(Boolean),
        ),
      ] as string[];

      const { data: candidateProfiles, error: candProfErr } = candidateUserIds.length
        ? await supabase.from("profiles").select("user_id, full_name, email").in("user_id", candidateUserIds)
        : { data: [] as any[], error: null };
      if (candProfErr) throw candProfErr;

      const candidates: Row[] = (candidateProfiles ?? [])
        .filter((p: any) => !rolesByUser[p.user_id]) // avoid dupes if candidate also has staff role
        .map((p: any) => ({
          user_id: p.user_id,
          full_name: p.full_name || (p.email ? String(p.email).split("@")[0] : "") || "Candidate",
          email: p.email,
          roles: ["candidate"],
          user_type: "Candidate",
        }));

      const combined = [...staff, ...candidates].sort((a, b) => a.full_name.localeCompare(b.full_name));
      setRows(combined);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter((r) => {
      return (
        r.full_name.toLowerCase().includes(qq) ||
        r.email.toLowerCase().includes(qq) ||
        r.roles.some((x) => x.toLowerCase().includes(qq))
      );
    });
  }, [q, rows]);

  const sorted = useMemo(() => {
    return sortBy(filtered, tableSort.sort, (r, key) => {
      switch (key) {
        case "full_name":
          return r.full_name;
        case "user_type":
          return r.user_type;
        case "roles":
          return (r.roles || []).join(", ");
        default:
          return r.full_name;
      }
    });
  }, [filtered, tableSort.sort]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </div>
      </DashboardLayout>
    );
  }

  if (!organizationId) {
    return (
      <DashboardLayout>
        <Card>
          <CardHeader>
            <CardTitle>Organization not assigned</CardTitle>
            <CardDescription>Your org admin role is active, but it isn’t linked to a tenant.</CardDescription>
          </CardHeader>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold">Users</h1>
            <p className="mt-1">Read-only list of users in your tenant (staff + candidates)</p>
          </div>
          <div className="w-full max-w-sm">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / email / role…" />
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Tenant Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead
                      label="User"
                      sortKey="full_name"
                      sort={tableSort.sort}
                      onToggle={tableSort.toggle}
                    />
                    <SortableTableHead
                      label="Type"
                      sortKey="user_type"
                      sort={tableSort.sort}
                      onToggle={tableSort.toggle}
                    />
                    <SortableTableHead
                      label="Roles"
                      sortKey="roles"
                      sort={tableSort.sort}
                      onToggle={tableSort.toggle}
                    />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8">
                        No users found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    sorted.map((r) => (
                      <TableRow key={r.user_id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{r.full_name}</p>
                            <p className="text-sm">{r.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {r.user_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {r.roles.map((role) => (
                              <Badge key={role} variant="secondary" className="text-xs">
                                {role.replace("_", " ")}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}


