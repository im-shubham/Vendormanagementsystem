import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { PortalLayout } from '@/layouts/PortalLayout';

import VendorLoginPage from '@/pages/auth/VendorLoginPage';
import AdminLoginPage from '@/pages/auth/AdminLoginPage';
import ActivateAccountPage from '@/pages/auth/ActivateAccountPage';
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage';
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage';
import AccountStatusPage from '@/pages/auth/AccountStatusPage';

import VendorDashboardPage from '@/pages/vendor/VendorDashboardPage';
import UploadPodPage from '@/pages/vendor/UploadPodPage';
import MySubmissionsPage from '@/pages/vendor/MySubmissionsPage';
import VendorSubmissionDetailPage from '@/pages/vendor/SubmissionDetailPage';
import HelpPage from '@/pages/vendor/HelpPage';
import NotificationsPage from '@/pages/NotificationsPage';

import AdminDashboardPage from '@/pages/admin/AdminDashboardPage';
import VendorsPage from '@/pages/admin/VendorsPage';
import VendorDetailPage from '@/pages/admin/VendorDetailPage';
import RegistrationsPage from '@/pages/admin/RegistrationsPage';
import AdminSubmissionsPage from '@/pages/admin/AdminSubmissionsPage';
import SubmissionReviewPage from '@/pages/admin/SubmissionReviewPage';
import NotFoundPage from '@/pages/NotFoundPage';

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<VendorLoginPage />} />
            <Route path="/activate" element={<ActivateAccountPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/account-status" element={<AccountStatusPage />} />
            <Route path="/admin/login" element={<AdminLoginPage />} />

            <Route
              path="/vendor"
              element={
                <ProtectedRoute role="VENDOR">
                  <PortalLayout portal="vendor" />
                </ProtectedRoute>
              }
            >
              <Route index element={<VendorDashboardPage />} />
              <Route path="upload" element={<UploadPodPage />} />
              <Route path="submissions" element={<MySubmissionsPage />} />
              <Route path="submissions/:id" element={<VendorSubmissionDetailPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="help" element={<HelpPage />} />
            </Route>

            <Route
              path="/admin"
              element={
                <ProtectedRoute role="ADMIN">
                  <PortalLayout portal="admin" />
                </ProtectedRoute>
              }
            >
              <Route index element={<AdminDashboardPage />} />
              <Route path="vendors" element={<VendorsPage />} />
              <Route path="vendors/:id" element={<VendorDetailPage />} />
              <Route path="registrations" element={<RegistrationsPage />} />
              <Route path="submissions" element={<AdminSubmissionsPage />} />
              <Route path="submissions/:id" element={<SubmissionReviewPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
