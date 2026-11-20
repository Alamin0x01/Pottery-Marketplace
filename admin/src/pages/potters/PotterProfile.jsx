import { useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { Card } from '../../components/ui/Card.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { TableSkeleton } from '../../components/ui/TableSkeleton.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.jsx';
import { Button, BUTTON_BASE, BUTTON_VARIANTS } from '../../components/ui/Button.jsx';
import { DetailList, PageHeader, TabPanel, Tabs } from '../../components/ui/Layout.jsx';
import { StatCard } from '../../components/ui/StatCard.jsx';
import { ProductThumb } from '../../components/ui/ProductThumb.jsx';
import { DeviceStatusBadge, LastSeen } from '../../features/devices/DeviceBits.jsx';
import { AssignToPotterDialog } from '../../features/devices/AssignDialogs.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { usePagedList } from '../../hooks/usePagedList.js';
import { adminApi } from '../../services/adminApi.js';
import { ORDER_STATUS_META, PRODUCT_STATUS_META, POTTER_STATUS_META } from '../../utils/constants.js';
import { formatBdt, formatDateTime, formatNumber, formatRelative } from '../../utils/format.js';
import { formatBdPhone } from '../../utils/phone.js';

function DevicesTab({ potter, devices, onAssign }) {
  const columns = [
    { key: 'id', header: 'Device', render: (d) => <Link to={`/devices/${d.id}`} className="font-mono text-xs font-medium text-charcoal hover:text-terracotta-700">{d.id}</Link> },
    { key: 'status', header: 'Status', render: (d) => <DeviceStatusBadge device={d} /> },
    { key: 'model', header: 'Model', hideBelow: 'md', render: (d) => d.model ?? <span className="text-charcoal-soft">—</span> },
    { key: 'firmware', header: 'Firmware', hideBelow: 'lg', render: (d) => d.firmwareVersion ?? <span className="text-charcoal-soft">—</span> },
    { key: 'seen', header: 'Last seen', render: (d) => <LastSeen value={d.lastSeen} /> },
  ];
  return (
    <Card
      title="Devices"
      subtitle="A potter can own several devices; each device has exactly one owner."
      action={potter.status === 'active' && <Button variant="primary" onClick={onAssign}>Assign device</Button>}
    >
      {devices.length === 0 ? (
        <EmptyState icon="devices" title="No devices assigned" description="Assign a registered device to this potter so they can send product photos." />
      ) : (
        <DataTable columns={columns} rows={devices} caption={`Devices owned by ${potter.name}`} />
      )}
    </Card>
  );
}

function ProductsTab({ potterId }) {
  const list = usePagedList((params) => adminApi.products(params), { potterId, limit: 10 });
  const columns = [
    { key: 'name', header: 'Product', render: (p) => <span className="flex items-center gap-3"><ProductThumb product={p} /><span className="font-medium">{p.name ?? 'Untitled draft'}</span></span> },
    { key: 'status', header: 'Status', render: (p) => <StatusBadge value={p.status} meta={PRODUCT_STATUS_META} /> },
    { key: 'price', header: 'Price', hideBelow: 'sm', className: 'text-right', render: (p) => (p.price ? formatBdt(p.price) : '—') },
    { key: 'stock', header: 'Stock', hideBelow: 'md', className: 'text-right', render: (p) => (typeof p.stock === 'number' ? p.stock : '—') },
    { key: 'created', header: 'Created', hideBelow: 'md', render: (p) => <span className="text-charcoal-soft">{formatRelative(p.createdAt)}</span> },
  ];
  return (
    <Card title="Products" subtitle="Listings created from this potter’s photos">
      {list.loading && !list.data ? <TableSkeleton /> : list.error && !list.data ? <ErrorState error={list.error} onRetry={list.reload} compact /> : list.data.items.length === 0 ? (
        <EmptyState icon="products" title="No products yet" description="Products appear here after the potter’s device sends a photo." />
      ) : (
        <>
          <DataTable columns={columns} rows={list.data.items} caption="Products" />
          <Pagination page={list.page} hasPrev={list.hasPrev} hasNext={list.hasNext} onPrev={list.prev} onNext={list.next} loading={list.loading} />
        </>
      )}
    </Card>
  );
}

function OrdersTab({ potterId }) {
  const list = usePagedList((params) => adminApi.orders(params), { potterId, limit: 10 });
  const columns = [
    { key: 'id', header: 'Order', render: (o) => <span className="font-mono text-xs">{o.id}</span> },
    { key: 'product', header: 'Product', render: (o) => <span className="block max-w-48 truncate">{o.productName ?? '—'}</span> },
    { key: 'buyer', header: 'Buyer', hideBelow: 'md', render: (o) => o.buyerName },
    { key: 'total', header: 'Total', hideBelow: 'sm', className: 'text-right', render: (o) => formatBdt((o.negotiatedPrice ?? o.listedPrice) * o.quantity) },
    { key: 'status', header: 'Status', render: (o) => <StatusBadge value={o.status} meta={ORDER_STATUS_META} /> },
    { key: 'placed', header: 'Placed', hideBelow: 'lg', render: (o) => <span className="text-charcoal-soft">{formatRelative(o.createdAt)}</span> },
  ];
  return (
    <Card title="Orders" subtitle="Orders for this potter’s products">
      {list.loading && !list.data ? <TableSkeleton /> : list.error && !list.data ? <ErrorState error={list.error} onRetry={list.reload} compact /> : list.data.items.length === 0 ? (
        <EmptyState icon="orders" title="No orders yet" description="Customer orders for this potter will be listed here." />
      ) : (
        <>
          <DataTable columns={columns} rows={list.data.items} caption="Orders" />
          <Pagination page={list.page} hasPrev={list.hasPrev} hasNext={list.hasNext} onPrev={list.prev} onNext={list.next} loading={list.loading} />
        </>
      )}
    </Card>
  );
}

export function PotterProfilePage() {
  const { id } = useParams();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const tab = ['devices', 'products', 'orders'].includes(params.get('tab')) ? params.get('tab') : 'devices';
  const state = useAsync((signal) => adminApi.potters.get(id, signal), [id]);
  const [dialog, setDialog] = useState(null);
  const [notice, setNotice] = useState(location.state?.notice ?? null);

  if (state.loading && !state.data) {
    return <div className="space-y-4" aria-busy="true"><Skeleton className="h-8 w-64" /><Skeleton className="h-32 w-full" /><Skeleton className="h-48 w-full" /></div>;
  }
  if (state.error && !state.data) {
    const missing = state.error.status === 404 || state.error.status === 400;
    return (
      <Card>
        {missing ? (
          <EmptyState icon="potters" title="Potter not found" description={`There is no potter with ID ${id}.`} action={<Link to="/potters" className={`${BUTTON_BASE} ${BUTTON_VARIANTS.secondary}`}>Back to potters</Link>} />
        ) : (
          <ErrorState error={state.error} onRetry={state.reload} />
        )}
      </Card>
    );
  }

  const { potter, devices, counts } = state.data;
  const active = potter.status === 'active';
  const tabs = [
    { id: 'devices', label: 'Devices', count: counts.devices },
    { id: 'products', label: 'Products', count: counts.products },
    { id: 'orders', label: 'Orders', count: counts.orders },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={potter.name}
        badge={<StatusBadge value={potter.status} meta={POTTER_STATUS_META} />}
        subtitle={`Potter ID ${potter.id}`}
        back={{ to: '/potters', label: 'All potters' }}
        actions={
          <>
            <Link to={`/potters/${potter.id}/edit`} className={`${BUTTON_BASE} ${BUTTON_VARIANTS.secondary}`}>Edit</Link>
            <Button variant={active ? 'dangerOutline' : 'primary'} onClick={() => setDialog('status')}>{active ? 'Deactivate' : 'Activate'}</Button>
          </>
        }
      />

      {notice && (
        <p role="status" className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="font-medium underline">Dismiss</button>
        </p>
      )}
      {!active && (
        <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This potter is inactive: approved products are hidden from customers and their devices are refused until the account is activated again.
        </p>
      )}

      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Devices" icon="devices" value={formatNumber(counts.devices)} accent="slate" />
        <StatCard label="Products" icon="products" value={formatNumber(counts.products)} />
        <StatCard label="Orders" icon="orders" value={formatNumber(counts.orders)} />
        <StatCard label="Open orders" icon="orders" accent="amber" value={formatNumber(counts.openOrders)} hint="Not yet delivered or cancelled" />
      </section>

      <Card title="Details">
        <DetailList
          items={[
            { label: 'Full name', value: potter.name },
            { label: 'Phone number', value: formatBdPhone(potter.phone) },
            { label: 'Village', value: potter.village },
            { label: 'District', value: potter.district },
            { label: 'Full address', value: potter.address, always: true },
            { label: 'Registered', value: formatDateTime(potter.registrationDate) },
            { label: 'Last updated', value: formatDateTime(potter.updatedAt) },
          ]}
        />
      </Card>

      <div className="space-y-4">
        <Tabs tabs={tabs} active={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} label="Potter sections" />
        <TabPanel id={tab}>
          {tab === 'devices' && <DevicesTab potter={potter} devices={devices} onAssign={() => setDialog('assign')} />}
          {tab === 'products' && <ProductsTab potterId={potter.id} />}
          {tab === 'orders' && <OrdersTab potterId={potter.id} />}
        </TabPanel>
      </div>

      {dialog === 'status' && (
        <ConfirmDialog
          title={active ? `Deactivate ${potter.name}?` : `Activate ${potter.name}?`}
          confirmLabel={active ? 'Deactivate potter' : 'Activate potter'}
          tone={active ? 'danger' : 'primary'}
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await adminApi.potters.setStatus(potter.id, active ? 'inactive' : 'active');
            setNotice(active ? 'Potter deactivated.' : 'Potter activated.');
            state.reload({ silent: true });
          }}
        >
          {active ? (
            <p>Approved products will be hidden from customers and this potter’s devices will be refused until you activate the account again. Nothing is deleted.</p>
          ) : (
            <p>Products that were hidden by the deactivation become visible again, and the potter’s active devices can connect.</p>
          )}
        </ConfirmDialog>
      )}
      {dialog === 'assign' && (
        <AssignToPotterDialog
          potter={potter}
          onClose={() => setDialog(null)}
          onAssigned={() => {
            setNotice('Device assigned.');
            state.reload({ silent: true });
          }}
        />
      )}
    </div>
  );
}
