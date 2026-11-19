import { Card } from '../components/ui/Card.jsx';
import { DataTable } from '../components/ui/DataTable.jsx';
import { StatusBadge } from '../components/ui/StatusBadge.jsx';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States.jsx';
import { ApiStatus } from '../components/ApiStatus.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { adminApi } from '../services/adminApi.js';
import { getFirebaseAuth } from '../lib/firebase.js';
import { ROLE_META } from '../utils/constants.js';
import { formatDateTime } from '../utils/format.js';

const Row = ({ label, children }) => (
  <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-center sm:justify-between">
    <dt className="text-sm text-charcoal-soft">{label}</dt>
    <dd className="min-w-0 break-all text-sm font-medium text-charcoal">{children}</dd>
  </div>
);

function AdminsDirectory() {
  const { data, error, loading, reload } = useAsync((signal) => adminApi.admins({ limit: 50 }, signal), []);
  const columns = [
    { key: 'name', header: 'Name', render: (a) => a.name },
    { key: 'email', header: 'Email', hideBelow: 'sm', render: (a) => a.email },
    { key: 'role', header: 'Role', render: (a) => <StatusBadge value={a.role} meta={ROLE_META} /> },
    { key: 'active', header: 'Access', render: (a) => <span className={a.active ? 'text-emerald-700' : 'text-stone-500'}>{a.active ? 'Active' : 'Removed'}</span> },
    { key: 'since', header: 'Added', hideBelow: 'md', render: (a) => formatDateTime(a.createdAt) },
  ];
  return (
    <Card title="Administrators" subtitle="Visible to superadmins only">
      {loading && !data ? <div className="space-y-3 p-5"><Skeleton className="h-5" /><Skeleton className="h-5" /></div>
        : error && !data ? <ErrorState error={error} onRetry={reload} compact />
        : data.items.length === 0 ? <EmptyState icon="customers" title="No administrators recorded" />
        : <DataTable columns={columns} rows={data.items} caption="Administrators" />}
      <p className="border-t border-line px-5 py-3 text-xs text-charcoal-soft">
        Admin access can only be granted or removed by the platform operator, using the admin management
        script on the server (see docs/ADMIN_AUTH.md). It cannot be changed from this screen or by any request.
      </p>
    </Card>
  );
}

export function SettingsPage() {
  const { admin, logout } = useAuth();
  const user = getFirebaseAuth().currentUser;
  const projectId = getFirebaseAuth().app.options.projectId;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-charcoal">Settings</h1>
        <p className="text-sm text-charcoal-soft">Your account and the connection to the platform</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Your account">
          <dl className="divide-y divide-line px-5">
            <Row label="Name">{admin.name ?? '—'}</Row>
            <Row label="Email">{admin.email}</Row>
            <Row label="Role"><StatusBadge value={admin.role} meta={ROLE_META} /></Row>
            <Row label="User ID"><span className="font-mono text-xs">{admin.uid}</span></Row>
            <Row label="Last sign-in">{user?.metadata.lastSignInTime ? formatDateTime(user.metadata.lastSignInTime) : '—'}</Row>
          </dl>
          <div className="border-t border-line px-5 py-4">
            <button type="button" onClick={logout} className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400">
              Sign out of this device
            </button>
          </div>
        </Card>

        <Card title="Platform connection">
          <dl className="divide-y divide-line px-5">
            <Row label="API"><ApiStatus /></Row>
            <Row label="Firebase project"><span className="font-mono text-xs">{projectId}</span></Row>
            <Row label="Access control">Role verified by the server on every request</Row>
          </dl>
        </Card>
      </div>

      {admin.role === 'superadmin' && <AdminsDirectory />}
    </div>
  );
}
