import { Suspense, lazy } from 'react';

const AuthActionPage = lazy(() => import('./AuthActionPage.jsx'));

export default function AuthActionEntry() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F7F7FB]" />}>
      <AuthActionPage />
    </Suspense>
  );
}
