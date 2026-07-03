import { useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { api } from "../../lib/api";
import { Spinner } from "../../components/Spinner";
import { Pagination } from "../../components/Pagination";

const PAGE_SIZE = 25;

export default function UsersList() {
  const nav = useNavigate();
  // Direct account creation in ioark is reserved for the exception cases
  // (admins, contractors, service accounts) — gated to super-admins so day-to-day
  // tenant admins onboard regular employees in IOCRM instead.
  const { me } = useOutletContext<{ me: any }>();
  const canAddAccount = !!me?.isSuperAdmin;
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  // Debounce typing, and reset to page 1 whenever the search term changes.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => { setPage(1); }, [debounced]);

  function load() {
    setLoading(true);
    api.users({ search: debounced, page, page_size: PAGE_SIZE })
      .then((r) => { setItems(r.items); setTotal(r.total); })
      .catch((e) => setMsg(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, [debounced, page]);

  async function resetMfa(u: any) {
    if (!window.confirm(`Reset MFA for ${u.username}? Their current authenticator stops working and they'll set up a new one at next sign-in.`)) return;
    setMsg("");
    try { const r = await api.resetUserMfa(u.id); setMsg(r.message || `MFA reset for ${u.username}.`); load(); }
    catch (e: any) { setMsg(e.message); }
  }
  async function unlock(u: any) {
    if (!window.confirm(`Unlock ${u.username}'s account? They'll be able to sign in again.`)) return;
    setMsg("");
    try { const r = await api.unlockUser(u.id); setMsg(r.message || `Unlocked ${u.username}.`); load(); }
    catch (e: any) { setMsg(e.message); }
  }

  return (
    <>
      <div className="page-head">
        <h2 className="page-title">Directory</h2>
        {canAddAccount && (
          <button className="btn-sm primary-sm" onClick={() => nav("/admin/directory/new")}>+ Add account</button>
        )}
      </div>
      <div className="toolbar">
        <input className="toolbar-search" placeholder="Search name, username, email, employee ID…"
          value={search} onChange={(e) => setSearch(e.target.value)} />
        {msg && <span style={{ fontSize: 13 }}>{msg}</span>}
      </div>

      {loading ? <div className="section-loader"><Spinner /> Loading directory…</div> : (
        <>
          <table>
            <thead><tr><th>Employee</th><th>Name</th><th>Username</th><th>Email</th><th>Status</th><th>MFA</th><th>Groups</th><th>Apps</th><th>Source</th><th></th></tr></thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={10} className="empty-row">No employees match your search.</td></tr>
              ) : items.map((u) => (
                <tr key={u.id}>
                  <td>{u.employee_id || "—"}</td>
                  <td>{[u.first_name, u.last_name].filter(Boolean).join(" ") || u.display_name || "—"}</td>
                  <td>{u.username}{u.is_admin && <span className="chip">admin</span>}</td>
                  <td>{u.email}</td>
                  <td>
                    <span className={"badge " + (u.status === "ACTIVE" ? "active" : "left")}>
                      {u.status === "ACTIVE" ? "Active" : "Left"}
                    </span>
                    {u.locked && (
                      <span className="badge left" style={{ marginLeft: 4 }}
                        title={u.lock_reason ? `Locked: ${u.lock_reason}` : "Locked"}>Locked</span>
                    )}
                  </td>
                  <td><span className="badge mfa">{u.mfa}</span></td>
                  <td>{u.groups.map((g: string) => <span className="chip" key={g}>{g}</span>)}</td>
                  <td>{u.applications.map((a: string) => <span className="chip" key={a}>{a}</span>)}</td>
                  <td>{u.source}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="btn-sm" onClick={() => nav(`/admin/directory/${u.id}/edit`)}>Edit</button>
                    <button className="btn-sm" style={{ marginLeft: 6 }} onClick={() => resetMfa(u)}>Reset MFA</button>
                    {u.locked && (
                      <button className="btn-sm" style={{ marginLeft: 6 }} onClick={() => unlock(u)}>Unlock</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />
        </>
      )}
    </>
  );
}
