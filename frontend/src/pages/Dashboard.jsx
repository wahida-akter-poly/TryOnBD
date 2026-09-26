import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { dashboardConfig } from '../data/dashboardConfig';
import Overview from '../components/dashboard/Overview';
import Management from '../components/dashboard/Management';
import RecordForm from '../components/dashboard/RecordForm';
import ReviewForm from '../components/product/ReviewForm';
import { TryOnHistory, Wishlist } from '../components/dashboard/CustomerPanels';
import {
  ActivityLog,
  Admins,
  Permissions,
  Reports,
  Settings,
  Subscription,
} from '../components/dashboard/DemoPanels';
import { NotFound } from './public/About';

export default function Dashboard() {
  const { role, section = 'overview' } = useParams();
  const { state, user, toast } = useApp();
  const navigate = useNavigate();
  const config = dashboardConfig[role];
  if (!config?.sections.some(([key]) => key === section)) return <NotFound />;
  const seller = state.sellers.filter((s) => s.userId === user.id).at(-1) || state.sellers[0];
  if (section === 'overview') return <Overview role={role} />;
  if (
    ['users', 'sellers', 'products', 'categories', 'orders', 'reviews', 'sessions'].includes(
      section,
    )
  )
    return <Management key={`${role}-${section}`} collection={section} role={role} />;
  if (section === 'wishlist') return <Wishlist />;
  if (section === 'try-on-history') return <TryOnHistory />;
  if (section === 'settings') return <Settings role={role} />;
  if (section === 'subscription') return <Subscription />;
  if (section === 'permissions') return <Permissions />;
  if (section === 'admins') return <Admins />;
  if (section === 'activity') return <ActivityLog />;
  if (['analytics', 'performance', 'reports'].includes(section)) return <Reports />;
  const profile = section === 'profile';
  const business = section === 'business-profile';
  const write = section === 'write-review';
  return (
    <>
      <div className="dashboard-heading">
        <div>
          <span className="eyebrow">YOUR DEMO WORKSPACE</span>
          <h1>
            {profile
              ? 'A little about you.'
              : business
                ? 'Your business story.'
                : write
                  ? 'Share your perspective.'
                  : 'Meet your next bestseller.'}
          </h1>
          <p>
            {profile || business
              ? 'Changes are validated by the controller and reflected in local demo state.'
              : 'Thoughtful details make all the difference.'}
          </p>
        </div>
      </div>
      <section className="panel p-7 max-w-4xl">
        {write ? (
          <ReviewForm onDone={() => navigate('/dashboard/customer/reviews')} />
        ) : (
          <RecordForm
            key={`${section}-${profile ? user.id : seller?.id}`}
            collection={profile ? 'users' : business ? 'sellers' : 'products'}
            record={profile ? user : business ? seller : null}
            defaults={{ sellerId: seller?.id }}
            onDone={() => {
              if (!profile && !business) navigate('/dashboard/seller/products');
            }}
          />
        )}
      </section>
    </>
  );
}
