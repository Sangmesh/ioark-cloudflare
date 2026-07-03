import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Spinner } from "../../components/Spinner";
import { Pagination } from "../../components/Pagination";

const PAGE_SIZE = 25;
const OUTCOMES = ["SUCCESS", "FAILURE", "DENIED", "ERROR", "INFO"];

export default function AuditList() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [outcome, setOutcome] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);
  // Any filter change resets to the first page.
  useEffect(() => { setPage(1); }, [debounced, outcome, dateFrom, dateTo]);

  useEffect(() => {
    setLoading(true);
    api.audit({ search: debounced, outcome, date_from: dateFrom, date_to: dateTo,
                page, page_size: PAGE_SIZE })
      .then((r) => { setItems(r.items); setTotal(r.total); })
      .catch((e) => setMsg(e.message))
      .finally(() => setLoading(false));
  }, [debounced, outcome, dateFrom, dateTo, page]);

  return (
    <>
      <h2 className="page-title">System Log</h2>
      <div className="toolbar">
        <input className="toolbar-search" placeholder="Search action, actor or target…"
          value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className="toolbar-select">
          <option value="">All outcomes</option>
          {OUTCOMES.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <label className="toolbar-date">From <input type="date" value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)} /></label>
        <label className="toolbar-date">To <input type="date" value={dateTo}
          onChange={(e) => setDateTo(e.target.value)} /></label>
        {(outcome || dateFrom || dateTo || search) && (
          <button className="btn-sm" onClick={() => { setSearch(""); setOutcome(""); setDateFrom(""); setDateTo(""); }}>
            Clear
          </button>
        )}
      </div>

      {loading ? <div className="section-loader"><Spinner /> Loading log…</div> : (
        <>
          {msg && <div className="error">{msg}</div>}
          <table>
            <thead><tr><th>Time</th><th>Action</th><th>Outcome</th><th>Actor</th><th>Target</th><th>IP</th></tr></thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={6} className="empty-row">No log entries match your filters.</td></tr>
              ) : items.map((r, i) => (
                <tr key={i}>
                  <td>{new Date(r.ts).toLocaleString()}</td>
                  <td><span className="chip">{r.action}</span></td>
                  <td><span className="badge" style={{ color: outcomeColor(r.outcome) }}
                    title={r.user_agent || ""}>{r.outcome || "—"}</span></td>
                  <td>{r.actor || "—"}</td><td>{r.target || "—"}</td><td>{r.ip || "—"}</td>
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

function outcomeColor(outcome?: string): string {
  switch (outcome) {
    case "SUCCESS": return "var(--success, #1e7a3c)";
    case "FAILURE": return "var(--warning, #c06a00)";
    case "DENIED": return "var(--danger, #c02828)";
    case "ERROR": return "var(--danger, #c02828)";
    default: return "var(--muted, #777)";
  }
}
