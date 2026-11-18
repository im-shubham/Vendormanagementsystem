import { Link } from 'react-router-dom';
import { Logo } from '@/components/brand/Logo';

export default function NotFoundPage() {
  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <div className="text-center">
        <Logo className="mx-auto w-48" />
        <p className="mt-10 text-6xl font-extrabold text-navy-900">404</p>
        <p className="mt-2 text-slate-500">The page you are looking for does not exist.</p>
        <Link to="/" className="mt-6 inline-flex h-11 items-center rounded-xl bg-royal-800 px-5 font-semibold text-white hover:bg-royal-700">
          Go to portal
        </Link>
      </div>
    </div>
  );
}
