import { Link, useLocation } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Card } from '../../components/ui';

export default function NotFoundPage() {
  const { pathname } = useLocation();
  return (
    <Card className="card-pad mx-auto max-w-lg text-center">
      <Compass className="mx-auto h-10 w-10 text-slate-300" />
      <h1 className="mt-3 text-lg font-semibold text-slate-900">Page not found</h1>
      <p className="mt-1 text-sm text-slate-500">
        There is no screen at <code className="rounded bg-slate-100 px-1">{pathname}</code>. It may have been renamed,
        or your role may not have access to it.
      </p>
      <Link to="/" className="btn-primary mt-4">Back to dashboard</Link>
    </Card>
  );
}
