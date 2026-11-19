import { Link } from 'react-router-dom';
import { Card } from '../../components/ui/Card.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { EmptyState, ErrorState } from '../../components/ui/States.jsx';
import { TableSkeleton } from '../../components/ui/TableSkeleton.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { SearchInput } from '../../components/ui/SearchInput.jsx';
import { FilterSelect } from '../../components/ui/Fields.jsx';
import { Button, BUTTON_BASE, BUTTON_VARIANTS } from '../../components/ui/Button.jsx';
import { PageHeader } from '../../components/ui/Layout.jsx';
import { DeviceStatusBadge, LastSeen } from '../../features/devices/DeviceBits.jsx';
import { usePagedList } from '../../hooks/usePagedList.js';
import { usePolling } from '../../hooks/usePolling.js';
import { useUrlFilters } from '../../hooks/useUrlFilters.js';
import { adminApi } from '../../services/adminApi.js';
import { DEVICE_FILTER_OPTIONS, DEVICE_STATUS_META } from '../../utils/constants.js';
import { formatRelative } from '../../utils/format.js';

const PAGE_SIZE = 15;
const STATUS_OPTIONS = DEVICE_FILTER_OPTIONS.map((value) => ({ value, label: DEVICE_STATUS_META[value].label }));

export function DevicesListPage() {
  const [filters, setFilter] = useUrlFilters(['q', 'status']);
  const list = usePagedList((params) => adminApi.devices.list(params), { ...filters, limit: PAGE_SIZE });
  const filtered = Boolean(filters.q || filters.status);
  usePolling(() => list.reload({ silent: true }), 30_000); // last-seen times move on their own

  const columns = [
    {
      key: 'id',
      header: 'Device',
      render: (d) => (
        <Link to={`/devices/${d.id}`} className="group block">
          <span className="whitespace-nowrap font-mono text-sm font-medium text-charcoal group-hover:text-terracotta-700">{d.id}</span>
          <span className="block text-xs text-charcoal-soft">{d.model ?? 'Model not set'}</span>
        </Link>
      ),
    },
    { key: 'status', header: 'Status', render: (d) => <DeviceStatusBadge device={d} /> },
    {
      key: 'potter',
      header: 'Potter',
      render: (d) =>
        d.potter ? (
          <Link to={`/potters/${d.potter.id}`} className="hover:text-terracotta-700">
            {d.potter.name}
            <span className="block font-mono text-xs text-charcoal-soft">{d.potter.id}</span>
          </Link>
        ) : (
          <span className="text-charcoal-soft">{d.potterId ? d.potterId : 'Not assigned'}</span>
        ),
    },
    { key: 'seen', header: 'Last seen', hideBelow: 'sm', render: (d) => <LastSeen value={d.lastSeen} /> },
    { key: 'firmware', header: 'Firmware', hideBelow: 'lg', render: (d) => d.firmwareVersion ?? <span className="text-charcoal-soft">—</span> },
    { key: 'registered', header: 'Registered', hideBelow: 'lg', render: (d) => <span className="text-charcoal-soft">{formatRelative(d.registeredAt)}</span> },
    { key: 'open', header: <span className="sr-only">Open</span>, hideBelow: 'sm', className: 'text-right', render: (d) => <Link to={`/devices/${d.id}`} className="text-xs font-medium text-terracotta-600 hover:text-terracotta-700">Details</Link> },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Devices"
        subtitle="IoT devices, who owns them and when they last contacted the server."
        actions={<Link to="/devices/new" className={`${BUTTON_BASE} ${BUTTON_VARIANTS.primary}`}>Register device</Link>}
      />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
          <SearchInput value={filters.q} onCommit={(v) => setFilter('q', v)} label="Search devices by ID" placeholder="Search by Device ID, e.g. DEV-001" maxLength={20} />
          <FilterSelect label="Filter by status" placeholder="All statuses" value={filters.status} onChange={(e) => setFilter('status', e.target.value)} options={STATUS_OPTIONS} />
          {filtered && <Button onClick={() => ['q', 'status'].forEach((k) => setFilter(k, ''))}>Clear filters</Button>}
        </div>

        {list.loading && !list.data ? (
          <TableSkeleton />
        ) : list.error && !list.data ? (
          <ErrorState error={list.error} onRetry={list.reload} />
        ) : list.data.items.length === 0 ? (
          <EmptyState
            icon="devices"
            title={filtered ? 'No devices match these filters' : 'No devices registered yet'}
            description={filtered ? 'Try another Device ID or status, or clear the filters.' : 'Register a device to generate its credentials, then assign it to a potter.'}
            action={!filtered && <Link to="/devices/new" className={`${BUTTON_BASE} ${BUTTON_VARIANTS.primary}`}>Register device</Link>}
          />
        ) : (
          <div className={list.loading ? 'opacity-60 transition-opacity' : 'transition-opacity'} aria-busy={list.loading}>
            <DataTable columns={columns} rows={list.data.items} caption="Devices" />
            <Pagination page={list.page} hasPrev={list.hasPrev} hasNext={list.hasNext} onPrev={list.prev} onNext={list.next} loading={list.loading} count={list.data.items.length} />
          </div>
        )}
        {list.error && list.data && <p role="alert" className="border-t border-line px-5 py-3 text-sm text-red-700">Could not refresh: {list.error.message}</p>}
      </Card>
      <p className="text-xs text-charcoal-soft">
        “Active” means the device contacted the server recently; an enabled device that has gone quiet is shown as “Offline”.
      </p>
    </div>
  );
}
