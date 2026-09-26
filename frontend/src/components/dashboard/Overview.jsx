import {
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Package,
  ShoppingBag,
  Users,
  ScanLine,
  Star,
  Store,
  Clock,
  CheckCircle,
  Wallet,
  Heart,
  TrendingUp,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { analytics } from '../../data/mock/seed';
import { money } from '../../utils/format';
import { ChartCard, StatCard, StatusChip } from '../common/UI';
import SystemMonitor from './SystemMonitor';

export function Analytics({ full = false }) {
  const { state } = useApp();
  const distribution = state.categories
    .map((c) => ({
      name: c.categoryName,
      count: state.products.filter((p) => p.categoryId === c.id).length,
    }))
    .filter((c) => c.count);
  return (
    <>
      <div className="charts-grid">
        <ChartCard
          title="A growing sense of style"
          description="Simulated order trend · Apr – Sep 2026"
        >
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analytics} margin={{ top: 20, right: 10, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="orderGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#31775d" stopOpacity={0.24} />
                    <stop offset="100%" stopColor="#31775d" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="#e9ece7" />
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#758078', fontSize: 12 }}
                />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#758078', fontSize: 12 }} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="orders"
                  stroke="#31775d"
                  strokeWidth={2.5}
                  fill="url(#orderGradient)"
                  name="Demo orders"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        <ChartCard
          title="The collection, at a glance"
          description="Local product category distribution"
        >
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={distribution}
                  dataKey="count"
                  nameKey="name"
                  innerRadius={65}
                  outerRadius={95}
                  paddingAngle={5}
                >
                  {distribution.map((d, i) => (
                    <Cell
                      key={d.name}
                      fill={['#245b47', '#79a28a', '#c0cdb1', '#d8bd8c', '#778c8d'][i % 5]}
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>
      {full && (
        <>
          <div className="charts-grid">
            {[
              { key: 'revenue', title: 'Demo revenue', color: '#34735a' },
              { key: 'sessions', title: 'Try-on engagement', color: '#727eae' },
              { key: 'sellers', title: 'Simulated seller growth', color: '#b49c68' },
            ].map((chart) => (
              <ChartCard key={chart.key} title={chart.title}>
                <div className="chart-wrap">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics}>
                      <CartesianGrid vertical={false} strokeDasharray="4 4" />
                      <XAxis dataKey="month" />
                      <YAxis width={55} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} />
                      <Tooltip />
                      <Bar dataKey={chart.key} fill={chart.color} radius={[5, 5, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>
            ))}
            <ChartCard
              title="Review rating distribution"
              description="Counts from local demo reviews"
            >
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[1, 2, 3, 4, 5].map((r) => ({
                      rating: `${r} ★`,
                      count: state.reviews.filter((x) => x.rating === r).length,
                    }))}
                  >
                    <XAxis dataKey="rating" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#9aa980" radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </div>
          <div className="stats-grid">
            <StatCard
              label="Demo subscriptions"
              value="৳14,900"
              hint="Illustrative monthly billing · no payment system"
              icon={Store}
            />
            <StatCard
              label="Demo commissions"
              value="৳9,100"
              hint="Illustrative 5% rate · no settlement"
              icon={Wallet}
            />
            <StatCard
              label="Demo revenue"
              value="৳182,000"
              hint="September scenario · not financial reporting"
              icon={TrendingUp}
            />
          </div>
        </>
      )}
    </>
  );
}
export default function Overview({ role }) {
  const { state, user } = useApp();
  const seller = state.sellers.filter((s) => s.userId === user.id).at(-1) || state.sellers[0];
  const ownOrders = state.orders.filter((o) => o.userId === user.id);
  const ownProducts = state.products.filter((p) => p.sellerId === seller?.id);
  const ownSessions = state.sessions.filter((s) => s.userId === user.id);
  const ownReviews = state.reviews.filter((r) => r.userId === user.id);
  const sellerOrders = state.orders.filter((o) =>
    o.items?.some((item) => ownProducts.some((p) => p.id === item.productId)),
  );
  const stats =
    role === 'customer'
      ? [
          ['Total orders', ownOrders.length, ShoppingBag],
          ['Pending orders', ownOrders.filter((o) => o.orderStatus === 'PENDING').length, Clock],
          [
            'Completed orders',
            ownOrders.filter((o) => o.orderStatus === 'DELIVERED').length,
            CheckCircle,
          ],
          ['Try-on sessions', ownSessions.length, ScanLine],
          ['Reviews given', ownReviews.length, Star],
        ]
      : role === 'seller'
        ? [
            ['Total products', ownProducts.length, Package],
            ['In stock', ownProducts.filter((p) => p.stockQuantity > 0).length, CheckCircle],
            [
              'Low stock',
              ownProducts.filter((p) => p.stockQuantity > 0 && p.stockQuantity < 6).length,
              Clock,
            ],
            ['Demo orders', sellerOrders.length, ShoppingBag],
            [
              'Demo item revenue',
              money(
                sellerOrders
                  .filter((o) => o.orderStatus === 'DELIVERED')
                  .flatMap((o) => o.items)
                  .filter((i) => ownProducts.some((p) => p.id === i.productId))
                  .reduce((sum, i) => sum + i.price * i.quantity, 0),
              ),
              Wallet,
            ],
            [
              'Average rating',
              (
                ownProducts.reduce((n, p) => n + (p.rating || 0), 0) / (ownProducts.length || 1)
              ).toFixed(1),
              Star,
            ],
            [
              'Try-on sessions',
              state.sessions.filter((s) => ownProducts.some((p) => p.id === s.productId)).length,
              ScanLine,
            ],
            ['Demo conversion rate', '12.8%', TrendingUp],
          ]
        : [
            ['Users', state.users.length, Users],
            ['Sellers', state.sellers.length, Store],
            ['Products', state.products.length, Package],
            ['Orders', state.orders.length, ShoppingBag],
            ['Reviews', state.reviews.length, Star],
            ['Try-on sessions', state.sessions.length, ScanLine],
          ];
  return (
    <>
      <div className="dashboard-heading">
        <div>
          <span className="eyebrow">
            {role === 'customer'
              ? 'YOUR LITTLE CORNER OF TRYONBD'
              : 'A CLEARER VIEW OF YOUR WORKSPACE'}
          </span>
          <h1>
            {role === 'customer'
              ? `Hello, ${user.fullName.split(' ')[0]}.`
              : role === 'seller'
                ? 'Good things are growing.'
                : 'The bigger picture.'}
          </h1>
          <p>
            {role === 'customer'
              ? 'A new day. A new perspective. What will you discover?'
              : 'Your local demo activity, thoughtfully brought together.'}
          </p>
        </div>
        <Link
          className="btn btn-primary"
          to={
            role === 'customer'
              ? '/try-on'
              : role === 'seller'
                ? '/dashboard/seller/add-product'
                : '/api-playground'
          }
        >
          {role === 'customer'
            ? 'Try a new look'
            : role === 'seller'
              ? 'Add a product'
              : 'Explore API'}
          <ArrowUpRight size={16} />
        </Link>
      </div>
      <div className="stats-grid">
        {stats.map(([label, value, icon]) => (
          <StatCard key={label} label={label} value={value} icon={icon} />
        ))}
      </div>
      {role === 'customer' ? (
        <>
          <div className="customer-feature">
            <div>
              <span className="eyebrow">YOUR NEXT FAVORITE LOOK</span>
              <h2>Curiosity looks good on you.</h2>
              <p>Your personal style studio is one click away.</p>
              <Link to="/try-on" className="btn btn-primary">
                Step into the studio
                <ScanLine size={16} />
              </Link>
            </div>
            <ScanLine size={110} strokeWidth={0.6} />
          </div>
          <section className="panel">
            <div className="panel-heading flex justify-between">
              <h3>Recent orders</h3>
              <Link className="text-link" to="/dashboard/customer/orders">
                View all →
              </Link>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Local reference</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {ownOrders
                    .slice(-4)
                    .reverse()
                    .map((o) => (
                      <tr key={o.id}>
                        <td>{o.id}</td>
                        <td>{money(o.totalAmount)}</td>
                        <td>
                          <StatusChip status={o.orderStatus} />
                        </td>
                        <td>
                          <Link to={`/invoice/${o.id}`} className="text-link">
                            View invoice
                          </Link>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <Analytics />
      )}
      {role !== 'customer' && <SystemMonitor />}
    </>
  );
}
