import { useEffect, useState } from "react";
import { useNavigate, useParams, useOutletContext } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api } from "../../lib/api";
import { Field } from "../../components/Field";
import { Spinner } from "../../components/Spinner";

const createSchema = z.object({
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  employee_id: z.string().optional(),
  username: z.string().min(1, "Username is required"),
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  password: z.string().min(8, "Use at least 8 characters").optional().or(z.literal("")),
  status: z.enum(["ACTIVE", "LEFT"]),
  groups: z.array(z.string()).optional(),
});
// Admin may edit only these fields; employee ID, username, email and password are not editable.
const editSchema = z.object({
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  status: z.enum(["ACTIVE", "LEFT"]),
  groups: z.array(z.string()).optional(),
});

export default function UserForm() {
  const nav = useNavigate();
  const { id } = useParams();
  const { me } = useOutletContext<{ me: any }>();
  const editing = !!id;

  // Creating accounts directly in ioark is reserved for super-admins (exception
  // accounts). Bounce a non-super-admin who reaches /new by direct URL.
  useEffect(() => {
    if (!editing && me && !me.isSuperAdmin) nav("/admin/directory", { replace: true });
  }, [editing, me]);
  const [groups, setGroups] = useState<any[]>([]);
  const [current, setCurrent] = useState<any>(null);
  const [loaded, setLoaded] = useState(!editing);
  const [msg, setMsg] = useState("");
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } =
    useForm<any>({ resolver: zodResolver(editing ? editSchema : createSchema),
                   defaultValues: editing ? {} : { status: "ACTIVE" } });

  useEffect(() => {
    api.groupNames().then(setGroups).catch(() => {});
    if (editing) {
      api.user(id!).then((u: any) => {
        setCurrent(u);
        reset({ first_name: u.first_name || "", last_name: u.last_name || "",
                status: u.status === "LEFT" ? "LEFT" : "ACTIVE", groups: u.groups || [] });
        setLoaded(true);
      }).catch((e: any) => { setMsg(e.message); setLoaded(true); });
    }
  }, []);

  // A SCIM-provisioned employee's profile (name, status) is mastered upstream
  // (IOCRM). ioark locks those fields; only access (groups) stays editable here.
  const managed = editing && current?.source === "SCIM";

  async function onSubmit(data: any) {
    setMsg("");
    try {
      if (editing) {
        // For IOCRM-managed users only send what ioark owns (group access), so we
        // never try to push a locked field the backend would reject.
        const payload = managed
          ? { groups: data.groups || [] }
          : { first_name: data.first_name, last_name: data.last_name,
              status: data.status, groups: data.groups || [] };
        await api.updateUser(id!, payload);
      } else {
        await api.createUser({ ...data, employee_id: data.employee_id || undefined,
                               password: data.password || undefined });
      }
      nav("/admin/directory");
    } catch (e: any) { setMsg(e.message); }
  }

  if (!loaded) return <div className="section-loader"><Spinner /> Loading…</div>;

  return (
    <>
      <div className="page-head">
        <h2 className="page-title">{editing ? `Edit ${current?.username || "employee"}` : "Add account"}</h2>
        <button className="btn-sm" onClick={() => nav("/admin/directory")}>← Back to directory</button>
      </div>
      <div className="card">
        {!editing && (
          <div className="form-warning">
            This account is created directly in ioark and will <strong>NOT</strong> sync from
            IOCRM. For regular employees, add them in IOCRM instead — only create accounts here
            for cases not managed by IOCRM (admins, contractors, service accounts).
          </div>
        )}
        {managed && (
          <div className="managed-banner">
            <strong>Profile managed by IOCRM.</strong> Name and employment status are
            read-only here and sync from IOCRM — change them there. You can still
            manage this employee's group access and roles below.
          </div>
        )}
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          {editing ? (
            <div className="row">
              <div><Field label="Employee ID (read-only)">
                <input className="mono" value={current?.employee_id || "—"} disabled readOnly />
              </Field></div>
              <div><Field label="Username (read-only)">
                <input value={current?.username || ""} disabled readOnly />
              </Field></div>
              <div><Field label="Email (read-only)">
                <input value={current?.email || ""} disabled readOnly />
              </Field></div>
            </div>
          ) : (
            <div className="row">
              <div><Field label="Employee ID" error={errors.employee_id?.message as string}>
                <input aria-invalid={!!errors.employee_id} {...register("employee_id")} />
              </Field></div>
              <div><Field label="Username" error={errors.username?.message as string}>
                <input aria-invalid={!!errors.username} {...register("username")} />
              </Field></div>
              <div><Field label="Email" error={errors.email?.message as string}>
                <input aria-invalid={!!errors.email} {...register("email")} />
              </Field></div>
              <div><Field label="Temp password" error={errors.password?.message as string}>
                <input aria-invalid={!!errors.password} {...register("password")} />
              </Field></div>
            </div>
          )}
          <div className="row">
            <div><Field label={managed ? "First name (managed by IOCRM)" : "First name"}
              error={errors.first_name?.message as string}>
              <input aria-invalid={!!errors.first_name} disabled={managed} {...register("first_name")} />
            </Field></div>
            <div><Field label={managed ? "Last name (managed by IOCRM)" : "Last name"}
              error={errors.last_name?.message as string}>
              <input aria-invalid={!!errors.last_name} disabled={managed} {...register("last_name")} />
            </Field></div>
            <div><Field label={managed ? "Employment status (managed by IOCRM)" : "Employment status"}
              error={errors.status?.message as string}>
              <select disabled={managed} {...register("status")}>
                <option value="ACTIVE">Active</option>
                <option value="LEFT">Left</option>
              </select>
            </Field></div>
          </div>
          <Field label="Groups">
            <select multiple {...register("groups")}>
              {groups.map((g) => <option key={g.id} value={g.name}>{g.name}</option>)}
            </select>
          </Field>
          <button className="btn-sm primary-sm" style={{ marginTop: 12 }} disabled={isSubmitting}>
            {isSubmitting && <Spinner />}{editing ? "Save changes" : "Create account"}
          </button>
          <button type="button" className="btn-sm" style={{ marginTop: 12, marginLeft: 8 }}
            onClick={() => nav("/admin/directory")} disabled={isSubmitting}>Cancel</button>
          {msg && <span style={{ marginLeft: 12, fontSize: 13 }}>{msg}</span>}
        </form>
      </div>
    </>
  );
}
