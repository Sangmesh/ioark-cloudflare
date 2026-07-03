import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { Spinner } from "../../components/Spinner";
import { Pagination } from "../../components/Pagination";

const PAGE_SIZE = 25;

export default function AppsList() {
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
    api.apps({ search: debounced, page, page_size: PAGE_SIZE })
      .then((r) => { setItems(r.items); setTotal(r.total); })
      .catch((e) => setMsg(e.message))
      .finally(() => setLoading(false));
  }, [debounced, page]);

  return (
    <>
      <div className="page-head">
        <h2 className="page-title">Applications</h2>
        <button className="btn-sm primary-sm" onClick={() => nav("/admin/applications/new")}>+ Register application</button>
      </div>
      <div className="toolbar">
        <input className="toolbar-search" placeholder="Search applications by name or login URL…"
          value={search} onChange={(e) => setSearch(e.target.value)} />
        {msg && <span style={{ fontSize: 13 }}>{msg}</span>}
      </div>

      {loading ? <div className="section-loader"><Spinner /> Loading applications…</div> : (
        <>
          <table>
            <thead><tr><th>Application</th><th>Protocol</th><th>Client ID</th><th>Login URL</th><th>Redirect URIs</th><th>Status</th><th>Network</th><th></th></tr></thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={8} className="empty-row">No applications match your search.</td></tr>
              ) : items.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td><span className="badge mfa">{a.protocol === "saml" ? "SAML" : "OIDC"}</span></td>
                  <td className="mono">{a.protocol === "saml" ? "—" : a.client_id}</td>
                  <td className="mono">{a.protocol === "saml" ? (a.saml_acs_url || "—") : (a.login_url || "—")}</td>
                  <td className="mono">{a.protocol === "saml" ? (a.saml_sp_entity_id || "—") : a.redirect_uris.join(", ")}</td>
                  <td><span className={"badge " + (a.enabled ? "active" : "suspended")}>{a.enabled ? "Active" : "Disabled"}</span></td>
                  <td>{a.network_security_enabled && (a.allowed_networks || []).length > 0
                    ? <span className="chip" title={(a.allowed_networks || []).join(", ")}>
                        {(a.allowed_networks || []).length} network{(a.allowed_networks || []).length === 1 ? "" : "s"}
                      </span>
                    : <span style={{ color: "var(--muted)" }}>—</span>}</td>
                  <td><button className="btn-sm" onClick={() => nav(`/admin/applications/${a.id}/edit`)}>Edit</button></td>
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
