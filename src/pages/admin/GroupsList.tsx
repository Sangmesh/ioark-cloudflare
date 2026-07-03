import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { Spinner } from "../../components/Spinner";
import { Pagination } from "../../components/Pagination";

const PAGE_SIZE = 25;

export default function GroupsList() {
  const nav = useNavigate();
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => { setPage(1); }, [debounced]);

  useEffect(() => {
    setLoading(true);
    api.groups({ search: debounced, page, page_size: PAGE_SIZE })
      .then((r) => { setItems(r.items); setTotal(r.total); })
      .catch((e) => setMsg(e.message))
      .finally(() => setLoading(false));
  }, [debounced, page]);

  return (
    <>
      <div className="page-head">
        <h2 className="page-title">Groups</h2>
        <button className="btn-sm primary-sm" onClick={() => nav("/admin/groups/new")}>+ Add group</button>
      </div>
      <div className="toolbar">
        <input className="toolbar-search" placeholder="Search groups by name or description…"
          value={search} onChange={(e) => setSearch(e.target.value)} />
        {msg && <span style={{ fontSize: 13 }}>{msg}</span>}
      </div>

      {loading ? <div className="section-loader"><Spinner /> Loading groups…</div> : (
        <>
          <table>
            <thead><tr><th>Group</th><th>Description</th><th>Members</th><th>Applications</th><th>Source</th><th></th></tr></thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={6} className="empty-row">No groups match your search.</td></tr>
              ) : items.map((g) => (
                <tr key={g.id}>
                  <td>{g.name}</td>
                  <td>{g.description || "—"}</td>
                  <td>{g.members}</td>
                  <td>{g.applications.map((a: string) => <span className="chip" key={a}>{a}</span>)}</td>
                  <td>{g.source}</td>
                  <td><button className="btn-sm" onClick={() => nav(`/admin/groups/${g.id}/edit`)}>Edit</button></td>
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
