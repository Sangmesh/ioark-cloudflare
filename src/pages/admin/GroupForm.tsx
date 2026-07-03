import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api } from "../../lib/api";
import { Field } from "../../components/Field";
import { Spinner } from "../../components/Spinner";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  applications: z.array(z.string()).optional(),
});
type GroupForm = z.infer<typeof schema>;

export default function GroupForm() {
  const nav = useNavigate();
  const { id } = useParams();
  const editing = !!id;
  const [apps, setApps] = useState<any[]>([]);
  const [current, setCurrent] = useState<any>(null);
  const [loaded, setLoaded] = useState(!editing);
  const [msg, setMsg] = useState("");
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } =
    useForm<GroupForm>({ resolver: zodResolver(schema) });

  useEffect(() => {
    api.appNames().then(setApps).catch(() => {});
    if (editing) {
      api.group(id!).then((g: any) => {
        setCurrent(g);
        reset({ name: g.name, description: g.description || "", applications: g.applications || [] });
        setLoaded(true);
      }).catch((e: any) => { setMsg(e.message); setLoaded(true); });
    }
  }, []);

  async function onSubmit(data: GroupForm) {
    setMsg("");
    const payload = { name: data.name, description: data.description || null, applications: data.applications || [] };
    try {
      if (editing) await api.updateGroup(id!, payload);
      else await api.createGroup(payload);
      nav("/admin/groups");
    } catch (e: any) { setMsg(e.message); }
  }

  if (!loaded) return <div className="section-loader"><Spinner /> Loading…</div>;

  return (
    <>
      <div className="page-head">
        <h2 className="page-title">{editing ? `Edit ${current?.name || "group"}` : "Add group"}</h2>
        <button className="btn-sm" onClick={() => nav("/admin/groups")}>← Back to groups</button>
      </div>
      <div className="card">
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="row">
            <div><Field label="Name" error={errors.name?.message}>
              <input aria-invalid={!!errors.name} {...register("name")} />
            </Field></div>
            <div><Field label="Description" error={errors.description?.message}>
              <input aria-invalid={!!errors.description} {...register("description")} />
            </Field></div>
          </div>
          <Field label="Entitled applications">
            <select multiple {...register("applications")}>
              {apps.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
            </select>
          </Field>
          <button className="btn-sm primary-sm" style={{ marginTop: 12 }} disabled={isSubmitting}>
            {isSubmitting && <Spinner />}{editing ? "Save changes" : "Create group"}
          </button>
          <button type="button" className="btn-sm" style={{ marginTop: 12, marginLeft: 8 }}
            onClick={() => nav("/admin/groups")} disabled={isSubmitting}>Cancel</button>
          {msg && <span style={{ marginLeft: 12, fontSize: 13 }}>{msg}</span>}
        </form>
      </div>
    </>
  );
}
