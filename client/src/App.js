import React from "react";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";

import ProtectedRoute, { PublicOnlyRoute, FallbackRoute } from "./auth/ProtectedRoute";

import LoginPage from "./Pages/admin/Home/Home";
import Onboarding from "./Pages/admin/Onboarding/Onboarding";
import WorkspaceHome from "./Pages/admin/WorkspaceHome/AdminHome";
import Teams from "./Pages/admin/Teams/Teams";
import Insights from "./Pages/admin/Insights/Insights";
import MemberHome from "./Components/User/MemberHome/MemberHome";
import MemberOnboarding from "./Components/User/MemberOnboarding/MemberOnboarding";
import UserLogin1 from "./Components/User/Login1/Login1";
import AdminPanel from "./Pages/admin/AdminPanel/AdminPanel";
import TemplateRecipients from "./Pages/admin/EmailRecepients/TemplateRecipients";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<PublicOnlyRoute />}>
          <Route index element={<LoginPage />} />
        </Route>

        <Route path="user/login1" element={<UserLogin1 />} />

        <Route element={<ProtectedRoute />}>
          <Route path="my-workspace" element={<MemberHome />} />
          <Route path="member-onboarding" element={<MemberOnboarding />} />
        </Route>

        <Route element={<ProtectedRoute roles={["admin"]} />}>
          <Route path="onboarding" element={<Onboarding />} />
          <Route path="workspace" element={<WorkspaceHome />} />

          <Route path="admin" element={<Outlet />}>
            <Route path="teams" element={<Teams />} />
            <Route path="panel" element={<AdminPanel />} />
            <Route path="insights" element={<Insights />} />
            <Route path="templaterecepients/:templateId" element={<TemplateRecipients />} />
          </Route>
        </Route>

        <Route path="*" element={<FallbackRoute />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;