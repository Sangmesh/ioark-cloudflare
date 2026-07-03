import { useEffect, useState } from "react";
import { useNavigate, NavLink, Outlet } from "react-router-dom";
import { api } from "../lib/api";
import { PageLoader } from "../components/Spinner";
import { SidebarLogo } from "../components/Brand";
import { DrawerToggle } from "../components/DrawerToggle";
import { TopbarMenu } from "../components/TopbarMenu";

/** Admin layout shell: sidebar + topbar with the module pages rendered into the
 *  <Outlet>. Each module (Directory / Groups / Applications / System Log) is its
 *  own routed page; list and add/edit forms are separate routes underneath. */
export default function Admin() {
  const nav = useNavigate();
  const [me, setMe] = useState<any>(null);

  useEffect(() => {
    api.me().then((m) => { if (!m.isAdmin) nav("/app"); else setMe(m); }).catch(() => nav("/"));
  }, []);
  if (!me) return <PageLoader />;

  const fullName = [me.firstName, me.lastName].filter(Boolean).join(" ") || me.displayName || me.username;
  const navClass = ({ isActive }: { isActive: boolean }) => "nav-item" + (isActive ? " active" : "");

  return (
    <div className="shell">
      <div className="sidebar">
        <SidebarLogo logoUrl={me.tenantLogo} />
        <div className="nav-item" onClick={() => nav("/app")}>My Apps</div>
        <div className="nav-item" onClick={() => nav("/profile")}>My Profile</div>
        <NavLink to="/admin/directory" className={navClass}>Directory</NavLink>
        <NavLink to="/admin/groups" className={navClass}>Groups</NavLink>
        <NavLink to="/admin/applications" className={navClass}>Applications</NavLink>
        <NavLink to="/admin/logs" className={navClass}>System Log</NavLink>
      </div>
      <div className="main">
        <div className="topbar">
          <div className="topbar-left">
            <DrawerToggle />
            <div className="who">Admin · {fullName}</div>
          </div>
          <TopbarMenu />
        </div>
        <div className="content"><Outlet context={{ me }} /></div>
      </div>
    </div>
  );
}
