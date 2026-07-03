import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./styles.css";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Profile from "./pages/Profile";
import Admin from "./pages/Admin";
import Control from "./pages/Control";
import EnrollDevice from "./pages/EnrollDevice";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import UnlockAccount from "./pages/UnlockAccount";
import UsersList from "./pages/admin/UsersList";
import UserForm from "./pages/admin/UserForm";
import GroupsList from "./pages/admin/GroupsList";
import GroupForm from "./pages/admin/GroupForm";
import AppsList from "./pages/admin/AppsList";
import AppForm from "./pages/admin/AppForm";
import AuditList from "./pages/admin/AuditList";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/unlock-account" element={<UnlockAccount />} />
        <Route path="/app" element={<Dashboard />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/enroll" element={<EnrollDevice />} />
        <Route path="/admin" element={<Admin />}>
          <Route index element={<Navigate to="directory" replace />} />
          <Route path="directory" element={<UsersList />} />
          <Route path="directory/new" element={<UserForm />} />
          <Route path="directory/:id/edit" element={<UserForm />} />
          <Route path="groups" element={<GroupsList />} />
          <Route path="groups/new" element={<GroupForm />} />
          <Route path="groups/:id/edit" element={<GroupForm />} />
          <Route path="applications" element={<AppsList />} />
          <Route path="applications/new" element={<AppForm />} />
          <Route path="applications/:id/edit" element={<AppForm />} />
          <Route path="logs" element={<AuditList />} />
          <Route path="*" element={<Navigate to="directory" replace />} />
        </Route>
        <Route path="/control" element={<Control />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
